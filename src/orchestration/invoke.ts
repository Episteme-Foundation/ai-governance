import Anthropic from '@anthropic-ai/sdk';
import {
  GovernanceRequest,
  RoleDefinition,
  ProjectConfig,
} from '../types';
import { SystemPromptBuilder } from '../context/prompt-builder';
import { PreToolUseHook } from '../hooks/pre-tool-use';
import { PostToolUseHook } from '../hooks/post-tool-use';
import { StopHook } from '../hooks/stop';
import { SessionRepository } from '../db/repositories/session-repository';
import { AuditRepository } from '../db/repositories/audit-repository';
import { DecisionRepository } from '../db/repositories/decision-repository';
import { EmbeddingsService } from '../context/embeddings';

/**
 * Agent invoker - executes governance agents with proper context and hooks
 */
export class AgentInvoker {
  constructor(
    private readonly anthropic: Anthropic,
    private readonly promptBuilder: SystemPromptBuilder,
    private readonly sessionRepo: SessionRepository,
    private readonly auditRepo: AuditRepository,
    private readonly decisionRepo: DecisionRepository,
    private readonly embeddingsService: EmbeddingsService
  ) {}

  /**
   * Invoke an agent to handle a governance request
   *
   * @param request - Governance request
   * @param role - Role the agent should fulfill
   * @param project - Project configuration
   * @returns Agent response
   */
  async invoke(
    request: GovernanceRequest,
    role: RoleDefinition,
    project: ProjectConfig
  ): Promise<string> {
    // 1. Create session
    const session = await this.sessionRepo.create({
      projectId: project.id,
      role: role.name,
      request,
      startedAt: new Date().toISOString(),
      status: 'active',
      toolUses: [],
      decisionsLogged: [],
      escalations: [],
    });

    // 2. Build system prompt
    const systemPrompt = await this.promptBuilder.build(
      project,
      role,
      request
    );

    // 3. Create hooks
    const preToolUse = new PreToolUseHook(
      this.auditRepo,
      session.id,
      project.id
    );
    const postToolUse = new PostToolUseHook(
      this.decisionRepo,
      this.auditRepo,
      this.embeddingsService,
      session.id,
      project.id
    );
    const stopHook = new StopHook(
      this.sessionRepo,
      this.auditRepo,
      session.id,
      project.id
    );

    try {
      // 4. Invoke Claude with streaming
      // NOTE: This is a simplified version. Full implementation would:
      // - Use Claude Agent SDK for tool execution
      // - Implement proper hook integration
      // - Handle MCP server connections
      // - Stream responses back

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: request.intent,
          },
        ],
      });

      // 5. Extract text response
      const textContent = response.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as any).text)
        .join('\n');

      // 6. Complete session
      await stopHook.validate(request, role, [], []);

      return textContent;
    } catch (error) {
      // Handle errors
      await stopHook.forceComplete(
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
