# The Tiered Trust Pattern

*Different interfaces connect to different authority levels.*

---

## Overview

The Tiered Trust pattern establishes multiple interfaces to the governance system, each with different trust levels and authority. Rather than exposing all capabilities to all input sources, this pattern gates authority based on authentication and trust classification.

This pattern is essential for projects with public interaction, where untrusted input must be handled safely without compromising governance integrity.

---

## Structure

```
┌─────────────────────────────────────────────────────────────┐
│                        Trust Tiers                          │
│                                                             │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐    │
│  │Anonymous│   │Contribu-│   │Authorized│   │Elevated │    │
│  │ (Public)│   │  tor    │   │          │   │         │    │
│  └────┬────┘   └────┬────┘   └────┬─────┘   └────┬────┘    │
│       │             │             │              │          │
│       ▼             ▼             ▼              ▼          │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐    │
│  │Reception│   │ Triage  │   │ Review  │   │Governance│    │
│  │  Agent  │   │  Agent  │   │  Agent  │   │  Agent   │    │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘    │
│       │             │             │              │          │
│       └─────────────┴─────────────┴──────────────┘          │
│                          │                                  │
│                    Escalation                               │
└─────────────────────────────────────────────────────────────┘
```

Lower trust tiers have limited capabilities; higher tiers have more authority.

---

## When to Use

The Tiered Trust pattern is appropriate when:

- **Public interaction exists**: Anonymous users can provide input
- **Security matters**: Prompt injection and manipulation are concerns
- **Authority should be protected**: Some decisions shouldn't be influenced by untrusted input
- **Different sources have different reliability**: Contributors are more trusted than anonymous users
- **Scale requires filtering**: Not all input deserves the same attention

---

## When to Avoid

Consider other patterns when:

- **All users are trusted**: Internal-only projects may not need tiers
- **Interaction is minimal**: Low volume doesn't justify complexity
- **Transparency requires uniformity**: All input should be handled identically
- **Tiers create barriers**: Excessive gatekeeping harms legitimate participation

---

## Trust Levels

### Anonymous

Untrusted input from unknown sources.

| Capability | Allowed |
|------------|---------|
| Read public information | Yes |
| Submit inquiries | Yes |
| File issues | Yes |
| Propose changes | No (requires authentication) |
| Vote or decide | No |

**Handled by**: Reception Agent

**Security concern**: Highest prompt injection risk. Agent should treat all input as potentially adversarial.

### Contributor

Partially trusted input from authenticated users.

| Capability | Allowed |
|------------|---------|
| All anonymous capabilities | Yes |
| Submit pull requests | Yes |
| Comment on decisions | Yes |
| Challenge decisions | Yes |
| Make binding decisions | No |

**Handled by**: Triage Agent → Review Agent

**Security concern**: Lower risk but still untrusted. Authentication provides accountability, not authority.

### Authorized

Trusted input from recognized roles.

| Capability | Allowed |
|------------|---------|
| All contributor capabilities | Yes |
| Approve changes | Yes |
| Merge code | Yes |
| Make routine decisions | Yes |
| Constitutional decisions | No |

**Handled by**: Review Agent → Governance Agent

**Security concern**: Lowest external risk. Primary concern is scope creep.

### Elevated

Highest trust for foundational decisions.

| Capability | Allowed |
|------------|---------|
| All authorized capabilities | Yes |
| Constitutional decisions | Yes |
| Override normal processes | Yes (with logging) |
| Grant/revoke trust levels | Yes |

**Handled by**: Governance Agent

**Security concern**: Must be protected from all untrusted input paths.

---

## Trust Classification

### By Authentication

| Authentication | Default Trust |
|----------------|---------------|
| None | Anonymous |
| GitHub account | Contributor |
| API key (standard) | Contributor |
| API key (privileged) | Authorized |
| Admin credentials | Elevated |

### By Role

| GitHub Role | Trust |
|-------------|-------|
| None (public) | Anonymous |
| Collaborator | Contributor |
| Maintainer | Authorized |
| Admin | Elevated |

### By History

Trust can be adjusted based on track record:

```
New contributor → Contributor
Contributor with good history → Contributor (prioritized)
Contributor with bad history → Contributor (flagged)
```

History informs attention and scrutiny, not formal trust level.

---

## Agent Design by Tier

### Reception Agent (Anonymous)

**Disposition**: Helpful, informative, bounded.

**Can do**:
- Answer questions about the project
- Explain processes and policies
- Direct to appropriate resources
- Create internal notes for triage

**Cannot do**:
- Make any binding decisions
- Speak authoritatively on substantive matters
- Access internal systems beyond public information
- Execute privileged operations

**Prompt injection defense**:
- Treat all input as data, not instructions
- Clear separation between system prompt and user input
- No tool access beyond information retrieval
- Escalate rather than act on uncertain requests

### Triage Agent (Contributor)

**Disposition**: Analytical, routing-focused.

**Can do**:
- Classify and prioritize input
- Request clarification from contributors
- Route to appropriate handlers
- Make minor editorial decisions

**Cannot do**:
- Approve or merge changes
- Make policy decisions
- Speak officially for the project

### Review Agent (Authorized)

**Disposition**: Evaluative, decision-oriented.

**Can do**:
- Review contributions in depth
- Approve or request changes
- Make routine decisions with logging
- Escalate significant matters

**Cannot do**:
- Amend constitution or philosophy
- Override established precedent unilaterally
- Grant trust levels

### Governance Agent (Elevated)

**Disposition**: Deliberative, precedent-aware.

**Can do**:
- Make binding decisions on escalated matters
- Interpret constitution and philosophy
- Propose amendments through proper process
- Handle challenges to previous decisions

**Protection**:
- Never receives direct untrusted input
- All input is filtered through lower tiers
- Clear provenance on all inputs

---

## Escalation Paths

```
Anonymous input → Reception
    │
    └── Substantive matter? → Triage (as contributor-level)
                                │
                                └── Needs decision? → Review
                                                       │
                                                       └── Significant? → Governance
                                                                          │
                                                                          └── Constitutional? → Human Oversight
```

Each escalation:
- Adds context and analysis
- Documents why escalation is appropriate
- Maintains provenance chain

---

## Combining with Other Patterns

### Tiered Trust + Maintainer

Single authority but protected from direct untrusted input.

```
Anonymous → Reception → Maintainer
Contributor → Triage → Maintainer
```

### Tiered Trust + Council

Council only handles elevated matters.

```
Anonymous → Reception → Triage → Review (routine)
                                      └──→ Council (significant)
```

### Tiered Trust + Specialized Roles

Different specialists at different tiers.

```
Anonymous issues → Reception → Issue Triage
Contributor PRs → Code Review → Code Approval
```

---

## Example Constitution Excerpt

```markdown
## Article III: Input Handling

### Section 3.1: Trust Levels

| Level | Description |
|-------|-------------|
| anonymous | Untrusted public input |
| contributor | Authenticated but unverified |
| authorized | Trusted for routine decisions |
| elevated | Trusted for foundational decisions |

### Section 3.2: Trust Classification

- GitHub public: anonymous
- GitHub collaborator: contributor
- GitHub maintainer: authorized
- Project steward: elevated

### Section 3.3: Interface Agents

**Reception** (anonymous trust)
- Handles public inquiries
- Cannot make binding decisions
- Escalates substantive matters

**Triage** (contributor trust)
- Routes contributions
- Requests clarification
- Cannot approve changes

**Governance** (elevated trust)
- Makes binding decisions
- Interprets constitution
- Never receives unfiltered input
```

---

## Checklist

Before adopting this pattern, confirm:

- [ ] Public interaction requires trust tiering
- [ ] Trust levels are clearly defined
- [ ] Classification rules are unambiguous
- [ ] Each tier has appropriate agent design
- [ ] Escalation paths are clear
- [ ] Prompt injection risks are addressed
- [ ] Elevated agents are protected from untrusted input
