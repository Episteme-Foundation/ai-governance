import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import {
  createTrace,
  createSpan,
  createGeneration,
  flushLangfuse,
} from '../../observability/index.js';

// Lazy-load the Claude Agent SDK (ESM-only module requires dynamic import)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sdkModule: any = null;
async function getClaudeAgentSdk(): Promise<{ query: (params: { prompt: string; options?: Record<string, unknown> }) => AsyncIterable<Record<string, unknown>> }> {
  if (!_sdkModule) {
    _sdkModule = await import('@anthropic-ai/claude-agent-sdk');
  }
  return _sdkModule;
}

/**
 * Developer session state
 */
interface DeveloperSession {
  id: string;
  claudeSessionId?: string;
  status: 'active' | 'completed' | 'failed';
  startedAt: string;
  lastActivity: string;
  turns: Array<{
    prompt: string;
    response: string;
    timestamp: string;
    costUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    numTurns?: number;
    durationMs?: number;
  }>;
  workingDirectory: string;
  mcpConfig?: Record<string, unknown>;
}

/**
 * MCP Server for Developer operations via Claude Agent SDK
 *
 * Provides tools for:
 * - Invoking Claude Code to perform development tasks (via SDK, not CLI)
 * - Resuming sessions for iterative development
 * - Checking session status and history
 *
 * Uses the @anthropic-ai/claude-agent-sdk for a proper conversational loop
 * with streaming, permission handling, and structured output. The engineer
 * agent can observe Claude Code's progress and respond to questions.
 */
export class DeveloperServer {
  private server: Server;
  private sessions: Map<string, DeveloperSession> = new Map();
  private readonly repoRoot: string;
  private readonly mcpConfigPath?: string;

  constructor(
    repoRoot: string,
    options?: {
      mcpConfigPath?: string;
    }
  ) {
    this.repoRoot = repoRoot;
    this.mcpConfigPath = options?.mcpConfigPath;

    this.server = new Server(
      {
        name: 'developer',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'developer_invoke',
          description:
            'Invoke Claude Code to perform a development task. Creates a new session with Claude Code ' +
            'that has full capabilities: reading/writing files, running commands, git operations, etc. ' +
            'Uses the Claude Agent SDK for a conversational loop with streaming progress. ' +
            'Use this to delegate implementation work while retaining oversight.',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description:
                  'The development task to perform. Be specific about what should be accomplished, ' +
                  'what verification criteria apply, and any constraints.',
              },
              working_directory: {
                type: 'string',
                description: 'Working directory for the session (defaults to repo root)',
              },
              allowed_tools: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Specific tools to allow (e.g., ["Read", "Write", "Edit", "Bash"]). ' +
                  'If not specified, all tools are available.',
              },
              max_turns: {
                type: 'number',
                description: 'Maximum number of turns before stopping (default: 20)',
              },
              system_prompt: {
                type: 'string',
                description: 'Optional system prompt to prepend to the default Claude Code prompt',
              },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'developer_resume',
          description:
            'Resume an existing Claude Code session with additional context or feedback. ' +
            'Use this to continue iterative development, provide corrections, or guide the ' +
            'session toward completion.',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: {
                type: 'string',
                description: 'The session ID from a previous developer_invoke call',
              },
              prompt: {
                type: 'string',
                description:
                  'Additional guidance, feedback, or the next step for the session',
              },
            },
            required: ['session_id', 'prompt'],
          },
        },
        {
          name: 'developer_get_session',
          description:
            'Get the status and history of a development session. Use this to check on ' +
            'progress, review what was done, or get the session ID for resumption.',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: {
                type: 'string',
                description: 'The session ID to query',
              },
            },
            required: ['session_id'],
          },
        },
        {
          name: 'developer_list_sessions',
          description:
            'List all development sessions, optionally filtered by status. ' +
            'Useful for reviewing active or recent sessions.',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['active', 'completed', 'failed', 'all'],
                description: 'Filter by session status (default: all)',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of sessions to return (default: 10)',
              },
            },
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name } = request.params;
      const args: Record<string, unknown> = request.params.arguments ?? {};

      switch (name) {
        case 'developer_invoke':
          return this.handleInvoke(args);
        case 'developer_resume':
          return this.handleResume(args);
        case 'developer_get_session':
          return this.handleGetSession(args);
        case 'developer_list_sessions':
          return this.handleListSessions(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Build SDK options for a Claude Agent query
   */
  private buildSdkOptions(params: {
    workingDirectory: string;
    allowedTools?: string[];
    maxTurns?: number;
    systemPrompt?: string;
    resumeSessionId?: string;
  }): Record<string, unknown> {
    const options: Record<string, unknown> = {
      cwd: params.workingDirectory,
      // Use Claude Code's built-in system prompt with optional append
      systemPrompt: params.systemPrompt
        ? { type: 'preset', preset: 'claude_code', append: params.systemPrompt }
        : { type: 'preset', preset: 'claude_code' },
      // Load project settings so CLAUDE.md is respected
      settingSources: ['project'],
      // Auto-accept edits for automated development work
      permissionMode: 'acceptEdits',
    };

    if (params.allowedTools && params.allowedTools.length > 0) {
      options.allowedTools = params.allowedTools;
    }

    if (params.maxTurns) {
      options.maxTurns = params.maxTurns;
    }

    if (params.resumeSessionId) {
      options.resume = params.resumeSessionId;
    }

    return options;
  }

  /**
   * Execute a Claude Agent SDK query and collect results
   */
  private async executeClaudeQuery(
    prompt: string,
    options: Record<string, unknown>,
    langfuseTrace?: ReturnType<typeof createTrace>
  ): Promise<{
    success: boolean;
    output: string;
    sessionId?: string;
    costUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    numTurns?: number;
    durationMs?: number;
    toolsUsed: string[];
  }> {
    const sdk = await getClaudeAgentSdk();
    const toolsUsed: string[] = [];
    let sessionId: string | undefined;
    let resultOutput = '';
    let costUsd: number | undefined;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let numTurns: number | undefined;
    let durationMs: number | undefined;
    let success = false;

    const queryStartTime = Date.now();

    try {
      const queryIterator = sdk.query({ prompt, options });

      for await (const message of queryIterator) {
        const msg = message as Record<string, unknown>;

        // Track session ID from init message
        if (msg.type === 'system' && msg.subtype === 'init') {
          sessionId = msg.session_id as string;

          if (langfuseTrace) {
            createSpan(langfuseTrace, {
              name: 'claude-code:init',
              input: { prompt },
              output: {
                model: msg.model,
                tools: msg.tools,
                mcpServers: msg.mcp_servers,
              },
              metadata: {
                permissionMode: msg.permissionMode as string,
                sessionId: msg.session_id as string,
              },
            });
          }
        }

        // Track assistant messages for tool use
        if (msg.type === 'assistant') {
          const assistantMessage = msg.message as { content?: Array<Record<string, unknown>> } | undefined;
          if (assistantMessage?.content) {
            for (const block of assistantMessage.content) {
              if (typeof block.name === 'string') {
                toolsUsed.push(block.name);

                if (langfuseTrace) {
                  createSpan(langfuseTrace, {
                    name: `claude-code:tool:${block.name}`,
                    input: block.input,
                    metadata: {
                      toolUseId: block.id as string | undefined,
                      parentToolUseId: msg.parent_tool_use_id as string | null,
                    },
                  });
                }
              }
            }
          }
        }

        // Capture result
        if (msg.type === 'result') {
          sessionId = sessionId || (msg.session_id as string);
          costUsd = msg.total_cost_usd as number | undefined;
          numTurns = msg.num_turns as number | undefined;
          durationMs = msg.duration_ms as number | undefined;

          const usage = msg.usage as { input_tokens?: number; output_tokens?: number } | undefined;
          if (usage) {
            inputTokens = usage.input_tokens;
            outputTokens = usage.output_tokens;
          }

          if (msg.subtype === 'success') {
            success = true;
            resultOutput = (msg.result as string) || '';
          } else {
            success = false;
            const errors = msg.errors as string[] | undefined;
            resultOutput = `Error (${msg.subtype}): ${errors?.join('; ') || 'Unknown error'}`;
          }

          if (langfuseTrace) {
            createGeneration(langfuseTrace, {
              name: 'claude-code:execution',
              model: 'claude-agent-sdk',
              input: { prompt },
              output: resultOutput,
              usage: {
                input: inputTokens,
                output: outputTokens,
              },
              metadata: {
                success,
                subtype: msg.subtype as string,
                numTurns,
                costUsd,
                durationMs,
                toolsUsed,
              },
            });
          }
        }
      }
    } catch (error) {
      success = false;
      resultOutput = error instanceof Error ? error.message : 'Unknown error during Claude Code execution';
      durationMs = Date.now() - queryStartTime;

      if (langfuseTrace) {
        createSpan(langfuseTrace, {
          name: 'claude-code:error',
          input: { prompt },
          output: { error: resultOutput },
          metadata: { durationMs },
        });
      }
    }

    return {
      success,
      output: resultOutput,
      sessionId,
      costUsd,
      inputTokens,
      outputTokens,
      numTurns,
      durationMs,
      toolsUsed,
    };
  }

  /**
   * Invoke Claude Code with a new session
   */
  private async handleInvoke(args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    const {
      prompt,
      working_directory = this.repoRoot,
      allowed_tools,
      max_turns = 20,
      system_prompt,
    } = args as {
      prompt: string;
      working_directory?: string;
      allowed_tools?: string[];
      max_turns?: number;
      system_prompt?: string;
    };

    // Create new session
    const sessionId = randomUUID();
    const session: DeveloperSession = {
      id: sessionId,
      status: 'active',
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      turns: [],
      workingDirectory: working_directory as string,
    };
    this.sessions.set(sessionId, session);

    // Create Langfuse trace for this developer session
    const langfuseTrace = createTrace({
      id: sessionId,
      name: 'developer-invoke',
      metadata: {
        prompt: (prompt as string).substring(0, 200),
        workingDirectory: working_directory,
        maxTurns: max_turns,
      },
      tags: ['developer', 'claude-code-sdk'],
      input: prompt,
    });

    try {
      // Build SDK options
      const sdkOptions = this.buildSdkOptions({
        workingDirectory: working_directory as string,
        allowedTools: allowed_tools as string[] | undefined,
        maxTurns: max_turns as number,
        systemPrompt: system_prompt as string | undefined,
      });

      // Execute via Claude Agent SDK
      const result = await this.executeClaudeQuery(
        prompt as string,
        sdkOptions,
        langfuseTrace
      );

      // Update session
      session.turns.push({
        prompt: prompt as string,
        response: result.output,
        timestamp: new Date().toISOString(),
        costUsd: result.costUsd,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        numTurns: result.numTurns,
        durationMs: result.durationMs,
      });
      session.lastActivity = new Date().toISOString();
      session.status = result.success ? 'completed' : 'failed';
      session.claudeSessionId = result.sessionId;

      // Finalize Langfuse trace
      if (langfuseTrace) {
        langfuseTrace.update({
          output: result.output.substring(0, 1000),
          metadata: {
            success: result.success,
            costUsd: result.costUsd,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            numTurns: result.numTurns,
            durationMs: result.durationMs,
            toolsUsed: result.toolsUsed,
          },
        });
        await flushLangfuse();
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                session_id: sessionId,
                claude_session_id: result.sessionId,
                status: session.status,
                output: result.output,
                cost_usd: result.costUsd,
                input_tokens: result.inputTokens,
                output_tokens: result.outputTokens,
                num_turns: result.numTurns,
                duration_ms: result.durationMs,
                tools_used: result.toolsUsed,
                can_resume: !!result.sessionId,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      session.status = 'failed';

      if (langfuseTrace) {
        langfuseTrace.update({
          output: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
        await flushLangfuse();
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: true,
              session_id: sessionId,
              message: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Resume an existing session
   */
  private async handleResume(args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    const { session_id, prompt } = args as {
      session_id: string;
      prompt: string;
    };

    const session = this.sessions.get(session_id);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: true,
              message: `Session not found: ${session_id}`,
            }),
          },
        ],
        isError: true,
      };
    }

    if (!session.claudeSessionId) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: true,
              message: 'Session cannot be resumed (no Claude session ID)',
            }),
          },
        ],
        isError: true,
      };
    }

    // Create Langfuse trace for resume
    const langfuseTrace = createTrace({
      id: randomUUID(),
      name: 'developer-resume',
      sessionId: session.id,
      metadata: {
        prompt: prompt.substring(0, 200),
        resumeSessionId: session.claudeSessionId,
        turnNumber: session.turns.length + 1,
      },
      tags: ['developer', 'claude-code-sdk', 'resume'],
      input: prompt,
    });

    try {
      // Build SDK options with resume
      const sdkOptions = this.buildSdkOptions({
        workingDirectory: session.workingDirectory,
        resumeSessionId: session.claudeSessionId,
      });

      // Execute via Claude Agent SDK
      const result = await this.executeClaudeQuery(
        prompt,
        sdkOptions,
        langfuseTrace
      );

      // Update session
      session.turns.push({
        prompt,
        response: result.output,
        timestamp: new Date().toISOString(),
        costUsd: result.costUsd,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        numTurns: result.numTurns,
        durationMs: result.durationMs,
      });
      session.lastActivity = new Date().toISOString();
      session.status = result.success ? 'active' : 'failed';

      // Finalize Langfuse trace
      if (langfuseTrace) {
        langfuseTrace.update({
          output: result.output.substring(0, 1000),
          metadata: {
            success: result.success,
            costUsd: result.costUsd,
            numTurns: result.numTurns,
            toolsUsed: result.toolsUsed,
          },
        });
        await flushLangfuse();
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                session_id: session.id,
                claude_session_id: session.claudeSessionId,
                status: session.status,
                output: result.output,
                cost_usd: result.costUsd,
                input_tokens: result.inputTokens,
                output_tokens: result.outputTokens,
                num_turns: result.numTurns,
                duration_ms: result.durationMs,
                tools_used: result.toolsUsed,
                turn_number: session.turns.length,
                can_resume: true,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      session.status = 'failed';

      if (langfuseTrace) {
        langfuseTrace.update({
          output: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
        await flushLangfuse();
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: true,
              session_id: session.id,
              message: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get session details
   */
  private async handleGetSession(args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    const { session_id } = args as { session_id: string };

    const session = this.sessions.get(session_id);
    if (!session) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: true,
              message: `Session not found: ${session_id}`,
            }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              session_id: session.id,
              claude_session_id: session.claudeSessionId,
              status: session.status,
              started_at: session.startedAt,
              last_activity: session.lastActivity,
              working_directory: session.workingDirectory,
              total_turns: session.turns.length,
              turns: session.turns.map((t, i) => ({
                turn: i + 1,
                timestamp: t.timestamp,
                prompt_preview: t.prompt.substring(0, 100) + (t.prompt.length > 100 ? '...' : ''),
                response_preview: t.response.substring(0, 200) + (t.response.length > 200 ? '...' : ''),
                cost_usd: t.costUsd,
                input_tokens: t.inputTokens,
                output_tokens: t.outputTokens,
                num_turns: t.numTurns,
                duration_ms: t.durationMs,
              })),
              can_resume: !!session.claudeSessionId && session.status !== 'failed',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * List sessions
   */
  private async handleListSessions(args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    const { status = 'all', limit = 10 } = args as {
      status?: string;
      limit?: number;
    };

    let sessions = Array.from(this.sessions.values());

    // Filter by status
    if (status !== 'all') {
      sessions = sessions.filter((s) => s.status === status);
    }

    // Sort by last activity (most recent first)
    sessions.sort((a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );

    // Apply limit
    sessions = sessions.slice(0, limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              total: sessions.length,
              sessions: sessions.map((s) => ({
                session_id: s.id,
                status: s.status,
                started_at: s.startedAt,
                last_activity: s.lastActivity,
                total_turns: s.turns.length,
                can_resume: !!s.claudeSessionId && s.status !== 'failed',
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  getServer(): Server {
    return this.server;
  }

  /**
   * Get tool definitions for use in agent invocation
   */
  getToolDefinitions(): Anthropic.Tool[] {
    return [
      {
        name: 'developer_invoke',
        description:
          'Invoke Claude Code to perform a development task. Creates a new session with Claude Code ' +
          'that has full capabilities: reading/writing files, running commands, git operations, etc. ' +
          'Uses the Claude Agent SDK for a conversational loop with streaming progress. ' +
          'Use this to delegate implementation work while retaining oversight.',
        input_schema: {
          type: 'object' as const,
          properties: {
            prompt: {
              type: 'string',
              description:
                'The development task to perform. Be specific about what should be accomplished, ' +
                'what verification criteria apply, and any constraints.',
            },
            working_directory: {
              type: 'string',
              description: 'Working directory for the session (defaults to repo root)',
            },
            allowed_tools: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Specific tools to allow (e.g., ["Read", "Write", "Edit", "Bash"]). ' +
                'If not specified, all tools are available.',
            },
            max_turns: {
              type: 'number',
              description: 'Maximum number of turns before stopping (default: 20)',
            },
            system_prompt: {
              type: 'string',
              description: 'Optional system prompt to append to the default Claude Code prompt',
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'developer_resume',
        description:
          'Resume an existing Claude Code session with additional context or feedback. ' +
          'Use this to continue iterative development, provide corrections, or guide the ' +
          'session toward completion.',
        input_schema: {
          type: 'object' as const,
          properties: {
            session_id: {
              type: 'string',
              description: 'The session ID from a previous developer_invoke call',
            },
            prompt: {
              type: 'string',
              description:
                'Additional guidance, feedback, or the next step for the session',
            },
          },
          required: ['session_id', 'prompt'],
        },
      },
      {
        name: 'developer_get_session',
        description:
          'Get the status and history of a development session. Use this to check on ' +
          'progress, review what was done, or get the session ID for resumption.',
        input_schema: {
          type: 'object' as const,
          properties: {
            session_id: {
              type: 'string',
              description: 'The session ID to query',
            },
          },
          required: ['session_id'],
        },
      },
      {
        name: 'developer_list_sessions',
        description:
          'List all development sessions, optionally filtered by status. ' +
          'Useful for reviewing active or recent sessions.',
        input_schema: {
          type: 'object' as const,
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'completed', 'failed', 'all'],
              description: 'Filter by session status (default: all)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of sessions to return (default: 10)',
            },
          },
        },
      },
    ];
  }

  /**
   * Execute a tool directly (for use by orchestration layer)
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'developer_invoke': {
        const result = await this.handleInvoke(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      case 'developer_resume': {
        const result = await this.handleResume(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      case 'developer_get_session': {
        const result = await this.handleGetSession(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      case 'developer_list_sessions': {
        const result = await this.handleListSessions(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
