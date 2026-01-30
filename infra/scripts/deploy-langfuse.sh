#!/bin/bash
set -e

echo "=========================================="
echo "Langfuse Deployment"
echo "=========================================="
echo ""
echo "RECOMMENDED: Use the GitHub Actions workflow for deployment."
echo "This handles Docker image mirroring in the cloud without needing"
echo "Docker installed locally."
echo ""
echo "To deploy via GitHub Actions:"
echo "  1. Go to: https://github.com/Episteme-Foundation/ai-governance/actions"
echo "  2. Select 'Deploy Langfuse' workflow"
echo "  3. Click 'Run workflow'"
echo ""
echo "=========================================="
echo ""

read -p "Do you want to deploy locally instead? (requires Docker) [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Exiting. Use GitHub Actions workflow instead."
    exit 0
fi

# Check Docker is available
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker or use GitHub Actions."
    exit 1
fi

REGION=${AWS_REGION:-us-east-1}
STACK_NAME="langfuse"
DATABASE_STACK_NAME=${DATABASE_STACK_NAME:-ai-governance-database}
LANGFUSE_VERSION=${LANGFUSE_VERSION:-latest}
ECR_REPO_NAME="langfuse"

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO_NAME}"

# Generate secrets if not provided
if [ -z "$NEXTAUTH_SECRET" ]; then
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
fi

if [ -z "$SALT" ]; then
    SALT=$(openssl rand -base64 32)
fi

echo ""
echo "Configuration:"
echo "  Region: $REGION"
echo "  Account: $ACCOUNT_ID"
echo "  Langfuse Version: $LANGFUSE_VERSION"
echo ""

# Check database stack exists
echo "Checking database stack..."
DB_STATUS=$(aws cloudformation describe-stacks \
    --stack-name $DATABASE_STACK_NAME \
    --query "Stacks[0].StackStatus" \
    --output text \
    --region $REGION 2>/dev/null || echo "NOT_FOUND")

if [ "$DB_STATUS" == "NOT_FOUND" ]; then
    echo "Error: Database stack '$DATABASE_STACK_NAME' not found."
    exit 1
fi
echo "Database stack status: $DB_STATUS"

# Create ECR repository if needed
echo ""
echo "Checking ECR repository..."
aws ecr describe-repositories --repository-names $ECR_REPO_NAME --region $REGION 2>/dev/null || \
aws ecr create-repository \
    --repository-name $ECR_REPO_NAME \
    --image-scanning-configuration scanOnPush=true \
    --region $REGION

# Pull from Docker Hub and push to ECR
echo ""
echo "Pulling langfuse/langfuse:${LANGFUSE_VERSION} from Docker Hub..."
docker pull langfuse/langfuse:${LANGFUSE_VERSION}

echo ""
echo "Authenticating with ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

echo ""
echo "Pushing to ECR..."
docker tag langfuse/langfuse:${LANGFUSE_VERSION} ${ECR_URI}:${LANGFUSE_VERSION}
docker tag langfuse/langfuse:${LANGFUSE_VERSION} ${ECR_URI}:latest
docker push ${ECR_URI}:${LANGFUSE_VERSION}
docker push ${ECR_URI}:latest

# Deploy CloudFormation
echo ""
echo "Deploying CloudFormation stack..."
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

# Get URL
LANGFUSE_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs[?OutputKey=='LangfuseUrl'].OutputValue" \
    --output text \
    --region $REGION)

echo ""
echo "=========================================="
echo "Langfuse deployment complete!"
echo ""
echo "URL: $LANGFUSE_URL"
echo ""
echo "Next steps:"
echo "1. Wait for App Runner to finish (few minutes)"
echo "2. Create account at $LANGFUSE_URL"
echo "3. Create API keys in Settings > API Keys"
echo "4. Add to ai-governance/app-config secret"
echo "5. Redeploy ai-governance"
echo "=========================================="
