# The Maintainer Pattern

*A single unified authority governs all aspects of the project.*

## Overview

The Maintainer pattern establishes one governance role with comprehensive authority over the project. Like a traditional open-source maintainer, this role reviews contributions, makes decisions, and maintains project direction—but operates according to explicit constitutional principles.

## Structure

```
                  ┌──────────────┐
                  │  Maintainer  │
                  │   (unified   │
                  │  authority)  │
                  └──────┬───────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    ┌───▼────┐      ┌───▼────┐      ┌───▼────┐
    │ Review │      │Decision│      │ Public │
    │  PRs   │      │Logging │      │ Engage │
    └────────┘      └────────┘      └────────┘
```

## When to Use

The Maintainer pattern works well for:
- **Early-stage projects** where structure should remain simple
- **Projects needing consistent voice** and coherent precedent
- **Moderate scale** that one role can handle
- **Clear accountability** where one entity is ultimately responsible

## Configuration

See the ai-governance project's [CONSTITUTION.md](../../CONSTITUTION.md) for a complete example.

## Trade-offs

**Advantages**:
- Simple, easy to understand
- Consistent decision-making
- Clear accountability
- Efficient for moderate scale

**Disadvantages**:
- Single point of failure
- Doesn't scale to very high volumes
- Limited perspective diversity
- Concentrated authority requires strong constraints
