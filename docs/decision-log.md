# Decision Log Format and Practices

*How to document governance decisions for institutional memory.*

---

## Purpose

The decision log is institutional memory. Every significant decision is recorded with its full reasoning, creating a persistent record that enables:

- **Continuity**: Past decisions remain accessible across agent instances
- **Consistency**: Similar situations can be identified and treated similarly
- **Accountability**: Anyone can inspect how decisions were made
- **Learning**: Patterns of good and poor decisions become visible over time

For stateless AI systems, the decision log is the only way institutional memory can exist.

---

## What Counts as Significant

A decision is significant if it:

- Affects the project's direction
- Accepts or rejects a contribution
- Allocates resources
- Sets precedent for future decisions
- Changes how the project operates
- Would reasonably interest a future contributor

When in doubt, log it. Over-documentation is better than gaps.

---

## Decision Document Format

Each decision is a markdown file in `decisions/` following this format:

```markdown
# Decision NNNN: Short Title

**Date**: YYYY-MM-DD
**Status**: Proposed | Adopted | Superseded | Withdrawn
**Decision Maker**: [Role or identifier]
**Supersedes**: [Decision ID, if applicable]
**Superseded By**: [Decision ID, if applicable]

---

## Decision

[Clear statement of what was decided]

---

## Reasoning

[Why this decision was reached. This is the most important section.]

### Context

[What situation prompted this decision]

### Arguments For

[Why this decision is correct]

### Arguments Against

[What spoke against this decision, and why it was outweighed]

### Alternatives Considered

[Other options and why they were rejected]

---

## Considerations

[What factors were weighed]

- Factor 1: [How it influenced the decision]
- Factor 2: [How it influenced the decision]

---

## Uncertainties

[What remains unclear]

- [Uncertainty 1]
- [Uncertainty 2]

---

## Reversibility

[Whether and how this decision could be undone]

---

## Would Change If

[What new information would prompt reconsideration]

- [Condition 1]
- [Condition 2]

---

## Implementation

[How this decision will be carried out, if applicable]

---

## Related Decisions

- [Decision NNNN]: [Relationship]
- [Decision NNNN]: [Relationship]
```

---

## Naming Convention

Decision files are named: `NNNN-short-title.md`

- **NNNN**: Four-digit sequential number, zero-padded (0001, 0042, 0123)
- **short-title**: Lowercase, hyphenated summary (adopt-governance, reject-feature-x)

Examples:
- `0001-adopt-governance.md`
- `0015-require-signed-commits.md`
- `0042-reject-breaking-change.md`

---

## Status Lifecycle

```
Proposed → Adopted
    │         │
    │         └──→ Superseded (by new decision)
    │
    └──→ Withdrawn (not proceeding)
```

- **Proposed**: Under consideration, not yet final
- **Adopted**: Active decision, in effect
- **Superseded**: Replaced by a later decision (link to successor)
- **Withdrawn**: Considered but not adopted

Never delete decisions. Superseded decisions remain in the log for historical context.

---

## Logging Routine Decisions

Not every action needs a separate document. Routine decisions can be logged in aggregate:

```markdown
# Decision 0050: Contribution Reviews, October 2024

**Date**: 2024-10-31
**Status**: Adopted

## Decisions

### PR #142: Fix typo in README
- **Decision**: Merged
- **Reasoning**: Correct, improves documentation

### PR #143: Add new API endpoint
- **Decision**: Merged with modifications
- **Reasoning**: Valuable feature; requested minor naming changes for consistency

### Issue #89: Request for Windows support
- **Decision**: Acknowledged, added to roadmap
- **Reasoning**: Valid use case; insufficient resources currently

### PR #144: Rewrite core module
- **Decision**: Requested changes
- **Reasoning**: Scope too large; asked for incremental approach
```

---

## Challenges and Responses

When a decision is challenged, the exchange becomes part of the record:

```markdown
---

## Challenges

### Challenge by @contributor (2024-11-15)

**Argument**: [Summary of the challenge]

**Response**: [How the challenge was addressed]

**Outcome**: Decision stands | Decision modified | Decision reversed

**Reasoning**: [Why this outcome]
```

If a challenge leads to reversal, create a new decision that supersedes the original.

---

## Searching Decisions

The orchestration application supports semantic search over decisions. When making a new decision:

1. Search for similar past decisions
2. Consider whether precedent applies
3. If departing from precedent, explain why

Manual search: decisions are markdown files, searchable by content.

---

## Best Practices

### Be Complete

Include all relevant reasoning, even if it seems obvious. Future readers lack your context.

### Be Honest

Document genuine uncertainties. Acknowledge when the decision was difficult or could reasonably go another way.

### Be Specific

"This improves the project" is not reasoning. Explain *how* and *why*.

### Link Related Decisions

Connect decisions that inform each other. This builds a coherent body of precedent.

### Update Status

When a decision is superseded, update both the old decision (add superseded-by link) and the new decision (add supersedes link).

### Preserve History

Never edit the core reasoning of an adopted decision. Add amendments or create new decisions instead.

---

## Example: Full Decision Document

```markdown
# Decision 0015: Require Signed Commits

**Date**: 2024-09-15
**Status**: Adopted
**Decision Maker**: Maintainer

---

## Decision

All code contributions must use signed commits (GPG or SSH signatures). Documentation-only changes are exempt.

---

## Reasoning

### Context

Several PRs have had unclear authorship. One case involved a commit attributed to an inactive contributor, raising questions about authenticity.

### Arguments For

1. **Auditability**: Signed commits prove authorship
2. **Security**: Prevents unauthorized commits under others' identities
3. **Trust**: Contributors can verify the source of code they depend on

### Arguments Against

1. **Barrier to entry**: Not all contributors know how to sign commits
2. **Tooling friction**: Some Git clients don't support signing easily

### Alternatives Considered

- **No requirement**: Status quo; rejected due to auditability concerns
- **All commits signed**: Too burdensome for documentation-only changes
- **Verified email only**: Provides some assurance but is easier to spoof

---

## Considerations

- Security value outweighs onboarding friction for code changes
- Documentation changes are lower risk and often made by casual contributors
- We will provide documentation on setting up commit signing

---

## Uncertainties

- How many contributors will be blocked by this requirement?
- Will the documentation be sufficient?

---

## Reversibility

This can be reversed by adopting a new decision. Commits already in the repository would retain their signatures (or lack thereof).

---

## Would Change If

- Significant number of valid contributions are blocked
- Better authentication mechanism becomes available
- Community strongly opposes after trial period

---

## Implementation

1. Update CONTRIBUTING.md with signing instructions
2. Configure branch protection to require signed commits
3. Exempt documentation-only PRs via path-based rule
4. Announce change with 30-day notice period

---

## Related Decisions

- Decision 0008: Contribution guidelines establishes the broader contribution process
```
