import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ChallengeRepository } from '../../db/repositories/challenge-repository';

/**
 * MCP Server for Challenge operations
 *
 * Provides tools for challenging and responding to decisions
 */
export class ChallengeServer {
  private server: Server;

  constructor(private readonly challengeRepo: ChallengeRepository) {
    this.server = new Server(
      {
        name: 'challenge',
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
          name: 'submit_challenge',
          description:
            'Challenge a governance decision. Available to all trust levels.',
          inputSchema: {
            type: 'object',
            properties: {
              decision_id: {
                type: 'string',
                description: 'ID of decision being challenged',
              },
              project_id: {
                type: 'string',
                description: 'Project ID',
              },
              submitted_by: {
                type: 'string',
                description: 'Who is submitting the challenge',
              },
              argument: {
                type: 'string',
                description: 'Argument for why the decision should be reconsidered',
              },
              evidence: {
                type: 'string',
                description: 'Supporting evidence (optional)',
              },
            },
            required: [
              'decision_id',
              'project_id',
              'submitted_by',
              'argument',
            ],
          },
        },
        {
          name: 'list_challenges',
          description: 'List pending challenges',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID',
              },
              status: {
                type: 'string',
                enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
                description: 'Filter by status (optional)',
              },
            },
            required: ['project_id'],
          },
        },
        {
          name: 'respond_to_challenge',
          description:
            'Respond to a challenge. (Authorized trust level required)',
          inputSchema: {
            type: 'object',
            properties: {
              challenge_id: {
                type: 'string',
                description: 'Challenge ID',
              },
              responded_by: {
                type: 'string',
                description: 'Who is responding',
              },
              response: {
                type: 'string',
                description: 'Response to the challenge',
              },
              outcome: {
                type: 'string',
                enum: ['accepted', 'rejected'],
                description: 'Whether the challenge is accepted or rejected',
              },
            },
            required: [
              'challenge_id',
              'responded_by',
              'response',
              'outcome',
            ],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'submit_challenge':
          return this.handleSubmitChallenge(args);
        case 'list_challenges':
          return this.handleListChallenges(args);
        case 'respond_to_challenge':
          return this.handleRespondToChallenge(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async handleSubmitChallenge(args: any) {
    const { decision_id, project_id, submitted_by, argument, evidence } = args;

    const challenge = await this.challengeRepo.create({
      decisionId: decision_id,
      projectId: project_id,
      submittedBy: submitted_by,
      submittedAt: new Date().toISOString(),
      status: 'pending',
      argument,
      evidence,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            challenge_id: challenge.id,
            message: 'Challenge submitted successfully',
          }),
        },
      ],
    };
  }

  private async handleListChallenges(args: any) {
    const { project_id, status } = args;

    const challenges = await this.challengeRepo.getByProject(
      project_id,
      status
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ challenges }, null, 2),
        },
      ],
    };
  }

  private async handleRespondToChallenge(args: any) {
    const { challenge_id, responded_by, response, outcome } = args;

    const challenge = await this.challengeRepo.respond(challenge_id, {
      respondedBy: responded_by,
      respondedAt: new Date().toISOString(),
      response,
      outcome,
      status: outcome,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Challenge ${outcome}`,
            challenge,
          }),
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
        name: 'submit_challenge',
        description:
          'Challenge a governance decision. Available to all trust levels.',
        input_schema: {
          type: 'object' as const,
          properties: {
            decision_id: {
              type: 'string',
              description: 'ID of decision being challenged',
            },
            project_id: {
              type: 'string',
              description: 'Project ID',
            },
            submitted_by: {
              type: 'string',
              description: 'Who is submitting the challenge',
            },
            argument: {
              type: 'string',
              description: 'Argument for why the decision should be reconsidered',
            },
            evidence: {
              type: 'string',
              description: 'Supporting evidence (optional)',
            },
          },
          required: [
            'decision_id',
            'project_id',
            'submitted_by',
            'argument',
          ],
        },
      },
      {
        name: 'list_challenges',
        description: 'List pending challenges',
        input_schema: {
          type: 'object' as const,
          properties: {
            project_id: {
              type: 'string',
              description: 'Project ID',
            },
            status: {
              type: 'string',
              enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
              description: 'Filter by status (optional)',
            },
          },
          required: ['project_id'],
        },
      },
      {
        name: 'respond_to_challenge',
        description:
          'Respond to a challenge. (Authorized trust level required)',
        input_schema: {
          type: 'object' as const,
          properties: {
            challenge_id: {
              type: 'string',
              description: 'Challenge ID',
            },
            responded_by: {
              type: 'string',
              description: 'Who is responding',
            },
            response: {
              type: 'string',
              description: 'Response to the challenge',
            },
            outcome: {
              type: 'string',
              enum: ['accepted', 'rejected'],
              description: 'Whether the challenge is accepted or rejected',
            },
          },
          required: [
            'challenge_id',
            'responded_by',
            'response',
            'outcome',
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
      case 'submit_challenge': {
        const result = await this.handleSubmitChallenge(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      case 'list_challenges': {
        const result = await this.handleListChallenges(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      case 'respond_to_challenge': {
        const result = await this.handleRespondToChallenge(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}

// Import Anthropic types
import Anthropic from '@anthropic-ai/sdk';
