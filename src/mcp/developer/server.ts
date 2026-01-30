import { spawn } from 'child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';

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
  }>;
  workingDirectory: string;
  mcpConfig?: Record<string, unknown>;
}

/**
 * MCP Server for Developer operations via Claude Code
 *
 * Provides tools for:
 * - Invoking Claude Code to perform development tasks
 * - Resuming sessions for iterative development
 * - Checking session status and history
 *
 * This enables our agents (particularly Evaluator) to delegate development
 * work to Claude Code while maintaining full tracing and session management.
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
    } = args as {
      prompt: string;
      working_directory?: string;
      allowed_tools?: string[];
      max_turns?: number;
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

    try {
      // Build Claude Code CLI command
      const cliArgs = this.buildCliArgs({
        prompt: prompt as string,
        workingDirectory: working_directory as string,
        allowedTools: allowed_tools as string[] | undefined,
        maxTurns: max_turns as number,
      });

      // Execute Claude Code
      const result = await this.executeClaude(cliArgs, working_directory as string);

      // Update session
      session.turns.push({
        prompt: prompt as string,
        response: result.output,
        timestamp: new Date().toISOString(),
      });
      session.lastActivity = new Date().toISOString();
      session.status = result.success ? 'completed' : 'failed';
      session.claudeSessionId = result.sessionId;

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

    try {
      // Build CLI args with resume
      const cliArgs = this.buildCliArgs({
        prompt,
        workingDirectory: session.workingDirectory,
        resumeSessionId: session.claudeSessionId,
      });

      // Execute Claude Code
      const result = await this.executeClaude(cliArgs, session.workingDirectory);

      // Update session
      session.turns.push({
        prompt,
        response: result.output,
        timestamp: new Date().toISOString(),
      });
      session.lastActivity = new Date().toISOString();
      session.status = result.success ? 'active' : 'failed';

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

  /**
   * Build CLI arguments for Claude Code
   */
  private buildCliArgs(options: {
    prompt: string;
    workingDirectory: string;
    allowedTools?: string[];
    maxTurns?: number;
    resumeSessionId?: string;
  }): string[] {
    const args: string[] = [];

    // Non-interactive mode with prompt
    args.push('-p', options.prompt);

    // Resume session if specified
    if (options.resumeSessionId) {
      args.push('--resume', options.resumeSessionId);
    }

    // Max turns
    if (options.maxTurns) {
      args.push('--max-turns', options.maxTurns.toString());
    }

    // Allowed tools
    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','));
    }

    // MCP config if available
    if (this.mcpConfigPath) {
      args.push('--mcp-config', this.mcpConfigPath);
    }

    // Output format for easier parsing
    args.push('--output-format', 'json');

    return args;
  }

  /**
   * Execute Claude Code CLI
   */
  private executeClaude(
    args: string[],
    workingDirectory: string
  ): Promise<{ success: boolean; output: string; sessionId?: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', args, {
        cwd: workingDirectory,
        env: {
          ...process.env,
          // Ensure Claude Code uses same environment
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to start Claude Code: ${error.message}`));
      });

      proc.on('close', (code) => {
        if (code === 0 || code === null) {
          // Try to parse JSON output
          try {
            const parsed = JSON.parse(stdout);
            resolve({
              success: true,
              output: parsed.result || stdout,
              sessionId: parsed.session_id,
            });
          } catch {
            // Not JSON, return raw output
            resolve({
              success: true,
              output: stdout || 'Task completed',
            });
          }
        } else {
          resolve({
            success: false,
            output: stderr || stdout || `Claude Code exited with code ${code}`,
          });
        }
      });

      // Timeout after 10 minutes
      setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error('Claude Code execution timed out after 10 minutes'));
      }, 10 * 60 * 1000);
    });
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
