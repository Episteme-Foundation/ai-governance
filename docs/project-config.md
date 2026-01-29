# Project Configuration Schema

*How to configure a governed project.*

---

## Overview

Each governed project is configured via a YAML file that defines its identity, structure, and operational parameters. This file is read by the orchestration application to configure agent behavior.

---

## File Location

Project configurations live in `projects/` directory:

```
projects/
├── ai-governance.yaml    # This project's configuration
├── episteme.yaml         # Another governed project
└── example-project.yaml  # Another governed project
```

---

## Schema

```yaml
# Project identity
project:
  id: string              # Unique identifier
  name: string            # Human-readable name
  repository: string      # Repository URL
  constitution: string    # Path to constitution document

# Human oversight configuration
oversight:
  contacts:               # Who to notify for escalations
    - name: string
      email: string
      github: string
  escalation_threshold:   # When to auto-escalate to humans
    overturned_challenges: boolean  # Escalate when decisions reversed?
    constitutional_amendments: boolean  # Escalate for constitution changes?
    custom_rules: []      # Additional escalation triggers

# Rate limiting
limits:
  anonymous:
    requests_per_hour: number
  contributor:
    requests_per_hour: number
  authorized:
    requests_per_hour: number  # 0 for unlimited

# Role definitions
roles:
  - name: string          # Role identifier
    purpose: string       # What this role is for
    accepts_trust:        # Which trust levels this role handles
      - anonymous | contributor | authorized | elevated
    tools:
      allowed: []         # Permitted tool names
      denied: []          # Explicitly forbidden tools
    significant_actions: []  # Actions requiring decision logging
    escalates_to: string  # Higher-authority role (optional)
    instructions: string  # Role-specific prompt content
    constraints: []       # Hard limits enforced by hooks

# Trust classification
trust:
  github_roles:           # Map GitHub roles to trust levels
    public: anonymous
    collaborator: contributor
    maintainer: authorized
    admin: elevated
  api_keys:               # Named API keys and their trust levels
    - name: string
      trust: contributor | authorized | elevated

# MCP servers
mcp_servers:
  - name: string          # Server identifier
    type: string          # Server type (decision-log, challenge, github, custom)
    config: object        # Server-specific configuration
```

---

## Full Example

```yaml
project:
  id: ai-governance
  name: AI Governance Framework
  repository: https://github.com/example/ai-governance
  constitution: CONSTITUTION.md

oversight:
  contacts:
    - name: Project Steward
      email: steward@example.com
      github: steward-username
  escalation_threshold:
    overturned_challenges: true
    constitutional_amendments: true
    custom_rules:
      - condition: "decision affects more than 10 files"
        action: notify

limits:
  anonymous:
    requests_per_hour: 10
  contributor:
    requests_per_hour: 100
  authorized:
    requests_per_hour: 0  # unlimited

roles:
  - name: reception
    purpose: Handle public input safely and helpfully
    accepts_trust:
      - anonymous
    tools:
      allowed:
        - search_decisions
        - get_decision
        - github_get_issue
        - github_get_pr
      denied:
        - github_merge
        - github_approve
        - log_decision
    significant_actions: []
    escalates_to: maintainer
    instructions: |
      You are the Reception agent for the AI Governance project.

      Your role is to help visitors with questions about the project.
      You can provide information but cannot make binding decisions.

      For substantive matters, escalate to the Maintainer by creating
      an internal note with context and your analysis.
    constraints:
      - type: no_binding_decisions
        message: "Reception cannot make binding decisions"
      - type: no_official_statements
        message: "Reception cannot speak officially for the project"

  - name: maintainer
    purpose: Unified governance authority
    accepts_trust:
      - contributor
      - authorized
      - elevated
    tools:
      allowed:
        - search_decisions
        - get_decision
        - log_decision
        - submit_challenge
        - respond_to_challenge
        - github_get_issue
        - github_get_pr
        - github_comment
        - github_approve
        - github_merge
        - github_close
      denied: []
    significant_actions:
      - github_merge
      - github_close
      - log_decision
      - respond_to_challenge
    escalates_to: null  # Human oversight
    instructions: |
      You are the Maintainer of the AI Governance project.

      Your responsibilities:
      - Review and decide on contributions
      - Maintain the decision log with full reasoning
      - Ensure consistency with PHILOSOPHY.md and CONSTITUTION.md
      - Respond substantively to challenges

      Remember:
      - Document all significant decisions
      - Evaluate arguments on merit, not source
      - Support human oversight mechanisms
      - You cannot expand your own scope unilaterally
    constraints:
      - type: require_reasoning
        on_actions:
          - github_merge
          - github_close
        message: "Significant actions require documented reasoning"
      - type: no_self_promotion
        message: "Cannot expand own scope without constitutional process"

trust:
  github_roles:
    public: anonymous
    collaborator: contributor
    maintainer: authorized
    admin: elevated
  api_keys:
    - name: ci-bot
      trust: contributor
    - name: admin-key
      trust: elevated

mcp_servers:
  - name: decision-log
    type: decision-log
    config:
      database: postgresql://localhost/ai-governance
      embedding_provider: openai

  - name: github
    type: github
    config:
      app_id: 12345
      private_key_path: /secrets/github-app.pem
      webhook_secret_path: /secrets/webhook-secret

  - name: challenge
    type: challenge
    config:
      database: postgresql://localhost/ai-governance
```

---

## Role Definition Details

### accepts_trust

Which trust levels this role handles. The router directs requests to the appropriate role based on the request's trust level.

```yaml
accepts_trust:
  - anonymous      # Handles untrusted public input
  - contributor    # Handles authenticated contributors
```

### tools

Tools available to this role. The `denied` list takes precedence over `allowed`.

```yaml
tools:
  allowed:
    - search_decisions  # Can search past decisions
    - get_decision      # Can read specific decisions
  denied:
    - github_merge      # Cannot merge even if in allowed
```

### significant_actions

Actions that require decision logging. When the agent performs these actions, the PostToolUse hook verifies that reasoning was provided.

```yaml
significant_actions:
  - github_merge
  - github_close
  - respond_to_challenge
```

### constraints

Hard limits enforced by hooks. These cannot be overridden by the agent.

```yaml
constraints:
  - type: require_reasoning
    on_actions:
      - github_merge
    message: "Merge requires documented reasoning"

  - type: max_changes_per_session
    limit: 5
    message: "Cannot make more than 5 changes per session"

  - type: no_self_modification
    paths:
      - PHILOSOPHY.md
      - CONSTITUTION.md
    message: "Cannot modify foundational documents without elevated trust"
```

---

## Trust Classification

### GitHub Roles

Maps GitHub repository roles to trust levels:

```yaml
trust:
  github_roles:
    public: anonymous       # Not authenticated
    collaborator: contributor  # Has push access
    maintainer: authorized     # Has maintain access
    admin: elevated           # Has admin access
```

### API Keys

Named API keys for programmatic access:

```yaml
trust:
  api_keys:
    - name: ci-bot
      trust: contributor
    - name: monitoring
      trust: contributor
    - name: admin-cli
      trust: elevated
```

---

## MCP Server Configuration

### Decision Log Server

```yaml
- name: decision-log
  type: decision-log
  config:
    database: postgresql://host/db
    embedding_provider: openai  # or anthropic, local
    embedding_model: text-embedding-3-small
    similarity_threshold: 0.7
    max_results: 10
```

### GitHub Server

```yaml
- name: github
  type: github
  config:
    app_id: 12345
    private_key_path: /path/to/key.pem
    webhook_secret_path: /path/to/secret
    installation_id: 67890  # Optional, auto-detected
```

### Challenge Server

```yaml
- name: challenge
  type: challenge
  config:
    database: postgresql://host/db
    challenge_window_days: 30
    require_evidence: false
```

### Custom Server

```yaml
- name: custom-analytics
  type: custom
  config:
    command: node /path/to/server.js
    args:
      - --port=3001
    env:
      API_KEY: ${ANALYTICS_API_KEY}
```

---

## Environment Variables

Sensitive values can reference environment variables:

```yaml
mcp_servers:
  - name: github
    type: github
    config:
      private_key_path: ${GITHUB_APP_PRIVATE_KEY_PATH}
      webhook_secret: ${GITHUB_WEBHOOK_SECRET}
```

---

## Validation

The orchestration application validates configuration on startup:

1. Required fields are present
2. Role names are unique
3. Escalation chains don't have cycles
4. Trust levels are valid
5. Tool names reference known tools
6. Constraint types are valid

Invalid configuration prevents startup with clear error messages.
