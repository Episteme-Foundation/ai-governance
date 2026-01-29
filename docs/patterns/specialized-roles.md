# The Specialized Roles Pattern

*Different agents handle different types of input with clear handoffs.*

---

## Overview

The Specialized Roles pattern establishes multiple agent roles, each focused on a specific type of input or domain. Rather than one role handling everything or multiple roles deliberating together, specialized roles divide responsibilities by function, with defined handoff and escalation paths.

This pattern is valuable for scale, expertise, and separation of concerns.

---

## Structure

```
┌─────────────────────────────────────────────────────┐
│                  Specialized Roles                   │
│                                                      │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│  │  Code    │   │  Issue   │   │   Docs   │  ...   │
│  │ Reviewer │   │ Handler  │   │ Reviewer │        │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘        │
│       │              │              │               │
│       └──────────────┼──────────────┘               │
│                      │                              │
│                      ▼                              │
│              ┌──────────────┐                       │
│              │  Escalation  │                       │
│              │   Handler    │                       │
│              └──────────────┘                       │
└─────────────────────────────────────────────────────┘
```

Each role has clear scope, and matters outside that scope are handed off to appropriate roles.

---

## When to Use

The Specialized Roles pattern is appropriate when:

- **Volume is high**: Too much input for one role to handle well
- **Domains differ**: Different inputs require different expertise
- **Separation matters**: Clear boundaries reduce errors and conflicts
- **Parallelism helps**: Multiple roles can work simultaneously
- **Deep expertise is valuable**: Specialists develop better judgment in their domain

---

## When to Avoid

Consider other patterns when:

- **Volume is low**: Specialization overhead isn't justified
- **Domains overlap heavily**: Boundaries are unclear or artificial
- **Coherence matters most**: Unified voice is more important than depth
- **Coordination is expensive**: Handoffs introduce delay and friction

---

## Common Specializations

### By Input Type

| Role | Handles |
|------|---------|
| Code Reviewer | Pull requests, code changes |
| Issue Handler | Bug reports, feature requests |
| Documentation Reviewer | Doc changes, README updates |
| Security Reviewer | Security-related changes |
| Release Manager | Version releases, changelogs |

### By Domain

| Role | Domain |
|------|--------|
| Frontend Specialist | UI, UX, client code |
| Backend Specialist | APIs, services, infrastructure |
| Data Specialist | Database, analytics, ML |
| DevOps Specialist | CI/CD, deployment, monitoring |

### By Function

| Role | Function |
|------|----------|
| Triage | Initial classification and routing |
| Review | Detailed analysis and feedback |
| Approval | Final decision authority |
| Communication | External announcements, responses |

---

## Handoff Mechanisms

### Explicit Routing

Input is classified and routed to the appropriate role.

```
New PR → Router
           │
           ├── Code change → Code Reviewer
           ├── Doc change → Documentation Reviewer
           └── Mixed → Code Reviewer (primary) + Doc Reviewer (secondary)
```

### Escalation Chains

Roles escalate matters outside their scope or authority.

```
Issue Handler
    │
    ├── Routine bug → Handle directly
    ├── Security issue → Escalate to Security Reviewer
    └── Policy question → Escalate to Governance
```

### Collaboration Protocols

Multiple roles work together on complex inputs.

```
Large PR:
    1. Code Reviewer: Technical analysis
    2. Security Reviewer: Security scan
    3. Documentation Reviewer: Doc requirements
    4. Approval Authority: Final decision
```

---

## Role Definition Template

```markdown
### [Role Name]

**Specialization**: [What this role focuses on]

**Handles**:
- [Input type 1]
- [Input type 2]

**Does Not Handle**:
- [Out of scope 1] → [Handoff to]
- [Out of scope 2] → [Handoff to]

**Authority**:
- [What this role can decide]

**Escalates When**:
- [Condition 1]
- [Condition 2]

**Collaborates With**:
- [Role]: [On what]
```

---

## Coordination

### Shared Context

All roles share:
- Philosophy and constitution
- Decision log (for precedent)
- Project roadmap and priorities

### Communication Channels

Define how roles communicate:
- **Internal notes**: Async handoff documentation
- **Escalation tickets**: Formal escalation requests
- **Status updates**: Progress on shared work

### Conflict Resolution

When roles disagree:
1. Attempt resolution through discussion
2. Escalate to designated arbiter
3. Document resolution for precedent

---

## Combining with Other Patterns

### Specialized Roles + Tiered Trust

Different trust levels route to different specialists.

```
Anonymous input → Reception → Triage
Contributor input → Triage → Appropriate Specialist
Elevated input → Direct to relevant Specialist
```

### Specialized Roles + Maintainer

Specialists advise; Maintainer decides.

```
Code Reviewer → Recommendation → Maintainer → Decision
Issue Handler → Recommendation → Maintainer → Decision
```

### Specialized Roles + Council

Specialists handle routine matters; Council handles significant decisions.

```
Routine PR → Code Reviewer → Merge
Architectural change → Code Reviewer → Council → Decision
```

---

## Example Constitution Excerpt

```markdown
## Article II: Structure

### Section 2.1: Pattern

This project adopts the Specialized Roles Pattern.

### Section 2.2: Roles

**Code Reviewer**
- Handles: Pull requests with code changes
- Authority: Approve/request changes on code PRs
- Escalates: Architectural changes, security concerns

**Issue Handler**
- Handles: Bug reports, feature requests
- Authority: Label, prioritize, close stale issues
- Escalates: Policy questions, resource requests

**Documentation Reviewer**
- Handles: Documentation changes
- Authority: Approve/request changes on doc PRs
- Escalates: Technical accuracy disputes

**Governance**
- Handles: Escalations, policy decisions, precedent
- Authority: Make binding interpretations
- Escalates: Constitutional matters → Human oversight

### Section 2.3: Handoffs

When a matter spans multiple specializations:
1. Primary role is determined by dominant content
2. Secondary roles provide input
3. Primary role makes final recommendation
4. Governance resolves disputes
```

---

## Checklist

Before adopting this pattern, confirm:

- [ ] Input volume justifies specialization
- [ ] Domain boundaries are clear
- [ ] Handoff mechanisms are defined
- [ ] Escalation paths are clear
- [ ] Coordination overhead is acceptable
- [ ] Roles have sufficient scope to be meaningful
- [ ] Gaps between roles are covered
