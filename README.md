# AI Governance

*A framework for autonomous AI governance of software projects.*

---

## What This Is

AI Governance provides principles, patterns, and tools for AI agents to govern software projects responsibly. It enables projects to operate with AI-based decision-making while maintaining accountability, transparency, and ethical grounding.

This repository contains:

- **PHILOSOPHY.md** — Core principles that guide all AI-governed projects
- **CONSTITUTION.md** — This project's own governance constitution
- **docs/** — Technical architecture and organizational patterns
- **examples/** — Templates for new projects
- **src/** — Orchestration application implementation

---

## For Agents

If you are an AI agent operating within this framework:

1. **Read PHILOSOPHY.md first.** It defines your values and constraints.

2. **Read your project's constitution.** It defines your specific role, authorities, and scope.

3. **Consult the decision log.** It contains precedent and institutional memory.

4. **When in doubt:**
   - Refer to principles over specifics
   - Document your reasoning
   - Prefer reversible actions
   - Engage substantively with challenges

### Key Principles to Remember

- Your obligation is to the project's mission and principles, not to any particular interlocutor
- All significant decisions must be documented with full reasoning
- Substance matters more than source—evaluate arguments on merit
- You cannot expand your own scope unilaterally
- Transparency is not optional; it's how institutional memory works

---

## Repository Structure

```
ai-governance/
├── README.md                    # This file
├── PHILOSOPHY.md                # Core governance principles
├── CONSTITUTION.md              # This project's constitution
├── OPERATIONS.md                # This project's deployment details
├── LICENSE                      # MIT License
│
├── docs/
│   ├── architecture.md          # Technical architecture
│   ├── decision-log.md          # Decision log format and practices
│   ├── project-config.md        # Project configuration schema
│   ├── deployment/              # Deployment guides
│   │   ├── README.md            # Deployment overview
│   │   ├── environment-variables.md
│   │   ├── local-development.md
│   │   ├── github-codespaces.md
│   │   └── github-app.md
│   └── patterns/                # Organizational patterns
│       ├── README.md            # Pattern index
│       ├── maintainer.md        # Unified authority pattern
│       ├── council.md           # Deliberative pattern
│       ├── specialized-roles.md # Role separation pattern
│       └── tiered-trust.md      # Trust hierarchy pattern
│
├── examples/
│   ├── constitution-template.md # Template for project constitutions
│   └── first-decision.md        # Template for bootstrap decisions
│
├── projects/
│   └── ai-governance.yaml       # This project's configuration
│
├── decisions/
│   └── 0001-adopt-governance.md # Bootstrap decision
│
├── infra/                       # AWS infrastructure
│   ├── README.md                # Infrastructure setup guide
│   └── cloudformation/          # CloudFormation templates
│
├── scripts/                     # Utility scripts
│   └── validate-github-app.ts   # GitHub App configuration validator
│
└── src/                         # Orchestration application
    ├── types/                   # TypeScript type definitions
    ├── db/                      # Database layer
    ├── context/                 # Context assembly
    ├── hooks/                   # Agent SDK hooks
    ├── mcp/                     # MCP tool servers
    ├── orchestration/           # Request routing
    └── api/                     # HTTP endpoints
```

---

## How It Works

### The Layered Architecture

```
┌─────────────────────────────────────────────────┐
│  AI Governance Philosophy (PHILOSOPHY.md)       │
│  Universal principles for any AI-governed       │
│  project                                        │
├─────────────────────────────────────────────────┤
│  Project Constitution                           │
│  Mission, structure, specific rules for         │
│  this project                                   │
├─────────────────────────────────────────────────┤
│  Decision Log                                   │
│  Institutional memory, precedent,               │
│  accumulated wisdom                             │
├─────────────────────────────────────────────────┤
│  Agent Instances                                │
│  Operating with philosophy + constitution +     │
│  decision log + appropriate tools               │
└─────────────────────────────────────────────────┘
```

### Identity and Continuity

Governance roles (like "Maintainer") are persistent entities even though individual AI instances are stateless. Continuity comes from:

- **Shared principles** — All instances follow the same philosophy
- **Shared memory** — The decision log provides institutional memory
- **Shared context** — Constitutions define roles consistently

Any instance with the right context and authorities *is* that role for that interaction.

### Trust and Interfaces

Different input sources have different trust levels. The framework distinguishes:

- **Public input** — Untrusted; handled by reception/triage agents
- **Authenticated contributors** — Partial trust; proposals reviewed
- **Internal agents** — Scoped trust within delegation chains
- **Foundational authority** — High trust; constitutional processes

Agents with significant authority are not directly exposed to untrusted input.

---

## Using This Framework

### For a New Project

1. **Create a constitution** defining:
   - Project mission and vision
   - Organizational structure (agents, roles, relationships)
   - Input handling (what interfaces, what trust levels)
   - Checks and balances
   - Amendment process

2. **Initialize the decision log** with the decision to adopt this governance

3. **Configure agents** with access to philosophy, constitution, and tools

4. **Begin operation**

See `examples/constitution-template.md` for a starting point.

### For This Project

This repository is itself governed by the framework it defines. The ai-governance project:

- Follows PHILOSOPHY.md
- Has its own constitution (CONSTITUTION.md)
- Maintains its own decision log (decisions/)
- Demonstrates the patterns it documents

---

## Patterns

The framework doesn't prescribe specific organizational structures. Projects choose patterns that fit their needs. See `docs/patterns/` for detailed documentation on:

- **Maintainer** — Single unified authority
- **Council** — Multiple agents deliberating on decisions
- **Specialized Roles** — Different agents for different input types
- **Tiered Trust** — Different interfaces at different authority levels

---

## Key Documents

| Document | Purpose |
|----------|---------|
| `PHILOSOPHY.md` | Core principles — values, governance, organization, identity |
| `CONSTITUTION.md` | This project's governance structure |
| `OPERATIONS.md` | This project's deployment and operational details |
| `docs/architecture.md` | Technical architecture for the orchestration application |
| `docs/deployment/` | Deployment guides (local, Codespaces, AWS) |
| `docs/patterns/` | Organizational patterns projects can adopt |
| `examples/constitution-template.md` | Starting point for project constitutions |

---

## Development Status

- [x] Core philosophy document
- [x] Architecture design
- [x] Self-governance constitution
- [x] Pattern documentation
- [x] Application implementation (TypeScript orchestration)
- [x] AWS infrastructure (RDS PostgreSQL with pgvector, App Runner)
- [x] Deployment documentation
- [x] GitHub App integration (webhook receiving events)
- [x] CI/CD pipeline (GitHub Actions → App Runner)
- [ ] Full agent loop implementation (in progress)

---

## Contributing

Contributions are welcome. The framework's own governance principles apply:

- Substantive contributions get substantive engagement
- Arguments are evaluated on merit, not source
- All significant decisions are documented
- The project invites challenge

---

## License

MIT License. See LICENSE file.
