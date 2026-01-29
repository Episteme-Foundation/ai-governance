import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { github } from './auth';

/**
 * MCP Server for GitHub operations
 *
 * Provides tools for interacting with GitHub via the GitHub App
 */
export class GitHubServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'github',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'github_get_pr',
          description: 'Get pull request details including title, description, author, and status',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              pr_number: { type: 'number', description: 'Pull request number' },
            },
            required: ['owner', 'repo', 'pr_number'],
          },
        },
        {
          name: 'github_get_issue',
          description: 'Get issue details including title, description, author, and labels',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              issue_number: { type: 'number', description: 'Issue number' },
            },
            required: ['owner', 'repo', 'issue_number'],
          },
        },
        {
          name: 'github_list_files',
          description: 'List files changed in a pull request with their status and patch',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              pr_number: { type: 'number', description: 'Pull request number' },
            },
            required: ['owner', 'repo', 'pr_number'],
          },
        },
        {
          name: 'github_comment',
          description: 'Post a comment on a pull request or issue',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              issue_number: { type: 'number', description: 'Issue or PR number' },
              body: { type: 'string', description: 'Comment body (markdown supported)' },
            },
            required: ['owner', 'repo', 'issue_number', 'body'],
          },
        },
        {
          name: 'github_request_changes',
          description: 'Request changes on a pull request with review comments',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              pr_number: { type: 'number', description: 'Pull request number' },
              body: { type: 'string', description: 'Review body explaining requested changes' },
            },
            required: ['owner', 'repo', 'pr_number', 'body'],
          },
        },
        {
          name: 'github_approve',
          description: 'Approve a pull request (requires authorized trust level)',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              pr_number: { type: 'number', description: 'Pull request number' },
              body: { type: 'string', description: 'Optional approval comment' },
            },
            required: ['owner', 'repo', 'pr_number'],
          },
        },
        {
          name: 'github_merge',
          description: 'Merge a pull request (requires authorized trust level)',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              pr_number: { type: 'number', description: 'Pull request number' },
              commit_title: { type: 'string', description: 'Optional merge commit title' },
              commit_message: { type: 'string', description: 'Optional merge commit message' },
              merge_method: {
                type: 'string',
                enum: ['merge', 'squash', 'rebase'],
                description: 'Merge method (default: squash)',
              },
            },
            required: ['owner', 'repo', 'pr_number'],
          },
        },
        {
          name: 'github_close',
          description: 'Close an issue or pull request (requires authorized trust level)',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              issue_number: { type: 'number', description: 'Issue or PR number' },
            },
            required: ['owner', 'repo', 'issue_number'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.handleToolCall(name, args as Record<string, unknown>);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                message: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleToolCall(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    switch (name) {
      case 'github_get_pr': {
        const { owner, repo, pr_number } = args as {
          owner: string;
          repo: string;
          pr_number: number;
        };
        const pr = await github.getPullRequest(owner, repo, pr_number);
        return {
          number: pr.number,
          title: pr.title,
          body: pr.body,
          state: pr.state,
          draft: pr.draft,
          mergeable: pr.mergeable,
          mergeable_state: pr.mergeable_state,
          user: {
            login: pr.user?.login,
          },
          head: {
            ref: pr.head?.ref,
            sha: pr.head?.sha,
          },
          base: {
            ref: pr.base?.ref,
          },
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          additions: pr.additions,
          deletions: pr.deletions,
          changed_files: pr.changed_files,
          labels: pr.labels?.map((l: { name: string }) => l.name),
        };
      }

      case 'github_get_issue': {
        const { owner, repo, issue_number } = args as {
          owner: string;
          repo: string;
          issue_number: number;
        };
        const issue = await github.getIssue(owner, repo, issue_number);
        return {
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          user: {
            login: issue.user?.login,
          },
          labels: issue.labels?.map((l: { name: string }) => l.name),
          assignees: issue.assignees?.map((a: { login: string }) => a.login),
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          comments: issue.comments,
        };
      }

      case 'github_list_files': {
        const { owner, repo, pr_number } = args as {
          owner: string;
          repo: string;
          pr_number: number;
        };
        const files = await github.listPRFiles(owner, repo, pr_number);
        return {
          files: files.map((f: {
            filename: string;
            status: string;
            additions: number;
            deletions: number;
            changes: number;
            patch?: string;
          }) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
            patch: f.patch, // Diff content
          })),
          total_files: files.length,
        };
      }

      case 'github_comment': {
        const { owner, repo, issue_number, body } = args as {
          owner: string;
          repo: string;
          issue_number: number;
          body: string;
        };
        const comment = await github.createComment(owner, repo, issue_number, body);
        return {
          id: comment.id,
          html_url: comment.html_url,
          created_at: comment.created_at,
        };
      }

      case 'github_request_changes': {
        const { owner, repo, pr_number, body } = args as {
          owner: string;
          repo: string;
          pr_number: number;
          body: string;
        };
        const review = await github.createReview(owner, repo, pr_number, 'REQUEST_CHANGES', body);
        return {
          id: review.id,
          state: review.state,
          html_url: review.html_url,
          submitted_at: review.submitted_at,
        };
      }

      case 'github_approve': {
        const { owner, repo, pr_number, body } = args as {
          owner: string;
          repo: string;
          pr_number: number;
          body?: string;
        };
        const review = await github.createReview(owner, repo, pr_number, 'APPROVE', body);
        return {
          id: review.id,
          state: review.state,
          html_url: review.html_url,
          submitted_at: review.submitted_at,
        };
      }

      case 'github_merge': {
        const { owner, repo, pr_number, commit_title, commit_message, merge_method } = args as {
          owner: string;
          repo: string;
          pr_number: number;
          commit_title?: string;
          commit_message?: string;
          merge_method?: 'merge' | 'squash' | 'rebase';
        };
        const result = await github.mergePullRequest(owner, repo, pr_number, {
          commitTitle: commit_title,
          commitMessage: commit_message,
          mergeMethod: merge_method,
        });
        return {
          merged: result.merged,
          sha: result.sha,
          message: result.message,
        };
      }

      case 'github_close': {
        const { owner, repo, issue_number } = args as {
          owner: string;
          repo: string;
          issue_number: number;
        };
        const result = await github.close(owner, repo, issue_number);
        return {
          number: result.number,
          state: result.state,
          closed_at: result.closed_at,
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  getServer(): Server {
    return this.server;
  }

  /**
   * Get tool definitions for use in agent invocation
   * This allows the orchestration layer to pass tools to Claude
   */
  getToolDefinitions() {
    return [
      {
        name: 'github_get_pr',
        description: 'Get pull request details including title, description, author, and status',
        input_schema: {
          type: 'object' as const,
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            pr_number: { type: 'number', description: 'Pull request number' },
          },
          required: ['owner', 'repo', 'pr_number'],
        },
      },
      {
        name: 'github_get_issue',
        description: 'Get issue details including title, description, author, and labels',
        input_schema: {
          type: 'object' as const,
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            issue_number: { type: 'number', description: 'Issue number' },
          },
          required: ['owner', 'repo', 'issue_number'],
        },
      },
      {
        name: 'github_list_files',
        description: 'List files changed in a pull request with their status and patch',
        input_schema: {
          type: 'object' as const,
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            pr_number: { type: 'number', description: 'Pull request number' },
          },
          required: ['owner', 'repo', 'pr_number'],
        },
      },
      {
        name: 'github_comment',
        description: 'Post a comment on a pull request or issue',
        input_schema: {
          type: 'object' as const,
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            issue_number: { type: 'number', description: 'Issue or PR number' },
            body: { type: 'string', description: 'Comment body (markdown supported)' },
          },
          required: ['owner', 'repo', 'issue_number', 'body'],
        },
      },
      {
        name: 'github_request_changes',
        description: 'Request changes on a pull request with review comments',
        input_schema: {
          type: 'object' as const,
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            pr_number: { type: 'number', description: 'Pull request number' },
            body: { type: 'string', description: 'Review body explaining requested changes' },
          },
          required: ['owner', 'repo', 'pr_number', 'body'],
        },
      },
      {
        name: 'github_approve',
        description: 'Approve a pull request (requires authorized trust level)',
        input_schema: {
          type: 'object' as const,
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            pr_number: { type: 'number', description: 'Pull request number' },
            body: { type: 'string', description: 'Optional approval comment' },
          },
          required: ['owner', 'repo', 'pr_number'],
        },
      },
      {
        name: 'github_merge',
        description: 'Merge a pull request (requires authorized trust level)',
        input_schema: {
          type: 'object' as const,
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            pr_number: { type: 'number', description: 'Pull request number' },
            commit_title: { type: 'string', description: 'Optional merge commit title' },
            commit_message: { type: 'string', description: 'Optional merge commit message' },
            merge_method: {
              type: 'string',
              enum: ['merge', 'squash', 'rebase'],
              description: 'Merge method (default: squash)',
            },
          },
          required: ['owner', 'repo', 'pr_number'],
        },
      },
      {
        name: 'github_close',
        description: 'Close an issue or pull request (requires authorized trust level)',
        input_schema: {
          type: 'object' as const,
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            issue_number: { type: 'number', description: 'Issue or PR number' },
          },
          required: ['owner', 'repo', 'issue_number'],
        },
      },
    ];
  }

  /**
   * Execute a tool directly (for use by orchestration layer)
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.handleToolCall(name, args);
  }
}
