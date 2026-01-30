import { BaseRepository } from './base-repository.js';

/**
 * A single turn in a conversation
 */
export interface ConversationTurn {
  id?: number;
  sessionId: string;
  turnNumber: number;
  role: 'user' | 'assistant' | 'tool_result';
  content: unknown; // Full message content (text, tool_use blocks, etc.)
  timestamp?: string;
  model?: string;
  stopReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Repository for conversation logging
 *
 * Stores full conversation history for each agent session,
 * enabling evals, debugging, and prompt optimization.
 */
export class ConversationRepository extends BaseRepository {
  /**
   * Log a conversation turn
   */
  async logTurn(turn: Omit<ConversationTurn, 'id' | 'timestamp'>): Promise<ConversationTurn> {
    const result = await this.db.query(
      `INSERT INTO conversation_log
       (session_id, turn_number, role, content, model, stop_reason, input_tokens, output_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, timestamp`,
      [
        turn.sessionId,
        turn.turnNumber,
        turn.role,
        JSON.stringify(turn.content),
        turn.model || null,
        turn.stopReason || null,
        turn.inputTokens || null,
        turn.outputTokens || null,
      ]
    );

    return {
      ...turn,
      id: result.rows[0].id,
      timestamp: result.rows[0].timestamp,
    };
  }

  /**
   * Log multiple turns in a batch (more efficient for bulk logging)
   */
  async logTurns(turns: Array<Omit<ConversationTurn, 'id' | 'timestamp'>>): Promise<void> {
    if (turns.length === 0) return;

    const values: unknown[] = [];
    const placeholders: string[] = [];

    turns.forEach((turn, i) => {
      const offset = i * 8;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
      );
      values.push(
        turn.sessionId,
        turn.turnNumber,
        turn.role,
        JSON.stringify(turn.content),
        turn.model || null,
        turn.stopReason || null,
        turn.inputTokens || null,
        turn.outputTokens || null
      );
    });

    await this.db.query(
      `INSERT INTO conversation_log
       (session_id, turn_number, role, content, model, stop_reason, input_tokens, output_tokens)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (session_id, turn_number) DO UPDATE SET
         content = EXCLUDED.content,
         model = EXCLUDED.model,
         stop_reason = EXCLUDED.stop_reason,
         input_tokens = EXCLUDED.input_tokens,
         output_tokens = EXCLUDED.output_tokens`,
      values
    );
  }

  /**
   * Get full conversation for a session
   */
  async getConversation(sessionId: string): Promise<ConversationTurn[]> {
    const result = await this.db.query(
      `SELECT * FROM conversation_log
       WHERE session_id = $1
       ORDER BY turn_number ASC`,
      [sessionId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      turnNumber: row.turn_number,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      model: row.model,
      stopReason: row.stop_reason,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
    }));
  }

  /**
   * Get conversations for multiple sessions (for bulk export)
   */
  async getConversations(sessionIds: string[]): Promise<Map<string, ConversationTurn[]>> {
    if (sessionIds.length === 0) {
      return new Map();
    }

    const result = await this.db.query(
      `SELECT * FROM conversation_log
       WHERE session_id = ANY($1)
       ORDER BY session_id, turn_number ASC`,
      [sessionIds]
    );

    const conversations = new Map<string, ConversationTurn[]>();

    for (const row of result.rows) {
      const turn: ConversationTurn = {
        id: row.id,
        sessionId: row.session_id,
        turnNumber: row.turn_number,
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
        model: row.model,
        stopReason: row.stop_reason,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
      };

      const existing = conversations.get(turn.sessionId) || [];
      existing.push(turn);
      conversations.set(turn.sessionId, existing);
    }

    return conversations;
  }

  /**
   * Get token usage statistics for a session
   */
  async getTokenUsage(sessionId: string): Promise<{ inputTokens: number; outputTokens: number }> {
    const result = await this.db.query(
      `SELECT
         COALESCE(SUM(input_tokens), 0) as input_tokens,
         COALESCE(SUM(output_tokens), 0) as output_tokens
       FROM conversation_log
       WHERE session_id = $1`,
      [sessionId]
    );

    return {
      inputTokens: parseInt(result.rows[0].input_tokens, 10),
      outputTokens: parseInt(result.rows[0].output_tokens, 10),
    };
  }

  /**
   * Get recent conversations for a project (for evals)
   */
  async getRecentByProject(
    projectId: string,
    limit: number = 100
  ): Promise<Array<{ sessionId: string; turns: ConversationTurn[] }>> {
    // First get recent sessions
    const sessionsResult = await this.db.query(
      `SELECT s.id FROM sessions s
       WHERE s.project_id = $1
       ORDER BY s.started_at DESC
       LIMIT $2`,
      [projectId, limit]
    );

    const sessionIds = sessionsResult.rows.map((r) => r.id);
    const conversations = await this.getConversations(sessionIds);

    return sessionIds
      .map((id) => ({
        sessionId: id,
        turns: conversations.get(id) || [],
      }))
      .filter((c) => c.turns.length > 0);
  }
}
