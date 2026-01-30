import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Configuration for an MCP server connection
 */
export interface MCPServerConfig {
  /** Unique identifier for this server */
  name: string;

  /** Connection type */
  type: 'stdio' | 'http';

  /** For stdio: command and args to spawn the server */
  stdio?: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  };

  /** For http: URL to connect to */
  http?: {
    url: string;
    headers?: Record<string, string>;
  };

  /** Optional: filter which tools to expose from this server */
  toolFilter?: {
    include?: string[];
    exclude?: string[];
  };
}

/**
 * Connected MCP server with its client
 */
interface ConnectedServer {
  config: MCPServerConfig;
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport;
  tools: Map<string, MCPTool>;
}

/**
 * Tool definition from an MCP server
 */
interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

/**
 * Result of calling a tool
 */
export interface MCPToolResult {
  success: boolean;
  content?: unknown;
  error?: string;
}

/**
 * MCP Client Manager
 *
 * Manages connections to multiple MCP servers (both stdio and HTTP-based)
 * and provides a unified interface for listing and calling tools.
 *
 * Usage:
 * ```typescript
 * const manager = new MCPClientManager();
 *
 * // Add server configurations
 * await manager.connect({
 *   name: 'filesystem',
 *   type: 'stdio',
 *   stdio: {
 *     command: 'npx',
 *     args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/repo']
 *   }
 * });
 *
 * await manager.connect({
 *   name: 'github',
 *   type: 'http',
 *   http: {
 *     url: 'https://api.githubcopilot.com/mcp/',
 *     headers: { 'Authorization': 'Bearer ...' }
 *   }
 * });
 *
 * // List all available tools
 * const tools = manager.getToolDefinitions();
 *
 * // Call a tool
 * const result = await manager.callTool('read_text_file', { path: '/repo/src/index.ts' });
 * ```
 */
export class MCPClientManager {
  private servers: Map<string, ConnectedServer> = new Map();
  private toolToServer: Map<string, string> = new Map();

  /**
   * Connect to an MCP server
   */
  async connect(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.name)) {
      throw new Error(`Server '${config.name}' is already connected`);
    }

    let transport: StdioClientTransport | StreamableHTTPClientTransport;

    if (config.type === 'stdio') {
      if (!config.stdio) {
        throw new Error(`Stdio server '${config.name}' requires stdio configuration`);
      }

      const params: StdioServerParameters = {
        command: config.stdio.command,
        args: config.stdio.args,
        env: config.stdio.env,
        cwd: config.stdio.cwd,
      };

      transport = new StdioClientTransport(params);
    } else if (config.type === 'http') {
      if (!config.http) {
        throw new Error(`HTTP server '${config.name}' requires http configuration`);
      }

      transport = new StreamableHTTPClientTransport(
        new URL(config.http.url),
        {
          requestInit: config.http.headers
            ? { headers: config.http.headers }
            : undefined,
        }
      );
    } else {
      throw new Error(`Unknown server type: ${config.type}`);
    }

    // Create and connect the client
    const client = new Client(
      {
        name: 'ai-governance',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    try {
      await client.connect(transport);
    } catch (error) {
      throw new Error(
        `Failed to connect to server '${config.name}': ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Get available tools from the server
    const toolsResult = await client.listTools();
    const tools = new Map<string, MCPTool>();

    for (const tool of toolsResult.tools) {
      // Apply tool filter if configured
      if (config.toolFilter) {
        if (config.toolFilter.include && !config.toolFilter.include.includes(tool.name)) {
          continue;
        }
        if (config.toolFilter.exclude && config.toolFilter.exclude.includes(tool.name)) {
          continue;
        }
      }

      tools.set(tool.name, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        serverName: config.name,
      });

      // Register tool -> server mapping
      this.toolToServer.set(tool.name, config.name);
    }

    this.servers.set(config.name, {
      config,
      client,
      transport,
      tools,
    });

    console.log(
      `[MCPClientManager] Connected to '${config.name}' with ${tools.size} tools:`,
      Array.from(tools.keys())
    );
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) {
      return;
    }

    // Remove tool mappings
    for (const toolName of server.tools.keys()) {
      this.toolToServer.delete(toolName);
    }

    // Close the transport
    await server.transport.close();

    this.servers.delete(serverName);
    console.log(`[MCPClientManager] Disconnected from '${serverName}'`);
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const serverNames = Array.from(this.servers.keys());
    for (const name of serverNames) {
      await this.disconnect(name);
    }
  }

  /**
   * Call a tool by name
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const serverName = this.toolToServer.get(toolName);
    if (!serverName) {
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
      };
    }

    const server = this.servers.get(serverName);
    if (!server) {
      return {
        success: false,
        error: `Server '${serverName}' not connected`,
      };
    }

    try {
      const result = await server.client.callTool({
        name: toolName,
        arguments: args,
      });

      return {
        success: true,
        content: result.content,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all available tools in Claude API format
   */
  getToolDefinitions(allowedTools?: string[], deniedTools?: string[]): Anthropic.Tool[] {
    const tools: Anthropic.Tool[] = [];

    for (const server of this.servers.values()) {
      for (const tool of server.tools.values()) {
        // Apply role-based filtering
        if (allowedTools && allowedTools.length > 0) {
          if (!allowedTools.includes(tool.name)) {
            continue;
          }
        }
        if (deniedTools && deniedTools.length > 0) {
          if (deniedTools.includes(tool.name)) {
            continue;
          }
        }

        tools.push({
          name: tool.name,
          description: tool.description || `Tool from ${tool.serverName}`,
          input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
        });
      }
    }

    return tools;
  }

  /**
   * Check if a tool exists
   */
  hasTool(toolName: string): boolean {
    return this.toolToServer.has(toolName);
  }

  /**
   * Get the server name for a tool
   */
  getToolServer(toolName: string): string | undefined {
    return this.toolToServer.get(toolName);
  }

  /**
   * Get list of connected server names
   */
  getConnectedServers(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Get all tool names from a specific server
   */
  getServerTools(serverName: string): string[] {
    const server = this.servers.get(serverName);
    if (!server) {
      return [];
    }
    return Array.from(server.tools.keys());
  }
}
