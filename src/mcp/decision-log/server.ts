import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DecisionRepository } from '../../db/repositories/decision-repository';
import { EmbeddingsService } from '../../context/embeddings';

/**
 * MCP Server for Decision Log operations
 *
 * Provides tools for:
 * - Searching decisions semantically
 * - Getting specific decisions
 * - Logging new decisions
 */
export class DecisionLogServer {
  private server: Server;

  constructor(
    private readonly decisionRepo: DecisionRepository,
    private readonly embeddingsService: EmbeddingsService
  ) {
    this.server = new Server(
      {
        name: 'decision-log',
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
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_decisions',
          description:
            'Search for decisions semantically similar to a query. Returns relevant past decisions that may provide precedent.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID to search within',
              },
              query: {
                type: 'string',
                description: 'Search query describing what you are looking for',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 5)',
                default: 5,
              },
            },
            required: ['project_id', 'query'],
          },
        },
        {
          name: 'get_decision',
          description: 'Get a specific decision by ID',
          inputSchema: {
            type: 'object',
            properties: {
              decision_id: {
                type: 'string',
                description: 'Decision ID',
              },
            },
            required: ['decision_id'],
          },
        },
        {
          name: 'log_decision',
          description:
            'Log a new governance decision. Should be used for all significant actions that require documented reasoning.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID',
              },
              title: {
                type: 'string',
                description: 'Brief title of the decision',
              },
              decision: {
                type: 'string',
                description: 'What was decided',
              },
              reasoning: {
                type: 'string',
                description: 'Why this decision was made',
              },
              considerations: {
                type: 'string',
                description: 'What factors were considered (optional)',
              },
              uncertainties: {
                type: 'string',
                description: 'What uncertainties remain (optional)',
              },
              reversibility: {
                type: 'string',
                description: 'How easily this can be reversed (optional)',
              },
              would_change_if: {
                type: 'string',
                description:
                  'What conditions would lead to changing this decision (optional)',
              },
              decision_maker: {
                type: 'string',
                description: 'Who made this decision',
              },
            },
            required: [
              'project_id',
              'title',
              'decision',
              'reasoning',
              'decision_maker',
            ],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'search_decisions':
          return this.handleSearchDecisions(args);
        case 'get_decision':
          return this.handleGetDecision(args);
        case 'log_decision':
          return this.handleLogDecision(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async handleSearchDecisions(args: any) {
    const { project_id, query, limit = 5 } = args;

    // Generate embedding for query
    const embedding = await this.embeddingsService.embed(query);

    // Search decisions
    const results = await this.decisionRepo.semanticSearch(
      project_id,
      embedding,
      limit,
      0.7
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              query,
              results: results.map((r) => ({
                decision: {
                  id: r.decision.id,
                  number: r.decision.decisionNumber,
                  title: r.decision.title,
                  date: r.decision.date,
                  decision: r.decision.decision,
                  reasoning: r.decision.reasoning,
                },
                similarity: r.similarity,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleGetDecision(args: any) {
    const { decision_id } = args;

    const decision = await this.decisionRepo.getById(decision_id);

    if (!decision) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Decision not found' }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(decision, null, 2),
        },
      ],
    };
  }

  private async handleLogDecision(args: any) {
    const {
      project_id,
      title,
      decision,
      reasoning,
      considerations,
      uncertainties,
      reversibility,
      would_change_if,
      decision_maker,
    } = args;

    // Generate embedding
    const decisionText = `${title}\n${decision}\n${reasoning}`;
    const embedding = await this.embeddingsService.embed(decisionText);

    // Get next decision number
    const decisionNumber = await this.decisionRepo.getNextDecisionNumber(
      project_id
    );

    // Create decision
    const newDecision = await this.decisionRepo.create({
      projectId: project_id,
      decisionNumber,
      title,
      date: new Date().toISOString().split('T')[0],
      status: 'adopted',
      decisionMaker: decision_maker,
      decision,
      reasoning,
      considerations,
      uncertainties,
      reversibility,
      wouldChangeIf: would_change_if,
      embedding,
      relatedDecisions: [],
      tags: [],
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              decision_id: newDecision.id,
              decision_number: newDecision.decisionNumber,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  getServer(): Server {
    return this.server;
  }

  /**
   * Get tool definitions for use in agent invocation
   */
  getToolDefinitions(): Anthropic.Tool[] {
    return [
      {
        name: 'search_decisions',
        description:
          'Search for decisions semantically similar to a query. Returns relevant past decisions that may provide precedent.',
        input_schema: {
          type: 'object' as const,
          properties: {
            project_id: {
              type: 'string',
              description: 'Project ID to search within',
            },
            query: {
              type: 'string',
              description: 'Search query describing what you are looking for',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 5)',
            },
          },
          required: ['project_id', 'query'],
        },
      },
      {
        name: 'get_decision',
        description: 'Get a specific decision by ID',
        input_schema: {
          type: 'object' as const,
          properties: {
            decision_id: {
              type: 'string',
              description: 'Decision ID',
            },
          },
          required: ['decision_id'],
        },
      },
      {
        name: 'log_decision',
        description:
          'Log a new governance decision. Should be used for all significant actions that require documented reasoning.',
        input_schema: {
          type: 'object' as const,
          properties: {
            project_id: {
              type: 'string',
              description: 'Project ID',
            },
            title: {
              type: 'string',
              description: 'Brief title of the decision',
            },
            decision: {
              type: 'string',
              description: 'What was decided',
            },
            reasoning: {
              type: 'string',
              description: 'Why this decision was made',
            },
            considerations: {
              type: 'string',
              description: 'What factors were considered (optional)',
            },
            uncertainties: {
              type: 'string',
              description: 'What uncertainties remain (optional)',
            },
            reversibility: {
              type: 'string',
              description: 'How easily this can be reversed (optional)',
            },
            would_change_if: {
              type: 'string',
              description:
                'What conditions would lead to changing this decision (optional)',
            },
            decision_maker: {
              type: 'string',
              description: 'Who made this decision',
            },
          },
          required: [
            'project_id',
            'title',
            'decision',
            'reasoning',
            'decision_maker',
          ],
        },
      },
    ];
  }

  /**
   * Execute a tool directly (for use by orchestration layer)
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'search_decisions': {
        const result = await this.handleSearchDecisions(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      case 'get_decision': {
        const result = await this.handleGetDecision(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      case 'log_decision': {
        const result = await this.handleLogDecision(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}

// Import Anthropic types
import Anthropic from '@anthropic-ai/sdk';
