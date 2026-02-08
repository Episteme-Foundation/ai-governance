# Governance Dashboard

A React web dashboard for monitoring AI governance activity across projects.

## What It Shows

- **Projects** — all registered projects with status, config source, and roles
- **Overview** — aggregate stats (decisions, sessions, challenges) plus pending challenges and recent activity
- **Decisions** — browsable decision log with expandable detail panels (reasoning, considerations, uncertainties)
- **Sessions** — agent session history showing role, duration, tool usage, and escalations
- **Challenges** — filterable challenge list (pending/accepted/rejected) with full argument and response detail
- **Audit Log** — chronological event feed showing every governance action

When multiple projects are registered, a project selector in the sidebar switches context.

## Production Deployment

The dashboard deploys automatically as part of the existing CI/CD pipeline:

1. Push to `main`
2. GitHub Actions builds the Docker image (which includes the dashboard build step)
3. Image is pushed to ECR
4. App Runner auto-deploys the new image
5. Dashboard is live at `https://<your-app-runner-url>/dashboard/`

No separate infrastructure is needed. The dashboard is built into the same container as the governance server and served as static files at `/dashboard/`.

### Required Secrets

These should already be in your `ai-governance/app-config` secret in AWS Secrets Manager:

| Secret | Purpose |
|--------|---------|
| `ADMIN_API_KEY` | Authenticates dashboard API requests |
| `ENCRYPTION_KEY` | Encrypts per-project API keys at rest (optional — falls back to derived key from `ANTHROPIC_API_KEY`) |

### Authentication

All dashboard API endpoints require the `x-admin-key` header matching `ADMIN_API_KEY`. In the browser, set this in localStorage:

```js
localStorage.setItem('admin_api_key', 'your-admin-key')
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /admin/projects` | List all registered projects |
| `GET /admin/projects/:id/stats` | Aggregate stats for a project |
| `GET /admin/projects/:id/decisions` | Decisions with optional `?limit=N` |
| `GET /admin/projects/:id/sessions` | Sessions with optional `?limit=N&status=active` |
| `GET /admin/projects/:id/challenges` | Challenges with optional `?status=pending` |
| `GET /admin/projects/:id/audit` | Audit log entries with optional `?limit=N` |

## Architecture

```
dashboard/
  src/
    api.ts          # API client with types
    hooks.ts        # useAsync data-fetching hook
    App.tsx         # Layout, routing, project context
    pages/
      Projects.tsx  # Project list
      Overview.tsx  # Stats + pending challenges + activity
      Decisions.tsx # Decision log browser
      Sessions.tsx  # Session history
      Challenges.tsx # Challenge browser with filters
      Audit.tsx     # Audit log viewer
```

Vite + React + TypeScript SPA. React Router for navigation. React context for project selection. No external state management libraries.

## Local Development

If you want to develop the dashboard locally:

```bash
# Start the backend (needs DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY in .env)
npm run dev

# In another terminal, start the dashboard dev server
cd dashboard
npm install    # first time only
npm run dev
```

The Vite dev server proxies `/admin/*` requests to `localhost:3000`.
