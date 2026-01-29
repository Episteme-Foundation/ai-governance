import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

/**
 * Load secrets from AWS Secrets Manager if running in production
 * and env vars are not already set.
 *
 * This allows:
 * - Local dev: Uses .env file directly
 * - Codespaces: Uses GitHub Codespaces secrets (injected as env vars)
 * - AWS production: Fetches from Secrets Manager
 */
export async function loadSecrets(): Promise<void> {
  // If all required env vars are already set, skip Secrets Manager
  const requiredVars = [
    'DATABASE_URL',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GITHUB_APP_ID',
    'GITHUB_WEBHOOK_SECRET',
  ];

  const hasPrivateKey =
    process.env.GITHUB_APP_PRIVATE_KEY ||
    process.env.GITHUB_APP_PRIVATE_KEY_PATH;

  const allSet =
    requiredVars.every((v) => process.env[v]) && hasPrivateKey;

  if (allSet) {
    console.log('All secrets available from environment');
    return;
  }

  // Try to load from Secrets Manager
  const secretName = process.env.AWS_SECRET_NAME || 'ai-governance/app-config';
  const region = process.env.AWS_REGION || 'us-east-1';

  console.log(`Loading secrets from AWS Secrets Manager: ${secretName}`);

  try {
    const client = new SecretsManagerClient({ region });
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error('Secret has no string value');
    }

    const secrets = JSON.parse(response.SecretString);

    // Set environment variables from secrets (only if not already set)
    const secretMappings: Record<string, string> = {
      DATABASE_URL: secrets.DATABASE_URL,
      ANTHROPIC_API_KEY: secrets.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: secrets.OPENAI_API_KEY,
      GITHUB_APP_ID: secrets.GITHUB_APP_ID,
      GITHUB_APP_PRIVATE_KEY: secrets.GITHUB_APP_PRIVATE_KEY,
      GITHUB_WEBHOOK_SECRET: secrets.GITHUB_WEBHOOK_SECRET,
      GITHUB_REPOSITORY: secrets.GITHUB_REPOSITORY,
    };

    for (const [key, value] of Object.entries(secretMappings)) {
      if (!process.env[key] && value) {
        process.env[key] = value;
      }
    }

    console.log('Secrets loaded from AWS Secrets Manager');
  } catch (error) {
    // If we can't load from Secrets Manager and env vars aren't set, this is fatal
    if (!allSet) {
      console.error('Failed to load secrets from AWS Secrets Manager:', error);
      throw new Error(
        'Required secrets not available. Set environment variables or configure AWS Secrets Manager.'
      );
    }
    // Otherwise, warn but continue (env vars may be partially set)
    console.warn(
      'Could not load from Secrets Manager, using available env vars:',
      error
    );
  }
}
