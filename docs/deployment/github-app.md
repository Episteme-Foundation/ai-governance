# GitHub App Setup

This guide walks through creating and configuring a GitHub App for the AI Governance system. The GitHub App enables agents to autonomously review PRs, approve, merge, comment, and manage issues.

## Prerequisites

- Admin access to the GitHub organization or repository
- The repository where ai-governance will be installed

## Step 1: Create the GitHub App

1. Go to **GitHub Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**
   - Or navigate directly to: https://github.com/settings/apps/new

2. Fill in the basic information:

   | Field | Value |
   |-------|-------|
   | **GitHub App name** | `ai-governance-bot` (must be unique across GitHub) |
   | **Homepage URL** | Your repository URL (e.g., `https://github.com/your-org/ai-governance`) |

3. **Identifying and authorizing users** - Leave all unchecked:
   - [ ] Expire user authorization tokens
   - [ ] Request user authorization during installation
   - [ ] Enable Device Flow

4. **Post installation** - Leave blank

5. **Webhook**:
   - [x] **Active** - Check this
   - **Webhook URL** - Use a placeholder for now: `https://example.com/webhook`
     - Update this after deployment with your actual endpoint
     - For local testing, use [smee.io](https://smee.io) to create a proxy URL
   - **Webhook secret** - Generate with: `openssl rand -hex 32`
     - Save this value as `GITHUB_WEBHOOK_SECRET`

## Step 2: Configure Permissions

On the **Permissions & events** page, set these **Repository permissions**:

| Permission | Access Level | Purpose |
|------------|--------------|---------|
| **Contents** | Read | Read repository files, constitution, decisions |
| **Issues** | Read and write | Create escalation issues, respond to questions |
| **Metadata** | Read | Required (auto-selected) |
| **Pull requests** | Read and write | Review, approve, merge PRs |

All other permissions can remain "No access".

## Step 3: Subscribe to Events

Check these events to receive webhooks:

- [x] **Issues** - When issues are opened, edited, closed
- [x] **Issue comment** - When comments are added to issues/PRs
- [x] **Pull request** - When PRs are opened, updated, merged
- [x] **Pull request review** - When reviews are submitted

## Step 4: Installation Access

Choose where the app can be installed:

- **Only on this account** - If this is for a single organization
- **Any account** - If you want others to install it (not typical for self-governance)

## Step 5: Create the App

Click **Create GitHub App**.

## Step 6: Note the App ID

After creation, you'll be on the app's settings page. Note the **App ID** at the top - this becomes your `GITHUB_APP_ID`.

## Step 7: Generate a Private Key

1. Scroll down to **Private keys**
2. Click **Generate a private key**
3. A `.pem` file will download
4. Save this file securely - it's used for `GITHUB_APP_PRIVATE_KEY_PATH`

For cloud deployment (Codespaces/AWS), you'll paste the contents of this file as `GITHUB_APP_PRIVATE_KEY` environment variable.

## Step 8: Install the App

1. Go to the app's settings → **Install App** (left sidebar)
2. Click **Install** next to your organization/account
3. Choose **Only select repositories** and select your ai-governance repo
4. Click **Install**

## Environment Variables

After setup, configure these environment variables:

```bash
# From Step 6
GITHUB_APP_ID=123456

# From Step 7 - path for local dev
GITHUB_APP_PRIVATE_KEY_PATH=/path/to/your-app.private-key.pem

# Or for cloud: paste the entire PEM contents
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"

# From Step 5 (webhook secret you generated)
GITHUB_WEBHOOK_SECRET=your-generated-secret

# Your repository
GITHUB_REPOSITORY=your-org/ai-governance
```

## Verification

Run the validation script to verify your setup:

```bash
npm run validate:github
```

This checks:
- App ID and private key are valid
- App can authenticate with GitHub
- App has required permissions
- App is installed on the target repository

## Updating the Webhook URL

Once you have a deployed endpoint:

1. Go to your app's settings
2. Update the **Webhook URL** to your actual endpoint (e.g., `https://your-domain.com/api/webhooks/github`)
3. Click **Save changes**

## Troubleshooting

### "App not installed" error
- Verify the app is installed on the repository (Step 8)
- Check `GITHUB_REPOSITORY` matches the installed repo

### "Invalid signature" on webhooks
- Verify `GITHUB_WEBHOOK_SECRET` matches what you set in the app settings

### "Resource not accessible by integration"
- The app is missing required permissions
- Go to app settings → Permissions and add the missing permission
- Reinstall the app for changes to take effect
