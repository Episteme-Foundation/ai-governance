# Shared Truth: Wiki and Decision Log

## Overview

AI-governed projects need shared truth - information that all agents can reference and rely on. This framework provides two complementary systems:

1. **Decision Log** - Governance decisions and precedent
2. **Wiki** - Project knowledge and documentation

## Complementary Purposes

### Decision Log (Governance)

**Purpose**: Record governance decisions with full reasoning

**Contains**:
- Contribution approvals/rejections
- Policy interpretations
- Constitutional amendments
- Governance process changes
- Challenge resolutions

**Characteristics**:
- Immutable once recorded
- Always includes full reasoning
- Semantically searchable
- Establishes precedent
- Lives in `decisions/` directory

**When to use**: Whenever making a governance decision that should set precedent or requires accountability.

### Wiki (Knowledge)

**Purpose**: Document project knowledge and how things work

**Contains**:
- Architecture documentation
- How-to guides
- Contribution guidelines
- FAQ
- Design rationale
- Troubleshooting guides

**Characteristics**:
- Editable and evolving
- Can be reorganized
- Searchable by keyword
- Provides context and understanding
- Lives in GitHub Wiki

**When to use**: Whenever documenting what the project is, how it works, or how to use/contribute to it.

## How They Work Together

### Cross-References

Wiki pages can reference decisions:
```markdown
## Authentication

We use JWT tokens for API authentication. This decision was made in
[Decision 0042](../decisions/0042-adopt-jwt-auth.md) for reasons of
scalability and stateless operation.
```

Decisions can reference wiki pages:
```markdown
## Decision

Adopt the architecture described in the [Architecture Overview](wiki/Architecture-Overview)
wiki page.
```

### Wiki Changes as Decisions

Significant wiki changes are logged as decisions. This creates a record of:
- Why the change was made
- What alternatives were considered
- Who approved it
- What circumstances would warrant changing it

Example workflow:
1. Contributor proposes new wiki page on "Testing Strategy"
2. Wiki Curator reviews and approves
3. Because it's a new page (significant change), a decision is auto-logged:
   ```
   Decision 0123: Add Testing Strategy Wiki Page
   
   We added a Testing Strategy page to document our approach to testing.
   This page was needed because contributors were unclear about our
   testing expectations...
   ```

### Context Assembly

When an agent handles a governance request, its context includes:

1. PHILOSOPHY.md (universal principles)
2. Project constitution (project-specific rules)
3. **Wiki landing page** (project overview and navigation)
4. **Relevant past decisions** (via semantic search)
5. Role-specific instructions
6. Request details

Both wiki and decision log contribute to the agent's understanding.

## Design Principles

### 1. Right Tool for Right Job

Don't force everything into one system:
- Governance decisions → decision log
- Project knowledge → wiki
- Code documentation → inline comments
- API reference → generated docs
- Temporary notes → issues

### 2. Immutability vs Evolution

**Decision log is immutable**: Once recorded, decisions aren't edited (they can be superseded by new decisions, but the original remains).

**Wiki is editable**: Information evolves as the project changes. The wiki represents current understanding, not historical decisions.

### 3. Search and Discovery

**Decision log**: Semantic search finds similar past decisions based on meaning, not just keywords.

**Wiki**: Keyword search and navigation find information about topics.

Different search strategies for different needs.

### 4. Single Source of Truth

Each piece of information has one authoritative location:
- "What's our current architecture?" → Wiki
- "Why did we choose this architecture?" → Decision log
- "How do I implement X?" → Wiki + code docs
- "Why was PR #123 rejected?" → Decision log

## Anti-Patterns to Avoid

### 1. Decision Log as Wiki

Don't use decision log for general knowledge:
```
❌ Decision 0050: Document the Database Schema
   The database schema is [full schema documentation]...
```

Instead:
```
✓ Decision 0050: Adopt New Database Schema
   We're adopting the schema documented in wiki/Database-Schema because...
```

### 2. Wiki as Decision Record

Don't use wiki to record why decisions were made:
```
❌ Wiki page: "Why We Use PostgreSQL"
   On Jan 15, we decided to use PostgreSQL because...
```

Instead:
```
✓ Decision 0023: Adopt PostgreSQL
   [Full reasoning]

✓ Wiki page: "Database"
   We use PostgreSQL (see Decision 0023). Connection details...
```

### 3. Duplicate Information

Don't maintain the same information in both systems. Link instead:
```
✓ Wiki: "See Decision 0042 for authentication approach rationale"
✓ Decision: "Implementation details in wiki/Authentication"
```

## Migration and Evolution

As projects grow, the shared truth systems evolve:

### Early Stage
- Few decisions
- Small wiki
- Everything fits in agent context

### Growth
- Many decisions → semantic search becomes valuable
- Large wiki → landing page + search essential
- Context limits → need better summarization

### Maturity
- Rich precedent base in decision log
- Comprehensive wiki
- Clear patterns of similar decisions
- Well-organized knowledge base

At each stage, the systems scale differently but continue to complement each other.
