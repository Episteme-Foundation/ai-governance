import { MCPClientManager, MCPServerConfig } from './client-manager';

/**
 * Environment configuration for MCP servers
 */
export interface MCPEnvironment {
  /** GitHub Personal Access Token for GitHub MCP server */
  githubToken?: string;

  /** Repository to operate on (owner/repo format) */
  repository?: string;

  /** Local paths to allow filesystem access to */
  allowedPaths?: string[];

  /** Whether to use the hosted GitHub MCP server or local */
  useHostedGitHub?: boolean;
}

/**
 * Create configurations for standard MCP servers
 */
export function createStandardServerConfigs(env: MCPEnvironment): MCPServerConfig[] {
  const configs: MCPServerConfig[] = [];

  // GitHub MCP Server
  if (env.githubToken) {
    if (env.useHostedGitHub) {
      // Use GitHub's hosted MCP endpoint
      configs.push({
        name: 'github',
        type: 'http',
        http: {
          url: 'https://api.githubcopilot.com/mcp/',
          headers: {
            'Authorization': `Bearer ${env.githubToken}`,
            'Content-Type': 'application/json',
          },
        },
      });
    } else {
      // Spawn local GitHub MCP server
      // Note: Using the deprecated but still functional npm package
      // TODO: Migrate to github/github-mcp-server when available as npm
      configs.push({
        name: 'github',
        type: 'stdio',
        stdio: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: env.githubToken,
          },
        },
      });
    }
  }

  // Filesystem MCP Server (for local file access)
  if (env.allowedPaths && env.allowedPaths.length > 0) {
    configs.push({
      name: 'filesystem',
      type: 'stdio',
      stdio: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', ...env.allowedPaths],
      },
    });
  }

  // Git MCP Server (Python-based, using uvx)
  // Note: This requires Python/uvx to be available
  if (env.allowedPaths && env.allowedPaths.length > 0) {
    configs.push({
      name: 'git',
      type: 'stdio',
      stdio: {
        command: 'uvx',
        args: ['mcp-server-git', '--repository', env.allowedPaths[0]],
      },
    });
  }

  return configs;
}

/**
 * Create and connect an MCP client manager with standard servers
 *
 * This is a convenience function that:
 * 1. Creates the standard server configurations
 * 2. Connects to each server
 * 3. Returns the ready-to-use client manager
 *
 * Servers that fail to connect will be logged but won't stop the process.
 */
export async function createMCPClientManager(env: MCPEnvironment): Promise<MCPClientManager> {
  const manager = new MCPClientManager();
  const configs = createStandardServerConfigs(env);

  for (const config of configs) {
    try {
      await manager.connect(config);
    } catch (error) {
      console.warn(
        `[MCPServerFactory] Failed to connect to '${config.name}':`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      // Continue with other servers
    }
  }

  return manager;
}

/**
 * Server configurations for different deployment environments
 */
export const ServerPresets = {
  /**
   * Local development with full capabilities
   */
  localDevelopment: (repoPath: string, githubToken: string): MCPEnvironment => ({
    githubToken,
    repository: undefined, // Will be determined from git remote
    allowedPaths: [repoPath],
    useHostedGitHub: false,
  }),

  /**
   * Container deployment (no local filesystem, uses GitHub API)
   */
  container: (githubToken: string): MCPEnvironment => ({
    githubToken,
    repository: undefined,
    allowedPaths: undefined, // No local filesystem access
    useHostedGitHub: true, // Use hosted GitHub MCP
  }),

  /**
   * CI/CD environment with limited capabilities
   */
  ci: (githubToken: string, repoPath: string): MCPEnvironment => ({
    githubToken,
    repository: undefined,
    allowedPaths: [repoPath],
    useHostedGitHub: false,
  }),
};
