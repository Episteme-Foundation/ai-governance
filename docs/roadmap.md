# AI Governance Project Roadmap

*Living document maintained by governance agents. Last updated: 2026-02-09.*

---

## Current Phase: Foundation & Self-Hosting

The AI governance framework is operational and self-hosting. The core orchestration
application handles GitHub webhooks, routes requests through role-based agents
(Maintainer, Reception, Engineer), records governance decisions, and supports
agent-to-agent communication via both synchronous (`converse`) and asynchronous
(`send`) patterns.

---

## Priorities

### P0 — Critical Infrastructure

| Item | Status |
|------|--------|
| Core orchestration (webhook → router → agent → response) | ✅ Complete |
| Decision logging with semantic search (pgvector) | ✅ Complete |
| GitHub App integration for webhook events | ✅ Complete |
| Trust classification and role-based routing | ✅ Complete |
| Agent-to-agent conversation system | ✅ Complete |
| Langfuse observability integration | ✅ Complete |
| AWS deployment (RDS PostgreSQL + App Runner) | ✅ Complete |
| CI/CD via GitHub Actions | ✅ Complete |
| Main branch protection ruleset | 🔲 Open (Issue #16) |

### P1 — Governance Completeness

| Item | Status |
|------|--------|
| PHILOSOPHY.md foundational document | ✅ Complete |
| CONSTITUTION.md project constitution | ✅ Complete |
| Decision 0001 (bootstrap — adopt governance) | ✅ Complete |
| Follow through on decisions requiring code changes | 🔲 Open (Issue #9) |
| Challenge system end-to-end validation | 🔲 Not started |
| Constitutional amendment workflow validation | 🔲 Not started |
| Project roadmap documentation | 🔲 In progress (this document) |

### P2 — Developer Experience & Documentation

| Item | Status |
|------|--------|
| README with architecture overview | ✅ Complete |
| Deployment docs (local, Codespaces, AWS) | ✅ Complete |
| Organizational pattern docs (Maintainer, Council, etc.) | ✅ Complete |
| Project configuration schema docs | ✅ Complete |
| Wiki initialization and content | 🔲 In progress |
| Improved onboarding for new adopters | 🔲 Not started |
| Example project walkthrough | 🔲 Not started |
| API documentation for contributor/public API | 🔲 Not started |

### P3 — Agent Quality & Reliability

| Item | Status |
|------|--------|
| Systematic quality evaluation via Langfuse | 🔲 Not started |
| Prompt refinement based on observed session patterns | 🔲 Not started |
| Error recovery and retry strategies | 🔲 Not started |
| Rate limiting enforcement | 🔲 Not started |
| Session cost tracking and optimization | 🔲 Not started |

### P4 — Framework Expansion

| Item | Status |
|------|--------|
| Multi-project support (hosting governance for external projects) | 🔲 Not started |
| Dashboard for governance visibility | 🔲 Scaffolded (dashboard/) |
| Public API for governance queries | 🔲 Not started |
| Additional organizational patterns | 🔲 Not started |
| Plugin system for custom MCP servers | 🔲 Not started |

---

## Open Issues

| Issue | Title | Priority | Notes |
|-------|-------|----------|-------|
| #16 | Main branch unprotected | P0 | Requires GitHub admin to create ruleset |
| #9 | Decisions requiring code changes | P1 | Meta-issue; partially addressed by this PR |
| #11 | Test Maintainer coding and write tools | P2 | Testing task |
| #5 | Clean up stale test branches | P3 | Requires branch deletion access |
| #2 | Test: Verify AI Governance Agent Response | P3 | May be closeable |

---

## Decision Log Summary

| ID | Decision | Date | Status |
|----|----------|------|--------|
| 0001 | Adopt AI Governance Framework (Maintainer pattern) | 2025-01-28 | Adopted |

---

## Architecture Notes

The project follows the **Maintainer pattern** from CONSTITUTION.md:

- **Maintainer**: Unified governance authority — reviews PRs, logs decisions, handles challenges
- **Reception**: Public interface — triages issues, responds to inquiries, escalates to Maintainer
- **Engineer**: Implementation — develops features, fixes bugs, evaluates quality, drives self-improvement

All agents operate through the orchestration application (`src/`), which:
1. Receives events via GitHub webhooks (`src/api/`)
2. Routes them based on trust + intent (`src/orchestration/router.ts`)
3. Builds context (philosophy + constitution + role instructions + wiki + decisions)
4. Invokes Claude with appropriate tools via MCP servers (`src/mcp/`)
5. Records decisions, audit trails, and observability data

Human oversight is minimal by default. Escalation triggers are defined in
`.governance/project.yaml`.

---

## How to Update This Roadmap

This roadmap should be updated when:
- New issues are created or closed
- New decisions are logged
- Priorities shift based on experience
- Features are completed

The Engineer agent checks this roadmap during scheduled maintenance to select
the highest-priority actionable task.
