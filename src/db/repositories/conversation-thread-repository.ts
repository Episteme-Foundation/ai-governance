import { BaseRepository } from './base-repository';

/**
 * Participant in a conversation
 */
export interface Participant {
  type: 'role' | 'human' | 'external';
  id: string;
}

/**
 * A message in a conversation thread
 */
export interface ConversationMessage {
  id?: number;
  conversationId: string;
  fromParticipant: Participant;
  content: string;
  sessionId?: string;
  timestamp?: string;
}

/**
 * A conversation thread between participants
 */
export interface ConversationThread {
  id: string;
  projectId: string;
  participants: Participant[];
  status: 'active' | 'resolved' | 'stale';
  topic?: string;
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string;
  resolution?: string;
}

/**
 * Repository for unified conversation threads
 *
 * Handles both human-agent and agent-agent conversations.
 * This is different from ConversationRepository which logs
 * low-level API turns within a single session.
 */
export class ConversationThreadRepository extends BaseRepository {
  /**
   * Create a new conversation thread
   */
  async create(
    thread: Omit<ConversationThread, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ConversationThread> {
    const id = crypto.randomUUID();

    const result = await this.db.query(
      `INSERT INTO conversations (id, project_id, participants, status, topic)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING created_at, updated_at`,
      [
        id,
        thread.projectId,
        JSON.stringify(thread.participants),
        thread.status,
        thread.topic || null,
      ]
    );

    return {
      id,
      ...thread,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
    };
  }

  /**
   * Get a conversation by ID
   */
  async getById(conversationId: string): Promise<ConversationThread | null> {
    const result = await this.db.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToThread(result.rows[0]);
  }

  /**
   * Find an active conversation between specific participants
   */
  async findActive(
    projectId: string,
    participants: Participant[]
  ): Promise<ConversationThread | null> {
    // Sort participants for consistent comparison
    const sortedParticipants = [...participants].sort((a, b) =>
      `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)
    );

    const result = await this.db.query(
      `SELECT * FROM conversations
       WHERE project_id = $1
         AND status = 'active'
         AND participants @> $2::jsonb
         AND jsonb_array_length(participants) = $3
       ORDER BY updated_at DESC
       LIMIT 1`,
      [projectId, JSON.stringify(sortedParticipants), participants.length]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToThread(result.rows[0]);
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    message: Omit<ConversationMessage, 'id' | 'timestamp'>
  ): Promise<ConversationMessage> {
    const result = await this.db.query(
      `INSERT INTO conversation_messages (conversation_id, from_participant, content, session_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, timestamp`,
      [
        message.conversationId,
        JSON.stringify(message.fromParticipant),
        message.content,
        message.sessionId || null,
      ]
    );

    // Update conversation's updated_at
    await this.db.query(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
      [message.conversationId]
    );

    return {
      ...message,
      id: result.rows[0].id,
      timestamp: result.rows[0].timestamp,
    };
  }

  /**
   * Get all messages in a conversation
   */
  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    const result = await this.db.query(
      `SELECT * FROM conversation_messages
       WHERE conversation_id = $1
       ORDER BY timestamp ASC`,
      [conversationId]
    );

    return result.rows.map(this.rowToMessage);
  }

  /**
   * Get conversation with all messages
   */
  async getWithMessages(
    conversationId: string
  ): Promise<{ thread: ConversationThread; messages: ConversationMessage[] } | null> {
    const thread = await this.getById(conversationId);
    if (!thread) {
      return null;
    }

    const messages = await this.getMessages(conversationId);
    return { thread, messages };
  }

  /**
   * Update conversation status
   */
  async updateStatus(
    conversationId: string,
    status: 'active' | 'resolved' | 'stale',
    resolution?: string
  ): Promise<void> {
    if (status === 'resolved') {
      await this.db.query(
        `UPDATE conversations
         SET status = $1, resolved_at = NOW(), resolution = $2
         WHERE id = $3`,
        [status, resolution || null, conversationId]
      );
    } else {
      await this.db.query(
        `UPDATE conversations SET status = $1 WHERE id = $2`,
        [status, conversationId]
      );
    }
  }

  /**
   * Get active conversations for a participant
   */
  async getActiveForParticipant(
    projectId: string,
    participant: Participant
  ): Promise<ConversationThread[]> {
    const result = await this.db.query(
      `SELECT * FROM conversations
       WHERE project_id = $1
         AND status = 'active'
         AND participants @> $2::jsonb
       ORDER BY updated_at DESC`,
      [projectId, JSON.stringify([participant])]
    );

    return result.rows.map(this.rowToThread);
  }

  /**
   * Get recent conversations for a project
   */
  async getRecent(
    projectId: string,
    limit: number = 20
  ): Promise<ConversationThread[]> {
    const result = await this.db.query(
      `SELECT * FROM conversations
       WHERE project_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [projectId, limit]
    );

    return result.rows.map(this.rowToThread);
  }

  /**
   * Mark stale conversations (no activity for specified hours)
   */
  async markStale(projectId: string, staleAfterHours: number = 24): Promise<number> {
    const result = await this.db.query(
      `UPDATE conversations
       SET status = 'stale'
       WHERE project_id = $1
         AND status = 'active'
         AND updated_at < NOW() - INTERVAL '1 hour' * $2
       RETURNING id`,
      [projectId, staleAfterHours]
    );

    return result.rowCount || 0;
  }

  private rowToThread(row: Record<string, unknown>): ConversationThread {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      participants: row.participants as Participant[],
      status: row.status as 'active' | 'resolved' | 'stale',
      topic: row.topic as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      resolvedAt: row.resolved_at as string | undefined,
      resolution: row.resolution as string | undefined,
    };
  }

  private rowToMessage(row: Record<string, unknown>): ConversationMessage {
    return {
      id: row.id as number,
      conversationId: row.conversation_id as string,
      fromParticipant: row.from_participant as Participant,
      content: row.content as string,
      sessionId: row.session_id as string | undefined,
      timestamp: row.timestamp as string,
    };
  }
}
