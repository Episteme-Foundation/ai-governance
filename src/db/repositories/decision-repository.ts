import { Pool } from 'pg';
import { BaseRepository } from './base-repository';
import { Decision, DecisionSearchResult } from '../../types';

export class DecisionRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async create(decision: Omit<Decision, 'id'>): Promise<Decision> {
    const paddedNumber = decision.decisionNumber.toString().padStart(4, '0');
    const id = `${decision.project}-${paddedNumber}`;

    const embeddingStr = decision.embedding
      ? `[${decision.embedding.join(',')}]`
      : null;

    const result = await this.query(
      `INSERT INTO decisions (
        id, decision_number, project_id, title, date, status, decision_maker,
        decision, reasoning, considerations, uncertainties, reversibility,
        would_change_if, embedding, related_decisions, tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        id,
        decision.decisionNumber,
        decision.project,
        decision.title,
        decision.date,
        decision.status,
        decision.decisionMaker,
        decision.decision,
        decision.reasoning,
        decision.considerations,
        decision.uncertainties,
        decision.reversibility,
        decision.wouldChangeIf,
        embeddingStr,
        decision.relatedDecisions || [],
        decision.tags || [],
      ]
    );

    return this.rowToDecision(result.rows[0]);
  }

  async getById(id: string): Promise<Decision | null> {
    const result = await this.query('SELECT * FROM decisions WHERE id = $1', [id]);
    return result.rows[0] ? this.rowToDecision(result.rows[0]) : null;
  }

  async getByProject(projectId: string, limit = 100): Promise<Decision[]> {
    const result = await this.query(
      `SELECT * FROM decisions
       WHERE project_id = $1
       ORDER BY decision_number DESC
       LIMIT $2`,
      [projectId, limit]
    );
    return result.rows.map((row) => this.rowToDecision(row));
  }

  async semanticSearch(
    projectId: string,
    embedding: number[],
    limit = 10,
    threshold = 0.7
  ): Promise<DecisionSearchResult[]> {
    const embeddingStr = `[${embedding.join(',')}]`;
    const result = await this.query(
      `SELECT *, 1 - (embedding <=> $1::vector) AS similarity
       FROM decisions
       WHERE project_id = $2
         AND embedding IS NOT NULL
         AND 1 - (embedding <=> $1::vector) >= $3
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      [embeddingStr, projectId, threshold, limit]
    );

    return result.rows.map((row) => ({
      decision: this.rowToDecision(row),
      similarity: parseFloat(row.similarity),
    }));
  }

  async update(id: string, updates: Partial<Decision>): Promise<Decision> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (updates.status) {
      fields.push(`status = \$${paramCount++}`);
      values.push(updates.status);
    }
    if (updates.embedding) {
      fields.push(`embedding = \$${paramCount++}`);
      values.push(`[${updates.embedding.join(',')}]`);
    }
    if (updates.relatedDecisions) {
      fields.push(`related_decisions = \$${paramCount++}`);
      values.push(updates.relatedDecisions);
    }
    if (updates.tags) {
      fields.push(`tags = \$${paramCount++}`);
      values.push(updates.tags);
    }

    if (fields.length === 0) {
      const existing = await this.getById(id);
      if (!existing) throw new Error(`Decision ${id} not found`);
      return existing;
    }

    values.push(id);
    const result = await this.query(
      `UPDATE decisions SET ${fields.join(', ')} WHERE id = \$${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error(`Decision ${id} not found`);
    }

    return this.rowToDecision(result.rows[0]);
  }

  async getNextDecisionNumber(projectId: string): Promise<number> {
    const result = await this.query(
      'SELECT COALESCE(MAX(decision_number), 0) + 1 AS next_number FROM decisions WHERE project_id = $1',
      [projectId]
    );
    return result.rows[0].next_number;
  }

  private rowToDecision(row: any): Decision {
    return {
      id: row.id,
      decisionNumber: row.decision_number,
      title: row.title,
      date: row.date,
      status: row.status,
      decisionMaker: row.decision_maker,
      project: row.project_id,
      decision: row.decision,
      reasoning: row.reasoning,
      considerations: row.considerations,
      uncertainties: row.uncertainties,
      reversibility: row.reversibility,
      wouldChangeIf: row.would_change_if,
      embedding: row.embedding,
      relatedDecisions: row.related_decisions,
      tags: row.tags,
    };
  }
}
