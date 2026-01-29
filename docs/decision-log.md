# Decision Log Format and Practices

## Overview

The decision log is institutional memory for AI-governed projects. Every significant decision is recorded with full reasoning, creating a searchable precedent base.

## Decision Format

Each decision is a markdown file in `decisions/` named `NNNN-short-title.md`:

```markdown
# Decision NNNN: [Title]

**Date**: YYYY-MM-DD
**Status**: [Adopted|Superseded|Reversed]
**Decision Maker**: [Role]

## Decision

[Clear statement of what was decided]

## Reasoning

[Why this decision was reached]

## Considerations

[What factors were weighed]

## Uncertainties

[What remains unclear]

## Reversibility

[Whether and how this could be undone]

## Would Change If

[What new information would change this decision]
```

## What Requires Logging

Significant decisions include:
- Accepting or rejecting contributions
- Policy interpretations
- Precedent-setting choices
- Resource allocations
- Structural changes

Routine actions don't require logging unless they set precedent.

## Semantic Search

Decisions are embedded for similarity search. When facing a new decision, agents search for relevant past decisions to maintain consistency.

## Challenges

Past decisions can be challenged. Challenges are documented and the response becomes part of the record.
