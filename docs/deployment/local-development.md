# Local Development Setup

This guide covers running the AI Governance framework locally for testing and development.

## Prerequisites

- Node.js 18+
- PostgreSQL 15+ with pgvector extension
- Git

## Option 1: Docker (Recommended)

The easiest way to run PostgreSQL with pgvector locally.

### Start PostgreSQL with pgvector

```bash
docker run -d \
  --name ai-governance-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=ai_governance \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

### Verify pgvector is available

```bash
docker exec -it ai-governance-db psql -U postgres -d ai_governance \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Stop/Start the container

```bash
docker stop ai-governance-db
docker start ai-governance-db
```

## Option 2: Native PostgreSQL

If you prefer a native installation:

### macOS (Homebrew)

```bash
brew install postgresql@15
brew services start postgresql@15

# Install pgvector
git clone --branch v0.6.0 https://github.com/pgvector/pgvector.git
cd pgvector
make
make install
```

### Create database

```bash
createdb ai_governance
psql -d ai_governance -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

## Project Setup

### 1. Clone and install dependencies

```bash
git clone <your-repo>
cd ai-governance
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your local values:

```bash
# Database (Docker setup)
DATABASE_URL=postgresql://postgres:password@localhost:5432/ai_governance

# API Keys (required for full functionality)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# GitHub App (optional for local testing)
# Leave blank to skip GitHub integration
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY_PATH=
GITHUB_WEBHOOK_SECRET=
GITHUB_REPOSITORY=
```

### 3. Run database migrations

```bash
npm run migrate up
```

### 4. Build TypeScript

```bash
npm run build
```

### 5. Start the server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## Testing Without API Keys

For testing the basic infrastructure without API keys:

1. Comment out the API key checks in `src/index.ts` temporarily
2. The database and HTTP server will start
3. You can test database connections and migrations

Note: Agent functionality requires valid API keys.

## Running Tests

```bash
npm test
```

## Common Development Tasks

### Check database connection

```bash
psql "postgresql://postgres:password@localhost:5432/ai_governance" \
  -c "SELECT version();"
```

### View database tables

```bash
psql "postgresql://postgres:password@localhost:5432/ai_governance" \
  -c "\dt"
```

### Reset database

```bash
npm run migrate down -- --all
npm run migrate up
```

### Type checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## Testing GitHub Webhooks Locally

To receive GitHub webhooks locally, use a tunneling service:

### Using smee.io (Recommended)

1. Go to https://smee.io and click "Start a new channel"
2. Copy the webhook proxy URL
3. Install the smee client:
   ```bash
   npm install -g smee-client
   ```
4. Start the proxy:
   ```bash
   smee -u https://smee.io/your-channel-id -p 3000 -P /api/webhooks/github
   ```
5. Set the smee URL as your GitHub App's webhook URL

### Using ngrok

```bash
ngrok http 3000
```

Use the ngrok URL as your GitHub App's webhook URL.

## Troubleshooting

### "Connection refused" to database

1. Check PostgreSQL is running: `docker ps` or `brew services list`
2. Verify port 5432 is not in use: `lsof -i :5432`
3. Check connection string in `.env`

### "Extension vector does not exist"

Install pgvector extension:
```bash
psql -d ai_governance -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### "API key required" error

Ensure your `.env` file has valid API keys. Get them from:
- Anthropic: https://console.anthropic.com/
- OpenAI: https://platform.openai.com/api-keys

### TypeScript compilation errors

```bash
npm run build
```

Check the error output for specific issues. Run `npm run typecheck` for type-only checking.
