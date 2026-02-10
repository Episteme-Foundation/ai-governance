# Tool Capability Test Results

*Documents which tools have been verified as working for each agent role.*

---

## Purpose

This document tracks the results of testing which MCP tools work correctly
for each governance agent role. It serves as a reference for debugging and
for understanding which capabilities are verified versus theoretical.

---

## Maintainer Role

### GitHub Read Tools

| Tool | Status | Notes |
|------|--------|-------|
| `get_file_contents` | ✅ Verified | Reads files from the repository |
| `issue_read` | ✅ Verified | Reads issues with comments |
| `list_issues` | ✅ Verified | Lists repository issues |
| `pull_request_read` | ✅ Verified | Reads PR details |
| `list_pull_requests` | ✅ Verified | Lists repository PRs |
| `search_issues` | ✅ Verified | Searches issues/PRs |
| `list_branches` | ✅ Verified | Lists repository branches |

### GitHub Write Tools

| Tool | Status | Notes |
|------|--------|-------|
| `add_issue_comment` | ✅ Verified | Adds comments to issues/PRs |
| `create_or_update_file` | ✅ Verified | Creates/updates files via Contents API |
| `create_branch` | ✅ Verified | Creates branches from refs |
| `create_pull_request` | ✅ Verified | Creates pull requests |
| `merge_pull_request` | ⚠️ Untested | Maintainer only |

### Governance Tools

| Tool | Status | Notes |
|------|--------|-------|
| `log_decision` | ✅ Verified | Logs decisions to database |
| `search_decisions` | ✅ Verified | Semantic search over decisions |
| `get_decision` | ✅ Verified | Retrieves specific decisions |

### Conversation Tools

| Tool | Status | Notes |
|------|--------|-------|
| `converse` | ✅ Verified | Synchronous agent-to-agent |
| `send` | ✅ Verified | Async notifications via GitHub issues |
| `end_conversation` | ✅ Verified | Resolves conversations |
| `list_conversations` | ✅ Verified | Lists active conversations |

### Observability Tools

| Tool | Status | Notes |
|------|--------|-------|
| `langfuse_query_traces` | ✅ Verified | Queries past sessions |
| `langfuse_add_score` | ✅ Verified | Scores sessions |

---

## Engineer Role

### GitHub Tools

| Tool | Status | Notes |
|------|--------|-------|
| `get_file_contents` | ✅ Verified | Reads repository files |
| `create_branch` | ✅ Verified | Creates feature branches |
| `create_or_update_file` | ✅ Verified | Commits files to branches |
| `create_pull_request` | ✅ Verified | Opens PRs for review |
| `add_issue_comment` | ✅ Verified | Comments on issues |
| `merge_pull_request` | ❌ Denied | Correctly blocked by role config |

### Development Tools

| Tool | Status | Notes |
|------|--------|-------|
| `developer_invoke` | ⚠️ Untested | Claude Code delegation |
| `developer_resume` | ⚠️ Untested | Session continuation |

---

## Reception Role

| Tool | Status | Notes |
|------|--------|-------|
| `get_file_contents` | ✅ Verified | Reads project info |
| `issue_read` | ✅ Verified | Reads issues for triage |
| `add_issue_comment` | ✅ Verified | Responds to issues |
| `search_decisions` | ✅ Verified | Looks up precedent |

---

## Test Methodology

Tools are verified through actual usage during governance operations.
A tool is marked as:

- **✅ Verified**: Successfully used in a real governance session
- **⚠️ Untested**: Available to the role but not yet exercised
- **❌ Denied**: Correctly blocked by role configuration
- **🐛 Broken**: Available but failing (with details)

This document should be updated as new tools are tested and new roles are added.
