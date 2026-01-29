# Deployment Guide

This guide covers deploying the AI Governance framework for any project. For project-specific details about this repository's deployment, see [OPERATIONS.md](../../OPERATIONS.md).

## Overview

The AI Governance framework requires:

1. **PostgreSQL database** with pgvector extension (for semantic search)
2. **GitHub App** (for autonomous PR review, approval, merging)
3. **Runtime environment** (AWS, local, or GitHub Codespaces)

## Deployment Options

| Option | Best For | Cost |
|--------|----------|------|
| [Local Development](local-development.md) | Initial testing, debugging | Free (your hardware) |
| [GitHub Codespaces](github-codespaces.md) | Autonomous agent development | ~$0.18/hr active |
| [AWS](../../infra/README.md) | Production deployment | ~$50-70/month |

## Quick Start

### Minimal Local Setup

```bash
# 1. Clone and install
git clone <your-repo>
cd ai-governance
npm install

# 2. Set up PostgreSQL with pgvector
# (Docker recommended - see local-development.md)

# 3. Configure environment
cp .env.example .env
# Edit .env with your values

# 4. Run migrations
npm run migrate up

# 5. Start the server
npm run dev
```

### Cloud Setup (Recommended)

1. **Deploy database infrastructure** - [AWS Setup](../../infra/README.md)
2. **Create GitHub App** - [GitHub App Setup](github-app.md)
3. **Enable Codespaces** - [Codespaces Setup](github-codespaces.md)
4. **Configure secrets** - [Environment Variables](environment-variables.md)

## Documentation Index

| Document | Description |
|----------|-------------|
| [Environment Variables](environment-variables.md) | Complete reference for all configuration |
| [Local Development](local-development.md) | Running locally for testing |
| [GitHub Codespaces](github-codespaces.md) | Cloud development environment |
| [GitHub App Setup](github-app.md) | Creating the GitHub App for autonomous governance |
| [AWS Infrastructure](../../infra/README.md) | CloudFormation templates and AWS setup |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     GitHub (Webhooks)                         │
│  Issues, PRs, Comments → triggers governance actions          │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│                   Governance Server                           │
│  Receives webhooks, routes to appropriate agent roles         │
└──────────────────┬───────────────────────────────────────────┘
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
┌──────────────┐       ┌──────────────┐
│  PostgreSQL  │       │   Claude     │
│  + pgvector  │       │   Agent      │
│              │       │   SDK        │
│  - Decisions │       │              │
│  - Sessions  │       │  - Reasoning │
│  - Embeddings│       │  - Actions   │
└──────────────┘       └──────────────┘
```

## Security Checklist

Before going to production:

- [ ] Database not publicly accessible (use VPN/bastion)
- [ ] API keys stored in environment variables, not code
- [ ] GitHub webhook secret configured and validated
- [ ] Rate limiting enabled
- [ ] Audit logging configured
- [ ] Security group restricts database access
