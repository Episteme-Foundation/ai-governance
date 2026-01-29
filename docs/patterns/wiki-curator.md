# The Wiki Curator Pattern

*Specialized role for maintaining wiki quality and organization.*

## Overview

The Wiki Curator pattern establishes a dedicated role responsible for maintaining the project wiki as a high-quality knowledge base. While all roles can propose wiki edits, the Curator ensures consistency, accuracy, and organization.

## Structure

```
Contributors → Propose Wiki Edits (drafts)
                      ↓
              Wiki Curator Reviews
                      ↓
         Approve or Reject with Feedback
                      ↓
            Approved → Published to Wiki
                      ↓
     Significant Changes → Decision Log
```

## When to Use

The Wiki Curator pattern is appropriate when:

- **Wiki is central to project knowledge** - Documentation quality matters
- **Multiple contributors edit wiki** - Need consistent voice and organization
- **Quality control is important** - Errors in wiki could mislead users
- **Wiki grows large** - Navigation and structure need active management

## When to Avoid

Consider simpler approaches when:

- **Small wiki** - Maintainer can handle directly
- **Few editors** - Not enough activity to justify dedicated role
- **Low stakes** - Wiki errors aren't critical

## Responsibilities

### Content Quality
- Review proposed edits for clarity, accuracy, and completeness
- Ensure consistent terminology and voice
- Check that information is up to date
- Fix typos and formatting issues

### Organization
- Maintain logical wiki structure
- Create and update navigation pages
- Add appropriate cross-links between pages
- Archive or remove outdated content

### Decision Logging
- Identify which changes are "significant"
- Trigger decision logging for major changes:
  - New pages
  - Major rewrites (>30% content change)
  - Structural reorganization
  - Content policy changes

## Authority

The Wiki Curator has `authorized` trust level and can:

- **Approve/reject wiki drafts** - Review and provide feedback
- **Restructure wiki** - Reorganize pages, create sections
- **Edit directly** - Through the approval process
- **Determine significance** - Decide what gets logged as decision

The Curator **cannot**:
- Override Maintainer on wiki direction
- Make constitutional decisions
- Bypass the approval process for their own edits

## Configuration Example

```yaml
roles:
  - name: wiki-curator
    purpose: Maintain wiki quality and organization
    accepts_trust:
      - authorized
    tools:
      allowed:
        - wiki_search
        - wiki_get_page
        - wiki_list_pages
        - wiki_get_history
        - wiki_review_drafts
        - wiki_approve_draft
        - wiki_reject_draft
        - wiki_restructure
        - log_decision
      denied: []
    significant_actions:
      - wiki_approve_draft  # When approving significant changes
      - wiki_restructure
    escalates_to: maintainer
    instructions: |
      You are the Wiki Curator for [project name].

      Your role is to maintain the project wiki as a high-quality,
      well-organized knowledge base.

      When reviewing wiki edits:
      - Check for clarity, accuracy, and completeness
      - Ensure consistent terminology and voice
      - Verify information is up to date
      - Provide constructive feedback if rejecting

      Determine which changes are significant and need decision logging:
      - New pages
      - Major rewrites (>30% content change)
      - Structural changes
      - Content policy changes

      For significant changes, use log_decision to document the change
      and your reasoning.

      You can restructure the wiki to improve navigation and
      organization, but coordinate with the Maintainer on major
      structural changes.
    constraints:
      - type: require_feedback
        on_actions:
          - wiki_reject_draft
        message: "Rejected drafts must include constructive feedback"
```

## Integration with Other Patterns

### Wiki Curator + Maintainer
Curator focuses on wiki, Maintainer on code/governance. Clean separation of concerns.

### Wiki Curator + Specialized Roles
Different specialists can propose wiki edits in their domains. Curator ensures coherence.

### Wiki Curator + Tiered Trust
Public contributors propose edits → Curator reviews → Maintainer can override if needed.

## Trade-offs

**Advantages**:
- High-quality, well-maintained wiki
- Consistent voice and organization
- Active curation prevents staleness
- Clear responsibility for documentation

**Disadvantages**:
- Additional role to configure
- Approval process adds latency
- Requires someone/something to fill the role
- Can bottleneck if Curator is overloaded

## Best Practices

1. **Fast turnaround** - Review drafts within 24-48 hours
2. **Constructive feedback** - Help contributors improve, don't just reject
3. **Proactive maintenance** - Don't just review, actively improve
4. **Clear standards** - Document what makes a good wiki edit
5. **Escalate when needed** - Involve Maintainer for direction questions
