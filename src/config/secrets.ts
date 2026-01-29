import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

/**
 * Secrets manager for fetching configuration from AWS Secrets Manager
 */
export class SecretsManager {
  private client: SecretsManagerClient;
  private cache: Map<string, any> = new Map();

  constructor(region: string = process.env.AWS_REGION || 'us-east-1') {
    this.client = new SecretsManagerClient({ region });
  }

  /**
   * Get a secret from AWS Secrets Manager with caching
   */
  private async getSecret(secretId: string): Promise<any> {
    // Check cache
    if (this.cache.has(secretId)) {
      return this.cache.get(secretId);
    }

    try {
      const command = new GetSecretValueCommand({ SecretId: secretId });
      const response = await this.client.send(command);

      if (!response.SecretString) {
        throw new Error(`Secret ${secretId} has no string value`);
      }

      const secret = JSON.parse(response.SecretString);
      this.cache.set(secretId, secret);
      return secret;
    } catch (error) {
      console.warn(
        `Failed to fetch secret ${secretId} from AWS, falling back to environment variables:`,
        error
      );
      return null;
    }
  }

  /**
   * Get database connection URL
   */
  async getDatabaseUrl(): Promise<string> {
    // Try AWS Secrets Manager first
    const dbSecret = await this.getSecret('ai-governance/database');
    if (dbSecret?.url) {
      return dbSecret.url;
    }

    // Fallback to environment variable
    if (process.env.DATABASE_URL) {
      return process.env.DATABASE_URL;
    }

    throw new Error('DATABASE_URL not found in AWS Secrets Manager or environment');
  }

  /**
   * Get Anthropic API key
   */
  async getAnthropicApiKey(): Promise<string> {
    // Try AWS Secrets Manager first
    const anthropicSecret = await this.getSecret('ai-governance/anthropic');
    if (anthropicSecret?.api_key) {
      return anthropicSecret.api_key;
    }

    // Fallback to environment variable
    if (process.env.ANTHROPIC_API_KEY) {
      return process.env.ANTHROPIC_API_KEY;
    }

    throw new Error(
      'ANTHROPIC_API_KEY not found in AWS Secrets Manager or environment'
    );
  }

  /**
   * Get OpenAI API key
   */
  async getOpenAIApiKey(): Promise<string> {
    // Try AWS Secrets Manager first
    const openaiSecret = await this.getSecret('ai-governance/openai');
    if (openaiSecret?.api_key) {
      return openaiSecret.api_key;
    }

    // Fallback to environment variable
    if (process.env.OPENAI_API_KEY) {
      return process.env.OPENAI_API_KEY;
    }

    throw new Error('OPENAI_API_KEY not found in AWS Secrets Manager or environment');
  }

  /**
   * Get GitHub App credentials
   */
  async getGitHubAppCredentials(): Promise<{
    appId: string;
    privateKey: string;
    webhookSecret: string;
  } | null> {
    // Try AWS Secrets Manager first
    const githubSecret = await this.getSecret('ai-governance/github-app');
    if (githubSecret) {
      return {
        appId: githubSecret.app_id,
        privateKey: githubSecret.private_key,
        webhookSecret: githubSecret.webhook_secret,
      };
    }

    // Fallback to environment variables
    if (
      process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_PRIVATE_KEY_PATH &&
      process.env.GITHUB_WEBHOOK_SECRET
    ) {
      const fs = require('fs');
      return {
        appId: process.env.GITHUB_APP_ID,
        privateKey: fs.readFileSync(process.env.GITHUB_APP_PRIVATE_KEY_PATH, 'utf8'),
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
      };
    }

    // GitHub App is optional, return null if not configured
    console.warn('GitHub App credentials not found - webhook integration disabled');
    return null;
  }
}
