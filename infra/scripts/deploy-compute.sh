#!/bin/bash
set -e

echo "Deploying AI Governance compute infrastructure..."
echo ""

REGION=${AWS_REGION:-us-east-1}
STACK_NAME="ai-governance-compute"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Check if required environment variables are set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL environment variable is required"
    exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Error: ANTHROPIC_API_KEY environment variable is required"
    exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo "Error: OPENAI_API_KEY environment variable is required"
    exit 1
fi

if [ -z "$GITHUB_APP_ID" ]; then
    echo "Error: GITHUB_APP_ID environment variable is required"
    exit 1
fi

if [ -z "$GITHUB_APP_PRIVATE_KEY" ]; then
    # Try to read from file if path is set
    if [ -n "$GITHUB_APP_PRIVATE_KEY_PATH" ] && [ -f "$GITHUB_APP_PRIVATE_KEY_PATH" ]; then
        GITHUB_APP_PRIVATE_KEY=$(cat "$GITHUB_APP_PRIVATE_KEY_PATH")
    else
        echo "Error: GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH is required"
        exit 1
    fi
fi

if [ -z "$GITHUB_WEBHOOK_SECRET" ]; then
    echo "Error: GITHUB_WEBHOOK_SECRET environment variable is required"
    exit 1
fi

GITHUB_REPOSITORY=${GITHUB_REPOSITORY:-Episteme-Foundation/ai-governance}

echo "Configuration:"
echo "  Region: $REGION"
echo "  Account: $ACCOUNT_ID"
echo "  Repository: $GITHUB_REPOSITORY"
echo ""

# Step 1: Deploy CloudFormation stack
echo "Step 1: Deploying CloudFormation stack..."
aws cloudformation deploy \
    --stack-name $STACK_NAME \
    --template-file cloudformation/compute.yml \
    --parameter-overrides \
        DatabaseUrl="$DATABASE_URL" \
        AnthropicApiKey="$ANTHROPIC_API_KEY" \
        OpenAIApiKey="$OPENAI_API_KEY" \
        GitHubAppId="$GITHUB_APP_ID" \
        GitHubAppPrivateKey="$GITHUB_APP_PRIVATE_KEY" \
        GitHubWebhookSecret="$GITHUB_WEBHOOK_SECRET" \
        GitHubRepository="$GITHUB_REPOSITORY" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region $REGION \
    --no-fail-on-empty-changeset

echo ""
echo "Step 2: Building and pushing Docker image..."

# Get ECR repository URI
ECR_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/ai-governance"

# Login to ECR
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_URI

# Build image (from project root)
cd ../..
docker build -t ai-governance:latest .

# Tag and push
docker tag ai-governance:latest $ECR_URI:latest
docker push $ECR_URI:latest

echo ""
echo "Step 3: Triggering App Runner deployment..."

# Get App Runner service ARN
SERVICE_ARN=$(aws apprunner list-services --region $REGION \
    --query "ServiceSummaryList[?ServiceName=='ai-governance'].ServiceArn" \
    --output text)

if [ -n "$SERVICE_ARN" ]; then
    aws apprunner start-deployment --service-arn $SERVICE_ARN --region $REGION
    echo "Deployment triggered for service: $SERVICE_ARN"
else
    echo "Warning: Could not find App Runner service. It may still be creating."
    echo "Run this script again after the stack is fully created."
fi

echo ""
echo "Step 4: Getting service URL..."

# Wait a moment for outputs to be available
sleep 5

SERVICE_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs[?OutputKey=='ServiceUrl'].OutputValue" \
    --output text \
    --region $REGION 2>/dev/null || echo "pending")

WEBHOOK_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs[?OutputKey=='WebhookUrl'].OutputValue" \
    --output text \
    --region $REGION 2>/dev/null || echo "pending")

echo ""
echo "=========================================="
echo "Deployment complete!"
echo ""
echo "Service URL: $SERVICE_URL"
echo "Webhook URL: $WEBHOOK_URL"
echo ""
echo "NEXT STEPS:"
echo "1. Wait for App Runner service to become 'Running' (check AWS console)"
echo "2. Update your GitHub App webhook URL to: $WEBHOOK_URL"
echo "   - Go to: https://github.com/settings/apps/ai-governance-app"
echo "   - Update Webhook URL"
echo "   - Save changes"
echo "=========================================="
