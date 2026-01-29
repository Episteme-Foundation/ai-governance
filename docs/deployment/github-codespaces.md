# GitHub Codespaces Setup

GitHub Codespaces provides a cloud-based development environment that autonomous agents can use without any local machine. This is the recommended setup for agent-driven development.

## Why Codespaces?

- **No local dependencies** - Agents open a Codespace directly from GitHub
- **Pre-configured environment** - All tools and connections ready
- **Secrets injection** - Environment variables automatically available
- **Ephemeral** - Each session is isolated, agents can't break the environment

## Prerequisites

1. GitHub repository with the AI Governance framework
2. Database deployed and accessible (see [AWS Setup](../../infra/README.md))
3. API keys obtained (Anthropic, OpenAI)
4. GitHub App created (see [GitHub App Setup](github-app.md))

## Step 1: Enable Codespaces

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Codespaces**
3. Under "Codespaces access", enable for your organization/account
4. (Optional) Set a spending limit

## Step 2: Configure Codespaces Secrets

Codespaces secrets are injected as environment variables when a Codespace launches.

1. Go to **Settings** → **Secrets and variables** → **Codespaces**
2. Add these secrets:

| Secret Name | Description |
|-------------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (from AWS RDS) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GH_APP_ID` | GitHub App ID |
| `GH_APP_PRIVATE_KEY` | Full PEM contents of private key |
| `GH_WEBHOOK_SECRET` | Webhook secret |

**Important:** GitHub reserves the `GITHUB_*` prefix for its own variables, so use `GH_*` for GitHub App secrets. The application automatically normalizes these at runtime (maps `GH_*` → `GITHUB_*`).

**For private key:** Paste the entire contents of the `.pem` file including the `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` lines.

## Step 3: Create devcontainer.json

The repository should have a `.devcontainer/devcontainer.json` file that configures the Codespace environment.

Create `.devcontainer/devcontainer.json`:

```json
{
  "name": "AI Governance",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
  "features": {
    "ghcr.io/devcontainers/features/aws-cli:1": {},
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "postCreateCommand": "npm install",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-typescript-next"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode"
      }
    }
  },
  "forwardPorts": [3000],
  "remoteEnv": {
    "NODE_ENV": "development"
  }
}
```

## Step 4: Verify Setup

### Manual verification

1. Go to your repository on GitHub
2. Click **Code** → **Codespaces** → **Create codespace on main**
3. Wait for the Codespace to launch
4. In the terminal, verify environment:
   ```bash
   # Check secrets are injected
   echo $DATABASE_URL | head -c 30
   echo $ANTHROPIC_API_KEY | head -c 10

   # Test database connection
   npm run migrate up

   # Run the application
   npm run dev
   ```

### Agent verification

Agents can verify their environment by running:

```bash
npm run validate:github
```

## How Agents Use Codespaces

Once configured, agents can:

1. **Open a Codespace** via GitHub API or CLI:
   ```bash
   gh codespace create --repo owner/repo --branch main
   gh codespace ssh --codespace <name>
   ```

2. **Work in the environment:**
   - All dependencies pre-installed
   - Database accessible via `DATABASE_URL`
   - API keys available as environment variables
   - GitHub CLI authenticated

3. **Make changes and push:**
   ```bash
   git add .
   git commit -m "Implement feature X"
   git push origin main
   ```

4. **Close when done:**
   ```bash
   gh codespace delete --codespace <name>
   ```

## Cost Management

### Pricing (as of 2024)

- 2-core: $0.18/hour
- 4-core: $0.36/hour
- 8-core: $0.72/hour

### Recommendations

1. **Use 2-core machines** - Sufficient for development tasks
2. **Set spending limits** - Repository Settings → Codespaces → Spending limit
3. **Auto-delete idle Codespaces** - Set retention period (default 30 days)
4. **Stop Codespaces when idle** - Agents should stop, not just disconnect

### Organization Settings

For organizations, configure in Organization Settings → Codespaces:

- **Machine type policy**: Restrict to 2-core or 4-core
- **Retention period**: 7 days (idle Codespaces auto-delete)
- **Prebuild policy**: Enable for faster startup (adds storage cost)

## Troubleshooting

### "Secret not found" in Codespace

1. Verify secret is added in Settings → Secrets → Codespaces
2. Check secret name matches exactly (case-sensitive)
3. Restart the Codespace after adding secrets

### "Cannot connect to database"

1. Verify `DATABASE_URL` secret is correct
2. Check RDS security group allows Codespace IPs (GitHub IP ranges)
3. Test connection: `psql "$DATABASE_URL" -c "SELECT 1;"`

### Codespace won't start

1. Check repository has `.devcontainer/devcontainer.json`
2. Verify devcontainer image is accessible
3. Check GitHub status page for Codespaces issues

### Agent can't authenticate with GitHub

1. Verify `GITHUB_APP_PRIVATE_KEY` contains full PEM (not path)
2. Run `npm run validate:github` to check configuration
3. Ensure GitHub App is installed on the repository
