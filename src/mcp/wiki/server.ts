import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { WikiDraftRepository } from '../../db/repositories/wiki-draft-repository';
import { WikiLoader } from '../../context/loaders/wiki-loader';
import { ProjectConfig } from '../../types';

/**
 * MCP Server for Wiki operations
 *
 * Provides tools for:
 * - Searching wiki pages
 * - Getting wiki pages
 * - Proposing wiki edits (requires curator approval)
 * - Approving/rejecting wiki drafts (curator only)
 */
export class WikiServer {
  private server: Server;

  constructor(
    private readonly wikiDraftRepo: WikiDraftRepository,
    private readonly wikiLoader: typeof WikiLoader
  ) {
    this.server = new Server(
      {
        name: 'wiki',
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
          name: 'wiki_search',
          description: 'Search wiki pages for content',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID',
              },
              query: {
                type: 'string',
                description: 'Search query',
              },
            },
            required: ['project_id', 'query'],
          },
        },
        {
          name: 'wiki_get_page',
          description: 'Get a specific wiki page by path',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID',
              },
              page_path: {
                type: 'string',
                description: 'Path to wiki page',
              },
            },
            required: ['project_id', 'page_path'],
          },
        },
        {
          name: 'wiki_propose_edit',
          description:
            'Propose an edit to an existing wiki page. Requires curator approval before being published.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID',
              },
              page_path: {
                type: 'string',
                description: 'Path to page being edited',
              },
              proposed_content: {
                type: 'string',
                description: 'New content for the page',
              },
              edit_summary: {
                type: 'string',
                description: 'Summary of what changed and why',
              },
              proposed_by: {
                type: 'string',
                description: 'Who is proposing this edit',
              },
            },
            required: [
              'project_id',
              'page_path',
              'proposed_content',
              'edit_summary',
              'proposed_by',
            ],
          },
        },
        {
          name: 'wiki_propose_page',
          description:
            'Propose a new wiki page. Requires curator approval before being published.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID',
              },
              page_path: {
                type: 'string',
                description: 'Path for new page',
              },
              proposed_content: {
                type: 'string',
                description: 'Content for the new page',
              },
              edit_summary: {
                type: 'string',
                description: 'Why this page is being created',
              },
              proposed_by: {
                type: 'string',
                description: 'Who is proposing this page',
              },
            },
            required: [
              'project_id',
              'page_path',
              'proposed_content',
              'edit_summary',
              'proposed_by',
            ],
          },
        },
        {
          name: 'wiki_review_drafts',
          description:
            'List pending wiki draft edits awaiting curator review. (Curator only)',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID',
              },
            },
            required: ['project_id'],
          },
        },
        {
          name: 'wiki_approve_draft',
          description:
            'Approve a wiki draft and publish it to the wiki. (Curator only)',
          inputSchema: {
            type: 'object',
            properties: {
              draft_id: {
                type: 'string',
                description: 'Draft ID to approve',
              },
              reviewed_by: {
                type: 'string',
                description: 'Curator approving the draft',
              },
              feedback: {
                type: 'string',
                description: 'Optional feedback for the contributor',
              },
            },
            required: ['draft_id', 'reviewed_by'],
          },
        },
        {
          name: 'wiki_reject_draft',
          description:
            'Reject a wiki draft with feedback. (Curator only)',
          inputSchema: {
            type: 'object',
            properties: {
              draft_id: {
                type: 'string',
                description: 'Draft ID to reject',
              },
              reviewed_by: {
                type: 'string',
                description: 'Curator rejecting the draft',
              },
              feedback: {
                type: 'string',
                description: 'Feedback explaining why it was rejected',
              },
            },
            required: ['draft_id', 'reviewed_by', 'feedback'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'wiki_search':
          return this.handleWikiSearch(args);
        case 'wiki_get_page':
          return this.handleWikiGetPage(args);
        case 'wiki_propose_edit':
          return this.handleWikiProposeEdit(args);
        case 'wiki_propose_page':
          return this.handleWikiProposePage(args);
        case 'wiki_review_drafts':
          return this.handleWikiReviewDrafts(args);
        case 'wiki_approve_draft':
          return this.handleWikiApproveDraft(args);
        case 'wiki_reject_draft':
          return this.handleWikiRejectDraft(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async handleWikiSearch(args: any) {
    // TODO: Implement wiki search
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Wiki search not yet implemented',
            results: [],
          }),
        },
      ],
    };
  }

  private async handleWikiGetPage(args: any) {
    // TODO: Implement wiki page fetching
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Wiki page fetching not yet implemented',
          }),
        },
      ],
    };
  }

  private async handleWikiProposeEdit(args: any) {
    const { project_id, page_path, proposed_content, edit_summary, proposed_by } =
      args;

    const draft = await this.wikiDraftRepo.create({
      projectId: project_id,
      type: 'edit_page',
      pagePath: page_path,
      proposedContent: proposed_content,
      originalContent: undefined, // TODO: Fetch current content
      proposedBy: proposed_by,
      proposedAt: new Date().toISOString(),
      editSummary: edit_summary,
      status: 'pending',
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            draft_id: draft.id,
            message:
              'Edit proposed successfully. Awaiting curator review.',
          }),
        },
      ],
    };
  }

  private async handleWikiProposePage(args: any) {
    const { project_id, page_path, proposed_content, edit_summary, proposed_by } =
      args;

    const draft = await this.wikiDraftRepo.create({
      projectId: project_id,
      type: 'new_page',
      pagePath: page_path,
      proposedContent: proposed_content,
      proposedBy: proposed_by,
      proposedAt: new Date().toISOString(),
      editSummary: edit_summary,
      status: 'pending',
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            draft_id: draft.id,
            message:
              'New page proposed successfully. Awaiting curator review.',
          }),
        },
      ],
    };
  }

  private async handleWikiReviewDrafts(args: any) {
    const { project_id } = args;

    const drafts = await this.wikiDraftRepo.getPending(project_id);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ pending_drafts: drafts }, null, 2),
        },
      ],
    };
  }

  private async handleWikiApproveDraft(args: any) {
    const { draft_id, reviewed_by, feedback } = args;

    const draft = await this.wikiDraftRepo.approve(
      draft_id,
      reviewed_by,
      feedback
    );

    // TODO: Actually publish to GitHub Wiki

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Draft approved and published to wiki',
            draft,
          }),
        },
      ],
    };
  }

  private async handleWikiRejectDraft(args: any) {
    const { draft_id, reviewed_by, feedback } = args;

    const draft = await this.wikiDraftRepo.reject(
      draft_id,
      reviewed_by,
      feedback
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Draft rejected with feedback',
            draft,
          }),
        },
      ],
    };
  }

  getServer(): Server {
    return this.server;
  }

  // TODO: MCP SDK connection API has changed - update when implementing
  // async start(): Promise<void> { ... }
}
