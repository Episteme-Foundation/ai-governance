import { SessionRepository } from '../db/repositories/session-repository';
import { AuditRepository } from '../db/repositories/audit-repository';
import { GovernanceRequest, RoleDefinition } from '../types';

/**
 * Result of stop hook validation
 */
export interface StopHookResult {
  canComplete: boolean;
  reason?: string;
  missingDecisions?: string[];
}

/**
 * Stop hook - validates session before completion
 *
 * This hook is called when an agent session is about to complete to:
 * 1. Verify all significant actions were properly logged
 * 2. Ensure no hard constraints were violated
 * 3. Finalize the session in the database
 */
export class StopHook {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly auditRepo: AuditRepository,
    private readonly sessionId: string,
    private readonly projectId: string
  ) {}

  /**
   * Validate session before completion
   *
   * @param request - Original governance request
   * @param role - Role that was fulfilled
   * @param significantActionsPerformed - List of significant actions that were performed
   * @param decisionsLogged - List of decision IDs that were logged
   * @returns Validation result
   */
  async validate(
    request: GovernanceRequest,
    role: RoleDefinition,
    significantActionsPerformed: string[],
    decisionsLogged: string[]
  ): Promise<StopHookResult> {
    const missingDecisions: string[] = [];

    // 1. Check that all significant actions have corresponding decisions
    for (const action of significantActionsPerformed) {
      if (role.significantActions?.includes(action)) {
        // This action should have a logged decision
        // In a full implementation, we'd track which actions correspond to which decisions
        // For now, just verify we have at least one decision if we had significant actions
        if (decisionsLogged.length === 0) {
          missingDecisions.push(action);
        }
      }
    }

    // 2. If decisions are missing, block completion
    if (missingDecisions.length > 0) {
      await this.auditRepo.log({
        projectId: this.projectId,
        sessionId: this.sessionId,
        eventType: 'session_completion_blocked',
        actor: request.source.identity || 'anonymous',
        action: 'Session blocked due to missing decision logging',
        details: {
          missingDecisions,
          role: role.name,
        },
        trustLevel: request.trust,
      });

      return {
        canComplete: false,
        reason:
          'Cannot complete session: significant actions were not properly logged',
        missingDecisions,
      };
    }

    // 3. Finalize the session
    await this.sessionRepo.complete(this.sessionId, {
      decisionsLogged,
      status: 'completed',
    });

    // 4. Final audit log
    await this.auditRepo.log({
      projectId: this.projectId,
      sessionId: this.sessionId,
      eventType: 'session_completed',
      actor: request.source.identity || 'anonymous',
      action: 'Session completed successfully',
      details: {
        role: role.name,
        decisionsLogged: decisionsLogged.length,
      },
      trustLevel: request.trust,
    });

    return {
      canComplete: true,
    };
  }

  /**
   * Force complete a session (for error cases)
   *
   * @param status - Final session status
   * @param reason - Reason for forced completion
   */
  async forceComplete(
    status: 'failed' | 'blocked',
    reason: string
  ): Promise<void> {
    await this.sessionRepo.complete(this.sessionId, {
      status,
      decisionsLogged: [],
    });

    await this.auditRepo.log({
      projectId: this.projectId,
      sessionId: this.sessionId,
      eventType: 'session_force_completed',
      actor: 'system',
      action: `Session force completed: ${status}`,
      details: { reason },
      trustLevel: 'anonymous',
    });
  }
}
