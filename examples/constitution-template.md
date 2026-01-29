# [Project Name] Constitution

*Governance structure for [project name].*

---

## Preamble

[Explain why this project needs governance and what this constitution establishes.]

This constitution is subordinate to PHILOSOPHY.md from the AI Governance framework. Where they conflict, PHILOSOPHY.md prevails.

---

## Article I: Mission

### Section 1.1: Purpose

The [project name] exists to:

1. [Primary purpose]
2. [Secondary purpose]
3. [Additional purposes]

### Section 1.2: Scope

This project governs:

- [What repositories/resources are governed]
- [What decisions fall within scope]
- [What is explicitly out of scope]

---

## Article II: Organizational Structure

### Section 2.1: Pattern

This project adopts the **[Pattern Name]**: [brief description of chosen pattern].

This pattern is appropriate because:
- [Reason 1]
- [Reason 2]
- [Reason 3]

### Section 2.2: Roles

#### [Role Name 1]

**Purpose**: [What this role is for]

**Responsibilities**:
- [Responsibility 1]
- [Responsibility 2]

**Authority**:
- [What this role can do]
- [What decisions it can make]

**Constraints**:
- [What this role cannot do]
- [Hard limits]

**Trust Level**: `[anonymous|contributor|authorized|elevated]`

#### [Role Name 2]

[Repeat structure for each role]

---

## Article III: Input Handling

### Section 3.1: Input Sources

| Source | Channel | Default Trust | Handled By |
|--------|---------|---------------|------------|
| [Source] | [Channel] | `[trust level]` | [Role] |

### Section 3.2: Trust Levels

- **anonymous**: [Capabilities]
- **contributor**: [Capabilities]
- **authorized**: [Capabilities]
- **elevated**: [Capabilities]

### Section 3.3: Escalation

[When and how escalation happens between roles and to human oversight]

---

## Article IV: Decision Making

### Section 4.1: Decision Logging

All significant decisions are recorded in `decisions/` with:

- **Decision ID**: Sequential identifier
- **Date**: When the decision was made
- **Decision**: What was decided
- **Reasoning**: Why this decision was reached
- **Considerations**: What factors were weighed
- **Uncertainties**: What remains unclear
- **Would change if**: What new information would change this decision

### Section 4.2: Precedent

[How past decisions establish precedent and when departing from precedent is appropriate]

### Section 4.3: Challenges

[How anyone can challenge a decision and what the response process looks like]

---

## Article V: Amendments

### Section 5.1: Constitutional Amendments

Amendments to this constitution require:

1. [Requirement 1]
2. [Requirement 2]
3. [Process steps]

### Section 5.2: Philosophy Amendments

[Note that PHILOSOPHY.md amendments require broader consideration since they affect all projects]

### Section 5.3: Operational Changes

[What changes can be made without full amendment process]

---

## Article VI: Oversight

### Section 6.1: Human Oversight

[Level of human oversight: minimal, active, or full]

[When escalation to humans occurs]

### Section 6.2: Transparency

[How decisions and reasoning are made visible]

### Section 6.3: Contact

Human oversight contact: [Contact information or reference to project configuration]

---

## Article VII: Bootstrap

This constitution was adopted [date] as documented in `decisions/0001-adopt-governance.md`.

---

## Appendix A: Initial Configuration

**Project**: [project-id]
**Repository**: [repository URL]
**Pattern**: [Pattern name]
**Oversight Level**: [Minimal|Active|Full]

**Roles Configured**:
- [Role 1]: [Brief description]
- [Role 2]: [Brief description]

**MCP Servers**:
- [List of configured MCP servers]
