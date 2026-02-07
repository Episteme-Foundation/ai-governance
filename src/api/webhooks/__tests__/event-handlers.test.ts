import { handleWebhookEvent, handlers, WebhookHandlerResult } from '../event-handlers';
import { GitHubWebhookEvent } from '../github-webhook';

/**
 * Tests for webhook event handlers
 *
 * Verifies that GitHub webhook events are correctly parsed into governance
 * requests with appropriate intents. This is the entry point for all
 * webhook-driven governance — ensuring these intents are correct is
 * critical for proper routing downstream.
 */

// Helper to create a minimal webhook event
function makeEvent(overrides?: Partial<GitHubWebhookEvent>): GitHubWebhookEvent {
  return {
    event: 'issues',
    action: 'opened',
    deliveryId: 'test-delivery',
    owner: 'Episteme-Foundation',
    repo: 'ai-governance',
    sender: 'testuser',
    payload: {},
    ...overrides,
  };
}

describe('handleWebhookEvent', () => {
  const projectId = 'Episteme-Foundation/ai-governance';

  describe('issue_comment events', () => {
    it('should process substantive comments on issues', () => {
      const event = makeEvent({
        event: 'issue_comment',
        action: 'created',
        payload: {
          issue: { number: 8, title: 'Test issue' },
          comment: {
            body: 'This is a substantive comment that should be triaged',
            user: { login: 'someuser', type: 'User' },
          },
          sender: { login: 'someuser' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(true);
      expect(result.request).toBeDefined();
      expect(result.request!.intent).toContain('issue #8');
      expect(result.request!.intent.toLowerCase()).toContain('triage');
    });

    it('should process substantive comments on PRs', () => {
      const event = makeEvent({
        event: 'issue_comment',
        action: 'created',
        payload: {
          issue: { number: 15, title: 'Test PR', pull_request: {} },
          comment: {
            body: 'This is a substantive comment on a PR that should be reviewed',
            user: { login: 'someuser', type: 'User' },
          },
          sender: { login: 'someuser' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(true);
      expect(result.request).toBeDefined();
      expect(result.request!.intent).toContain('PR #15');
    });

    it('should skip bot comments to prevent loops', () => {
      const event = makeEvent({
        event: 'issue_comment',
        action: 'created',
        payload: {
          issue: { number: 8, title: 'Test issue' },
          comment: {
            body: 'I am a bot response that should not trigger another invocation',
            user: { login: 'ai-governance-app[bot]', type: 'Bot' },
          },
          sender: { login: 'ai-governance-app[bot]' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(false);
      expect(result.skipReason).toContain('bot');
    });

    it('should skip edited comments (only process created)', () => {
      const event = makeEvent({
        event: 'issue_comment',
        action: 'edited',
        payload: {
          issue: { number: 8, title: 'Test issue' },
          comment: {
            body: 'This is an edited comment',
            user: { login: 'someuser', type: 'User' },
          },
          sender: { login: 'someuser' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(false);
    });

    it('should skip very short comments', () => {
      const event = makeEvent({
        event: 'issue_comment',
        action: 'created',
        payload: {
          issue: { number: 8, title: 'Test issue' },
          comment: {
            body: '+1',
            user: { login: 'someuser', type: 'User' },
          },
          sender: { login: 'someuser' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(false);
      expect(result.skipReason).toContain('short');
    });

    it('should always process governance trigger comments', () => {
      const triggers = ['@governance', '/governance', '/review', '/challenge'];

      for (const trigger of triggers) {
        const event = makeEvent({
          event: 'issue_comment',
          action: 'created',
          payload: {
            issue: { number: 8, title: 'Test issue' },
            comment: {
              body: trigger,  // Even short if it's a trigger
              user: { login: 'someuser', type: 'User' },
            },
            sender: { login: 'someuser' },
          },
        });

        const result = handleWebhookEvent(event, projectId);
        expect(result.shouldProcess).toBe(true);
        expect(result.request!.intent.toLowerCase()).toContain('governance');
      }
    });
  });

  describe('issues events', () => {
    it('should process new issues', () => {
      const event = makeEvent({
        event: 'issues',
        action: 'opened',
        payload: {
          issue: { number: 10, title: 'New feature request', labels: [] },
          sender: { login: 'contributor' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(true);
      expect(result.request!.intent).toContain('Triage');
      expect(result.request!.intent).toContain('#10');
    });

    it('should process development labels', () => {
      const event = makeEvent({
        event: 'issues',
        action: 'labeled',
        payload: {
          issue: { number: 5, title: 'Fix bug', labels: [{ name: 'implement' }] },
          label: { name: 'implement' },
          sender: { login: 'maintainer' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(true);
      expect(result.request!.intent).toContain('Implement');
    });

    it('should process categorization labels through governance', () => {
      const event = makeEvent({
        event: 'issues',
        action: 'labeled',
        payload: {
          issue: { number: 5, title: 'Something broken', labels: [{ name: 'bug' }] },
          label: { name: 'bug' },
          sender: { login: 'user' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(true);
      expect(result.request!.intent).toContain('Evaluate');
    });

    it('should skip non-actionable labels', () => {
      const event = makeEvent({
        event: 'issues',
        action: 'labeled',
        payload: {
          issue: { number: 5, title: 'Something', labels: [{ name: 'documentation' }] },
          label: { name: 'documentation' },
          sender: { login: 'user' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(false);
    });

    it('should process notification labels', () => {
      const event = makeEvent({
        event: 'issues',
        action: 'labeled',
        payload: {
          issue: { number: 5, title: 'Work request', labels: [{ name: 'notify:engineer' }] },
          label: { name: 'notify:engineer' },
          sender: { login: 'maintainer' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(true);
      expect(result.request!.intent).toContain('notification');
      expect(result.request!.intent).toContain('engineer');
    });

    it('should skip unhandled issue actions', () => {
      const event = makeEvent({
        event: 'issues',
        action: 'closed',
        payload: {
          issue: { number: 5, title: 'Something' },
          sender: { login: 'user' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(false);
    });
  });

  describe('pull_request events', () => {
    it('should process opened PRs', () => {
      const event = makeEvent({
        event: 'pull_request',
        action: 'opened',
        payload: {
          pull_request: { number: 12, title: 'Add feature', merged: false },
          sender: { login: 'contributor' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(true);
      expect(result.request!.intent).toContain('Review');
      expect(result.request!.intent).toContain('#12');
    });

    it('should process synchronized PRs', () => {
      const event = makeEvent({
        event: 'pull_request',
        action: 'synchronize',
        payload: {
          pull_request: { number: 12, title: 'Add feature', merged: false },
          sender: { login: 'contributor' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(true);
      expect(result.request!.intent).toContain('updated');
    });

    it('should process merged PRs but skip closed-without-merge', () => {
      // Merged
      const mergedEvent = makeEvent({
        event: 'pull_request',
        action: 'closed',
        payload: {
          pull_request: { number: 12, title: 'Add feature', merged: true },
          sender: { login: 'maintainer' },
        },
      });
      expect(handleWebhookEvent(mergedEvent, projectId).shouldProcess).toBe(true);

      // Closed without merge
      const closedEvent = makeEvent({
        event: 'pull_request',
        action: 'closed',
        payload: {
          pull_request: { number: 12, title: 'Add feature', merged: false },
          sender: { login: 'maintainer' },
        },
      });
      expect(handleWebhookEvent(closedEvent, projectId).shouldProcess).toBe(false);
    });
  });

  describe('pull_request_review events', () => {
    it('should process approval reviews', () => {
      const event = makeEvent({
        event: 'pull_request_review',
        action: 'submitted',
        payload: {
          pull_request: { number: 12 },
          review: {
            state: 'approved',
            user: { login: 'reviewer', type: 'User' },
          },
          sender: { login: 'reviewer' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(true);
      expect(result.request!.intent).toContain('approval');
    });

    it('should skip bot reviews', () => {
      const event = makeEvent({
        event: 'pull_request_review',
        action: 'submitted',
        payload: {
          pull_request: { number: 12 },
          review: {
            state: 'approved',
            user: { login: 'bot[bot]', type: 'Bot' },
          },
          sender: { login: 'bot[bot]' },
        },
      });

      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(false);
    });
  });

  describe('ping events', () => {
    it('should skip ping events', () => {
      const event = makeEvent({ event: 'ping' });
      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(false);
      expect(result.skipReason).toContain('Ping');
    });
  });

  describe('unhandled events', () => {
    it('should skip unhandled event types', () => {
      const event = makeEvent({ event: 'push' });
      const result = handleWebhookEvent(event, projectId);
      expect(result.shouldProcess).toBe(false);
      expect(result.skipReason).toContain('Unhandled');
    });
  });
});
