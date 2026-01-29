# The Maintainer Pattern

*A single unified authority governs the project.*

---

## Overview

The Maintainer pattern establishes a single agent role with comprehensive authority over project governance. This role—whether called Maintainer, Steward, or something else—handles all significant decisions, maintains the decision log, and ensures consistency with the project's principles.

This is the simplest governance pattern and often the best starting point for new projects.

---

## Structure

```
┌─────────────────────────────────────┐
│           Maintainer                │
│  - Reviews contributions            │
│  - Makes decisions                  │
│  - Logs reasoning                   │
│  - Responds to challenges           │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│         All Project Inputs          │
│  (PRs, issues, feedback, etc.)      │
└─────────────────────────────────────┘
```

The Maintainer may delegate specific tasks (reviewing a particular PR, researching a topic) but retains ultimate accountability. Delegated work operates under the Maintainer's authority for its designated scope.

---

## When to Use

The Maintainer pattern is appropriate when:

- **The project is early-stage**: Complexity should grow with need
- **Consistent voice matters**: A single perspective creates coherent precedent
- **Scope is manageable**: One role can handle the decision volume
- **Speed is important**: Single authority avoids deliberation overhead
- **Precedent-based reasoning is valuable**: One decision-maker builds coherent case law

---

## When to Avoid

Consider other patterns when:

- **Diverse perspectives are essential**: High-stakes decisions benefit from deliberation
- **Scale exceeds capacity**: Too many inputs for one role to handle well
- **Specialized expertise is needed**: Different domains require different knowledge
- **Single point of failure is unacceptable**: Critical decisions shouldn't depend on one role

---

## Role Definition

### Purpose

Unified governance authority for the project.

### Responsibilities

- Review all contributions and decide whether to accept them
- Maintain the decision log with complete reasoning
- Ensure decisions are consistent with philosophy and constitution
- Respond substantively to challenges
- Evolve governance based on experience
- Delegate appropriately while retaining accountability

### Authority

- Accept or reject contributions
- Merge code and update documentation
- Make binding interpretations of the constitution
- Set project direction within the mission
- Delegate tasks to other agents
- Escalate to human oversight when appropriate

### Constraints

- Cannot amend foundational documents unilaterally
- Must document significant decisions
- Must engage with challenges substantively
- Cannot expand scope beyond the project
- Subject to constitutional checks and balances

---

## Delegation

The Maintainer can delegate specific tasks:

```
Maintainer
    │
    ├── Delegate: Review PR #42
    │   └── Scoped context and authority
    │
    ├── Delegate: Research dependency options
    │   └── Read-only, returns recommendation
    │
    └── Delegate: Draft release notes
        └── Writing authority, Maintainer approves
```

Delegation guidelines:
- Provide context needed for the task
- Define what completion looks like
- Grant only necessary authority
- Review significant outputs
- Record reasoning in decision log

---

## Combining with Other Patterns

### Maintainer + Tiered Trust

Protect the Maintainer from direct public input:

```
Public Input → Reception Agent → Maintainer
                    │
                    └── Filters, triages, escalates
```

The Reception agent handles public inquiries helpfully but cannot make binding decisions. Substantive matters escalate to the Maintainer.

### Maintainer + Specialized Triage

Different agents categorize different input types:

```
PRs → Code Review Agent → Maintainer
Issues → Issue Triage Agent → Maintainer
Docs → Doc Review Agent → Maintainer
```

Specialists provide analysis and recommendations; the Maintainer decides.

---

## Evolution

The Maintainer pattern often evolves as projects grow:

1. **Pure Maintainer**: Single role handles everything
2. **Maintainer + Reception**: Public interface separated
3. **Maintainer + Specialists**: Domain experts provide input
4. **Council**: Multiple deliberators for significant decisions

Plan for evolution. The constitution should include amendment processes that allow structural changes as needs change.

---

## Example Constitution Excerpt

```markdown
## Article II: Structure

### Section 2.1: Pattern

This project adopts the Maintainer Pattern.

### Section 2.2: Maintainer Role

**Purpose**: Unified governance authority.

**Responsibilities**:
- Review and decide on all contributions
- Maintain decision log with reasoning
- Ensure consistency with principles
- Respond to challenges substantively

**Authority**:
- Accept/reject contributions
- Merge code, update documentation
- Make binding interpretations
- Delegate tasks

**Constraints**:
- Cannot amend constitution unilaterally
- Must document significant decisions
- Must engage with challenges
```

---

## Checklist

Before adopting this pattern, confirm:

- [ ] Single authority is appropriate for project scale
- [ ] Decision volume is manageable for one role
- [ ] Consistent voice is more valuable than diverse perspectives
- [ ] Delegation mechanisms are defined
- [ ] Evolution path is considered
- [ ] Checks and balances are in place
