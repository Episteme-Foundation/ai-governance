import { Pool } from 'pg';
import { BaseRepository } from './base-repository';
import { WikiDraft } from '../../types';

export class WikiDraftRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async create(draft: Omit<WikiDraft, 'id'>): Promise<WikiDraft> {
    const id = `${draft.projectId}-draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = await this.query(
      `INSERT INTO wiki_drafts (
        id, project_id, type, page_path, proposed_content, original_content,
        proposed_by, edit_summary, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        id,
        draft.projectId,
        draft.type,
        draft.pagePath,
        draft.proposedContent,
        draft.originalContent || null,
        draft.proposedBy,
        draft.editSummary,
        draft.status,
      ]
    );

    return this.rowToDraft(result.rows[0]);
  }

  async getById(id: string): Promise<WikiDraft | null> {
    const result = await this.query('SELECT * FROM wiki_drafts WHERE id = $1', [id]);
    return result.rows[0] ? this.rowToDraft(result.rows[0]) : null;
  }

  async getPending(projectId: string): Promise<WikiDraft[]> {
    const result = await this.query(
      `SELECT * FROM wiki_drafts
       WHERE project_id = $1 AND status = 'pending'
       ORDER BY proposed_at ASC`,
      [projectId]
    );
    return result.rows.map((row) => this.rowToDraft(row));
  }

  async getByPage(projectId: string, pagePath: string): Promise<WikiDraft[]> {
    const result = await this.query(
      `SELECT * FROM wiki_drafts
       WHERE project_id = $1 AND page_path = $2
       ORDER BY proposed_at DESC`,
      [projectId, pagePath]
    );
    return result.rows.map((row) => this.rowToDraft(row));
  }

  async approve(
    id: string,
    reviewedBy: string,
    feedback?: string
  ): Promise<WikiDraft> {
    const result = await this.query(
      `UPDATE wiki_drafts
       SET status = 'approved',
           reviewed_by = $1,
           reviewed_at = NOW(),
           feedback = $2
       WHERE id = $3
       RETURNING *`,
      [reviewedBy, feedback || null, id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Draft ${id} not found`);
    }

    return this.rowToDraft(result.rows[0]);
  }

  async reject(id: string, reviewedBy: string, feedback: string): Promise<WikiDraft> {
    const result = await this.query(
      `UPDATE wiki_drafts
       SET status = 'rejected',
           reviewed_by = $1,
           reviewed_at = NOW(),
           feedback = $2
       WHERE id = $3
       RETURNING *`,
      [reviewedBy, feedback, id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Draft ${id} not found`);
    }

    return this.rowToDraft(result.rows[0]);
  }

  private rowToDraft(row: any): WikiDraft {
    return {
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      pagePath: row.page_path,
      proposedContent: row.proposed_content,
      originalContent: row.original_content,
      proposedBy: row.proposed_by,
      proposedAt: row.proposed_at.toISOString(),
      editSummary: row.edit_summary,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at?.toISOString(),
      feedback: row.feedback,
    };
  }
}
