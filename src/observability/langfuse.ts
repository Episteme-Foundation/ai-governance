import Langfuse from 'langfuse';

/**
 * Langfuse Client for AI Governance
 *
 * Provides:
 * 1. Trace creation for agent sessions
 * 2. Query API for agents to inspect their own operations
 * 3. Score attachment for evaluations
 */

let langfuseClient: Langfuse | null = null;

/**
 * Check if Langfuse is enabled
 */
export function isLangfuseEnabled(): boolean {
  return !!(
    process.env.LANGFUSE_SECRET_KEY &&
    process.env.LANGFUSE_PUBLIC_KEY
  );
}

/**
 * Get or create the Langfuse client
 */
export function getLangfuse(): Langfuse | null {
  if (!isLangfuseEnabled()) {
    return null;
  }

  if (!langfuseClient) {
    langfuseClient = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    });
  }

  return langfuseClient;
}

/**
 * Create a trace for an agent session
 */
export function createTrace(params: {
  id: string;
  name: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  input?: unknown;
}) {
  const langfuse = getLangfuse();
  if (!langfuse) return null;

  return langfuse.trace({
    id: params.id,
    name: params.name,
    sessionId: params.sessionId,
    userId: params.userId,
    metadata: params.metadata,
    tags: params.tags,
    input: params.input,
  });
}

/**
 * Create a generation span within a trace
 */
export function createGeneration(
  trace: ReturnType<Langfuse['trace']>,
  params: {
    name: string;
    model: string;
    modelParameters?: Record<string, unknown>;
    input?: unknown;
    output?: unknown;
    usage?: {
      input?: number;
      output?: number;
      total?: number;
    };
    metadata?: Record<string, unknown>;
  }
) {
  if (!trace) return null;

  return trace.generation({
    name: params.name,
    model: params.model,
    modelParameters: params.modelParameters as Record<string, string | number | boolean | string[] | null> | undefined,
    input: params.input,
    output: params.output,
    usage: params.usage,
    metadata: params.metadata as Record<string, string | number | boolean | string[] | null> | undefined,
  });
}

/**
 * Create a span for tool execution
 */
export function createSpan(
  trace: ReturnType<Langfuse['trace']>,
  params: {
    name: string;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
  }
) {
  if (!trace) return null;

  return trace.span({
    name: params.name,
    input: params.input,
    output: params.output,
    metadata: params.metadata,
  });
}

/**
 * Add a score to a trace or observation
 */
export async function addScore(params: {
  traceId: string;
  observationId?: string;
  name: string;
  value: number | string | boolean;
  comment?: string;
  dataType?: 'NUMERIC' | 'CATEGORICAL' | 'BOOLEAN';
}) {
  const langfuse = getLangfuse();
  if (!langfuse) return null;

  // Convert boolean to number for Langfuse score API
  const scoreValue = typeof params.value === 'boolean'
    ? (params.value ? 1 : 0)
    : params.value;

  return langfuse.score({
    traceId: params.traceId,
    observationId: params.observationId,
    name: params.name,
    value: scoreValue,
    comment: params.comment,
    dataType: params.dataType,
  });
}

/**
 * Flush pending events to Langfuse
 */
export async function flushLangfuse(): Promise<void> {
  const langfuse = getLangfuse();
  if (langfuse) {
    await langfuse.flushAsync();
  }
}

/**
 * Shutdown Langfuse client
 */
export async function shutdownLangfuse(): Promise<void> {
  const langfuse = getLangfuse();
  if (langfuse) {
    await langfuse.shutdownAsync();
    langfuseClient = null;
  }
}

// ============================================================
// Query API - For agents to inspect their own operations
// ============================================================

/**
 * Query traces with filters
 * Note: This uses the Langfuse API directly
 */
export async function queryTraces(params: {
  name?: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  fromTimestamp?: Date;
  toTimestamp?: Date;
  limit?: number;
  page?: number;
}): Promise<unknown[]> {
  const langfuse = getLangfuse();
  if (!langfuse) return [];

  // Use the fetch API to query Langfuse directly
  // The SDK doesn't expose query methods directly in all versions
  const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';
  const auth = Buffer.from(
    `${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`
  ).toString('base64');

  const queryParams = new URLSearchParams();
  if (params.name) queryParams.set('name', params.name);
  if (params.userId) queryParams.set('userId', params.userId);
  if (params.sessionId) queryParams.set('sessionId', params.sessionId);
  if (params.tags) queryParams.set('tags', params.tags.join(','));
  if (params.fromTimestamp) queryParams.set('fromTimestamp', params.fromTimestamp.toISOString());
  if (params.toTimestamp) queryParams.set('toTimestamp', params.toTimestamp.toISOString());
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.page) queryParams.set('page', String(params.page));

  const response = await fetch(`${baseUrl}/api/public/traces?${queryParams}`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Langfuse API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { data?: unknown[] };
  return data.data || [];
}

/**
 * Get a specific trace by ID
 */
export async function getTrace(traceId: string): Promise<unknown | null> {
  const langfuse = getLangfuse();
  if (!langfuse) return null;

  const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';
  const auth = Buffer.from(
    `${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`
  ).toString('base64');

  const response = await fetch(`${baseUrl}/api/public/traces/${traceId}`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Langfuse API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Query scores with filters
 */
export async function queryScores(params: {
  traceId?: string;
  name?: string;
  userId?: string;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  limit?: number;
  page?: number;
}): Promise<unknown[]> {
  const langfuse = getLangfuse();
  if (!langfuse) return [];

  const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';
  const auth = Buffer.from(
    `${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`
  ).toString('base64');

  const queryParams = new URLSearchParams();
  if (params.traceId) queryParams.set('traceId', params.traceId);
  if (params.name) queryParams.set('name', params.name);
  if (params.userId) queryParams.set('userId', params.userId);
  if (params.fromTimestamp) queryParams.set('fromTimestamp', params.fromTimestamp.toISOString());
  if (params.toTimestamp) queryParams.set('toTimestamp', params.toTimestamp.toISOString());
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.page) queryParams.set('page', String(params.page));

  const response = await fetch(`${baseUrl}/api/public/scores?${queryParams}`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Langfuse API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { data?: unknown[] };
  return data.data || [];
}

/**
 * Get aggregated metrics
 */
export async function getMetrics(params: {
  traceName?: string;
  tags?: string[];
  fromTimestamp?: Date;
  toTimestamp?: Date;
  groupBy?: 'traceName' | 'userId' | 'model' | 'day';
}): Promise<unknown> {
  const langfuse = getLangfuse();
  if (!langfuse) return null;

  const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';
  const auth = Buffer.from(
    `${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`
  ).toString('base64');

  const queryParams = new URLSearchParams();
  if (params.traceName) queryParams.set('traceName', params.traceName);
  if (params.tags) queryParams.set('tags', params.tags.join(','));
  if (params.fromTimestamp) queryParams.set('fromTimestamp', params.fromTimestamp.toISOString());
  if (params.toTimestamp) queryParams.set('toTimestamp', params.toTimestamp.toISOString());
  if (params.groupBy) queryParams.set('groupBy', params.groupBy);

  const response = await fetch(`${baseUrl}/api/public/metrics/daily?${queryParams}`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Langfuse API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
