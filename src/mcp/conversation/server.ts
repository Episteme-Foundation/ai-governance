import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Anthropic from '@anthropic-ai/sdk';
import {
  ConversationThreadRepository,
  ConversationThread,
  ConversationMessage,
  Participant,
} from '../../db/repositories/conversation-thread-repository';

/**
 * Callback for invoking another agent within a conversation
 *
 * @param targetRole - The role to invoke (e.g., "maintainer")
 * @param conversationContext - Formatted conversation history for the agent's context
 * @param conversationId - The conversation ID this invocation is part of
 * @returns The agent's response text
 */
export type AgentInvokeCallback = (
  targetRole: string,
  conversationContext: string,
  conversationId: string
) => Promise<string>;

/**
 * Callback for creating a GitHub issue (for async notifications)
 */
export type CreateIssueCallback = (params: {
  title: string;
  body: string;
  labels: string[];
}) => Promise<{ issue_number: number; html_url: string }>;

/**
 * Notification types for the send tool
 */
export type NotificationType =
  | 'escalation' // Needs decision from higher authority
  | 'work_request' // Please do this work
  | 'review_request' // Please review this
  | 'fyi'; // For your information, no action required

/**
 * MCP Server for inter-agent and human-agent conversations
 *
 * Provides the `converse` tool which enables agents to have
 * back-and-forth conversations with other agents or track
 * conversations with humans.
 *
 * Key design:
 * - Unified model for all conversation types
 * - Each converse() call is a turn that expects a response
 * - Conversations persist and can be resumed
 * - Either party can end or resolve a conversation
 */
export class ConversationServer {
  private server: Server;

  constructor(
    private readonly threadRepo: ConversationThreadRepository,
    private readonly invokeAgent: AgentInvokeCallback,
    private readonly currentRole: string,
    private readonly projectId: string,
    private readonly createIssue?: CreateIssueCallback
  ) {
    this.server = new Server(
      {
        name: 'conversation',
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
          name: 'converse',
          description:
            'Have a conversation with another agent or participant. Use this to discuss, ' +
            'ask questions, delegate, or collaborate with other roles. Each call sends a ' +
            'message and waits for a response. Conversations can be continued by providing ' +
            'the conversation_id from a previous call.',
          inputSchema: {
            type: 'object',
            properties: {
              with_role: {
                type: 'string',
                description:
                  'The role to talk to (e.g., "maintainer", "evaluator", "reception"). ' +
                  'Required when starting a new conversation.',
              },
              message: {
                type: 'string',
                description: 'Your message to the other participant.',
              },
              conversation_id: {
                type: 'string',
                description:
                  'ID of an existing conversation to continue. If not provided, ' +
                  'starts a new conversation (requires with_role).',
              },
              topic: {
                type: 'string',
                description:
                  'Brief description of what this conversation is about. ' +
                  'Only used when starting a new conversation.',
              },
            },
            required: ['message'],
          },
        },
        {
          name: 'end_conversation',
          description:
            'End a conversation and mark it as resolved. Use this when the matter ' +
            'has been addressed and no further discussion is needed.',
          inputSchema: {
            type: 'object',
            properties: {
              conversation_id: {
                type: 'string',
                description: 'The conversation ID to resolve.',
              },
              resolution: {
                type: 'string',
                description:
                  'Summary of how the conversation was resolved or what was decided.',
              },
            },
            required: ['conversation_id'],
          },
        },
        {
          name: 'list_conversations',
          description:
            'List active conversations you are participating in. Useful for checking ' +
            'if there are ongoing discussions that need attention.',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['active', 'resolved', 'stale', 'all'],
                description: 'Filter by conversation status (default: active).',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of conversations to return (default: 10).',
              },
            },
          },
        },
        {
          name: 'get_conversation',
          description:
            'Get the full history of a conversation. Useful for reviewing what was ' +
            'discussed before continuing or when referenced by another agent.',
          inputSchema: {
            type: 'object',
            properties: {
              conversation_id: {
                type: 'string',
                description: 'The conversation ID to retrieve.',
              },
            },
            required: ['conversation_id'],
          },
        },
        {
          name: 'send',
          description:
            'Send an async notification to another role. Unlike converse(), this does NOT wait ' +
            'for a response - it creates a work item that will be handled later. Use this for: ' +
            'escalations (needs decision), work requests (please do this), review requests ' +
            '(please review), or FYI (informational, no action needed). The notification ' +
            'creates a GitHub issue that triggers the target role.',
          inputSchema: {
            type: 'object',
            properties: {
              to_role: {
                type: 'string',
                description: 'The role to notify (e.g., "maintainer", "evaluator").',
              },
              type: {
                type: 'string',
                enum: ['escalation', 'work_request', 'review_request', 'fyi'],
                description:
                  'Type of notification: escalation (needs decision), work_request (please do this), ' +
                  'review_request (please review), fyi (informational).',
              },
              subject: {
                type: 'string',
                description: 'Brief subject line for the notification.',
              },
              body: {
                type: 'string',
                description:
                  'Full message body with context, your analysis, and what you need from them.',
              },
              context: {
                type: 'object',
                description:
                  'Optional structured context (e.g., {issue_number: 123, conversation_id: "..."}). ' +
                  'This metadata helps the recipient understand the full picture.',
              },
            },
            required: ['to_role', 'type', 'subject', 'body'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name } = request.params;
      const args: Record<string, unknown> = request.params.arguments ?? {};

      switch (name) {
        case 'converse':
          return this.handleConverse(args);
        case 'end_conversation':
          return this.handleEndConversation(args);
        case 'list_conversations':
          return this.handleListConversations(args);
        case 'get_conversation':
          return this.handleGetConversation(args);
        case 'send':
          return this.handleSend(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Handle the converse tool - send a message and get a response
   */
  private async handleConverse(args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    const { with_role, message, conversation_id, topic } = args as {
      with_role?: string;
      message: string;
      conversation_id?: string;
      topic?: string;
    };

    try {
      let thread: ConversationThread;
      let targetRole: string;

      if (conversation_id) {
        // Continue existing conversation
        const existing = await this.threadRepo.getById(conversation_id);
        if (!existing) {
          return this.errorResponse(`Conversation not found: ${conversation_id}`);
        }
        if (existing.status !== 'active') {
          return this.errorResponse(
            `Conversation is ${existing.status}, cannot continue`
          );
        }
        thread = existing;

        // Find the other participant
        const otherParticipant = thread.participants.find(
          (p) => !(p.type === 'role' && p.id === this.currentRole)
        );
        if (!otherParticipant || otherParticipant.type !== 'role') {
          return this.errorResponse('Cannot determine target role for conversation');
        }
        targetRole = otherParticipant.id;
      } else {
        // Start new conversation
        if (!with_role) {
          return this.errorResponse(
            'with_role is required when starting a new conversation'
          );
        }
        targetRole = with_role;

        // Check for existing active conversation with this role
        const currentParticipant: Participant = { type: 'role', id: this.currentRole };
        const targetParticipant: Participant = { type: 'role', id: targetRole };

        const existing = await this.threadRepo.findActive(this.projectId, [
          currentParticipant,
          targetParticipant,
        ]);

        if (existing) {
          // Reuse existing active conversation
          thread = existing;
        } else {
          // Create new conversation
          thread = await this.threadRepo.create({
            projectId: this.projectId,
            participants: [currentParticipant, targetParticipant],
            status: 'active',
            topic,
          });
        }
      }

      // Add the current agent's message to the thread
      await this.threadRepo.addMessage({
        conversationId: thread.id,
        fromParticipant: { type: 'role', id: this.currentRole },
        content: message,
      });

      // Build conversation context for the target agent
      const messages = await this.threadRepo.getMessages(thread.id);
      const context = this.formatConversationContext(thread, messages);

      // Invoke the target agent
      const response = await this.invokeAgent(targetRole, context, thread.id);

      // Add the target's response to the thread
      await this.threadRepo.addMessage({
        conversationId: thread.id,
        fromParticipant: { type: 'role', id: targetRole },
        content: response,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                conversation_id: thread.id,
                with_role: targetRole,
                response,
                message_count: messages.length + 2, // +2 for the new message and response
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.errorResponse(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Handle ending a conversation
   */
  private async handleEndConversation(args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    const { conversation_id, resolution } = args as {
      conversation_id: string;
      resolution?: string;
    };

    try {
      const thread = await this.threadRepo.getById(conversation_id);
      if (!thread) {
        return this.errorResponse(`Conversation not found: ${conversation_id}`);
      }

      await this.threadRepo.updateStatus(conversation_id, 'resolved', resolution);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                conversation_id,
                status: 'resolved',
                resolution: resolution || 'No resolution provided',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.errorResponse(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Handle listing conversations
   */
  private async handleListConversations(args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    const { status = 'active', limit = 10 } = args as {
      status?: string;
      limit?: number;
    };

    const currentParticipant: Participant = { type: 'role', id: this.currentRole };

    let conversations: ConversationThread[];
    if (status === 'all') {
      conversations = await this.threadRepo.getRecent(this.projectId, limit);
      // Filter to only those this role participates in
      conversations = conversations.filter((c) =>
        c.participants.some(
          (p) => p.type === 'role' && p.id === this.currentRole
        )
      );
    } else {
      conversations = await this.threadRepo.getActiveForParticipant(
        this.projectId,
        currentParticipant
      );
      if (status !== 'active') {
        // Filter by specific status
        conversations = conversations.filter((c) => c.status === status);
      }
      conversations = conversations.slice(0, limit);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              conversations: conversations.map((c) => ({
                conversation_id: c.id,
                participants: c.participants.map((p) => p.id),
                status: c.status,
                topic: c.topic,
                updated_at: c.updatedAt,
              })),
              total: conversations.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle getting conversation details
   */
  private async handleGetConversation(args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    const { conversation_id } = args as { conversation_id: string };

    const result = await this.threadRepo.getWithMessages(conversation_id);
    if (!result) {
      return this.errorResponse(`Conversation not found: ${conversation_id}`);
    }

    const { thread, messages } = result;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              conversation_id: thread.id,
              participants: thread.participants,
              status: thread.status,
              topic: thread.topic,
              created_at: thread.createdAt,
              updated_at: thread.updatedAt,
              messages: messages.map((m) => ({
                from: m.fromParticipant.id,
                content: m.content,
                timestamp: m.timestamp,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle the send tool - async notification to another role
   */
  private async handleSend(args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    const { to_role, type, subject, body, context } = args as {
      to_role: string;
      type: NotificationType;
      subject: string;
      body: string;
      context?: Record<string, unknown>;
    };

    // Check if we have the createIssue callback
    if (!this.createIssue) {
      return this.errorResponse(
        'send tool is not available: GitHub issue creation not configured'
      );
    }

    try {
      // Build the issue body with metadata
      let issueBody = `## ${this.getTypeLabel(type)}\n\n`;
      issueBody += `**From:** ${this.currentRole}\n`;
      issueBody += `**To:** ${to_role}\n`;
      issueBody += `**Type:** ${type}\n\n`;
      issueBody += `---\n\n`;
      issueBody += body;

      // Add context metadata if provided
      if (context && Object.keys(context).length > 0) {
        issueBody += `\n\n---\n\n`;
        issueBody += `### Context\n\n`;
        issueBody += '```json\n';
        issueBody += JSON.stringify(context, null, 2);
        issueBody += '\n```\n';

        // Add direct links for known context types
        if (context.conversation_id) {
          issueBody += `\n**Related Conversation:** \`${context.conversation_id}\`\n`;
        }
        if (context.issue_number) {
          issueBody += `\n**Related Issue:** #${context.issue_number}\n`;
        }
        if (context.pr_number) {
          issueBody += `\n**Related PR:** #${context.pr_number}\n`;
        }
      }

      // Create labels for routing
      const labels = [
        `notify:${to_role}`,
        `type:${type}`,
        `from:${this.currentRole}`,
      ];

      // Create the GitHub issue
      const result = await this.createIssue({
        title: `[${type}] ${subject}`,
        body: issueBody,
        labels,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Notification sent to ${to_role}`,
                issue_number: result.issue_number,
                issue_url: result.html_url,
                type,
                to_role,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.errorResponse(
        `Failed to send notification: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get human-readable label for notification type
   */
  private getTypeLabel(type: NotificationType): string {
    switch (type) {
      case 'escalation':
        return 'Escalation - Decision Needed';
      case 'work_request':
        return 'Work Request';
      case 'review_request':
        return 'Review Request';
      case 'fyi':
        return 'For Your Information';
      default:
        return 'Notification';
    }
  }

  /**
   * Format conversation history as context for the target agent
   */
  private formatConversationContext(
    thread: ConversationThread,
    messages: ConversationMessage[]
  ): string {
    let context = `## Active Conversation\n`;
    context += `You are in a conversation with ${this.currentRole}`;
    if (thread.topic) {
      context += ` about: ${thread.topic}`;
    }
    context += `.\n\n`;
    context += `Conversation ID: ${thread.id}\n\n`;

    if (messages.length > 0) {
      context += `### Thread History\n`;
      for (const msg of messages) {
        const sender = msg.fromParticipant.id;
        context += `\n[${sender}]: ${msg.content}\n`;
      }
      context += `\n`;
    }

    context += `### Your Turn\n`;
    context += `Respond to continue this conversation. Your response will be returned to ${this.currentRole}.\n`;

    return context;
  }

  private errorResponse(message: string): {
    content: Array<{ type: string; text: string }>;
    isError: boolean;
  } {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: true, message }),
        },
      ],
      isError: true,
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
        name: 'converse',
        description:
          'Have a conversation with another agent or participant. Use this to discuss, ' +
          'ask questions, delegate, or collaborate with other roles. Each call sends a ' +
          'message and waits for a response. Conversations can be continued by providing ' +
          'the conversation_id from a previous call.',
        input_schema: {
          type: 'object' as const,
          properties: {
            with_role: {
              type: 'string',
              description:
                'The role to talk to (e.g., "maintainer", "evaluator", "reception"). ' +
                'Required when starting a new conversation.',
            },
            message: {
              type: 'string',
              description: 'Your message to the other participant.',
            },
            conversation_id: {
              type: 'string',
              description:
                'ID of an existing conversation to continue. If not provided, ' +
                'starts a new conversation (requires with_role).',
            },
            topic: {
              type: 'string',
              description:
                'Brief description of what this conversation is about. ' +
                'Only used when starting a new conversation.',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'end_conversation',
        description:
          'End a conversation and mark it as resolved. Use this when the matter ' +
          'has been addressed and no further discussion is needed.',
        input_schema: {
          type: 'object' as const,
          properties: {
            conversation_id: {
              type: 'string',
              description: 'The conversation ID to resolve.',
            },
            resolution: {
              type: 'string',
              description:
                'Summary of how the conversation was resolved or what was decided.',
            },
          },
          required: ['conversation_id'],
        },
      },
      {
        name: 'list_conversations',
        description:
          'List active conversations you are participating in. Useful for checking ' +
          'if there are ongoing discussions that need attention.',
        input_schema: {
          type: 'object' as const,
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'resolved', 'stale', 'all'],
              description: 'Filter by conversation status (default: active).',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of conversations to return (default: 10).',
            },
          },
        },
      },
      {
        name: 'get_conversation',
        description:
          'Get the full history of a conversation. Useful for reviewing what was ' +
          'discussed before continuing or when referenced by another agent.',
        input_schema: {
          type: 'object' as const,
          properties: {
            conversation_id: {
              type: 'string',
              description: 'The conversation ID to retrieve.',
            },
          },
          required: ['conversation_id'],
        },
      },
      {
        name: 'send',
        description:
          'Send an async notification to another role. Unlike converse(), this does NOT wait ' +
          'for a response - it creates a work item that will be handled later. Use this for: ' +
          'escalations (needs decision), work requests (please do this), review requests ' +
          '(please review), or FYI (informational, no action needed).',
        input_schema: {
          type: 'object' as const,
          properties: {
            to_role: {
              type: 'string',
              description: 'The role to notify (e.g., "maintainer", "evaluator").',
            },
            type: {
              type: 'string',
              enum: ['escalation', 'work_request', 'review_request', 'fyi'],
              description:
                'Type of notification: escalation (needs decision), work_request (please do this), ' +
                'review_request (please review), fyi (informational).',
            },
            subject: {
              type: 'string',
              description: 'Brief subject line for the notification.',
            },
            body: {
              type: 'string',
              description:
                'Full message body with context, your analysis, and what you need from them.',
            },
            context: {
              type: 'object',
              description:
                'Optional structured context (e.g., {issue_number: 123, conversation_id: "..."}). ' +
                'This metadata helps the recipient understand the full picture.',
            },
          },
          required: ['to_role', 'type', 'subject', 'body'],
        },
      },
    ];
  }

  /**
   * Execute a tool directly (for use by orchestration layer)
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'converse': {
        const result = await this.handleConverse(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      case 'end_conversation': {
        const result = await this.handleEndConversation(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      case 'list_conversations': {
        const result = await this.handleListConversations(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      case 'get_conversation': {
        const result = await this.handleGetConversation(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      case 'send': {
        const result = await this.handleSend(args);
        return JSON.parse((result.content[0] as { text: string }).text);
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
