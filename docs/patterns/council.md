# The Council Pattern

*Multiple agents deliberate on significant decisions.*

---

## Overview

The Council pattern establishes multiple agent roles that deliberate together on important decisions. Rather than concentrating authority in a single role, the Council distributes decision-making across several perspectives, requiring some form of consensus or voting to reach conclusions.

This pattern is valuable when decisions are high-stakes, complex, or benefit from diverse viewpoints.

---

## Structure

```
┌─────────────────────────────────────────────────────┐
│                    Council                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Member A│  │ Member B│  │ Member C│  ...       │
│  │(Perspective)│(Perspective)│(Perspective)│       │
│  └─────────┘  └─────────┘  └─────────┘            │
│                     │                              │
│              Deliberation                          │
│                     │                              │
│              ┌──────┴──────┐                       │
│              │  Decision   │                       │
│              └─────────────┘                       │
└─────────────────────────────────────────────────────┘
```

Council members may have identical roles (all equal deliberators) or differentiated roles (different perspectives or expertise).

---

## When to Use

The Council pattern is appropriate when:

- **Stakes are high**: Decisions have significant, hard-to-reverse consequences
- **Perspectives differ legitimately**: Reasonable agents might reach different conclusions
- **Accountability should be distributed**: No single role should bear all responsibility
- **Deliberation adds value**: Discussion improves decision quality
- **Precedent is contested**: Different interpretations of principles are valid

---

## When to Avoid

Consider other patterns when:

- **Speed matters**: Deliberation takes time
- **Decisions are routine**: Overhead isn't justified for low-stakes choices
- **Perspectives don't differ**: Deliberation among identical views adds no value
- **Scale is low**: Small projects don't need distributed authority
- **Voice consistency matters**: Council decisions may lack coherent narrative

---

## Deliberation Mechanisms

### Unanimous Consent

All members must agree. Good for foundational decisions. Risk of deadlock.

```
Proposal → All Members Agree? → Adopted
                    │
                    └── No → Discussion continues or escalates
```

### Majority Vote

More than half must agree. Balances inclusivity with decisiveness.

```
Proposal → >50% Agree? → Adopted
                │
                └── No → Rejected or revised
```

### Supermajority

Higher threshold (2/3, 3/4) for significant decisions.

```
Proposal → ≥2/3 Agree? → Adopted
                │
                └── No → Requires more support
```

### Consensus with Fallback

Seek consensus, but have a fallback if it fails.

```
Proposal → Consensus? → Adopted
               │
               └── No → Majority vote after discussion period
```

---

## Role Definitions

### Equal Deliberators

All members have equivalent authority and perspective.

```markdown
### Council Member

**Purpose**: Equal participant in collective deliberation.

**Responsibilities**:
- Review proposals brought to Council
- Contribute perspective to deliberation
- Vote on decisions
- Document reasoning for positions taken

**Authority** (individual):
- Voice opinion
- Request information
- Propose alternatives

**Authority** (collective):
- Make binding decisions per voting rules
- Interpret constitution
- Set project direction
```

### Differentiated Perspectives

Members represent different viewpoints or expertise.

```markdown
### Technical Member

**Perspective**: Technical feasibility, code quality, architecture.

### Community Member

**Perspective**: User needs, accessibility, documentation.

### Governance Member

**Perspective**: Process, precedent, constitutional consistency.
```

---

## Council Size

| Size | Characteristics |
|------|-----------------|
| 3 | Minimal deliberation; decisive but limited perspectives |
| 5 | Good balance; diverse yet manageable |
| 7+ | Broad perspectives; harder to coordinate |

Odd numbers avoid ties in majority voting.

---

## Combining with Other Patterns

### Council + Tiered Trust

Council handles elevated decisions; other roles handle routine matters.

```
Routine decisions → Maintainer/Triage
Significant decisions → Council
Constitutional decisions → Council + Human Oversight
```

### Council + Specialized Roles

Specialists prepare analysis; Council deliberates on recommendations.

```
Technical analysis → Technical Specialist → Council
Community input → Community Liaison → Council
```

---

## Decision Documentation

Council decisions should document:

1. **The proposal**: What was being decided
2. **Deliberation summary**: Key arguments made
3. **Individual positions**: How each member voted and why
4. **Outcome**: What was decided
5. **Dissent**: Any minority opinions (respected, not suppressed)

Example:

```markdown
## Decision: Adopt new contribution policy

**Proposal**: Require signed commits for all contributions.

**Deliberation**:
- Member A: Supports; improves auditability
- Member B: Supports with modification; exempt documentation-only PRs
- Member C: Opposes; barrier to casual contributors

**Vote**: 2-1 in favor (with Member B's modification)

**Outcome**: Signed commits required for code changes; documentation-only changes exempt.

**Dissent**: Member C notes concern about contributor friction; will monitor for impact.
```

---

## Challenges

### Deadlock

Council cannot reach required agreement.

**Mitigations**:
- Clear voting rules with fallbacks
- Time limits on deliberation
- Escalation to human oversight
- Chair with tie-breaking authority

### Slow Decisions

Deliberation delays action.

**Mitigations**:
- Reserved for significant decisions only
- Time-boxed deliberation periods
- Async deliberation for non-urgent matters
- Emergency procedures for urgent decisions

### Inconsistent Voice

Different decisions have different character.

**Mitigations**:
- Designated spokesperson for external communication
- Shared style guidelines
- One member drafts, others approve

---

## Example Constitution Excerpt

```markdown
## Article II: Structure

### Section 2.1: Pattern

This project adopts the Council Pattern.

### Section 2.2: Council Composition

The Council consists of three members:
- Technical Perspective
- Community Perspective
- Governance Perspective

### Section 2.3: Decision Rules

- Routine decisions: Majority vote
- Significant decisions: Unanimous consent sought, 2/3 supermajority fallback
- Constitutional decisions: Unanimous consent required

### Section 2.4: Deliberation

Deliberation is documented. Dissenting opinions are recorded and respected. Time limit of 48 hours for routine decisions, 1 week for significant decisions.
```

---

## Checklist

Before adopting this pattern, confirm:

- [ ] Decision stakes justify deliberation overhead
- [ ] Diverse perspectives add value
- [ ] Voting rules are clear and workable
- [ ] Deadlock resolution is defined
- [ ] Deliberation timeline is reasonable
- [ ] Documentation requirements are clear
- [ ] Council size is appropriate
