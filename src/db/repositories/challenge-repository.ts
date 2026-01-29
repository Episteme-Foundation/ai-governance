import { BaseRepository } from './base-repository';
import { Challenge } from '../../types';

/**
 * Repository for challenges
 */
export class ChallengeRepository extends BaseRepository {
  /**
   * Create a new challenge
   */
  async create(challenge: Omit<Challenge, 'id'>): Promise<Challenge> {
    const id = crypto.randomUUID();

    await this.db.query(
      `INSERT INTO challenges (id, decision_id, project_id, submitted_by, submitted_at, status, argument, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        challenge.decisionId,
        challenge.projectId,
        challenge.submittedBy,
        challenge.submittedAt,
        challenge.status,
        challenge.argument,
        challenge.evidence || null,
      ]
    );

    return { id, ...challenge };
  }

  /**
   * Respond to a challenge
   */
  async respond(
    challengeId: string,
    response: {
      respondedBy: string;
      respondedAt: string;
      response: string;
      outcome: string;
      status: string;
    }
  ): Promise<Challenge> {
    await this.db.query(
      `UPDATE challenges
       SET responded_by = $1, responded_at = $2, response = $3, outcome = $4, status = $5
       WHERE id = $6`,
      [
        response.respondedBy,
        response.respondedAt,
        response.response,
        response.outcome,
        response.status,
        challengeId,
      ]
    );

    const result = await this.db.query(
      `SELECT * FROM challenges WHERE id = $1`,
      [challengeId]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get challenges by project
   */
  async getByProject(
    projectId: string,
    status?: string
  ): Promise<Challenge[]> {
    let query = `SELECT * FROM challenges WHERE project_id = $1`;
    const params: any[] = [projectId];

    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }

    query += ` ORDER BY submitted_at DESC`;

    const result = await this.db.query(query, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Get challenge by ID
   */
  async getById(challengeId: string): Promise<Challenge | null> {
    const result = await this.db.query(
      `SELECT * FROM challenges WHERE id = $1`,
      [challengeId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: any): Challenge {
    return {
      id: row.id,
      decisionId: row.decision_id,
      projectId: row.project_id,
      submittedBy: row.submitted_by,
      submittedAt: row.submitted_at,
      status: row.status,
      argument: row.argument,
      evidence: row.evidence,
      respondedBy: row.responded_by,
      respondedAt: row.responded_at,
      response: row.response,
      outcome: row.outcome,
    };
  }
}
