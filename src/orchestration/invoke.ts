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
import { ConversationRepository } from '../db/repositories/conversation-repository';
import { ConversationThreadRepository } from '../db/repositories/conversation-thread-repository';
import { EmbeddingsService } from '../context/embeddings';
import { MCPExecutor } from './mcp-executor';
import { ConversationServer } from '../mcp/conversation/server';
import {
  emitSessionStart,
  emitSessionEnd,
  emitApiRequest,
  emitToolUse,
  emitToolDenied,
  emitDecisionLogged,
  recordSession,
  recordTokens,
  recordToolUse as recordToolMetric,
  recordDecision,
  recordApiDuration,
  createTrace,
  createGeneration,
  createSpan,
  flushLangfuse,
} from '../observability';

// Maximum depth for recursive agent conversations to prevent infinite loops
const MAX_CONVERSATION_DEPTH = 5;

/**
 * Options for agent invocation
 */
interface InvokeOptions {
  /** Current conversation depth (for recursive agent-to-agent calls) */
  conversationDepth?: number;
  /** ID of active conversation thread (for context injection) */
  conversationId?: string;
}

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
    private readonly mcpExecutor: MCPExecutor,
    private readonly conversationRepo?: ConversationRepository,
    private readonly conversationThreadRepo?: ConversationThreadRepository
  ) {}

  /**
   * Create a ConversationServer for a specific role invocation
   * The server is scoped to the current role and project
   */
  private createConversationServer(
    currentRole: string,
    project: ProjectConfig,
    depth: number = 0
  ): ConversationServer | null {
    if (!this.conversationThreadRepo) {
      return null;
    }

    // Create the callback for invoking other agents
    const invokeAgentCallback = async (
      targetRole: string,
      conversationContext: string,
      conversationId: string
    ): Promise<string> => {
      // Prevent infinite recursion
      if (depth >= MAX_CONVERSATION_DEPTH) {
        return `[Error: Maximum conversation depth (${MAX_CONVERSATION_DEPTH}) reached. Cannot invoke ${targetRole}.]`;
      }

      // Find the target role definition
      const targetRoleDef = project.roles?.find((r) => r.name === targetRole);
      if (!targetRoleDef) {
        return `[Error: Role "${targetRole}" not found in project configuration.]`;
      }

      // Create a synthetic governance request for the conversation
      const conversationRequest: GovernanceRequest = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        trust: 'authorized', // Agent-to-agent conversations are trusted
        source: {
          channel: 'contributor_api',
          identity: currentRole,
        },
        project: project.id,
        intent: conversationContext,
        payload: {
          conversation_id: conversationId,
          from_role: currentRole,
        },
      };

      // Invoke the target agent (with increased depth to prevent infinite recursion)
      return this.invokeInternal(
        conversationRequest,
        targetRoleDef,
        project,
        depth + 1,
        conversationId
      );
    };

    // Create the callback for creating GitHub issues (for async notifications)
    const createIssueCallback = async (params: {
      title: string;
      body: string;
      labels: string[];
    }): Promise<{ issue_number: number; html_url: string }> => {
      // Extract owner/repo from project config or environment
      // For now, use the project repository URL to extract these
      const repoUrl = project.repository || '';
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) {
        throw new Error('Could not determine repository from project configuration');
      }
      const [, owner, repo] = match;

      // Call the GitHub MCP server's create_issue tool
      const result = await this.mcpExecutor.executeTool('create_issue', {
        owner,
        repo: repo.replace(/\.git$/, ''),
        title: params.title,
        body: params.body,
        labels: params.labels,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to create issue');
      }

      const issueResult = result.result as {
        number?: number;
        html_url?: string;
      };

      return {
        issue_number: issueResult.number || 0,
        html_url: issueResult.html_url || '',
      };
    };

    return new ConversationServer(
      this.conversationThreadRepo,
      invokeAgentCallback,
      currentRole,
      project.id,
      createIssueCallback
    );
  }

  /**
   * Internal invoke method that supports conversation depth tracking
   */
  private async invokeInternal(
    request: GovernanceRequest,
    role: RoleDefinition,
    project: ProjectConfig,
    conversationDepth: number = 0,
    conversationId?: string
  ): Promise<string> {
    return this.invokeWithOptions(request, role, project, {
      conversationDepth,
      conversationId,
    });
  }

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
    return this.invokeWithOptions(request, role, project, {});
  }

  /**
   * Invoke an agent with additional options for conversation tracking
   *
   * @param request - Governance request
   * @param role - Role the agent should fulfill
   * @param project - Project configuration
   * @param options - Additional invocation options
   * @returns Agent response
   */
  private async invokeWithOptions(
    request: GovernanceRequest,
    role: RoleDefinition,
    project: ProjectConfig,
    options: InvokeOptions
  ): Promise<string> {
    const { conversationDepth = 0, conversationId } = options;
    // 1. Create session
    const sessionStartTime = Date.now();
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

    // Emit session start event
    emitSessionStart({
      sessionId: session.id,
      projectId: project.id,
      role: role.name,
      trustLevel: request.trust,
      intent: request.intent,
    });
    recordSession({ role: role.name, trustLevel: request.trust });

    // Create Langfuse trace for this session
    const langfuseTrace = createTrace({
      id: session.id,
      name: role.name,
      sessionId: project.id,
      metadata: {
        trustLevel: request.trust,
        channel: request.source.channel,
        identity: request.source.identity || 'anonymous',
      },
      tags: [role.name, request.trust, request.source.channel],
      input: request.intent,
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

    // 3.5. Create ConversationServer for agent-to-agent communication
    const conversationServer = this.createConversationServer(
      role.name,
      project,
      conversationDepth
    );

    // 4. Get available tools filtered by role permissions
    const mcpTools = this.mcpExecutor.getToolDefinitions(
      role.tools.allowed.length > 0 ? role.tools.allowed : undefined,
      role.tools.denied.length > 0 ? role.tools.denied : undefined
    );

    // Add conversation tools if conversation server is available
    const conversationTools = conversationServer?.getToolDefinitions() || [];
    const tools = [...mcpTools, ...conversationTools];

    console.log(`[Agent] Tools available for role ${role.name}:`, tools.map(t => t.name));
    console.log(`[Agent] Role allowed tools:`, role.tools.allowed);

    // 5. Build initial messages with context from the request
    // Extract key context from payload for tool usage
    const payload = request.payload || {};
    let owner = payload.owner as string || '';
    let repo = payload.repo as string || '';
    const pullRequest = payload.pull_request as Record<string, unknown> | undefined;
    const issue = payload.issue as Record<string, unknown> | undefined;
    const prNumber = pullRequest?.number;
    const issueNumber = issue?.number;

    // Derive owner/repo from project config if not in payload
    if (!owner || !repo) {
      const repoUrl = project.repository || '';
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) {
        owner = owner || match[1];
        repo = repo || match[2].replace(/\.git$/, '');
      }
    }

    let userMessage = request.intent;

    // Add conversation context if this is part of an active conversation
    if (conversationId) {
      userMessage += `\n\n[You are responding within conversation ${conversationId}. Your response will be returned to the agent who invoked you.]`;
    }

    // Always include GitHub context when available
    if (owner && repo) {
      userMessage += `\n\nContext for GitHub API calls:\n- Owner: ${owner}\n- Repo: ${repo}`;
      if (prNumber) userMessage += `\n- PR Number: ${prNumber}`;
      if (issueNumber && !prNumber) userMessage += `\n- Issue Number: ${issueNumber}`;
      userMessage += `\n\nUse these values when calling GitHub tools (e.g., get_file_contents, add_issue_comment, merge_pull_request).`;
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

    // Track turn number for conversation logging
    let turnNumber = 0;

    // Log initial user message
    if (this.conversationRepo) {
      await this.conversationRepo.logTurn({
        sessionId: session.id,
        turnNumber: turnNumber++,
        role: 'user',
        content: userMessage,
      });
    }

    try {
      // 6. Agentic loop
      let continueLoop = true;
      let finalResponse = '';
      let iterations = 0;
      const maxIterations = 20; // Safety limit

      // Track totals for session end telemetry
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      while (continueLoop && iterations < maxIterations) {
        iterations++;

        // Call Claude API with prompt caching for the system prompt.
        // The system prompt (philosophy + constitution + role instructions) is
        // large and stable across turns, so caching saves significant tokens.
        const apiStartTime = Date.now();
        // Use type assertion for cache_control (supported by API but not yet
        // typed in SDK v0.31.0)
        const systemBlock = {
          type: 'text' as const,
          text: systemPrompt,
          cache_control: { type: 'ephemeral' as const },
        };
        const response = await this.anthropic.messages.create({
          model: 'claude-opus-4-6-20260205',
          max_tokens: 8192,
          system: [systemBlock] as unknown as Anthropic.Messages.TextBlockParam[],
          messages,
          tools: tools.length > 0 ? tools : undefined,
        }, {
          timeout: 5 * 60 * 1000, // 5 minute timeout per API call
        });
        const apiDurationMs = Date.now() - apiStartTime;

        // Emit API request telemetry
        emitApiRequest({
          sessionId: session.id,
          model: response.model,
          inputTokens: response.usage?.input_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
          cacheReadTokens: (response.usage as { cache_read_input_tokens?: number })?.cache_read_input_tokens || 0,
          cacheCreationTokens: (response.usage as { cache_creation_input_tokens?: number })?.cache_creation_input_tokens || 0,
          durationMs: apiDurationMs,
        });
        recordApiDuration(apiDurationMs, { model: response.model });
        recordTokens('input', response.usage?.input_tokens || 0, { model: response.model });
        recordTokens('output', response.usage?.output_tokens || 0, { model: response.model });

        // Track session totals
        totalInputTokens += response.usage?.input_tokens || 0;
        totalOutputTokens += response.usage?.output_tokens || 0;

        // Log generation to Langfuse
        if (langfuseTrace) {
          createGeneration(langfuseTrace, {
            name: `turn-${iterations}`,
            model: response.model,
            input: { system: systemPrompt, messages, tools },
            output: response.content,
            usage: {
              input: response.usage?.input_tokens,
              output: response.usage?.output_tokens,
            },
            metadata: {
              stopReason: response.stop_reason,
              durationMs: apiDurationMs,
            },
          });
        }

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
              // Tool use denied by hook - emit telemetry
              emitToolDenied({
                sessionId: session.id,
                toolName: toolUse.name,
                reason: validation.reason || 'unknown',
                trustLevel: request.trust,
              });

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

            // Execute tool - route to appropriate server
            const toolStartTime = Date.now();
            const conversationToolNames = ['converse', 'end_conversation', 'list_conversations', 'get_conversation'];
            const isConversationTool = conversationToolNames.includes(toolUse.name);

            let result: { success: boolean; result?: unknown; error?: string };
            let toolServer: string;

            if (isConversationTool && conversationServer) {
              // Execute via ConversationServer
              try {
                const conversationResult = await conversationServer.executeTool(
                  toolUse.name,
                  toolUse.input
                );
                result = { success: true, result: conversationResult };
                toolServer = 'conversation';
              } catch (error) {
                result = {
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown error',
                };
                toolServer = 'conversation';
              }
            } else {
              // Execute via MCP executor
              result = await this.mcpExecutor.executeTool(
                toolUse.name,
                toolUse.input
              );
              toolServer = this.mcpExecutor.getToolServer(toolUse.name) || 'unknown';
            }
            const toolDurationMs = Date.now() - toolStartTime;
            emitToolUse({
              sessionId: session.id,
              toolName: toolUse.name,
              server: toolServer,
              success: result.success,
              durationMs: toolDurationMs,
              error: result.error,
            });
            recordToolMetric({
              toolName: toolUse.name,
              server: toolServer,
              success: result.success,
              durationMs: toolDurationMs,
            });

            // Log tool span to Langfuse
            if (langfuseTrace) {
              createSpan(langfuseTrace, {
                name: `tool:${toolUse.name}`,
                input: toolUse.input,
                output: result.result,
                metadata: {
                  server: toolServer,
                  success: result.success,
                  durationMs: toolDurationMs,
                  error: result.error,
                },
              });
            }

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

                // Emit decision logged telemetry
                const actionType = (toolUse.input as { action_type?: string })?.action_type || 'unknown';
                emitDecisionLogged({
                  sessionId: session.id,
                  decisionId: decisionResult.decision_id,
                  actionType,
                });
                recordDecision({ actionType });
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

        // Log assistant response
        if (this.conversationRepo) {
          await this.conversationRepo.logTurn({
            sessionId: session.id,
            turnNumber: turnNumber++,
            role: 'assistant',
            content: assistantContent,
            model: response.model,
            stopReason: response.stop_reason ?? undefined,
            inputTokens: response.usage?.input_tokens,
            outputTokens: response.usage?.output_tokens,
          });
        }

        // If there were tool uses, add results and continue
        if (toolResults.length > 0) {
          messages.push({
            role: 'user',
            content: toolResults as Anthropic.Messages.ToolResultBlockParam[],
          });

          // Log tool results
          if (this.conversationRepo) {
            await this.conversationRepo.logTurn({
              sessionId: session.id,
              turnNumber: turnNumber++,
              role: 'tool_result',
              content: toolResults,
            });
          }
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

      // Emit session end telemetry
      emitSessionEnd({
        sessionId: session.id,
        status: 'completed',
        totalTurns: iterations,
        totalInputTokens,
        totalOutputTokens,
        totalDurationMs: Date.now() - sessionStartTime,
      });

      // Finalize Langfuse trace
      if (langfuseTrace) {
        langfuseTrace.update({
          output: finalResponse,
          metadata: {
            totalTurns: iterations,
            totalInputTokens,
            totalOutputTokens,
            totalDurationMs: Date.now() - sessionStartTime,
            decisionsLogged: decisionsLogged.length,
            toolsUsed: toolUses.length,
          },
        });
        await flushLangfuse();
      }

      return finalResponse;
    } catch (error) {
      // Emit session end telemetry for failure
      emitSessionEnd({
        sessionId: session.id,
        status: 'failed',
        totalTurns: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalDurationMs: Date.now() - sessionStartTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Finalize Langfuse trace on error
      if (langfuseTrace) {
        langfuseTrace.update({
          output: { error: error instanceof Error ? error.message : 'Unknown error' },
          metadata: {
            status: 'failed',
            totalDurationMs: Date.now() - sessionStartTime,
          },
        });
        await flushLangfuse();
      }

      // Handle errors
      await stopHook.forceComplete(
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
