# Environment Variables Reference

Complete reference for all environment variables used by the AI Governance framework.

## Required Variables

These must be set for the application to start.

### DATABASE_URL

PostgreSQL connection string with pgvector extension installed.

```bash
DATABASE_URL=postgresql://user:password@host:5432/database?ssl=true&sslmode=no-verify
```

**Format:** `postgresql://[user]:[password]@[host]:[port]/[database][?options]`

**Common options:**
- `?ssl=true&sslmode=no-verify` - SSL without certificate verification (AWS RDS)
- `?sslmode=require` - Require SSL with certificate verification

**Where to get it:**
- AWS RDS: Construct from CloudFormation outputs or Secrets Manager
- Local Docker: `postgresql://postgres:password@localhost:5432/ai_governance`

---

### ANTHROPIC_API_KEY

API key for Claude agent execution.

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

**Where to get it:** https://console.anthropic.com/

---

### OPENAI_API_KEY

API key for generating embeddings (decision semantic search).

```bash
OPENAI_API_KEY=sk-...
```

**Where to get it:** https://platform.openai.com/api-keys

---

## GitHub App Variables

Required for autonomous GitHub operations (PR review, approval, merging).

### GITHUB_APP_ID

The numeric ID of your GitHub App.

```bash
GITHUB_APP_ID=123456
```

**Where to get it:** GitHub App settings page, shown at the top.

---

### GITHUB_APP_PRIVATE_KEY_PATH

Path to the GitHub App private key file (for local development).

```bash
GITHUB_APP_PRIVATE_KEY_PATH=/path/to/private-key.pem
```

**Where to get it:** Generate in GitHub App settings → Private keys.

---

### GITHUB_APP_PRIVATE_KEY

The full contents of the GitHub App private key (for cloud deployment).

```bash
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----"
```

**Note:** Use either `GITHUB_APP_PRIVATE_KEY_PATH` (local) or `GITHUB_APP_PRIVATE_KEY` (cloud), not both.

---

### GITHUB_WEBHOOK_SECRET

Secret used to verify webhook payloads from GitHub.

```bash
GITHUB_WEBHOOK_SECRET=your-random-secret-here
```

**Generate with:** `openssl rand -hex 32`

**Where to configure:** GitHub App settings → Webhook → Secret

---

### GITHUB_REPOSITORY

The repository this governance instance manages (owner/repo format).

```bash
GITHUB_REPOSITORY=your-org/your-repo
```

---

## Optional Variables

### PORT

HTTP server port.

```bash
PORT=3000
```

**Default:** `3000`

---

### NODE_ENV

Runtime environment.

```bash
NODE_ENV=development  # or production
```

**Default:** `development`

**Effects:**
- `development`: Verbose logging, detailed error messages
- `production`: Minimal logging, generic error messages

---

### AWS_REGION

AWS region for services (if using AWS infrastructure).

```bash
AWS_REGION=us-east-1
```

**Default:** `us-east-1`

---

### REDIS_URL

Redis connection string for rate limiting (not yet implemented).

```bash
REDIS_URL=redis://localhost:6379
```

---

## Environment-Specific Setup

### Local Development

Create a `.env` file in the project root:

```bash
cp .env.example .env
# Edit .env with your values
```

The `dotenv` package loads this automatically.

### GitHub Codespaces

Add secrets in repository Settings → Secrets and variables → Codespaces:

| Secret Name | Value |
|-------------|-------|
| `DATABASE_URL` | Your RDS connection string |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `GITHUB_APP_ID` | Your GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | Full PEM contents |
| `GITHUB_WEBHOOK_SECRET` | Your webhook secret |
| `GITHUB_REPOSITORY` | owner/repo |

Codespaces automatically injects these as environment variables.

### AWS Deployment

For container deployments (App Runner, ECS, etc.), inject environment variables at runtime:

1. Store sensitive values in AWS Secrets Manager
2. Configure container to inject secrets as environment variables
3. Reference secrets in task definition or App Runner config

### GitHub Actions

For CI/CD workflows, add secrets in repository Settings → Secrets and variables → Actions.

## Validation

Run the validation script to check your configuration:

```bash
# Validates GitHub App configuration
npm run validate:github
```

Check all required variables are set:

```bash
# Quick check
node -e "
  const required = ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length) {
    console.error('Missing:', missing.join(', '));
    process.exit(1);
  }
  console.log('All required variables set');
"
```
