import {
  GitHubWebhookEvent,
  extractIdentifiers,
  createGovernanceRequest,
} from './github-webhook';
import { GovernanceRequest } from '../../types';

/**
 * Result of handling a webhook event
 */
export interface WebhookHandlerResult {
  /** Whether this event should trigger governance */
  shouldProcess: boolean;
  /** Governance request if processing is needed */
  request?: GovernanceRequest;
  /** Reason for skipping (if not processing) */
  skipReason?: string;
}

/**
 * Handle pull_request events
 */
function handlePullRequest(
  event: GitHubWebhookEvent,
  projectId: string
): WebhookHandlerResult {
  const identifiers = extractIdentifiers(event);
  const prNumber = identifiers.prNumber;
  const payload = event.payload;
  const pullRequest = payload.pull_request as Record<string, unknown>;
  const title = pullRequest?.title as string || 'Untitled PR';

  switch (event.action) {
    case 'opened':
      return {
        shouldProcess: true,
        request: createGovernanceRequest(
          event,
          `Review new pull request #${prNumber}: "${title}"`,
          projectId
        ),
      };

    case 'synchronize':
      return {
        shouldProcess: true,
        request: createGovernanceRequest(
          event,
          `Review updated pull request #${prNumber}: "${title}" (new commits pushed)`,
          projectId
        ),
      };

    case 'reopened':
      return {
        shouldProcess: true,
        request: createGovernanceRequest(
          event,
          `Review reopened pull request #${prNumber}: "${title}"`,
          projectId
        ),
      };

    case 'ready_for_review':
      return {
        shouldProcess: true,
        request: createGovernanceRequest(
          event,
          `Review pull request #${prNumber}: "${title}" (marked ready for review)`,
          projectId
        ),
      };

    case 'closed':
      // Don't process closed PRs unless merged
      const merged = pullRequest?.merged as boolean;
      if (merged) {
        return {
          shouldProcess: true,
          request: createGovernanceRequest(
            event,
            `Acknowledge merged pull request #${prNumber}: "${title}"`,
            projectId
          ),
        };
      }
      return {
        shouldProcess: false,
        skipReason: 'PR closed without merge',
      };

    case 'edited':
      // Only process significant edits (title/body changes)
      const changes = payload.changes as Record<string, unknown> | undefined;
      if (changes?.title || changes?.body) {
        return {
          shouldProcess: true,
          request: createGovernanceRequest(
            event,
            `Note pull request #${prNumber} description updated`,
            projectId
          ),
        };
      }
      return {
        shouldProcess: false,
        skipReason: 'Minor PR edit (not title/body)',
      };

    default:
      return {
        shouldProcess: false,
        skipReason: `Unhandled pull_request action: ${event.action}`,
      };
  }
}

/**
 * Handle issues events
 */
function handleIssue(
  event: GitHubWebhookEvent,
  projectId: string
): WebhookHandlerResult {
  const identifiers = extractIdentifiers(event);
  const issueNumber = identifiers.issueNumber;
  const payload = event.payload;
  const issue = payload.issue as Record<string, unknown>;
  const title = issue?.title as string || 'Untitled issue';

  switch (event.action) {
    case 'opened':
      return {
        shouldProcess: true,
        request: createGovernanceRequest(
          event,
          `Triage new issue #${issueNumber}: "${title}"`,
          projectId
        ),
      };

    case 'reopened':
      return {
        shouldProcess: true,
        request: createGovernanceRequest(
          event,
          `Review reopened issue #${issueNumber}: "${title}"`,
          projectId
        ),
      };

    case 'labeled':
      const label = (payload.label as Record<string, unknown>)?.name as string;
      if (label?.toLowerCase().includes('governance') ||
          label?.toLowerCase().includes('escalation')) {
        return {
          shouldProcess: true,
          request: createGovernanceRequest(
            event,
            `Review issue #${issueNumber} labeled with "${label}"`,
            projectId
          ),
        };
      }
      return {
        shouldProcess: false,
        skipReason: `Non-governance label added: ${label}`,
      };

    default:
      return {
        shouldProcess: false,
        skipReason: `Unhandled issues action: ${event.action}`,
      };
  }
}

/**
 * Handle issue_comment events (comments on issues and PRs)
 */
function handleIssueComment(
  event: GitHubWebhookEvent,
  projectId: string
): WebhookHandlerResult {
  const identifiers = extractIdentifiers(event);
  const issueNumber = identifiers.issueNumber;
  const prNumber = identifiers.prNumber;
  const payload = event.payload;
  const comment = payload.comment as Record<string, unknown>;
  const body = comment?.body as string || '';

  // Skip bot comments to prevent loops
  const user = comment?.user as Record<string, unknown>;
  const userType = user?.type as string;
  if (userType === 'Bot') {
    return {
      shouldProcess: false,
      skipReason: 'Comment from bot (preventing loops)',
    };
  }

  // Only process new comments
  if (event.action !== 'created') {
    return {
      shouldProcess: false,
      skipReason: `Comment action: ${event.action} (only processing 'created')`,
    };
  }

  // Check for direct mentions or governance triggers
  const mentionsGovernance =
    body.toLowerCase().includes('@governance') ||
    body.toLowerCase().includes('/governance') ||
    body.toLowerCase().includes('/review') ||
    body.toLowerCase().includes('/challenge');

  // Always process if explicitly mentioned
  if (mentionsGovernance) {
    const target = prNumber ? `PR #${prNumber}` : `issue #${issueNumber}`;
    return {
      shouldProcess: true,
      request: createGovernanceRequest(
        event,
        `Respond to governance request in comment on ${target}`,
        projectId
      ),
    };
  }

  // For PRs, process new substantive comments
  if (prNumber) {
    // Skip very short comments (likely reactions or simple acknowledgments)
    if (body.length < 20) {
      return {
        shouldProcess: false,
        skipReason: 'Comment too short for substantive review',
      };
    }

    return {
      shouldProcess: true,
      request: createGovernanceRequest(
        event,
        `Consider comment on PR #${prNumber}`,
        projectId
      ),
    };
  }

  // For issues, only process if explicitly triggered
  return {
    shouldProcess: false,
    skipReason: 'Issue comment without governance trigger',
  };
}

/**
 * Handle pull_request_review events
 */
function handlePullRequestReview(
  event: GitHubWebhookEvent,
  projectId: string
): WebhookHandlerResult {
  const identifiers = extractIdentifiers(event);
  const prNumber = identifiers.prNumber;
  const payload = event.payload;
  const review = payload.review as Record<string, unknown>;
  const state = review?.state as string || 'unknown';
  const user = review?.user as Record<string, unknown>;
  const reviewer = user?.login as string || 'unknown';

  // Skip bot reviews to prevent loops
  if (user?.type === 'Bot') {
    return {
      shouldProcess: false,
      skipReason: 'Review from bot (preventing loops)',
    };
  }

  if (event.action !== 'submitted') {
    return {
      shouldProcess: false,
      skipReason: `Review action: ${event.action} (only processing 'submitted')`,
    };
  }

  switch (state) {
    case 'approved':
      return {
        shouldProcess: true,
        request: createGovernanceRequest(
          event,
          `Acknowledge approval on PR #${prNumber} from ${reviewer}`,
          projectId
        ),
      };

    case 'changes_requested':
      return {
        shouldProcess: true,
        request: createGovernanceRequest(
          event,
          `Note changes requested on PR #${prNumber} by ${reviewer}`,
          projectId
        ),
      };

    case 'commented':
      // Skip comment-only reviews (handled by issue_comment)
      return {
        shouldProcess: false,
        skipReason: 'Comment-only review (handled by issue_comment)',
      };

    default:
      return {
        shouldProcess: false,
        skipReason: `Unknown review state: ${state}`,
      };
  }
}

/**
 * Handle check_run events (CI/CD status)
 */
function handleCheckRun(
  event: GitHubWebhookEvent,
  projectId: string
): WebhookHandlerResult {
  const payload = event.payload;
  const checkRun = payload.check_run as Record<string, unknown>;
  const conclusion = checkRun?.conclusion as string;
  const name = checkRun?.name as string || 'Check';

  // Only process completed checks
  if (event.action !== 'completed') {
    return {
      shouldProcess: false,
      skipReason: 'Check not completed yet',
    };
  }

  // Only notify on failures
  if (conclusion === 'failure' || conclusion === 'timed_out') {
    const pullRequests = checkRun?.pull_requests as Array<Record<string, unknown>>;
    const prNumber = pullRequests?.[0]?.number;

    if (prNumber) {
      return {
        shouldProcess: true,
        request: createGovernanceRequest(
          event,
          `Note CI failure: "${name}" failed on PR #${prNumber}`,
          projectId
        ),
      };
    }
  }

  return {
    shouldProcess: false,
    skipReason: `Check completed with conclusion: ${conclusion}`,
  };
}

/**
 * Main handler that routes events to specific handlers
 */
export function handleWebhookEvent(
  event: GitHubWebhookEvent,
  projectId: string
): WebhookHandlerResult {
  switch (event.event) {
    case 'pull_request':
      return handlePullRequest(event, projectId);

    case 'issues':
      return handleIssue(event, projectId);

    case 'issue_comment':
      return handleIssueComment(event, projectId);

    case 'pull_request_review':
      return handlePullRequestReview(event, projectId);

    case 'check_run':
      return handleCheckRun(event, projectId);

    case 'ping':
      // Ping events are GitHub testing the webhook
      return {
        shouldProcess: false,
        skipReason: 'Ping event (webhook test)',
      };

    default:
      return {
        shouldProcess: false,
        skipReason: `Unhandled event type: ${event.event}`,
      };
  }
}

/**
 * Export individual handlers for testing
 */
export const handlers = {
  handlePullRequest,
  handleIssue,
  handleIssueComment,
  handlePullRequestReview,
  handleCheckRun,
};
