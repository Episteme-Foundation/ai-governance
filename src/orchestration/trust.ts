import { TrustLevel, GovernanceRequest } from '../types';

/**
 * Trust classification service
 *
 * Maps request sources and identities to trust levels
 */
export class TrustClassifier {
  /**
   * Determine the trust level for a request
   *
   * @param request - Incoming governance request
   * @returns Appropriate trust level
   */
  classify(request: GovernanceRequest): TrustLevel {
    const { channel, identity } = request.source;

    switch (channel) {
      case 'github_webhook':
        return this.classifyGitHubWebhook(identity);

      case 'public_api':
        return 'anonymous';

      case 'contributor_api':
        return this.classifyContributorAPI(identity);

      case 'admin_cli':
        return 'elevated';

      default:
        return 'anonymous';
    }
  }

  /**
   * Classify GitHub webhook based on user/role
   */
  private classifyGitHubWebhook(identity?: string): TrustLevel {
    if (!identity) {
      return 'anonymous';
    }

    // TODO: Query GitHub API to check user's role in the repository
    // For now, use simple heuristics:

    // Check if identity indicates a maintainer/admin
    if (identity.includes('maintainer') || identity.includes('admin')) {
      return 'elevated';
    }

    // Check if identity indicates a collaborator
    if (identity.includes('collaborator') || identity.includes('member')) {
      return 'authorized';
    }

    // Default to contributor for GitHub users
    return 'contributor';
  }

  /**
   * Classify contributor API based on API key
   */
  private classifyContributorAPI(identity?: string): TrustLevel {
    if (!identity) {
      return 'anonymous';
    }

    // TODO: Look up API key in database to determine trust level
    // For now, default to contributor
    return 'contributor';
  }
}
