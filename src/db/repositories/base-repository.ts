import { Pool } from 'pg';

export abstract class BaseRepository {
  constructor(protected pool: Pool) {}

  protected async query(text: string, params?: unknown[]) {
    return this.pool.query(text, params);
  }

  protected async transaction<T>(callback: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
