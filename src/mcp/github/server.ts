import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Anthropic from '@anthropic-ai/sdk';
import { githubRequest, github } from './auth';

/**
 * Custom GitHub MCP Server
 *
 * Provides GitHub API tools using the existing GitHub App authentication
 * from auth.ts. This replaces the Docker-based @modelcontextprotocol/server-github
 * which requires uvx (Python) — not available in the node:20-alpine container.
 *
 * Follows the same pattern as DecisionLogServer and ChallengeServer:
 * - getToolDefinitions() for Claude API format
 * - executeTool() for direct invocation by MCPExecutor
 * - setupHandlers() for MCP protocol
 */
export class GitHubServer {
  private server: Server;
  private configured: boolean;

  constructor(
    private readonly owner: string,
    private readonly repo: string
  ) {
    this.configured = !!process.env.GITHUB_APP_ID;

    if (!this.configured) {
      console.warn('[GitHubServer] GITHUB_APP_ID not set — GitHub tools will return errors when called');
    }

    this.server = new Server(
      { name: 'github', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
  }

  private requireConfigured(): void {
    if (!this.configured) {
      throw new Error('GitHub App not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY environment variables.');
    }
  }

  // ─── Tool Handlers ───────────────────────────────────────────────

  private async handleGetIssue(args: Record<string, unknown>) {
    this.requireConfigured();
    const issueNumber = args.issue_number as number;
    const issue = await github.getIssue(this.owner, this.repo, issueNumber);

    // Also fetch comments if requested
    if (args.include_comments) {
      const resp = await githubRequest(this.owner, this.repo, `/issues/${issueNumber}/comments`);
      if (resp.ok) {
        const comments = await resp.json();
        return { ...issue, fetched_comments: comments };
      }
    }
    return issue;
  }

  private async handleListIssues(args: Record<string, unknown>) {
    this.requireConfigured();
    const params = new URLSearchParams();
    if (args.state) params.set('state', args.state as string);
    if (args.labels) params.set('labels', args.labels as string);
    if (args.per_page) params.set('per_page', String(args.per_page));
    if (args.sort) params.set('sort', args.sort as string);

    const resp = await githubRequest(this.owner, this.repo, `/issues?${params}`);
    if (!resp.ok) throw new Error(`Failed to list issues: ${resp.status}`);
    return resp.json();
  }

  private async handleSearchIssues(args: Record<string, unknown>) {
    this.requireConfigured();
    const query = args.query as string;
    const fullQuery = `repo:${this.owner}/${this.repo} ${query}`;
    const resp = await githubRequest(
      this.owner, this.repo,
      `https://api.github.com/search/issues?q=${encodeURIComponent(fullQuery)}&per_page=${args.per_page || 10}`
    );
    if (!resp.ok) throw new Error(`Search failed: ${resp.status}`);
    return resp.json();
  }

  private async handleGetPullRequest(args: Record<string, unknown>) {
    this.requireConfigured();
    return github.getPullRequest(this.owner, this.repo, args.pull_number as number);
  }

  private async handleListPullRequests(args: Record<string, unknown>) {
    this.requireConfigured();
    const params = new URLSearchParams();
    if (args.state) params.set('state', args.state as string);
    if (args.head) params.set('head', args.head as string);
    if (args.base) params.set('base', args.base as string);
    if (args.per_page) params.set('per_page', String(args.per_page));

    const resp = await githubRequest(this.owner, this.repo, `/pulls?${params}`);
    if (!resp.ok) throw new Error(`Failed to list PRs: ${resp.status}`);
    return resp.json();
  }

  private async handleListPRFiles(args: Record<string, unknown>) {
    this.requireConfigured();
    return github.listPRFiles(this.owner, this.repo, args.pull_number as number);
  }

  private async handleAddIssueComment(args: Record<string, unknown>) {
    this.requireConfigured();
    return github.createComment(
      this.owner, this.repo,
      args.issue_number as number,
      args.body as string
    );
  }

  private async handleCreateReview(args: Record<string, unknown>) {
    this.requireConfigured();
    return github.createReview(
      this.owner, this.repo,
      args.pull_number as number,
      args.event as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
      args.body as string | undefined
    );
  }

  private async handleMergePullRequest(args: Record<string, unknown>) {
    this.requireConfigured();
    return github.mergePullRequest(
      this.owner, this.repo,
      args.pull_number as number,
      {
        commitTitle: args.commit_title as string | undefined,
        commitMessage: args.commit_message as string | undefined,
        mergeMethod: args.merge_method as 'merge' | 'squash' | 'rebase' | undefined,
      }
    );
  }

  private async handleCloseIssue(args: Record<string, unknown>) {
    this.requireConfigured();
    return github.close(this.owner, this.repo, args.issue_number as number);
  }

  private async handleGetCollaboratorPermission(args: Record<string, unknown>) {
    this.requireConfigured();
    return github.getCollaboratorPermission(this.owner, this.repo, args.username as string);
  }

  private async handleGetFileContents(args: Record<string, unknown>) {
    this.requireConfigured();
    const path = args.path as string;
    const ref = args.ref as string | undefined;
    const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';

    const resp = await githubRequest(this.owner, this.repo, `/contents/${path}${params}`);
    if (!resp.ok) throw new Error(`Failed to get file: ${resp.status}`);
    const data = await resp.json() as Record<string, unknown>;

    // Decode base64 content if it's a file (not a directory)
    if (data.content && data.encoding === 'base64') {
      data.decoded_content = Buffer.from(data.content as string, 'base64').toString('utf8');
    }
    return data;
  }

  private async handleCreateOrUpdateFile(args: Record<string, unknown>) {
    this.requireConfigured();
    const path = args.path as string;
    const body: Record<string, unknown> = {
      message: args.message as string,
      content: Buffer.from(args.content as string).toString('base64'),
    };
    if (args.branch) body.branch = args.branch;
    if (args.sha) body.sha = args.sha; // Required for updates

    const resp = await githubRequest(this.owner, this.repo, `/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Failed to create/update file: ${resp.status} - ${error}`);
    }
    return resp.json();
  }

  private async handleCreateBranch(args: Record<string, unknown>) {
    this.requireConfigured();
    const branchName = args.branch as string;
    const fromRef = args.from_ref as string || 'main';

    // Get the SHA of the source ref
    const refResp = await githubRequest(
      this.owner, this.repo,
      `/git/ref/heads/${encodeURIComponent(fromRef)}`
    );
    if (!refResp.ok) throw new Error(`Failed to get ref ${fromRef}: ${refResp.status}`);
    const refData = await refResp.json() as { object: { sha: string } };

    // Create the new branch
    const resp = await githubRequest(this.owner, this.repo, '/git/refs', {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha,
      }),
    });
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Failed to create branch: ${resp.status} - ${error}`);
    }
    return resp.json();
  }

  private async handleListBranches(args: Record<string, unknown>) {
    this.requireConfigured();
    const params = new URLSearchParams();
    if (args.per_page) params.set('per_page', String(args.per_page));
    if (args.protected) params.set('protected', String(args.protected));

    const resp = await githubRequest(this.owner, this.repo, `/branches?${params}`);
    if (!resp.ok) throw new Error(`Failed to list branches: ${resp.status}`);
    return resp.json();
  }

  private async handleCreatePullRequest(args: Record<string, unknown>) {
    this.requireConfigured();
    const resp = await githubRequest(this.owner, this.repo, '/pulls', {
      method: 'POST',
      body: JSON.stringify({
        title: args.title,
        body: args.body,
        head: args.head,
        base: args.base || 'main',
        draft: args.draft || false,
      }),
    });
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Failed to create PR: ${resp.status} - ${error}`);
    }
    return resp.json();
  }

  private async handleAddLabels(args: Record<string, unknown>) {
    this.requireConfigured();
    const resp = await githubRequest(
      this.owner, this.repo,
      `/issues/${args.issue_number}/labels`,
      {
        method: 'POST',
        body: JSON.stringify({ labels: args.labels }),
      }
    );
    if (!resp.ok) throw new Error(`Failed to add labels: ${resp.status}`);
    return resp.json();
  }

  private async handleGetMe() {
    this.requireConfigured();
    const resp = await githubRequest(this.owner, this.repo, 'https://api.github.com/app');
    if (!resp.ok) throw new Error(`Failed to get app info: ${resp.status}`);
    return resp.json();
  }

  // ─── MCP Protocol Handlers ──────────────────────────────────────

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getMCPToolDefinitions(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        const result = await this.executeToolInternal(name, args as Record<string, unknown>);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
          isError: true,
        };
      }
    });
  }

  // ─── Tool Routing ───────────────────────────────────────────────

  private async executeToolInternal(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'issue_read':
      case 'get_issue':
        return this.handleGetIssue(args);
      case 'list_issues':
        return this.handleListIssues(args);
      case 'search_issues':
        return this.handleSearchIssues(args);
      case 'get_pull_request':
      case 'pull_request_read':
        return this.handleGetPullRequest(args);
      case 'list_pull_requests':
      case 'search_pull_requests':
        return this.handleListPullRequests(args);
      case 'list_pr_files':
        return this.handleListPRFiles(args);
      case 'add_issue_comment':
      case 'issue_write':
        return this.handleAddIssueComment(args);
      case 'pull_request_review_write':
      case 'create_review':
        return this.handleCreateReview(args);
      case 'merge_pull_request':
        return this.handleMergePullRequest(args);
      case 'close_issue':
        return this.handleCloseIssue(args);
      case 'get_collaborator_permission':
        return this.handleGetCollaboratorPermission(args);
      case 'get_file_contents':
        return this.handleGetFileContents(args);
      case 'create_or_update_file':
        return this.handleCreateOrUpdateFile(args);
      case 'create_branch':
        return this.handleCreateBranch(args);
      case 'list_branches':
        return this.handleListBranches(args);
      case 'create_pull_request':
        return this.handleCreatePullRequest(args);
      case 'add_labels':
        return this.handleAddLabels(args);
      case 'get_me':
        return this.handleGetMe();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────

  /**
   * Execute a tool directly (for MCPExecutor)
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.executeToolInternal(name, args);
  }

  /**
   * Get tool definitions in Claude API format (input_schema)
   */
  getToolDefinitions(): Anthropic.Tool[] {
    return [
      {
        name: 'get_issue',
        description: 'Get a GitHub issue by number, including labels, assignees, and state.',
        input_schema: {
          type: 'object' as const,
          properties: {
            issue_number: { type: 'number', description: 'Issue number' },
            include_comments: { type: 'boolean', description: 'Whether to include comments (default: false)' },
          },
          required: ['issue_number'],
        },
      },
      {
        name: 'issue_read',
        description: 'Read a GitHub issue with its comments. Alias for get_issue with include_comments=true.',
        input_schema: {
          type: 'object' as const,
          properties: {
            issue_number: { type: 'number', description: 'Issue number' },
            include_comments: { type: 'boolean', description: 'Include comments (default: true for issue_read)' },
          },
          required: ['issue_number'],
        },
      },
      {
        name: 'list_issues',
        description: 'List issues in the repository, optionally filtered by state and labels.',
        input_schema: {
          type: 'object' as const,
          properties: {
            state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Filter by state (default: open)' },
            labels: { type: 'string', description: 'Comma-separated list of label names to filter by' },
            per_page: { type: 'number', description: 'Results per page (max 100, default: 30)' },
            sort: { type: 'string', enum: ['created', 'updated', 'comments'], description: 'Sort field' },
          },
          required: [],
        },
      },
      {
        name: 'search_issues',
        description: 'Search for issues and pull requests using GitHub search syntax.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string', description: 'Search query (GitHub search syntax). The repo qualifier is added automatically.' },
            per_page: { type: 'number', description: 'Results per page (default: 10)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_pull_request',
        description: 'Get a pull request by number, including merge status, labels, and review state.',
        input_schema: {
          type: 'object' as const,
          properties: {
            pull_number: { type: 'number', description: 'Pull request number' },
          },
          required: ['pull_number'],
        },
      },
      {
        name: 'pull_request_read',
        description: 'Read a pull request. Alias for get_pull_request.',
        input_schema: {
          type: 'object' as const,
          properties: {
            pull_number: { type: 'number', description: 'Pull request number' },
          },
          required: ['pull_number'],
        },
      },
      {
        name: 'list_pull_requests',
        description: 'List pull requests in the repository.',
        input_schema: {
          type: 'object' as const,
          properties: {
            state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Filter by state' },
            head: { type: 'string', description: 'Filter by head branch (format: owner:ref)' },
            base: { type: 'string', description: 'Filter by base branch' },
            per_page: { type: 'number', description: 'Results per page' },
          },
          required: [],
        },
      },
      {
        name: 'search_pull_requests',
        description: 'Search pull requests. Alias for list_pull_requests with filters.',
        input_schema: {
          type: 'object' as const,
          properties: {
            state: { type: 'string', enum: ['open', 'closed', 'all'] },
            head: { type: 'string' },
            base: { type: 'string' },
            per_page: { type: 'number' },
          },
          required: [],
        },
      },
      {
        name: 'list_pr_files',
        description: 'List files changed in a pull request, including diffs.',
        input_schema: {
          type: 'object' as const,
          properties: {
            pull_number: { type: 'number', description: 'Pull request number' },
          },
          required: ['pull_number'],
        },
      },
      {
        name: 'add_issue_comment',
        description: 'Add a comment to an issue or pull request.',
        input_schema: {
          type: 'object' as const,
          properties: {
            issue_number: { type: 'number', description: 'Issue or PR number' },
            body: { type: 'string', description: 'Comment body (supports markdown)' },
          },
          required: ['issue_number', 'body'],
        },
      },
      {
        name: 'issue_write',
        description: 'Write a comment on an issue. Alias for add_issue_comment.',
        input_schema: {
          type: 'object' as const,
          properties: {
            issue_number: { type: 'number', description: 'Issue number' },
            body: { type: 'string', description: 'Comment body' },
          },
          required: ['issue_number', 'body'],
        },
      },
      {
        name: 'pull_request_review_write',
        description: 'Submit a review on a pull request (approve, request changes, or comment).',
        input_schema: {
          type: 'object' as const,
          properties: {
            pull_number: { type: 'number', description: 'Pull request number' },
            event: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'], description: 'Review action' },
            body: { type: 'string', description: 'Review body/comment' },
          },
          required: ['pull_number', 'event'],
        },
      },
      {
        name: 'merge_pull_request',
        description: 'Merge a pull request.',
        input_schema: {
          type: 'object' as const,
          properties: {
            pull_number: { type: 'number', description: 'Pull request number' },
            commit_title: { type: 'string', description: 'Title for the merge commit' },
            commit_message: { type: 'string', description: 'Message for the merge commit' },
            merge_method: { type: 'string', enum: ['merge', 'squash', 'rebase'], description: 'Merge method (default: squash)' },
          },
          required: ['pull_number'],
        },
      },
      {
        name: 'close_issue',
        description: 'Close an issue or pull request.',
        input_schema: {
          type: 'object' as const,
          properties: {
            issue_number: { type: 'number', description: 'Issue or PR number to close' },
          },
          required: ['issue_number'],
        },
      },
      {
        name: 'get_collaborator_permission',
        description: 'Get a user\'s permission level for this repository.',
        input_schema: {
          type: 'object' as const,
          properties: {
            username: { type: 'string', description: 'GitHub username to check' },
          },
          required: ['username'],
        },
      },
      {
        name: 'get_file_contents',
        description: 'Get the contents of a file from the repository. Returns the file content decoded from base64.',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: { type: 'string', description: 'Path to the file in the repository' },
            ref: { type: 'string', description: 'Branch, tag, or commit SHA (default: main branch)' },
          },
          required: ['path'],
        },
      },
      {
        name: 'create_or_update_file',
        description: 'Create or update a file in the repository via the GitHub Contents API. For updates, you must provide the current file SHA.',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: { type: 'string', description: 'Path to the file in the repository' },
            content: { type: 'string', description: 'File content (plain text — will be base64 encoded automatically)' },
            message: { type: 'string', description: 'Commit message' },
            branch: { type: 'string', description: 'Branch to commit to (default: repo default branch)' },
            sha: { type: 'string', description: 'SHA of the file being replaced (required for updates, not needed for new files)' },
          },
          required: ['path', 'content', 'message'],
        },
      },
      {
        name: 'create_branch',
        description: 'Create a new branch from an existing ref.',
        input_schema: {
          type: 'object' as const,
          properties: {
            branch: { type: 'string', description: 'Name of the new branch' },
            from_ref: { type: 'string', description: 'Source branch or SHA to create from (default: main)' },
          },
          required: ['branch'],
        },
      },
      {
        name: 'list_branches',
        description: 'List branches in the repository.',
        input_schema: {
          type: 'object' as const,
          properties: {
            per_page: { type: 'number', description: 'Results per page' },
            protected: { type: 'boolean', description: 'Only show protected branches' },
          },
          required: [],
        },
      },
      {
        name: 'create_pull_request',
        description: 'Create a new pull request.',
        input_schema: {
          type: 'object' as const,
          properties: {
            title: { type: 'string', description: 'PR title' },
            body: { type: 'string', description: 'PR description (supports markdown)' },
            head: { type: 'string', description: 'Branch containing changes' },
            base: { type: 'string', description: 'Branch to merge into (default: main)' },
            draft: { type: 'boolean', description: 'Create as draft PR (default: false)' },
          },
          required: ['title', 'head'],
        },
      },
      {
        name: 'add_labels',
        description: 'Add labels to an issue or pull request.',
        input_schema: {
          type: 'object' as const,
          properties: {
            issue_number: { type: 'number', description: 'Issue or PR number' },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Labels to add',
            },
          },
          required: ['issue_number', 'labels'],
        },
      },
      {
        name: 'get_me',
        description: 'Get information about the authenticated GitHub App.',
        input_schema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
    ];
  }

  /**
   * Get MCP-format tool definitions (inputSchema, not input_schema)
   */
  private getMCPToolDefinitions() {
    return this.getToolDefinitions().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.input_schema,
    }));
  }

  getServer(): Server {
    return this.server;
  }
}
