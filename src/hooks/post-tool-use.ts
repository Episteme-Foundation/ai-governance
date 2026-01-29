import {
  GovernanceRequest,
  RoleDefinition,
  Decision,
} from '../types';
import { DecisionRepository } from '../db/repositories/decision-repository';
import { AuditRepository } from '../db/repositories/audit-repository';
import { EmbeddingsService } from '../context/embeddings';

/**
 * Result of post-tool-use processing
 */
export interface PostToolUseResult {
  success: boolean;
  decisionLogged?: boolean;
  decisionId?: string;
  warnings?: string[];
}

/**
 * PostToolUse hook - handles decision logging and reasoning verification
 *
 * This hook is called after each tool use to:
 * 1. Log significant actions as decisions
 * 2. Verify reasoning was provided for important actions
 * 3. Audit the tool use result
 */
export class PostToolUseHook {
  constructor(
    private readonly decisionRepo: DecisionRepository,
    private readonly auditRepo: AuditRepository,
    private readonly embeddingsService: EmbeddingsService,
    private readonly sessionId: string,
    private readonly projectId: string
  ) {}

  /**
   * Process tool use result
   *
   * @param toolName - Name of the tool that was used
   * @param toolInput - Input parameters
   * @param toolOutput - Output result
   * @param request - Original governance request
   * @param role - Role being fulfilled
   * @param requiresDecisionLogging - Whether this action requires decision logging
   * @returns Processing result
   */
  async process(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolOutput: unknown,
    request: GovernanceRequest,
    role: RoleDefinition,
    requiresDecisionLogging: boolean
  ): Promise<PostToolUseResult> {
    const warnings: string[] = [];

    // 1. Audit the tool use
    await this.auditRepo.log({
      projectId: this.projectId,
      sessionId: this.sessionId,
      eventType: 'tool_use_completed',
      actor: request.source.identity || 'anonymous',
      action: `Completed tool: ${toolName}`,
      details: {
        toolName,
        toolInput,
        toolOutput,
        trustLevel: request.trust,
        role: role.name,
      },
      trustLevel: request.trust,
    });

    // 2. Log decision if required
    let decisionLogged = false;
    let decisionId: string | undefined;

    if (requiresDecisionLogging) {
      // Extract decision information from tool output
      const decisionInfo = this.extractDecisionInfo(
        toolName,
        toolInput,
        toolOutput
      );

      if (!decisionInfo.reasoning) {
        warnings.push(
          'Significant action performed without documented reasoning'
        );
      } else {
        // Generate embedding for decision
        const decisionText = `${decisionInfo.title}\n${decisionInfo.decision}\n${decisionInfo.reasoning}`;
        const embedding = await this.embeddingsService.embed(decisionText);

        // Log the decision
        const decision = await this.decisionRepo.create({
          projectId: this.projectId,
          decisionNumber: await this.decisionRepo.getNextDecisionNumber(
            this.projectId
          ),
          title: decisionInfo.title,
          date: new Date().toISOString().split('T')[0],
          status: 'adopted',
          decisionMaker: request.source.identity || role.name,
          decision: decisionInfo.decision,
          reasoning: decisionInfo.reasoning,
          considerations: decisionInfo.considerations,
          uncertainties: decisionInfo.uncertainties,
          reversibility: decisionInfo.reversibility,
          wouldChangeIf: decisionInfo.wouldChangeIf,
          embedding,
          relatedDecisions: [],
          tags: [toolName, role.name],
        });

        decisionLogged = true;
        decisionId = decision.id;

        // Update session with logged decision
        // TODO: Add decision ID to session.decisions_logged array
      }
    }

    return {
      success: true,
      decisionLogged,
      decisionId,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Extract decision information from tool output
   *
   * This attempts to parse structured decision information from the tool output.
   * In a real implementation, tools that perform significant actions would
   * return structured decision metadata.
   */
  private extractDecisionInfo(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolOutput: unknown
  ): Partial<Decision> {
    // Check if tool output includes decision metadata
    if (
      typeof toolOutput === 'object' &&
      toolOutput !== null &&
      'decision' in toolOutput
    ) {
      return toolOutput.decision as Partial<Decision>;
    }

    // Fallback: construct basic decision info from tool use
    return {
      title: `${toolName} execution`,
      decision: `Executed ${toolName} with parameters: ${JSON.stringify(toolInput)}`,
      reasoning: 'No explicit reasoning provided',
    };
  }
}
