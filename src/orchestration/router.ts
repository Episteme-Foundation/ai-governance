import { GovernanceRequest, RoleDefinition, ProjectConfig } from '../types';

/**
 * Request router - determines which role should handle a request
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
    // Simple routing logic based on request intent and trust level
    // In a full implementation, this would use more sophisticated matching

    // For now, just return the first role that accepts this trust level
    for (const role of project.roles) {
      if (role.acceptsTrust.includes(request.trust)) {
        return role;
      }
    }

    // Fallback to a default "Reception" role if configured
    const receptionRole = project.roles.find((r) => r.name === 'Reception');
    if (receptionRole) {
      return receptionRole;
    }

    // If no suitable role found, throw error
    throw new Error(
      `No role found to handle request with trust level: ${request.trust}`
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
