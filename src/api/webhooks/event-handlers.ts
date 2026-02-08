import {
  GitHubWebhookEvent,
  extractIdentifiers,
  createGovernanceRequest,
} from './github-webhook';
import { GovernanceRequest } from '../../types';
import type { ProjectRegistry } from '../../config/project-registry';

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

    case 'closed': {
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
    }

    case 'edited': {
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
    }

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
    case 'opened': {
      // Check for notification labels (from send tool) on new issues
      const issueLabels = (issue?.labels as Array<Record<string, unknown>> | undefined)?.map(
        (l) => (l.name as string)?.toLowerCase() || ''
      ) || [];
      const notifyLabel = issueLabels.find((l) => l.startsWith('notify:'));

      if (notifyLabel) {
        const targetRole = notifyLabel.replace('notify:', '');
        const typeLabel = issueLabels.find((l) => l.startsWith('type:'));
        const notifType = typeLabel?.replace('type:', '') || 'notification';
        return {
          shouldProcess: true,
          request: createGovernanceRequest(
            event,
            `Handle ${notifType} for ${targetRole}: issue #${issueNumber} "${title}"`,
            projectId
          ),
        };
      }

      return {
        shouldProcess: true,
        request: createGovernanceRequest(
          event,
          `Triage new issue #${issueNumber}: "${title}"`,
          projectId
        ),
      };
    }

    case 'reopened':
      return {
        shouldProcess: true,
        request: createGovernanceRequest(
          event,
          `Review reopened issue #${issueNumber}: "${title}"`,
          projectId
        ),
      };

    case 'labeled': {
      const label = (payload.label as Record<string, unknown>)?.name as string;
      const labelLower = label?.toLowerCase() || '';

      // Development labels trigger the engineer agent
      if (labelLower.includes('ready-for-development') ||
          labelLower.includes('approved-for-development') ||
          labelLower.includes('implement') ||
          labelLower === 'engineer') {
        return {
          shouldProcess: true,
          request: createGovernanceRequest(
            event,
            `Implement issue #${issueNumber}: "${title}" — assigned for development via label "${label}"`,
            projectId
          ),
        };
      }

      // Categorization labels (bug, enhancement, feature) go to maintainer
      // for evaluation — these indicate what the issue IS, not authorization
      // to implement. The maintainer decides priority and delegates to engineer.
      if (labelLower === 'bug' || labelLower === 'enhancement' || labelLower === 'feature') {
        return {
          shouldProcess: true,
          request: createGovernanceRequest(
            event,
            `Evaluate issue #${issueNumber}: "${title}" — labeled "${label}", assess priority and next steps`,
            projectId
          ),
        };
      }

      // Notification labels route to target role (from send tool)
      if (labelLower.startsWith('notify:')) {
        const targetRole = labelLower.replace('notify:', '');
        return {
          shouldProcess: true,
          request: createGovernanceRequest(
            event,
            `Handle notification for ${targetRole}: issue #${issueNumber} "${title}"`,
            projectId
          ),
        };
      }

      // Governance labels go to maintainer
      if (labelLower.includes('governance') ||
          labelLower.includes('escalation')) {
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
        skipReason: `Non-actionable label added: ${label}`,
      };
    }

    case 'assigned': {
      const assignee = (payload.assignee as Record<string, unknown>)?.login as string;
      return {
        shouldProcess: true,
        request: createGovernanceRequest(
          event,
          `Implement issue #${issueNumber}: "${title}" — assigned to ${assignee || 'engineer'}`,
          projectId
        ),
      };
    }

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

  // For issues, process substantive comments through reception for triage
  // Short comments (reactions, acknowledgments) are skipped
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
      `Triage comment on issue #${issueNumber}`,
      projectId
    ),
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
 * Handle installation events (GitHub App installed on a repo)
 * Triggers auto-discovery of .governance/ directory
 */
async function handleInstallation(
  event: GitHubWebhookEvent,
  registry: ProjectRegistry
): Promise<WebhookHandlerResult> {
  const payload = event.payload;
  const installation = payload.installation as Record<string, unknown> | undefined;
  const installationId = installation?.id as number | undefined;

  if (!installationId) {
    return {
      shouldProcess: false,
      skipReason: 'No installation ID in payload',
    };
  }

  if (event.action === 'created') {
    // App was installed — sync all repositories
    const repositories = payload.repositories as Array<Record<string, unknown>> | undefined;

    if (repositories) {
      for (const repo of repositories) {
        const fullName = repo.full_name as string;
        const [owner, repoName] = fullName.split('/');

        try {
          const config = await registry.syncFromRepo(owner, repoName, installationId);
          if (config) {
            console.log(`[Webhook] Auto-registered project from ${fullName}`);
          } else {
            console.log(`[Webhook] No .governance/project.yaml found in ${fullName}`);
          }
        } catch (error) {
          console.error(`[Webhook] Failed to sync ${fullName}:`, error);
        }
      }
    }

    return {
      shouldProcess: false,
      skipReason: 'Installation event processed (auto-discovery)',
    };
  }

  if (event.action === 'deleted') {
    // App was uninstalled — mark projects as suspended
    const repositories = payload.repositories as Array<Record<string, unknown>> | undefined;

    if (repositories) {
      for (const repo of repositories) {
        const fullName = repo.full_name as string;
        const project = await registry.getByRepoId(fullName);
        if (project) {
          await registry.updateStatus(project.id, 'suspended');
          console.log(`[Webhook] Suspended project ${project.id} (app uninstalled from ${fullName})`);
        }
      }
    }

    return {
      shouldProcess: false,
      skipReason: 'Installation deleted — projects suspended',
    };
  }

  return {
    shouldProcess: false,
    skipReason: `Unhandled installation action: ${event.action}`,
  };
}

/**
 * Handle installation_repositories events (repos added/removed from installation)
 */
async function handleInstallationRepositories(
  event: GitHubWebhookEvent,
  registry: ProjectRegistry
): Promise<WebhookHandlerResult> {
  const payload = event.payload;
  const installation = payload.installation as Record<string, unknown> | undefined;
  const installationId = installation?.id as number | undefined;

  if (!installationId) {
    return {
      shouldProcess: false,
      skipReason: 'No installation ID in payload',
    };
  }

  if (event.action === 'added') {
    const added = payload.repositories_added as Array<Record<string, unknown>> | undefined;
    if (added) {
      for (const repo of added) {
        const fullName = repo.full_name as string;
        const [owner, repoName] = fullName.split('/');
        try {
          await registry.syncFromRepo(owner, repoName, installationId);
        } catch (error) {
          console.error(`[Webhook] Failed to sync added repo ${fullName}:`, error);
        }
      }
    }
  }

  if (event.action === 'removed') {
    const removed = payload.repositories_removed as Array<Record<string, unknown>> | undefined;
    if (removed) {
      for (const repo of removed) {
        const fullName = repo.full_name as string;
        const project = await registry.getByRepoId(fullName);
        if (project) {
          await registry.updateStatus(project.id, 'suspended');
        }
      }
    }
  }

  return {
    shouldProcess: false,
    skipReason: 'Installation repositories event processed',
  };
}

/**
 * Handle push events that modify .governance/ files — triggers config re-sync
 */
async function handleGovernancePush(
  event: GitHubWebhookEvent,
  projectId: string,
  registry: ProjectRegistry
): Promise<WebhookHandlerResult | null> {
  const payload = event.payload;
  const commits = payload.commits as Array<Record<string, unknown>> | undefined;

  if (!commits || commits.length === 0) return null;

  // Check if any commits touch .governance/ files
  const governanceChanged = commits.some((commit) => {
    const added = (commit.added as string[]) || [];
    const modified = (commit.modified as string[]) || [];
    const removed = (commit.removed as string[]) || [];
    const allFiles = [...added, ...modified, ...removed];
    return allFiles.some((f) => f.startsWith('.governance/'));
  });

  if (!governanceChanged) return null;

  // Re-sync the project config from the repo
  const project = await registry.getByRepoId(projectId);
  if (project?.githubInstallationId) {
    try {
      await registry.syncFromRepo(event.owner, event.repo, project.githubInstallationId);
      console.log(`[Webhook] Re-synced .governance/ config for ${projectId}`);
    } catch (error) {
      console.error(`[Webhook] Failed to re-sync ${projectId}:`, error);
    }
  }

  // Still process the push as a normal event (return null to fall through)
  return null;
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
 * Extended handler that supports installation and push events with ProjectRegistry
 * Falls back to handleWebhookEvent for standard events
 */
export async function handleWebhookEventAsync(
  event: GitHubWebhookEvent,
  projectId: string,
  registry?: ProjectRegistry
): Promise<WebhookHandlerResult> {
  // Handle installation events (require registry)
  if (registry) {
    if (event.event === 'installation') {
      return handleInstallation(event, registry);
    }

    if (event.event === 'installation_repositories') {
      return handleInstallationRepositories(event, registry);
    }

    // For push events, check if .governance/ was modified
    if (event.event === 'push') {
      const pushResult = await handleGovernancePush(event, projectId, registry);
      if (pushResult) return pushResult;
      // Fall through to standard handling if not a governance push
    }
  }

  // Fall back to synchronous handler for all other events
  return handleWebhookEvent(event, projectId);
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
