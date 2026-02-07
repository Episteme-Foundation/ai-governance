import {
  GovernanceRequest,
  RoleDefinition,
  Constraint,
  TrustLevel,
} from '../types';
import { AuditRepository } from '../db/repositories/audit-repository';

/**
 * Result of pre-tool-use validation
 */
export interface PreToolUseResult {
  allowed: boolean;
  reason?: string;
  requiresDecisionLogging?: boolean;
}

/**
 * PreToolUse hook - enforces trust gating and role constraints
 *
 * This hook is called before each tool use to:
 * 1. Verify the request trust level permits the tool
 * 2. Check the tool is in the role's allowed list
 * 3. Evaluate hard constraints
 * 4. Determine if this action requires decision logging
 */
export class PreToolUseHook {
  constructor(
    private readonly auditRepo: AuditRepository,
    private readonly sessionId: string,
    private readonly projectId: string
  ) {}

  /**
   * Check if a tool use is allowed
   *
   * @param toolName - Name of the tool being used
   * @param toolInput - Input parameters to the tool
   * @param request - Original governance request
   * @param role - Role being fulfilled
   * @returns Validation result
   */
  async validate(
    toolName: string,
    toolInput: Record<string, unknown>,
    request: GovernanceRequest,
    role: RoleDefinition
  ): Promise<PreToolUseResult> {
    // Log the intent before validation
    await this.auditRepo.log({
      projectId: this.projectId,
      sessionId: this.sessionId,
      eventType: 'tool_use_attempt',
      actor: request.source.identity || 'anonymous',
      action: `Attempting to use tool: ${toolName}`,
      details: {
        toolName,
        toolInput,
        trustLevel: request.trust,
        role: role.name,
      },
      trustLevel: request.trust,
    });

    // 1. Check if tool is in allowed list
    if (role.tools.denied.includes(toolName)) {
      return {
        allowed: false,
        reason: `Tool "${toolName}" is explicitly denied for role ${role.name}`,
      };
    }

    if (
      role.tools.allowed.length > 0 &&
      !role.tools.allowed.includes(toolName)
    ) {
      return {
        allowed: false,
        reason: `Tool "${toolName}" is not in the allowed list for role ${role.name}`,
      };
    }

    // 2. Evaluate hard constraints
    for (const constraint of role.constraints || []) {
      if (constraint.enforcement === 'hard') {
        const violated = await this.evaluateConstraint(
          constraint,
          toolName,
          toolInput,
          request
        );
        if (violated) {
          return {
            allowed: false,
            reason: `Hard constraint violated: ${constraint.description}`,
          };
        }
      }
    }

    // 3. Determine if decision logging is required
    const requiresDecisionLogging =
      role.significantActions?.includes(toolName) || false;

    return {
      allowed: true,
      requiresDecisionLogging,
    };
  }

  /**
   * Evaluate a constraint against a tool use
   *
   * @param constraint - Constraint to evaluate
   * @param toolName - Tool being used
   * @param toolInput - Tool input parameters
   * @param request - Governance request
   * @returns True if constraint is violated
   */
  private async evaluateConstraint(
    constraint: Constraint,
    toolName: string,
    toolInput: Record<string, unknown>,
    request: GovernanceRequest
  ): Promise<boolean> {
    switch (constraint.type) {
      case 'trust_level':
        // Example: "Elevated trust required for this action"
        return this.checkTrustLevel(
          request.trust,
          constraint.parameters?.minTrust as TrustLevel
        );

      case 'rate_limit':
        // Example: "Max 10 actions per hour"
        return this.checkRateLimit(
          constraint.parameters?.limit as number,
          constraint.parameters?.windowMs as number
        );

      case 'approval_required':
        // Example: "Human approval required"
        return this.checkApproval(constraint.parameters?.approver as string);

      default:
        // Unknown constraint type - log warning but don't block
        console.warn(`Unknown constraint type: ${constraint.type}`);
        return false;
    }
  }

  /**
   * Check if request trust level meets minimum requirement
   */
  private checkTrustLevel(
    actualTrust: TrustLevel,
    requiredTrust: TrustLevel
  ): boolean {
    const trustHierarchy: TrustLevel[] = [
      'anonymous',
      'contributor',
      'authorized',
      'elevated',
    ];

    const actualLevel = trustHierarchy.indexOf(actualTrust);
    const requiredLevel = trustHierarchy.indexOf(requiredTrust);

    return actualLevel < requiredLevel;
  }

  /**
   * Check rate limiting (placeholder)
   */
  private async checkRateLimit(
    _limit: number,
    _windowMs: number
  ): Promise<boolean> {
    // TODO: Implement rate limiting using Redis
    return false;
  }

  /**
   * Check if approval has been granted (placeholder)
   */
  private async checkApproval(_approver: string): Promise<boolean> {
    // TODO: Implement approval tracking
    return false;
  }
}
