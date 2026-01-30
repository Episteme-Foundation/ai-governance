#!/bin/bash
set -e

echo "Deploying Langfuse observability infrastructure..."
echo ""

REGION=${AWS_REGION:-us-east-1}
STACK_NAME="langfuse"
DATABASE_STACK_NAME=${DATABASE_STACK_NAME:-ai-governance-database}

# Generate secrets if not provided
if [ -z "$NEXTAUTH_SECRET" ]; then
    echo "Generating NEXTAUTH_SECRET..."
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
fi

if [ -z "$SALT" ]; then
    echo "Generating SALT..."
    SALT=$(openssl rand -base64 32)
fi

echo "Configuration:"
echo "  Region: $REGION"
echo "  Database Stack: $DATABASE_STACK_NAME"
echo ""

# Check that database stack exists
echo "Checking database stack..."
DB_STATUS=$(aws cloudformation describe-stacks \
    --stack-name $DATABASE_STACK_NAME \
    --query "Stacks[0].StackStatus" \
    --output text \
    --region $REGION 2>/dev/null || echo "NOT_FOUND")

if [ "$DB_STATUS" == "NOT_FOUND" ]; then
    echo "Error: Database stack '$DATABASE_STACK_NAME' not found."
    echo "Deploy the database stack first: ./deploy-database.sh"
    exit 1
fi
echo "Database stack status: $DB_STATUS"

# Deploy CloudFormation stack
echo ""
echo "Deploying Langfuse CloudFormation stack..."
aws cloudformation deploy \
    --stack-name $STACK_NAME \
    --template-file cloudformation/langfuse.yml \
    --parameter-overrides \
        DatabaseStackName="$DATABASE_STACK_NAME" \
        NextAuthSecret="$NEXTAUTH_SECRET" \
        Salt="$SALT" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region $REGION \
    --no-fail-on-empty-changeset

# Wait for stack to complete
echo ""
echo "Waiting for stack to complete..."
aws cloudformation wait stack-create-complete \
    --stack-name $STACK_NAME \
    --region $REGION 2>/dev/null || \
aws cloudformation wait stack-update-complete \
    --stack-name $STACK_NAME \
    --region $REGION 2>/dev/null || true

# Get outputs
echo ""
echo "Getting Langfuse URL..."

LANGFUSE_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs[?OutputKey=='LangfuseUrl'].OutputValue" \
    --output text \
    --region $REGION 2>/dev/null || echo "pending")

echo ""
echo "=========================================="
echo "Langfuse deployment initiated!"
echo ""
echo "Langfuse URL: $LANGFUSE_URL"
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Wait for App Runner service to become 'Running'"
echo "   Check: aws apprunner list-services --region $REGION"
echo ""
echo "2. Update NEXTAUTH_URL in the Langfuse service:"
echo "   The service needs to know its own URL for auth to work."
echo "   Update the environment variable in AWS Console or redeploy."
echo ""
echo "3. Create a Langfuse account:"
echo "   - Go to: $LANGFUSE_URL"
echo "   - Sign up with email/password"
echo ""
echo "4. Create API keys in Langfuse:"
echo "   - Go to Settings > API Keys"
echo "   - Create a new key pair"
echo "   - Note the Public Key and Secret Key"
echo ""
echo "5. Add Langfuse keys to ai-governance secrets:"
echo "   aws secretsmanager put-secret-value \\"
echo "     --secret-id ai-governance/app-config \\"
echo "     --region $REGION \\"
echo "     --secret-string '{...existing..., \"LANGFUSE_PUBLIC_KEY\": \"pk-lf-...\", \"LANGFUSE_SECRET_KEY\": \"sk-lf-...\", \"LANGFUSE_BASE_URL\": \"$LANGFUSE_URL\"}'"
echo ""
echo "6. Redeploy ai-governance to pick up new secrets"
echo ""
echo "=========================================="
