import crypto from 'crypto';
import { GovernanceRequest, TrustLevel } from '../../types';

/**
 * GitHub webhook event structure
 */
export interface GitHubWebhookEvent {
  /** Event type (e.g., 'pull_request', 'issues', 'issue_comment') */
  event: string;
  /** Event action (e.g., 'opened', 'closed', 'created') */
  action: string;
  /** Delivery ID from GitHub */
  deliveryId: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Sender's GitHub username */
  sender: string;
  /** Full payload from GitHub */
  payload: Record<string, unknown>;
}

/**
 * Verify GitHub webhook signature using HMAC-SHA256
 *
 * @param payload - Raw request body as string
 * @param signature - X-Hub-Signature-256 header value
 * @param secret - Webhook secret configured in GitHub App
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  // GitHub sends signature as "sha256=<hash>"
  const expectedPrefix = 'sha256=';
  if (!signature.startsWith(expectedPrefix)) {
    return false;
  }

  const expectedHash = signature.slice(expectedPrefix.length);
  const actualHash = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHash, 'hex'),
      Buffer.from(actualHash, 'hex')
    );
  } catch {
    // If buffers have different lengths, they don't match
    return false;
  }
}

/**
 * Parse GitHub webhook headers and body into a structured event
 *
 * @param headers - Request headers
 * @param body - Parsed JSON body
 * @returns Parsed webhook event
 */
export function parseWebhookEvent(
  headers: Record<string, string | undefined>,
  body: Record<string, unknown>
): GitHubWebhookEvent {
  const event = headers['x-github-event'] || 'unknown';
  const deliveryId = headers['x-github-delivery'] || crypto.randomUUID();

  // Extract action from payload
  const action = (body.action as string) || 'unknown';

  // Extract repository info
  const repository = body.repository as Record<string, unknown> | undefined;
  const owner = (repository?.owner as Record<string, unknown>)?.login as string || 'unknown';
  const repo = (repository?.name as string) || 'unknown';

  // Extract sender
  const sender = (body.sender as Record<string, unknown>)?.login as string || 'unknown';

  return {
    event,
    action,
    deliveryId,
    owner,
    repo,
    sender,
    payload: body,
  };
}

/**
 * Determine trust level for a GitHub webhook sender
 *
 * This is a preliminary classification based on available information.
 * For full trust classification, use TrustClassifier with GitHub API lookups.
 *
 * @param event - Parsed webhook event
 * @returns Initial trust level
 */
export function classifyWebhookTrust(event: GitHubWebhookEvent): TrustLevel {
  // Bot accounts get contributor level (they're authenticated)
  if (event.sender.endsWith('[bot]')) {
    return 'contributor';
  }

  // Default to contributor for authenticated GitHub users
  // The actual trust level will be refined by TrustClassifier
  return 'contributor';
}

/**
 * Create a governance request from a GitHub webhook event
 *
 * @param event - Parsed webhook event
 * @param intent - Derived intent string
 * @param projectId - Project identifier
 * @returns Governance request
 */
export function createGovernanceRequest(
  event: GitHubWebhookEvent,
  intent: string,
  projectId: string
): GovernanceRequest {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    trust: classifyWebhookTrust(event),
    source: {
      channel: 'github_webhook',
      identity: event.sender,
    },
    project: projectId,
    intent,
    payload: {
      event: event.event,
      action: event.action,
      delivery_id: event.deliveryId,
      owner: event.owner,
      repo: event.repo,
      ...event.payload,
    },
  };
}

/**
 * Extract key identifiers from webhook payload
 */
export interface WebhookIdentifiers {
  /** Pull request number (if applicable) */
  prNumber?: number;
  /** Issue number (if applicable) */
  issueNumber?: number;
  /** Comment ID (if applicable) */
  commentId?: number;
  /** Review ID (if applicable) */
  reviewId?: number;
}

/**
 * Extract identifiers from a webhook payload
 *
 * @param event - Parsed webhook event
 * @returns Extracted identifiers
 */
export function extractIdentifiers(event: GitHubWebhookEvent): WebhookIdentifiers {
  const payload = event.payload;
  const identifiers: WebhookIdentifiers = {};

  // Pull request number
  const pullRequest = payload.pull_request as Record<string, unknown> | undefined;
  if (pullRequest?.number) {
    identifiers.prNumber = pullRequest.number as number;
  }

  // Issue number (also used for PR comments)
  const issue = payload.issue as Record<string, unknown> | undefined;
  if (issue?.number) {
    identifiers.issueNumber = issue.number as number;
  }

  // Comment ID
  const comment = payload.comment as Record<string, unknown> | undefined;
  if (comment?.id) {
    identifiers.commentId = comment.id as number;
  }

  // Review ID
  const review = payload.review as Record<string, unknown> | undefined;
  if (review?.id) {
    identifiers.reviewId = review.id as number;
  }

  // For issue_comment events on PRs, the issue number is the PR number
  if (event.event === 'issue_comment' && issue?.pull_request) {
    identifiers.prNumber = identifiers.issueNumber;
  }

  return identifiers;
}
