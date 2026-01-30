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
import { MCPExecutor } from './mcp-executor';

// Type definitions for Claude API responses
interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type ContentBlock = TextBlock | ToolUseBlock;

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Agent invoker - executes governance agents with proper context and hooks
 *
 * Implements an agentic loop that:
 * 1. Calls Claude with tools
 * 2. Validates tool use with hooks
 * 3. Executes tools via MCP servers
 * 4. Continues until stop_reason is 'end_turn'
 */
export class AgentInvoker {
  constructor(
    private readonly anthropic: Anthropic,
    private readonly promptBuilder: SystemPromptBuilder,
    private readonly sessionRepo: SessionRepository,
    private readonly auditRepo: AuditRepository,
    private readonly decisionRepo: DecisionRepository,
    private readonly embeddingsService: EmbeddingsService,
    private readonly mcpExecutor: MCPExecutor
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

    // 4. Get available tools filtered by role permissions
    const tools = this.mcpExecutor.getToolDefinitions(
      role.tools.allowed.length > 0 ? role.tools.allowed : undefined,
      role.tools.denied.length > 0 ? role.tools.denied : undefined
    );

    console.log(`[Agent] Tools available for role ${role.name}:`, tools.map(t => t.name));
    console.log(`[Agent] Role allowed tools:`, role.tools.allowed);

    // 5. Build initial messages with context from the request
    // Extract key context from payload for tool usage
    const payload = request.payload || {};
    const owner = payload.owner as string || '';
    const repo = payload.repo as string || '';
    const pullRequest = payload.pull_request as Record<string, unknown> | undefined;
    const issue = payload.issue as Record<string, unknown> | undefined;
    const prNumber = pullRequest?.number;
    const issueNumber = issue?.number;

    let userMessage = request.intent;
    if (owner && repo) {
      userMessage += `\n\nContext for GitHub API calls:\n- Owner: ${owner}\n- Repo: ${repo}`;
      if (prNumber) userMessage += `\n- PR Number: ${prNumber}`;
      if (issueNumber && !prNumber) userMessage += `\n- Issue Number: ${issueNumber}`;
      userMessage += `\n\nUse these values when calling GitHub tools (github_get_pr, github_comment, etc).`;
    }

    console.log(`[Agent] User message with context:`, userMessage);

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: userMessage,
      },
    ];

    // Track tool uses and decisions for stop hook validation
    const toolUses: Array<{ tool: string; input: unknown; output: unknown }> = [];
    const decisionsLogged: string[] = [];

    try {
      // 6. Agentic loop
      let continueLoop = true;
      let finalResponse = '';
      let iterations = 0;
      const maxIterations = 20; // Safety limit

      while (continueLoop && iterations < maxIterations) {
        iterations++;

        // Call Claude API
        const response = await this.anthropic.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 8192,
          system: systemPrompt,
          messages,
          tools: tools.length > 0 ? tools : undefined,
        });

        console.log(`[Agent] Claude response - stop_reason: ${response.stop_reason}, content_types:`, response.content.map(c => c.type));

        // Process response content
        const assistantContent: ContentBlock[] = [];
        const toolResults: ToolResultBlock[] = [];

        for (const block of response.content) {
          if (block.type === 'text') {
            assistantContent.push(block as TextBlock);
            finalResponse += (block as TextBlock).text;
          } else if (block.type === 'tool_use') {
            const toolUse = block as ToolUseBlock;
            assistantContent.push(toolUse);

            // Validate with pre-tool hook (correct parameter order)
            const validation = await preToolUse.validate(
              toolUse.name,
              toolUse.input,
              request,
              role
            );

            if (!validation.allowed) {
              // Tool use denied by hook
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify({
                  error: true,
                  message: `Tool use denied: ${validation.reason}`,
                }),
                is_error: true,
              });
              continue;
            }

            // Execute tool
            const result = await this.mcpExecutor.executeTool(
              toolUse.name,
              toolUse.input
            );

            // Track tool use
            toolUses.push({
              tool: toolUse.name,
              input: toolUse.input,
              output: result.result,
            });

            // Run post-tool hook (correct parameter order with all 6 params)
            await postToolUse.process(
              toolUse.name,
              toolUse.input,
              result.result,
              request,
              role,
              validation.requiresDecisionLogging || false
            );

            // Check if this was a decision logging tool
            if (toolUse.name === 'log_decision' && result.success) {
              const decisionResult = result.result as { decision_id?: string };
              if (decisionResult.decision_id) {
                decisionsLogged.push(decisionResult.decision_id);
              }
            }

            // Add tool result
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result.success
                ? JSON.stringify(result.result, null, 2)
                : JSON.stringify({ error: true, message: result.error }),
              is_error: !result.success,
            });
          }
        }

        // Add assistant message to conversation
        messages.push({
          role: 'assistant',
          content: assistantContent as Anthropic.Messages.ContentBlock[],
        });

        // If there were tool uses, add results and continue
        if (toolResults.length > 0) {
          messages.push({
            role: 'user',
            content: toolResults as Anthropic.Messages.ToolResultBlockParam[],
          });
        }

        // Check if we should continue
        if (response.stop_reason === 'end_turn') {
          continueLoop = false;
        } else if (response.stop_reason === 'tool_use') {
          // Continue to process tool results
          continueLoop = true;
        } else {
          // Other stop reasons (max_tokens, etc.)
          continueLoop = false;
        }
      }

      // 7. Validate with stop hook before completing
      // Extract just the tool names for stop validation
      const significantActions = toolUses.map((t) => t.tool);
      const stopValidation = await stopHook.validate(
        request,
        role,
        significantActions,
        decisionsLogged
      );

      if (!stopValidation.canComplete) {
        // Log warning but don't fail - the agent may have legitimate reasons
        console.warn('Stop hook validation warning:', stopValidation.reason, stopValidation.missingDecisions);
      }

      return finalResponse;
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
