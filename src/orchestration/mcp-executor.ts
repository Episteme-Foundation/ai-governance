import Anthropic from '@anthropic-ai/sdk';
import { GitHubServer } from '../mcp/github/server';
import { DecisionLogServer } from '../mcp/decision-log/server';
import { ChallengeServer } from '../mcp/challenge/server';
import { WikiServer } from '../mcp/wiki/server';

/**
 * Result of a tool execution
 */
export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

interface ToolHandler {
  server: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * MCP Tool Executor
 *
 * Routes tool calls to the appropriate MCP server and executes them.
 * Servers are injected to allow proper dependency management.
 */
export class MCPExecutor {
  // Map tool names to their handlers
  private toolServerMap: Map<string, ToolHandler>;

  constructor(
    private readonly githubServer: GitHubServer,
    private readonly decisionLogServer: DecisionLogServer,
    private readonly challengeServer: ChallengeServer,
    private readonly wikiServer: WikiServer
  ) {
    this.toolServerMap = new Map();
    this.registerTools();
  }

  private registerTools(): void {
    // GitHub tools
    const githubTools = [
      'github_get_pr',
      'github_get_issue',
      'github_list_files',
      'github_comment',
      'github_request_changes',
      'github_approve',
      'github_merge',
      'github_close',
    ];
    for (const tool of githubTools) {
      this.toolServerMap.set(tool, {
        server: 'github',
        execute: (args) => this.githubServer.executeTool(tool, args),
      });
    }

    // Decision log tools
    const decisionTools = ['search_decisions', 'get_decision', 'log_decision'];
    for (const tool of decisionTools) {
      this.toolServerMap.set(tool, {
        server: 'decision-log',
        execute: (args) => this.decisionLogServer.executeTool(tool, args),
      });
    }

    // Challenge tools
    const challengeTools = ['submit_challenge', 'list_challenges', 'respond_to_challenge'];
    for (const tool of challengeTools) {
      this.toolServerMap.set(tool, {
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
      this.toolServerMap.set(tool, {
        server: 'wiki',
        execute: (args) => this.wikiServer.executeTool(tool, args),
      });
    }
  }

  /**
   * Execute a tool by name
   *
   * @param toolName - Name of the tool to execute
   * @param args - Tool arguments
   * @returns Tool result
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const handler = this.toolServerMap.get(toolName);

    if (!handler) {
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
      };
    }

    try {
      const result = await handler.execute(args);
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

  /**
   * Get all available tool definitions for Claude API
   *
   * @param allowedTools - Optional list of allowed tool names (filter)
   * @param deniedTools - Optional list of denied tool names (filter)
   * @returns Tool definitions in Claude API format
   */
  getToolDefinitions(allowedTools?: string[], deniedTools?: string[]): Anthropic.Tool[] {
    const allTools = [
      ...this.githubServer.getToolDefinitions(),
      ...this.decisionLogServer.getToolDefinitions(),
      ...this.challengeServer.getToolDefinitions(),
      ...this.wikiServer.getToolDefinitions(),
    ];

    return allTools.filter((tool) => {
      // If allowed list is specified, tool must be in it
      if (allowedTools && allowedTools.length > 0) {
        if (!allowedTools.includes(tool.name)) {
          return false;
        }
      }

      // If denied list is specified, tool must not be in it
      if (deniedTools && deniedTools.length > 0) {
        if (deniedTools.includes(tool.name)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Check if a tool exists
   */
  hasToolHandler(toolName: string): boolean {
    return this.toolServerMap.has(toolName);
  }

  /**
   * Get the server name for a tool
   */
  getToolServer(toolName: string): string | undefined {
    return this.toolServerMap.get(toolName)?.server;
  }
}
