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
import { getInstallationToken } from './mcp/github/auth';
import { DecisionLogServer } from './mcp/decision-log/server';
import { ChallengeServer } from './mcp/challenge/server';
import { WikiServer } from './mcp/wiki/server';
import { LangfuseServer } from './mcp/langfuse/server';
import { DeveloperServer } from './mcp/developer/server';
import { isLangfuseEnabled, shutdownLangfuse } from './observability';

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

  // 4. Context assembly
  const promptBuilder = new SystemPromptBuilder(
    embeddingsService,
    decisionLoader,
    process.cwd(),
    conversationThreadRepo
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

  // Function to refresh GitHub connection with a fresh installation token
  // Called before each agent invocation since tokens expire after 1 hour
  const refreshGitHub = async (): Promise<void> => {
    if (!githubOwner || !githubRepo) {
      return; // GitHub not configured
    }

    try {
      const token = await getInstallationToken(githubOwner, githubRepo);
      await mcpClient.reconnect({
        name: 'github',
        type: 'stdio',
        stdio: {
          command: 'docker',
          args: [
            'run',
            '-i',
            '--rm',
            '-e',
            'GITHUB_PERSONAL_ACCESS_TOKEN',
            'ghcr.io/github/github-mcp-server',
          ],
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: token,
          },
        },
      });
    } catch (error) {
      console.warn(
        'Failed to refresh GitHub connection:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
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

  // 6. MCP Executor (routes tool calls to appropriate server)
  const mcpExecutor = new MCPExecutor(
    mcpClient,
    decisionLogServer,
    challengeServer,
    wikiServer,
    langfuseServer,
    developerServer
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

  // 6. API Server
  const server = new GovernanceServer(trustClassifier, router, invoker, refreshGitHub);

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
