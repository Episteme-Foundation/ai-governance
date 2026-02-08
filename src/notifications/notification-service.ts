import { Pool } from 'pg';
import { github } from '../mcp/github/auth';
import type { ProjectConfig } from '../types';
import type { ProjectRegistry } from '../config/project-registry';

/**
 * Notification types that can trigger alerts
 */
export type NotificationType =
  | 'pending_challenge'
  | 'overturned_challenge'
  | 'session_failure'
  | 'escalation_threshold'
  | 'config_sync_error'
  | 'periodic_summary';

export interface Notification {
  type: NotificationType;
  projectId: string;
  title: string;
  body: string;
  labels: string[];
  /** If set, deduplication key — won't create duplicate issues with same key */
  dedupeKey?: string;
}

/**
 * NotificationService — delivers governance alerts to project owners via GitHub issues
 *
 * Notifications are created as GitHub issues in the governed repository, labeled
 * with `governance-alert` so they're easy to filter and track.
 */
export class NotificationService {
  constructor(
    private readonly pool: Pool,
    private readonly registry: ProjectRegistry
  ) {}

  /**
   * Send a notification for a project — creates a GitHub issue in the project's repo
   */
  async notify(notification: Notification): Promise<void> {
    const project = await this.registry.getById(notification.projectId);
    if (!project) {
      console.warn(`[Notifications] Project not found: ${notification.projectId}`);
      return;
    }

    // Parse owner/repo from project repository URL
    const { owner, repo } = this.parseRepo(project);
    if (!owner || !repo) {
      console.warn(`[Notifications] Cannot parse repository for ${notification.projectId}: ${project.repository}`);
      return;
    }

    // Deduplication: check if an open issue with the same dedupeKey already exists
    if (notification.dedupeKey) {
      const isDupe = await this.isDuplicate(owner, repo, notification.dedupeKey);
      if (isDupe) {
        console.log(`[Notifications] Skipping duplicate: ${notification.dedupeKey}`);
        return;
      }
    }

    const labels = ['governance-alert', ...notification.labels];
    const body = this.formatBody(notification, project);

    try {
      const issue = await github.createIssue(owner, repo, notification.title, body, labels);
      console.log(`[Notifications] Created issue #${issue.number} in ${owner}/${repo}: ${notification.title}`);

      // Log to audit
      await this.pool.query(
        `INSERT INTO audit_log (project_id, event_type, actor, action, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          notification.projectId,
          'notification',
          'notification-service',
          `Created alert issue #${issue.number}: ${notification.title}`,
          JSON.stringify({
            type: notification.type,
            issueNumber: issue.number,
            dedupeKey: notification.dedupeKey,
          }),
        ]
      );
    } catch (error) {
      console.error(`[Notifications] Failed to create issue in ${owner}/${repo}:`, error);
    }
  }

  /**
   * Check for pending challenges and send notifications
   */
  async checkPendingChallenges(): Promise<void> {
    const result = await this.pool.query(
      `SELECT c.id, c.decision_id, c.project_id, c.submitted_by, c.submitted_at, c.argument,
              d.title as decision_title
       FROM challenges c
       JOIN decisions d ON d.id = c.decision_id
       WHERE c.status = 'pending'
         AND c.submitted_at < NOW() - INTERVAL '1 hour'
       ORDER BY c.submitted_at ASC`
    );

    for (const row of result.rows) {
      await this.notify({
        type: 'pending_challenge',
        projectId: row.project_id,
        title: `Pending Challenge: ${row.decision_title}`,
        body: [
          `A challenge has been pending for over an hour and needs attention.`,
          '',
          `**Decision:** ${row.decision_title} (\`${row.decision_id}\`)`,
          `**Challenged by:** ${row.submitted_by}`,
          `**Submitted:** ${row.submitted_at}`,
          '',
          `**Argument:**`,
          `> ${row.argument}`,
          '',
          `This challenge should be reviewed and responded to by the maintainer agent.`,
        ].join('\n'),
        labels: ['challenge', 'needs-attention'],
        dedupeKey: `pending-challenge-${row.id}`,
      });
    }
  }

  /**
   * Check for overturned challenges (accepted challenges that reversed a decision)
   */
  async checkOverturnedChallenges(): Promise<void> {
    const result = await this.pool.query(
      `SELECT c.id, c.decision_id, c.project_id, c.submitted_by, c.argument, c.response, c.outcome,
              d.title as decision_title
       FROM challenges c
       JOIN decisions d ON d.id = c.decision_id
       WHERE c.status = 'accepted'
         AND c.responded_at > NOW() - INTERVAL '24 hours'
       ORDER BY c.responded_at DESC`
    );

    for (const row of result.rows) {
      await this.notify({
        type: 'overturned_challenge',
        projectId: row.project_id,
        title: `Decision Overturned: ${row.decision_title}`,
        body: [
          `A governance decision has been overturned following a successful challenge.`,
          '',
          `**Decision:** ${row.decision_title} (\`${row.decision_id}\`)`,
          `**Challenged by:** ${row.submitted_by}`,
          '',
          `**Challenge Argument:**`,
          `> ${row.argument}`,
          '',
          `**Response:**`,
          `> ${row.response}`,
          '',
          `**Outcome:** ${row.outcome}`,
          '',
          `Project oversight contacts may want to review this reversal.`,
        ].join('\n'),
        labels: ['challenge-accepted', 'escalation'],
        dedupeKey: `overturned-challenge-${row.id}`,
      });
    }
  }

  /**
   * Check for repeated session failures
   */
  async checkSessionFailures(): Promise<void> {
    const result = await this.pool.query(
      `SELECT project_id, COUNT(*) as failure_count, MAX(started_at) as latest
       FROM sessions
       WHERE status = 'failed'
         AND started_at > NOW() - INTERVAL '6 hours'
       GROUP BY project_id
       HAVING COUNT(*) >= 3`
    );

    for (const row of result.rows) {
      await this.notify({
        type: 'session_failure',
        projectId: row.project_id,
        title: `Repeated Session Failures (${row.failure_count} in 6 hours)`,
        body: [
          `Multiple agent sessions have failed recently, which may indicate a systemic issue.`,
          '',
          `**Project:** ${row.project_id}`,
          `**Failures in last 6 hours:** ${row.failure_count}`,
          `**Latest failure:** ${row.latest}`,
          '',
          `This may indicate:`,
          `- API key issues (expired or rate-limited)`,
          `- Configuration problems`,
          `- A recurring error in agent processing`,
          '',
          `Check the dashboard for session details and audit logs.`,
        ].join('\n'),
        labels: ['session-failure', 'needs-attention'],
        dedupeKey: `session-failures-${row.project_id}-${new Date().toISOString().split('T')[0]}`,
      });
    }
  }

  /**
   * Generate a periodic summary for a project
   */
  async generateSummary(projectId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const [decisions, sessions, challenges] = await Promise.all([
      this.pool.query(
        `SELECT COUNT(*) as total FROM decisions WHERE project_id = $1 AND date >= NOW() - INTERVAL '7 days'`,
        [projectId]
      ),
      this.pool.query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
         FROM sessions WHERE project_id = $1 AND started_at >= NOW() - INTERVAL '7 days'`,
        [projectId]
      ),
      this.pool.query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'accepted') as accepted
         FROM challenges WHERE project_id = $1 AND submitted_at >= NOW() - INTERVAL '7 days'`,
        [projectId]
      ),
    ]);

    const d = decisions.rows[0];
    const s = sessions.rows[0];
    const c = challenges.rows[0];

    // Only send summary if there was any activity
    if (parseInt(s.total) === 0 && parseInt(d.total) === 0 && parseInt(c.total) === 0) {
      return;
    }

    await this.notify({
      type: 'periodic_summary',
      projectId,
      title: `Weekly Governance Summary (${today})`,
      body: [
        `## Weekly Governance Summary`,
        '',
        `| Metric | Count |`,
        `|--------|-------|`,
        `| Decisions logged | ${d.total} |`,
        `| Sessions total | ${s.total} |`,
        `| Sessions completed | ${s.completed} |`,
        `| Sessions failed | ${s.failed} |`,
        `| Challenges submitted | ${c.total} |`,
        `| Challenges pending | ${c.pending} |`,
        `| Challenges accepted | ${c.accepted} |`,
        '',
        parseInt(c.pending) > 0
          ? `**Action needed:** ${c.pending} challenge(s) are still pending review.`
          : `All challenges have been addressed.`,
        '',
        `View the full dashboard for details.`,
      ].join('\n'),
      labels: ['summary'],
      dedupeKey: `weekly-summary-${projectId}-${today}`,
    });
  }

  /**
   * Run all notification checks for all active projects
   */
  async runAllChecks(): Promise<void> {
    console.log('[Notifications] Running notification checks...');

    await this.checkPendingChallenges();
    await this.checkOverturnedChallenges();
    await this.checkSessionFailures();

    console.log('[Notifications] Notification checks complete');
  }

  // ── Private helpers ─────────────────────────────────────────────

  private parseRepo(project: ProjectConfig): { owner: string; repo: string } {
    const repoUrl = project.repository;

    // Handle formats: "https://github.com/owner/repo", "owner/repo"
    const match = repoUrl.match(/(?:github\.com\/)?([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }

    return { owner: '', repo: '' };
  }

  private async isDuplicate(owner: string, repo: string, dedupeKey: string): Promise<boolean> {
    try {
      // Search for open issues with governance-alert label containing the dedupe key
      const result = await this.pool.query(
        `SELECT 1 FROM audit_log
         WHERE event_type = 'notification'
           AND details->>'dedupeKey' = $1
           AND timestamp > NOW() - INTERVAL '7 days'
         LIMIT 1`,
        [dedupeKey]
      );
      return result.rows.length > 0;
    } catch {
      // If audit log query fails, allow the notification
      return false;
    }
  }

  private formatBody(notification: Notification, project: ProjectConfig): string {
    return [
      notification.body,
      '',
      '---',
      `*Generated by AI Governance notification service for project \`${project.id}\`*`,
    ].join('\n');
  }
}
