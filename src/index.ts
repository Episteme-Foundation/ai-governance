import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import {
  DecisionRepository,
  SessionRepository,
  AuditRepository,
  ChallengeRepository,
  WikiDraftRepository,
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
import { GitHubServer } from './mcp/github/server';
import { DecisionLogServer } from './mcp/decision-log/server';
import { ChallengeServer } from './mcp/challenge/server';
import { WikiServer } from './mcp/wiki/server';

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

  // 3. Services
  const embeddingProvider = new OpenAIEmbeddingProvider(openaiApiKey);
  const embeddingsService = new EmbeddingsService(embeddingProvider);
  const decisionLoader = new DecisionLoader(decisionRepo);

  // 4. Context assembly
  const promptBuilder = new SystemPromptBuilder(
    embeddingsService,
    decisionLoader,
    process.cwd()
  );

  // 5. MCP Servers
  const githubServer = new GitHubServer();
  const decisionLogServer = new DecisionLogServer(decisionRepo, embeddingsService);
  const challengeServer = new ChallengeServer(challengeRepo);
  const wikiServer = new WikiServer(wikiDraftRepo, WikiLoader);

  // 6. MCP Executor (routes tool calls to appropriate server)
  const mcpExecutor = new MCPExecutor(
    githubServer,
    decisionLogServer,
    challengeServer,
    wikiServer
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
    mcpExecutor
  );

  // 6. API Server
  const server = new GovernanceServer(trustClassifier, router, invoker);

  const port = parseInt(process.env.PORT || '3000', 10);
  await server.start(port);

  console.log(`AI Governance system ready on port ${port}`);

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await server.stop();
    await dbPool.end();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await server.stop();
    await dbPool.end();
    process.exit(0);
  });
}

// Run the application
main().catch((error) => {
  console.error('Fatal error starting application:', error);
  process.exit(1);
});
