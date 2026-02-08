import Anthropic from '@anthropic-ai/sdk';
import { MCPClientManager } from '../mcp/client-manager';
import { DecisionLogServer } from '../mcp/decision-log/server';
import { ChallengeServer } from '../mcp/challenge/server';
import { WikiServer } from '../mcp/wiki/server';
import { LangfuseServer } from '../mcp/langfuse/server';
import { DeveloperServer } from '../mcp/developer/server';
import { GitHubServer } from '../mcp/github/server';

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * MCP Executor
 *
 * Combines official MCP servers (via MCPClientManager) with custom
 * governance-specific servers (decision-log, challenge, wiki).
 *
 * This allows us to use:
 * - Official servers: GitHub, Filesystem, Git (via MCP protocol)
 * - Custom servers: Decision logging, challenges, wiki (direct implementation)
 */
export class MCPExecutor {
  private customToolHandlers: Map<string, {
    server: string;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
  }> = new Map();

  constructor(
    private readonly mcpClient: MCPClientManager,
    private readonly decisionLogServer: DecisionLogServer,
    private readonly challengeServer: ChallengeServer,
    private readonly wikiServer: WikiServer,
    private readonly langfuseServer?: LangfuseServer,
    private readonly developerServer?: DeveloperServer,
    private readonly githubServer?: GitHubServer
  ) {
    this.registerCustomTools();
  }

  /**
   * Register handlers for custom governance tools
   */
  private registerCustomTools(): void {
    // Decision log tools
    const decisionTools = ['search_decisions', 'get_decision', 'log_decision'];
    for (const tool of decisionTools) {
      this.customToolHandlers.set(tool, {
        server: 'decision-log',
        execute: (args) => this.decisionLogServer.executeTool(tool, args),
      });
    }

    // Challenge tools
    const challengeTools = ['submit_challenge', 'list_challenges', 'respond_to_challenge'];
    for (const tool of challengeTools) {
      this.customToolHandlers.set(tool, {
        server: 'challenge',
        execute: (args) => this.challengeServer.executeTool(tool, args),
      });
    }

    // Wiki tools
    const wikiTools = [
      'wiki_search',
      'wiki_get_page',
      'wiki_propose_edit',
      'wiki_propose_page',
      'wiki_review_drafts',
      'wiki_approve_draft',
      'wiki_reject_draft',
    ];
    for (const tool of wikiTools) {
      this.customToolHandlers.set(tool, {
        server: 'wiki',
        execute: (args) => this.wikiServer.executeTool(tool, args),
      });
    }

    // Langfuse tools (for self-observation)
    if (this.langfuseServer) {
      const langfuseTools = [
        'langfuse_query_traces',
        'langfuse_get_trace',
        'langfuse_query_scores',
        'langfuse_add_score',
        'langfuse_get_metrics',
        'langfuse_analyze_sessions',
      ];
      for (const tool of langfuseTools) {
        this.customToolHandlers.set(tool, {
          server: 'langfuse',
          execute: (args) => this.langfuseServer!.executeTool(tool, args),
        });
      }
    }

    // Developer tools (for invoking Claude Code)
    if (this.developerServer) {
      const developerTools = [
        'developer_invoke',
        'developer_resume',
        'developer_get_session',
        'developer_list_sessions',
      ];
      for (const tool of developerTools) {
        this.customToolHandlers.set(tool, {
          server: 'developer',
          execute: (args) => this.developerServer!.executeTool(tool, args),
        });
      }
    }

    // GitHub tools (custom server using GitHub App auth)
    if (this.githubServer) {
      const githubTools = this.githubServer.getToolDefinitions().map((t) => t.name);
      for (const tool of githubTools) {
        this.customToolHandlers.set(tool, {
          server: 'github',
          execute: (args) => this.githubServer!.executeTool(tool, args),
        });
      }
    }
  }

  /**
   * Execute a tool by name
   *
   * Routes to either the MCP client (for official servers) or
   * custom handlers (for governance-specific tools).
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    // Check custom tools first
    const customHandler = this.customToolHandlers.get(toolName);
    if (customHandler) {
      try {
        const result = await customHandler.execute(args);
        return {
          success: true,
          result,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    // Try MCP client for official servers
    if (this.mcpClient.hasTool(toolName)) {
      const mcpResult = await this.mcpClient.callTool(toolName, args);
      return {
        success: mcpResult.success,
        result: mcpResult.content,
        error: mcpResult.error,
      };
    }

    return {
      success: false,
      error: `Unknown tool: ${toolName}`,
    };
  }

  /**
   * Get all available tool definitions in Claude API format
   *
   * Combines tools from MCP client and custom servers.
   */
  getToolDefinitions(allowedTools?: string[], deniedTools?: string[]): Anthropic.Tool[] {
    const allTools: Anthropic.Tool[] = [];

    // Add tools from MCP client (official servers)
    const mcpTools = this.mcpClient.getToolDefinitions();
    allTools.push(...mcpTools);

    // Add tools from custom servers
    allTools.push(...this.decisionLogServer.getToolDefinitions());
    allTools.push(...this.challengeServer.getToolDefinitions());
    allTools.push(...this.wikiServer.getToolDefinitions());
    if (this.langfuseServer) {
      allTools.push(...this.langfuseServer.getToolDefinitions());
    }
    if (this.developerServer) {
      allTools.push(...this.developerServer.getToolDefinitions());
    }
    if (this.githubServer) {
      allTools.push(...this.githubServer.getToolDefinitions());
    }

    // Apply role-based filtering
    return allTools.filter((tool) => {
      if (allowedTools && allowedTools.length > 0) {
        if (!allowedTools.includes(tool.name)) {
          return false;
        }
      }
      if (deniedTools && deniedTools.length > 0) {
        if (deniedTools.includes(tool.name)) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Check if a tool exists (in either MCP client or custom handlers)
   */
  hasTool(toolName: string): boolean {
    return this.customToolHandlers.has(toolName) || this.mcpClient.hasTool(toolName);
  }

  /**
   * Get the server name for a tool
   */
  getToolServer(toolName: string): string | undefined {
    const customHandler = this.customToolHandlers.get(toolName);
    if (customHandler) {
      return customHandler.server;
    }
    return this.mcpClient.getToolServer(toolName);
  }

  /**
   * Create a new MCPExecutor with a different GitHubServer, sharing all other servers.
   * Used for per-request scoping to target the correct repository.
   *
   * @param server - GitHubServer scoped to the target repository
   * @returns A new MCPExecutor with the specified GitHubServer
   */
  withGitHub(server: GitHubServer): MCPExecutor {
    return new MCPExecutor(
      this.mcpClient,
      this.decisionLogServer,
      this.challengeServer,
      this.wikiServer,
      this.langfuseServer,
      this.developerServer,
      server
    );
  }

  /**
   * Get summary of connected servers
   */
  getServerSummary(): { mcpServers: string[]; customServers: string[] } {
    const customServers = new Set<string>();
    for (const handler of this.customToolHandlers.values()) {
      customServers.add(handler.server);
    }

    return {
      mcpServers: this.mcpClient.getConnectedServers(),
      customServers: Array.from(customServers),
    };
  }
}
