# AWS Infrastructure Setup

This directory contains CloudFormation templates and scripts to set up the AWS infrastructure for the AI Governance framework.

## Prerequisites

1. **AWS Account** with billing enabled
2. **AWS CLI** installed and configured (`aws configure`)
3. **Permissions** to create:
   - VPC, Subnets, Security Groups
   - RDS instances
   - ElastiCache clusters
   - Secrets Manager secrets
   - ECR repositories
   - App Runner or ECS resources

## Quick Start

```bash
cd infra
./scripts/setup-aws.sh
```

This creates all necessary AWS resources. **Expected cost: ~$50-70/month**

## Manual Setup (Step-by-Step)

### Step 1: Deploy Database

```bash
aws cloudformation create-stack \
  --stack-name ai-governance-database \
  --template-body file://cloudformation/database.yml \
  --parameters \
    ParameterKey=MasterPassword,ParameterValue=YOUR_SECURE_PASSWORD_HERE
```

**Wait for completion** (~10 minutes):
```bash
aws cloudformation wait stack-create-complete \
  --stack-name ai-governance-database
```

### Step 2: Install pgvector Extension

The database is created with PostgreSQL 15, but pgvector needs to be installed manually:

```bash
# Get database endpoint
DB_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name ai-governance-database \
  --query 'Stacks[0].Outputs[?OutputKey==`DBEndpoint`].OutputValue' \
  --output text)

# Connect and install pgvector
psql "postgresql://postgres:YOUR_PASSWORD@$DB_ENDPOINT:5432/ai_governance" \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

**Note:** RDS PostgreSQL 15.4+ includes pgvector by default on AWS.

### Step 3: Get Connection Details

```bash
# Connection string is stored in Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id ai-governance/database \
  --query SecretString \
  --output text
```

Save this connection string - you'll need it for:
- GitHub Secrets (`DATABASE_URL`)
- Local development (`.env` file)
- Agent Codespaces

### Step 4: Configure GitHub Secrets

In your GitHub repository settings, add these secrets:

1. `DATABASE_URL` - From Secrets Manager above
2. `AWS_ACCESS_KEY_ID` - For deployment
3. `AWS_SECRET_ACCESS_KEY` - For deployment
4. `AWS_REGION` - e.g., `us-east-1`
5. `OPENAI_API_KEY` - For embeddings

### Step 5: Enable GitHub Codespaces

1. Go to repository Settings → Codespaces
2. Enable Codespaces for this repository
3. Agents will use the `.devcontainer/devcontainer.json` config

## Infrastructure Components

### database.yml
- RDS PostgreSQL 15 with pgvector
- VPC with public subnets (for remote access)
- Security group (restrict to your IP + GitHub IPs in production)
- Secrets Manager for credentials
- **Cost:** ~$15/month (db.t4g.micro)

### cache.yml (TODO)
- ElastiCache Redis for rate limiting
- **Cost:** ~$12/month (cache.t4g.micro)

### compute.yml (TODO)
- App Runner or ECS Fargate for application
- Auto-scaling, blue/green deployment
- **Cost:** ~$10-30/month (minimal traffic)

## Security Considerations

### For Development (Current Setup)
- ✅ Database publicly accessible (required for Codespaces)
- ✅ Security group restricts to allowed IPs
- ✅ Strong passwords in Secrets Manager
- ✅ Encrypted at rest (RDS default)

### For Production (Recommended Updates)
- [ ] Use VPN or bastion host instead of public DB
- [ ] Restrict security group to specific GitHub IP ranges
- [ ] Enable RDS Proxy for connection pooling
- [ ] Use IAM database authentication
- [ ] Enable AWS WAF on API endpoints
- [ ] Set up CloudTrail for audit logging

## Cost Optimization

**Current monthly estimate:**
- RDS (db.t4g.micro): $15
- Data transfer: $5
- **Total: ~$20/month**

**With full stack:**
- Add ElastiCache: +$12
- Add App Runner: +$10-30
- **Total: ~$50-70/month**

**To reduce costs:**
- Use Aurora Serverless v2 (scales to zero)
- Use DynamoDB instead of Redis (pay per use)
- Use Lambda instead of App Runner (pay per invocation)

## Agent Access

Once set up, autonomous agents can:

1. **Open GitHub Codespace** - Pre-configured with DB access
2. **Write code** - Full TypeScript environment
3. **Run migrations** - `npm run migrate up`
4. **Run tests** - Against live RDS instance
5. **Deploy** - Push to main → GitHub Actions deploys

**No local machine required!**

## Troubleshooting

### "Cannot connect to database"
1. Check security group allows your IP
2. Verify password in Secrets Manager
3. Ensure pgvector extension is installed
4. Check RDS instance is in "available" state

### "Stack creation failed"
1. Check AWS service quotas (VPC, RDS limits)
2. Verify IAM permissions
3. Check CloudFormation events for specific error

### "Too expensive"
1. Use db.t3.micro instead of t4g (cheaper, non-ARM)
2. Reduce backup retention from 7 to 1 day
3. Use Aurora Serverless v2 with min capacity 0.5

## Next Steps

After AWS setup is complete:

1. Run database migrations: `npm run migrate up`
2. Set up GitHub Actions workflows
3. Deploy initial application
4. Hand off to autonomous agents!
