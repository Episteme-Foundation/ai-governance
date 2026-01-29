import { TrustLevel, GovernanceRequest } from '../types';
import { github } from '../mcp/github/auth';

/**
 * Trust classification service
 *
 * Maps request sources and identities to trust levels.
 * Uses GitHub API to look up actual repository permissions when available.
 */
export class TrustClassifier {
  // Cache permission lookups to avoid repeated API calls
  private permissionCache: Map<string, { permission: TrustLevel; expiresAt: number }> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Determine the trust level for a request (synchronous version)
   * Uses cached values when available, falls back to heuristics.
   *
   * @param request - Incoming governance request
   * @returns Appropriate trust level
   */
  classify(request: GovernanceRequest): TrustLevel {
    const { channel, identity } = request.source;

    switch (channel) {
      case 'github_webhook':
        return this.classifyGitHubWebhookSync(request, identity);

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
   * Determine the trust level for a request (async version with API lookup)
   * Performs actual GitHub API lookup for permissions.
   *
   * @param request - Incoming governance request
   * @returns Appropriate trust level
   */
  async classifyAsync(request: GovernanceRequest): Promise<TrustLevel> {
    const { channel, identity } = request.source;

    switch (channel) {
      case 'github_webhook':
        return this.classifyGitHubWebhookAsync(request, identity);

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
   * Classify GitHub webhook (sync, uses cache/heuristics)
   */
  private classifyGitHubWebhookSync(request: GovernanceRequest, identity?: string): TrustLevel {
    if (!identity) {
      return 'anonymous';
    }

    // Check cache first
    const cacheKey = this.getCacheKey(request.project, identity);
    const cached = this.permissionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.permission;
    }

    // Fall back to heuristics if no cache hit
    return 'contributor'; // Conservative default for GitHub users
  }

  /**
   * Classify GitHub webhook (async, performs API lookup)
   */
  private async classifyGitHubWebhookAsync(
    request: GovernanceRequest,
    identity?: string
  ): Promise<TrustLevel> {
    if (!identity) {
      return 'anonymous';
    }

    // Check cache first
    const cacheKey = this.getCacheKey(request.project, identity);
    const cached = this.permissionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.permission;
    }

    // Parse owner/repo from project ID
    const [owner, repo] = request.project.split('/');
    if (!owner || !repo) {
      // Can't look up permissions without owner/repo
      return 'contributor';
    }

    try {
      // Query GitHub API for actual permissions
      const permission = await github.getCollaboratorPermission(owner, repo, identity);
      const trustLevel = this.mapGitHubPermissionToTrust(permission.permission);

      // Cache the result
      this.permissionCache.set(cacheKey, {
        permission: trustLevel,
        expiresAt: Date.now() + this.cacheTTL,
      });

      return trustLevel;
    } catch (error) {
      // If API call fails, fall back to conservative default
      console.warn(`Failed to get GitHub permissions for ${identity}:`, error);
      return 'contributor';
    }
  }

  /**
   * Map GitHub repository permission to trust level
   *
   * GitHub permissions:
   * - admin: Full repository access
   * - maintain: Repository maintenance
   * - write: Push access
   * - triage: Manage issues/PRs without write
   * - read: Read-only access
   * - none: No access
   */
  private mapGitHubPermissionToTrust(
    permission: 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none'
  ): TrustLevel {
    switch (permission) {
      case 'admin':
        return 'elevated';
      case 'maintain':
        return 'elevated';
      case 'write':
        return 'authorized';
      case 'triage':
        return 'contributor';
      case 'read':
        return 'contributor';
      case 'none':
        return 'anonymous';
      default:
        return 'anonymous';
    }
  }

  /**
   * Get cache key for permission lookup
   */
  private getCacheKey(project: string, identity: string): string {
    return `${project}:${identity}`;
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

  /**
   * Clear the permission cache (useful for testing)
   */
  clearCache(): void {
    this.permissionCache.clear();
  }
}
