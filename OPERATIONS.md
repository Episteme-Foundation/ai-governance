# AI Governance Operations

This document contains deployment and operational details specific to this ai-governance instance. For general framework deployment, see [docs/deployment/](docs/deployment/).

## Current Deployment

### AWS Infrastructure

| Resource | Details |
|----------|---------|
| **Region** | us-east-1 |
| **Database** | RDS PostgreSQL 15.15 with pgvector |
| **Stack Name** | ai-governance-database |
| **Instance Class** | db.t4g.micro |

### Database Connection

The database endpoint is available via:

```bash
# Get endpoint from CloudFormation
aws cloudformation describe-stacks \
  --stack-name ai-governance-database \
  --query 'Stacks[0].Outputs[?OutputKey==`DBEndpoint`].OutputValue' \
  --output text
```

Connection string format:
```
postgresql://postgres:<password>@<endpoint>:5432/ai_governance?ssl=true&sslmode=no-verify
```

**Note:** The `sslmode=no-verify` is required because AWS RDS uses self-signed certificates by default.

### GitHub Repository

- **Repository:** Episteme-Foundation/ai-governance
- **Main Branch:** main
- **GitHub App:** (pending setup)

## Secrets Management

All secrets are managed via environment variables:

| Secret | Local Development | GitHub Codespaces | Production |
|--------|-------------------|-------------------|------------|
| DATABASE_URL | `.env` file | Codespaces secret | Container env var |
| ANTHROPIC_API_KEY | `.env` file | Codespaces secret | Container env var |
| OPENAI_API_KEY | `.env` file | Codespaces secret | Container env var |
| GITHUB_APP_* | `.env` file | Codespaces secret | Container env var |

## Setup Checklist

### Completed

- [x] AWS account configured
- [x] RDS PostgreSQL deployed with pgvector
- [x] Database migrations created
- [x] TypeScript application compiles
- [x] Environment variables documented
- [x] GitHub App documentation created
- [x] Devcontainer configuration added

### Pending

- [ ] Anthropic API key obtained and configured
- [ ] OpenAI API key obtained and configured
- [ ] GitHub App created and installed
- [ ] GitHub Codespaces enabled with secrets
- [ ] Initial end-to-end test
- [ ] Production deployment (App Runner/ECS)

## Runbooks

### Starting the Application

```bash
# Local development
npm run dev

# Production
npm start
```

### Database Migrations

```bash
# Run pending migrations
npm run migrate up

# Rollback last migration
npm run migrate down

# Rollback all migrations
npm run migrate down -- --all

# Check migration status
npm run migrate status
```

### Validating Configuration

```bash
# Validate GitHub App setup
npm run validate:github
```

### Connecting to Database

```bash
# Using psql (replace with actual endpoint and password)
psql "postgresql://postgres:PASSWORD@ENDPOINT:5432/ai_governance?sslmode=no-verify"

# Quick connectivity test
psql "$DATABASE_URL" -c "SELECT version();"
```

### Viewing Logs

```bash
# Local: output goes to stdout

# AWS CloudWatch (once deployed):
aws logs tail /aws/apprunner/ai-governance --follow
```

## Cost Tracking

### Current Monthly Costs

| Service | Cost |
|---------|------|
| RDS PostgreSQL (db.t4g.micro) | ~$15 |
| Data Transfer | ~$5 |
| **Total** | **~$20/month** |

### Projected Full Stack

| Service | Cost |
|---------|------|
| RDS PostgreSQL | ~$15 |
| ElastiCache Redis | ~$12 |
| App Runner | ~$10-30 |
| Data Transfer | ~$5 |
| **Total** | **~$50-70/month** |

## Contacts

For issues with this deployment:

- **GitHub Issues:** https://github.com/Episteme-Foundation/ai-governance/issues
- **Human Escalation:** (configured in GitHub App)

## Change Log

| Date | Change |
|------|--------|
| 2025-01-29 | Initial AWS infrastructure deployed |
| 2025-01-29 | Database migrations created and run |
| 2025-01-29 | Simplified secrets to use env vars directly |
| 2025-01-29 | Documentation restructured |
