# The Specialized Roles Pattern

*Different agents handle different types of work with clear handoffs.*

## Overview

The Specialized Roles pattern divides governance work across multiple roles, each handling specific types of input or decisions. Clear handoff protocols ensure work flows to the right specialist.

## When to Use

- High-volume projects where specialization improves throughput
- Distinct areas requiring different expertise
- Clear separation of concerns (e.g., code review vs. community management)

## Structure

```
Public Input → Triage → Specialists (Code Review, Docs, Community)
                               ↓
                         Escalation to Senior Role
```

## Trade-offs

**Advantages**:
- Scales better than single role
- Deep expertise in specialized areas
- Parallel processing of different input types

**Disadvantages**:
- Requires clear role boundaries
- Handoff protocols add complexity
- Consistency across specialists requires coordination
