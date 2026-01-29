import { BaseRepository } from './base-repository';
import { Session, GovernanceRequest } from '../../types';

/**
 * Repository for agent sessions
 */
export class SessionRepository extends BaseRepository {
  /**
   * Create a new session
   */
  async create(session: Omit<Session, 'id'>): Promise<Session> {
    const id = crypto.randomUUID();

    await this.db.query(
      `INSERT INTO sessions (id, project_id, role, request, started_at, status, tool_uses, decisions_logged, escalations)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        session.projectId,
        session.role,
        JSON.stringify(session.request),
        session.startedAt,
        session.status,
        JSON.stringify(session.toolUses || []),
        session.decisionsLogged || [],
        session.escalations || [],
      ]
    );

    return { id, ...session };
  }

  /**
   * Complete a session
   */
  async complete(
    sessionId: string,
    completion: {
      status: 'completed' | 'failed' | 'blocked';
      decisionsLogged: string[];
    }
  ): Promise<void> {
    await this.db.query(
      `UPDATE sessions
       SET status = $1, ended_at = NOW(), decisions_logged = $2
       WHERE id = $3`,
      [completion.status, completion.decisionsLogged, sessionId]
    );
  }

  /**
   * Get session by ID
   */
  async getById(sessionId: string): Promise<Session | null> {
    const result = await this.db.query(
      `SELECT * FROM sessions WHERE id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      projectId: row.project_id,
      role: row.role,
      request: row.request as GovernanceRequest,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      status: row.status,
      toolUses: row.tool_uses || [],
      decisionsLogged: row.decisions_logged || [],
      escalations: row.escalations || [],
    };
  }

  /**
   * Get active sessions for a project
   */
  async getActive(projectId: string): Promise<Session[]> {
    const result = await this.db.query(
      `SELECT * FROM sessions
       WHERE project_id = $1 AND status = 'active'
       ORDER BY started_at DESC`,
      [projectId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      role: row.role,
      request: row.request as GovernanceRequest,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      status: row.status,
      toolUses: row.tool_uses || [],
      decisionsLogged: row.decisions_logged || [],
      escalations: row.escalations || [],
    }));
  }
}
