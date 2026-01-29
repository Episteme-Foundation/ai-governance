# AI Governance Operations

This document contains deployment and operational details specific to this ai-governance instance. For general framework deployment, see [docs/deployment/](docs/deployment/).

## Current Deployment

### AWS Infrastructure

| Resource | Details |
|----------|---------|
| **Region** | us-east-1 |
| **Database** | RDS PostgreSQL 15.15 with pgvector |
| **Database Stack** | ai-governance-database |
| **Compute Stack** | ai-governance-compute |
| **Instance Class** | db.t4g.micro |

### Application Endpoints

| Endpoint | URL |
|----------|-----|
| **Service URL** | https://apme7vh4ri.us-east-1.awsapprunner.com |
| **Health Check** | https://apme7vh4ri.us-east-1.awsapprunner.com/health |
| **Webhook URL** | https://apme7vh4ri.us-east-1.awsapprunner.com/api/webhooks/github |

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
- **GitHub App:** ai-governance-app (ID: 2755899)

## Secrets Management

Secrets are stored in AWS Secrets Manager and loaded at runtime:

| Secret Name | Path |
|-------------|------|
| **App Config** | `ai-governance/app-config` |

Contains: DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET

| Environment | Secret Source |
|-------------|---------------|
| Local Development | `.env` file |
| GitHub Codespaces | Codespaces secrets |
| Production (App Runner) | AWS Secrets Manager |

## Setup Checklist

### Completed

- [x] AWS account configured
- [x] RDS PostgreSQL deployed with pgvector
- [x] Database migrations created
- [x] TypeScript application compiles
- [x] Environment variables documented
- [x] GitHub App documentation created
- [x] Devcontainer configuration added
- [x] Anthropic API key obtained and configured
- [x] OpenAI API key obtained and configured
- [x] GitHub App created (ai-governance-app, ID: 2755899)
- [x] AWS Secrets Manager configured
- [x] App Runner deployed and running
- [x] CI/CD workflow configured (GitHub Actions)

### Pending

- [ ] Update GitHub App webhook URL
- [ ] GitHub Codespaces secrets configured
- [ ] Initial end-to-end test (webhook → agent)

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
| 2026-01-29 | Initial AWS infrastructure deployed |
| 2026-01-29 | Database migrations created and run |
| 2026-01-29 | GitHub App created (ai-governance-app) |
| 2026-01-29 | AWS Secrets Manager integration added |
| 2026-01-29 | App Runner deployed (apme7vh4ri.us-east-1.awsapprunner.com) |
| 2026-01-29 | GitHub Actions CI/CD workflow configured |
