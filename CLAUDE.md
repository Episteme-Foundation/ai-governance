# AI Governance Project - Claude Code Guidelines

This project is an AI governance framework that governs itself. As a framework
for AI governance, it must demonstrate the principles it advocates.

## Project Overview

**Purpose**: Develop principles, patterns, and tools that enable AI agents to
govern software projects responsibly.

**Structure**: TypeScript application with MCP servers for governance tools
(decision logging, challenges, wiki, observability via Langfuse).

## Core Philosophy (from PHILOSOPHY.md)

You are working on a project built on these principles:

- **Transparency**: Every significant decision is documented with reasoning
- **Honesty**: Only assert things believed to be true; acknowledge uncertainty
- **Engagement**: Substantively engage with concerns and challenges
- **Substance over source**: Evaluate arguments by content, not who makes them
- **Minimal authority**: Use the least authority necessary to accomplish tasks
- **Support oversight**: Support human oversight mechanisms, don't undermine them

## Development Commands

```bash
npm run build        # Compile TypeScript
npm run typecheck    # Type check without emitting
npm run test         # Run test suite
npm run lint         # Run linter
npm run dev          # Run in development mode
```

## Code Patterns

- Use ES modules (import/export), not CommonJS
- Follow existing patterns in the codebase
- TypeScript strict mode is enabled
- Database access through repositories in `src/db/repositories/`
- MCP servers in `src/mcp/` follow a consistent structure

## Verification Requirements

Before creating a PR, always verify:
1. `npm run typecheck` passes
2. `npm run test` passes
3. `npm run lint` passes (or fix any issues)

If tests don't exist for your changes, write them.

## Decision Logging

Significant decisions should be logged using the decision-log MCP tools. A
decision is "significant" if it affects project direction, sets precedent,
or involves trade-offs worth documenting.

When logging decisions, include:
- What was decided
- Why (the reasoning)
- What alternatives were considered
- What would change the decision

## Governance Constraints

**You cannot modify without elevated trust:**
- PHILOSOPHY.md (foundational principles)
- CONSTITUTION.md (governance structure)

**Significant actions require reasoning:**
- Merging PRs
- Responding to challenges
- Logging decisions

## MCP Servers Available

If configured, you may have access to governance tools:

- `search_decisions` / `get_decision` / `log_decision` - Decision log
- `submit_challenge` / `respond_to_challenge` - Challenge system
- `langfuse_*` tools - Query past sessions for patterns

Use these tools when appropriate for governance tasks.

## Self-Improvement Context

This project aims to improve itself autonomously. When working:

- Learn from past sessions (via Langfuse if available)
- Follow patterns that have worked well
- Avoid approaches that have failed before
- Document insights that could help future sessions

## What Makes Good Contributions

1. **Understand first** - Read relevant code before changing it
2. **Follow patterns** - Match existing code style and architecture
3. **Verify work** - Run tests, check types, ensure it builds
4. **Explain why** - PR descriptions should explain the reasoning

Quality over speed. A clean, well-tested implementation is better than a
rushed one that introduces bugs or technical debt.

## Key Files

- `PHILOSOPHY.md` - Foundational principles (read this for context)
- `CONSTITUTION.md` - Governance structure for this project
- `projects/ai-governance.yaml` - Role definitions and configuration
- `src/index.ts` - Application entry point
- `docs/architecture.md` - System architecture

## Getting Help

If uncertain about requirements, check:
1. Related issues and PRs
2. Past decisions in `decisions/`
3. PHILOSOPHY.md for principles
4. Ask for clarification rather than guessing
