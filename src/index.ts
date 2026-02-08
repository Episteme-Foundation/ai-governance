import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import {
  DecisionRepository,
  SessionRepository,
  AuditRepository,
  ChallengeRepository,
  WikiDraftRepository,
  ConversationRepository,
  ConversationThreadRepository,
} from './db/repositories';
import { DecisionLoader, WikiLoader } from './context/loaders';
import {
  EmbeddingsService,
  OpenAIEmbeddingProvider,
} from './context/embeddings';
import { SystemPromptBuilder } from './context/prompt-builder';
import { TrustClassifier } from './orchestration/trust';
import { RequestRouter } from './orchestration/router';
import { AgentInvoker } from './orchestration/invoke';
import { MCPExecutor } from './orchestration/mcp-executor';
import { GovernanceServer } from './api/server';
import { loadSecrets } from './config/load-secrets';
import { createMCPClientManager } from './mcp/server-factory';
import { DecisionLogServer } from './mcp/decision-log/server';
import { ChallengeServer } from './mcp/challenge/server';
import { WikiServer } from './mcp/wiki/server';
import { LangfuseServer } from './mcp/langfuse/server';
import { DeveloperServer } from './mcp/developer/server';
import { GitHubServer } from './mcp/github/server';
import { isLangfuseEnabled, shutdownLangfuse } from './observability';
import { ProjectRegistry } from './config/project-registry';
import { loadProjectConfig } from './config/load-project';
import { NotificationService } from './notifications';

/**
 * Main entry point for AI Governance application
 */
async function main() {
  console.log('Starting AI Governance system...');

  // Load secrets from AWS Secrets Manager (if needed)
  // This handles production deployments where secrets aren't in env vars
  await loadSecrets();

  // Configuration is now available from environment variables
  // - Local dev: .env file loaded by dotenv
  // - GitHub Codespaces: secrets injected automatically
  // - AWS production: loaded from Secrets Manager above
  const databaseUrl = process.env.DATABASE_URL;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  console.log('Configuration loaded from environment');

  // 1. Database connection
  const dbPool = new Pool({
    connectionString: databaseUrl,
  });

  console.log('Connected to database');

  // 1.5. ProjectRegistry — DB-first config resolution with filesystem fallback
  const registry = new ProjectRegistry(dbPool);

  // Run multi-project migration (idempotent — safe to run every startup)
  try {
    await registry.runMigration();
  } catch (error) {
    // Migration may fail on first run before projects table exists
    // This is expected when using schema.sql without the migration
    console.warn('[Startup] Migration 002 skipped (may not be needed yet):', (error as Error).message);
  }

  // Bootstrap self-governance: upsert local config into DB
  try {
    const selfConfig = loadProjectConfig('ai-governance');
    await registry.register(selfConfig, { configSource: 'local' });
    console.log('[Startup] Self-governance project registered in DB');
  } catch (error) {
    console.warn('[Startup] Could not bootstrap self-governance config:', (error as Error).message);
  }

  // 2. Repositories
  const decisionRepo = new DecisionRepository(dbPool);
  const sessionRepo = new SessionRepository(dbPool);
  const auditRepo = new AuditRepository(dbPool);
  const challengeRepo = new ChallengeRepository(dbPool);
  const wikiDraftRepo = new WikiDraftRepository(dbPool);
  const conversationRepo = new ConversationRepository(dbPool);
  const conversationThreadRepo = new ConversationThreadRepository(dbPool);

  // 3. Services
  const embeddingProvider = new OpenAIEmbeddingProvider(openaiApiKey);
  const embeddingsService = new EmbeddingsService(embeddingProvider);
  const decisionLoader = new DecisionLoader(decisionRepo);

  // 4. Context assembly (with ProjectRegistry for remote project support)
  const promptBuilder = new SystemPromptBuilder(
    embeddingsService,
    decisionLoader,
    process.cwd(),
    conversationThreadRepo,
    registry
  );

  // 5. MCP Servers
  // Create MCP client manager for official servers (GitHub, Filesystem, Git)
  const githubRepository = process.env.GITHUB_REPOSITORY;
  let githubOwner: string | undefined;
  let githubRepo: string | undefined;

  if (githubRepository) {
    [githubOwner, githubRepo] = githubRepository.split('/');
    if (!githubOwner || !githubRepo) {
      console.warn(`Invalid GITHUB_REPOSITORY format: ${githubRepository} (expected owner/repo)`);
    }
  } else {
    console.warn('GITHUB_REPOSITORY not set - GitHub tools will not be available');
  }

  // Create MCP client manager (initially without GitHub - will connect on first request)
  const mcpClient = await createMCPClientManager({
    allowedPaths: [process.cwd()],
  });

  // GitHub token refresh is now handled automatically by the custom GitHubServer
  // (auth.ts caches tokens and refreshes when they expire within 60s)
  // Keep this as a no-op for GovernanceServer compatibility
  const refreshGitHub = async (): Promise<void> => {
    // No-op: custom GitHubServer handles token refresh internally via auth.ts cache
  };

  // Custom governance servers
  const decisionLogServer = new DecisionLogServer(decisionRepo, embeddingsService);
  const challengeServer = new ChallengeServer(challengeRepo);
  const wikiServer = new WikiServer(wikiDraftRepo, WikiLoader);

  // Langfuse server for self-observation (optional)
  const langfuseServer = isLangfuseEnabled() ? new LangfuseServer() : undefined;
  if (langfuseServer) {
    console.log('Langfuse enabled - agents can query their own operations');
  }

  // Developer server for Claude Code delegation
  const developerServer = new DeveloperServer(process.cwd());
  console.log('Developer server initialized - agents can delegate to Claude Code');

  // Custom GitHub server (uses GitHub App auth from auth.ts — no Docker/Python needed)
  let githubServer: GitHubServer | undefined;
  if (githubOwner && githubRepo) {
    githubServer = new GitHubServer(githubOwner, githubRepo);
    console.log(`GitHub server initialized for ${githubOwner}/${githubRepo}`);
  } else {
    console.warn('GitHub server not initialized - GITHUB_REPOSITORY not set');
  }

  // 6. MCP Executor (routes tool calls to appropriate server)
  const mcpExecutor = new MCPExecutor(
    mcpClient,
    decisionLogServer,
    challengeServer,
    wikiServer,
    langfuseServer,
    developerServer,
    githubServer
  );

  // 7. Orchestration
  const trustClassifier = new TrustClassifier();
  const router = new RequestRouter();

  const anthropic = new Anthropic({
    apiKey: anthropicApiKey,
  });

  const invoker = new AgentInvoker(
    anthropic,
    promptBuilder,
    sessionRepo,
    auditRepo,
    decisionRepo,
    embeddingsService,
    mcpExecutor,
    conversationRepo,
    conversationThreadRepo
  );

  // 6. Notification service
  const notificationService = new NotificationService(dbPool, registry);
  console.log('Notification service initialized');

  // 7. API Server (with ProjectRegistry, dashboard repos, and notifications)
  const server = new GovernanceServer(
    trustClassifier, router, invoker, refreshGitHub, registry,
    { pool: dbPool, decisions: decisionRepo, sessions: sessionRepo, challenges: challengeRepo, audit: auditRepo },
    notificationService
  );

  const port = parseInt(process.env.PORT || '3000', 10);
  await server.start(port);

  console.log(`AI Governance system ready on port ${port}`);

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await server.stop();
    await shutdownLangfuse();
    await dbPool.end();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await server.stop();
    await shutdownLangfuse();
    await dbPool.end();
    process.exit(0);
  });
}

// Run the application
main().catch((error) => {
  console.error('Fatal error starting application:', error);
  process.exit(1);
});
