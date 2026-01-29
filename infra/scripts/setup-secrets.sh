#!/bin/bash
set -e

echo "Setting up secrets in AWS Secrets Manager..."
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "Error: AWS CLI not configured. Run 'aws configure' first."
    exit 1
fi

REGION=${AWS_REGION:-us-east-1}

# Prompt for secrets if not provided as environment variables
if [ -z "$ANTHROPIC_API_KEY" ]; then
    read -p "Enter Anthropic API Key: " ANTHROPIC_API_KEY
fi

if [ -z "$OPENAI_API_KEY" ]; then
    read -p "Enter OpenAI API Key: " OPENAI_API_KEY
fi

echo ""
read -p "Do you want to set up GitHub App credentials? (y/n): " setup_github
if [ "$setup_github" = "y" ]; then
    if [ -z "$GITHUB_APP_ID" ]; then
        read -p "Enter GitHub App ID: " GITHUB_APP_ID
    fi

    if [ -z "$GITHUB_APP_PRIVATE_KEY_PATH" ]; then
        read -p "Enter path to GitHub App private key (.pem file): " GITHUB_APP_PRIVATE_KEY_PATH
        GITHUB_APP_PRIVATE_KEY=$(cat "$GITHUB_APP_PRIVATE_KEY_PATH")
    fi

    if [ -z "$GITHUB_WEBHOOK_SECRET" ]; then
        read -p "Enter GitHub Webhook Secret: " GITHUB_WEBHOOK_SECRET
    fi
fi

echo ""
echo "Creating secrets in AWS Secrets Manager..."

# Anthropic API Key
echo "- Creating ai-governance/anthropic..."
aws secretsmanager create-secret \
    --name ai-governance/anthropic \
    --description "Anthropic API key for Claude agent execution" \
    --secret-string "{\"api_key\":\"$ANTHROPIC_API_KEY\"}" \
    --region $REGION 2>/dev/null || \
aws secretsmanager update-secret \
    --secret-id ai-governance/anthropic \
    --secret-string "{\"api_key\":\"$ANTHROPIC_API_KEY\"}" \
    --region $REGION

# OpenAI API Key
echo "- Creating ai-governance/openai..."
aws secretsmanager create-secret \
    --name ai-governance/openai \
    --description "OpenAI API key for embeddings" \
    --secret-string "{\"api_key\":\"$OPENAI_API_KEY\"}" \
    --region $REGION 2>/dev/null || \
aws secretsmanager update-secret \
    --secret-id ai-governance/openai \
    --secret-string "{\"api_key\":\"$OPENAI_API_KEY\"}" \
    --region $REGION

# GitHub App Credentials (if provided)
if [ "$setup_github" = "y" ]; then
    echo "- Creating ai-governance/github-app..."
    GITHUB_SECRET_JSON=$(jq -n \
        --arg app_id "$GITHUB_APP_ID" \
        --arg private_key "$GITHUB_APP_PRIVATE_KEY" \
        --arg webhook_secret "$GITHUB_WEBHOOK_SECRET" \
        '{app_id: $app_id, private_key: $private_key, webhook_secret: $webhook_secret}')

    aws secretsmanager create-secret \
        --name ai-governance/github-app \
        --description "GitHub App credentials for autonomous governance" \
        --secret-string "$GITHUB_SECRET_JSON" \
        --region $REGION 2>/dev/null || \
    aws secretsmanager update-secret \
        --secret-id ai-governance/github-app \
        --secret-string "$GITHUB_SECRET_JSON" \
        --region $REGION
fi

echo ""
echo "✓ Secrets configured successfully!"
echo ""
echo "Secrets created in AWS Secrets Manager:"
echo "  - ai-governance/anthropic"
echo "  - ai-governance/openai"
if [ "$setup_github" = "y" ]; then
    echo "  - ai-governance/github-app"
fi
echo "  - ai-governance/database (already exists)"
echo ""
echo "Next steps:"
echo "1. Update src/index.ts to fetch secrets from AWS Secrets Manager"
echo "2. Add these same secrets to GitHub Codespaces Secrets"
echo "3. Deploy the application to AWS"
