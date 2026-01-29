import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

export function initializeDatabase(connectionString: string): Pool {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
  });

  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return pool;
}

export async function query(text: string, params?: unknown[]) {
  return getPool().query(text, params);
}

export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
