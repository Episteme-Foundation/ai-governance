import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import {
  DecisionRepository,
  SessionRepository,
  AuditRepository,
  ChallengeRepository,
} from './db/repositories';
import { DecisionLoader } from './context/loaders';
import {
  EmbeddingsService,
  OpenAIEmbeddingProvider,
} from './context/embeddings';
import { SystemPromptBuilder } from './context/prompt-builder';
import { TrustClassifier } from './orchestration/trust';
import { RequestRouter } from './orchestration/router';
import { AgentInvoker } from './orchestration/invoke';
import { GovernanceServer } from './api/server';
import { SecretsManager } from './config/secrets';

/**
 * Main entry point for AI Governance application
 */
async function main() {
  console.log('Starting AI Governance system...');

  // 0. Load secrets from AWS Secrets Manager (with .env fallback)
  const secretsManager = new SecretsManager();

  const databaseUrl = await secretsManager.getDatabaseUrl();
  const anthropicApiKey = await secretsManager.getAnthropicApiKey();
  const openaiApiKey = await secretsManager.getOpenAIApiKey();

  console.log('Secrets loaded successfully');

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

  // 5. Orchestration
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
    embeddingsService
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
