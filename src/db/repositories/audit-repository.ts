import { BaseRepository } from './base-repository';

export interface AuditLogEntry {
  id?: number;
  timestamp?: string;
  projectId?: string;
  sessionId?: string;
  eventType: string;
  actor: string;
  action: string;
  details?: Record<string, unknown>;
  trustLevel?: string;
}

/**
 * Repository for audit log entries
 */
export class AuditRepository extends BaseRepository {
  /**
   * Log an audit event
   */
  async log(entry: AuditLogEntry): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_log (project_id, session_id, event_type, actor, action, details, trust_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.projectId || null,
        entry.sessionId || null,
        entry.eventType,
        entry.actor,
        entry.action,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.trustLevel || null,
      ]
    );
  }

  /**
   * Get audit log for a project
   */
  async getByProject(
    projectId: string,
    limit: number = 100
  ): Promise<AuditLogEntry[]> {
    const result = await this.db.query(
      `SELECT * FROM audit_log
       WHERE project_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [projectId, limit]
    );

    return result.rows;
  }

  /**
   * Get audit log for a session
   */
  async getBySession(sessionId: string): Promise<AuditLogEntry[]> {
    const result = await this.db.query(
      `SELECT * FROM audit_log
       WHERE session_id = $1
       ORDER BY timestamp ASC`,
      [sessionId]
    );

    return result.rows;
  }
}
