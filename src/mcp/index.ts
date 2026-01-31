/**
 * MCP (Model Context Protocol) Integration
 *
 * This module provides integration with official MCP servers and custom
 * governance-specific servers.
 *
 * ## Architecture
 *
 * The system uses two types of MCP servers:
 *
 * ### Official MCP Servers (via MCPClientManager)
 * - **GitHub Server**: Repository operations, file reading, PRs, issues
 * - **Filesystem Server**: Local file operations with sandboxing
 * - **Git Server**: Git operations (status, diff, commit, etc.)
 *
 * ### Custom Governance Servers (direct implementation)
 * - **Decision Log Server**: Semantic search and logging of decisions
 * - **Challenge Server**: Challenge submission and resolution
 * - **Wiki Server**: Wiki management (draft/review workflow)
 *
 * ## Usage
 *
 * ```typescript
 * import {
 *   MCPClientManager,
 *   createMCPClientManager,
 *   ServerPresets,
 *   UnifiedMCPExecutor
 * } from './mcp';
 *
 * // Create client manager with standard servers
 * const mcpClient = await createMCPClientManager(
 *   ServerPresets.localDevelopment('/path/to/repo', githubToken)
 * );
 *
 * // Create unified executor combining MCP client with custom servers
 * const executor = new UnifiedMCPExecutor(
 *   mcpClient,
 *   decisionLogServer,
 *   challengeServer,
 *   wikiServer
 * );
 *
 * // Get all available tools
 * const tools = executor.getToolDefinitions();
 *
 * // Execute a tool
 * const result = await executor.executeTool('read_text_file', {
 *   path: '/repo/src/index.ts'
 * });
 * ```
 */

// Client manager for official MCP servers
export {
  MCPClientManager,
  MCPServerConfig,
  MCPToolResult,
} from './client-manager';

// Server factory and presets
export {
  MCPEnvironment,
  createStandardServerConfigs,
  createMCPClientManager,
  ServerPresets,
} from './server-factory';

// Custom governance servers
export { DecisionLogServer } from './decision-log/server';
export { ChallengeServer } from './challenge/server';
export { WikiServer } from './wiki/server';
export { DeveloperServer } from './developer/server';
export {
  ConversationServer,
  AgentInvokeCallback,
  CreateIssueCallback,
  NotificationType,
} from './conversation/server';

// GitHub authentication utilities (for generating installation tokens)
export { getInstallationToken } from './github/auth';
