import { GovernanceRequest, RoleDefinition, ProjectConfig } from '../types';

/**
 * Intent classification for routing decisions
 */
export type IntentCategory =
  | 'triage'           // New issues, general questions → reception
  | 'governance'       // Decisions, challenges, policy → maintainer
  | 'review'           // PR reviews, merge decisions → maintainer
  | 'development'      // Implementation work → engineer
  | 'maintenance'      // Scheduled tasks, roadmap → engineer or maintainer
  | 'unknown';         // Fallback

/**
 * Request router - determines which role should handle a request
 *
 * Routes based on a combination of:
 * 1. Trust level (which roles accept this trust?)
 * 2. Intent classification (what kind of work is this?)
 * 3. Labels and metadata from the request payload
 */
export class RequestRouter {
  /**
   * Route a request to the appropriate role
   *
   * @param request - Incoming governance request
   * @param project - Project configuration
   * @returns Role that should handle this request
   */
  route(request: GovernanceRequest, project: ProjectConfig): RoleDefinition {
    // Classify the intent
    const intentCategory = this.classifyIntent(request);

    // Find the best role based on intent + trust
    const role = this.findBestRole(request, project, intentCategory);

    if (role) {
      return role;
    }

    // Fallback: find any role that accepts this trust level
    for (const r of project.roles) {
      if (r.acceptsTrust.includes(request.trust)) {
        return r;
      }
    }

    // Last resort: Reception
    const receptionRole = project.roles.find((r) => r.name === 'reception');
    if (receptionRole) {
      return receptionRole;
    }

    throw new Error(
      `No role found to handle request with trust level: ${request.trust}`
    );
  }

  /**
   * Classify request intent to determine routing category
   */
  classifyIntent(request: GovernanceRequest): IntentCategory {
    const intent = request.intent.toLowerCase();
    const payload = request.payload || {};
    const labels = this.extractLabels(payload);

    // Check for development-related labels
    if (this.hasDevelopmentLabel(labels)) {
      return 'development';
    }

    // Check for maintenance/scheduled triggers
    if (payload.scheduled === true || payload.trigger === 'schedule') {
      return 'maintenance';
    }

    // Intent-based classification from webhook event descriptions
    if (intent.includes('implement') ||
        intent.includes('develop') ||
        intent.includes('build') ||
        intent.includes('create feature') ||
        intent.includes('ready for development') ||
        intent.includes('assigned for development')) {
      return 'development';
    }

    if (intent.includes('review') && (intent.includes('pull request') || intent.includes('pr #'))) {
      return 'review';
    }

    if (intent.includes('merge') ||
        intent.includes('approve') && intent.includes('pr')) {
      return 'review';
    }

    if (intent.includes('challenge') ||
        intent.includes('governance') ||
        intent.includes('decision') ||
        intent.includes('policy') ||
        intent.includes('constitutional') ||
        intent.includes('evaluate') ||
        intent.includes('assess priority')) {
      return 'governance';
    }

    if (intent.includes('triage') ||
        intent.includes('new issue') ||
        intent.includes('question') ||
        intent.includes('inquiry')) {
      return 'triage';
    }

    if (intent.includes('note ci failure') ||
        intent.includes('acknowledge')) {
      return 'review';
    }

    return 'unknown';
  }

  /**
   * Find the best role for a given intent category and trust level
   */
  private findBestRole(
    request: GovernanceRequest,
    project: ProjectConfig,
    intentCategory: IntentCategory
  ): RoleDefinition | null {
    // Map intent categories to preferred role names
    const preferredRoles: Record<IntentCategory, string[]> = {
      triage: ['reception', 'maintainer'],
      governance: ['maintainer'],
      review: ['maintainer'],
      development: ['engineer', 'evaluator', 'maintainer'],  // engineer preferred, evaluator for backwards compat
      maintenance: ['engineer', 'evaluator', 'maintainer'],
      unknown: [], // Use trust-based fallback
    };

    const candidates = preferredRoles[intentCategory];

    for (const roleName of candidates) {
      const role = project.roles.find(
        (r) => r.name.toLowerCase() === roleName.toLowerCase()
      );
      if (role && role.acceptsTrust.includes(request.trust)) {
        return role;
      }
    }

    return null;
  }

  /**
   * Extract labels from GitHub webhook payload
   */
  private extractLabels(payload: Record<string, unknown>): string[] {
    const labels: string[] = [];

    // Labels from the issue/PR itself
    const issue = payload.issue as Record<string, unknown> | undefined;
    const pullRequest = payload.pull_request as Record<string, unknown> | undefined;
    const entity = issue || pullRequest;

    if (entity?.labels && Array.isArray(entity.labels)) {
      for (const label of entity.labels) {
        if (typeof label === 'object' && label !== null && 'name' in label) {
          labels.push((label as { name: string }).name.toLowerCase());
        }
      }
    }

    // Label from a labeling event
    const eventLabel = payload.label as Record<string, unknown> | undefined;
    if (eventLabel?.name) {
      labels.push((eventLabel.name as string).toLowerCase());
    }

    return labels;
  }

  /**
   * Check if labels indicate authorized development work
   *
   * Only explicit authorization labels trigger development routing.
   * Categorization labels (bug, enhancement, feature) indicate what
   * an issue IS, not that it's been approved for development. Those
   * go through governance evaluation first.
   */
  private hasDevelopmentLabel(labels: string[]): boolean {
    const authorizationLabels = [
      'ready-for-development',
      'approved-for-development',
      'implement',
      'engineer',
    ];

    return labels.some((label) =>
      authorizationLabels.some((devLabel) => label.includes(devLabel))
    );
  }

  /**
   * Check if a specific role is appropriate for a request
   *
   * @param request - Governance request
   * @param role - Role to check
   * @returns Whether this role can handle the request
   */
  canHandle(request: GovernanceRequest, role: RoleDefinition): boolean {
    return role.acceptsTrust.includes(request.trust);
  }
}
