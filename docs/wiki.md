# Wiki Practices

## Overview

The project wiki is a living knowledge base that documents how the project works, its architecture, guides, and FAQs. Unlike code comments or inline documentation, the wiki provides high-level understanding and context.

## Storage

Wikis are stored using **GitHub Wiki** (the built-in wiki feature for GitHub repositories). This provides:

- Git-based version control
- Markdown formatting
- Easy editing interface
- History tracking
- Integration with repository

## Edit Workflow

All wiki edits go through an approval process:

1. **Propose Edit**
   - Contributors use `wiki_propose_edit` (for existing pages) or `wiki_propose_page` (for new pages)
   - Include clear edit summary explaining the change
   - Draft stored in database, not yet published

2. **Review**
   - Wiki Curator reviews draft via `wiki_review_drafts`
   - Checks for clarity, accuracy, organization
   - Provides feedback if improvements needed

3. **Approve or Reject**
   - Curator approves → published to GitHub Wiki
   - Curator rejects → feedback provided to contributor
   - Contributor can revise and resubmit

4. **Decision Logging**
   - Significant changes automatically logged as decisions
   - Logged changes include: new pages, major rewrites (>30% content), restructuring

## What Goes in the Wiki

**Good wiki content:**
- Project overview and mission
- Architecture documentation
- How-to guides and tutorials
- Contribution guidelines
- FAQ
- Glossary of terms
- Design decisions (why, not just what)
- Troubleshooting guides

**Not for wiki:**
- API reference (better in code docs)
- Detailed code documentation (use inline comments)
- Temporary notes (use issues or project boards)
- Governance decisions (use decision log)

## Wiki Organization

### Landing Page
The wiki landing page (Home) should include:
- Brief project description
- Links to major sections
- Most important/frequently accessed pages

This landing page is included in every agent's system prompt for context.

### Page Hierarchy
Organize pages into logical sections:
```
Home (landing page)
├── Getting Started
├── Architecture
│   ├── Overview
│   ├── Database Schema
│   └── MCP Servers
├── Guides
│   ├── Contributing
│   ├── Setting Up Development
│   └── Writing Tests
└── Reference
    ├── Glossary
    └── FAQ
```

### Naming Conventions
- Use clear, descriptive page names
- Use hyphens for spaces: `Getting-Started`, not `GettingStarted` or `getting_started`
- Capitalize properly: `Database Schema`, not `database schema`

## Maintenance

The Wiki Curator is responsible for:

- **Currency**: Keep information up to date as the project evolves
- **Accuracy**: Correct errors and outdated information
- **Organization**: Maintain logical structure and navigation
- **Completeness**: Fill gaps in documentation
- **Cleanup**: Archive or remove obsolete content

## Integration with Decision Log

Wiki and decision log serve different purposes but work together:

- **Wiki** documents *what* and *how* (project knowledge)
- **Decision log** documents *why* (governance reasoning)

When a significant wiki change is made, it's logged as a decision in the decision log. This provides:
- Reasoning for the change
- Context for future reference
- Precedent for similar changes
- Accountability

Example: Adding a new "Security Guidelines" page to the wiki would be logged as a decision explaining why these guidelines were needed and what considerations went into them.

## Best Practices

1. **Write for your audience** - Assume readers are smart but unfamiliar
2. **Be concise** - Respect readers' time
3. **Use examples** - Show, don't just tell
4. **Link generously** - Connect related concepts
5. **Keep current** - Update when things change
6. **Version appropriately** - Document what version the info applies to
