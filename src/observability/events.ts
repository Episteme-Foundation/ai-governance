import { emitEvent, isTelemetryEnabled } from './telemetry';

/**
 * AI Governance Events
 *
 * Following Anthropic's Claude Code event patterns for consistency.
 * Events are emitted via OpenTelemetry logs/events protocol.
 */

/**
 * Emit when a new agent session starts
 */
export function emitSessionStart(params: {
  sessionId: string;
  projectId: string;
  role: string;
  trustLevel: string;
  intent: string;
}): void {
  emitEvent('ai_governance.session_start', {
    'session.id': params.sessionId,
    'project.id': params.projectId,
    'agent.role': params.role,
    'trust.level': params.trustLevel,
    'request.intent_length': params.intent.length,
  });
}

/**
 * Emit for each Claude API request
 */
export function emitApiRequest(params: {
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  durationMs: number;
  costUsd?: number;
}): void {
  emitEvent('ai_governance.api_request', {
    'session.id': params.sessionId,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    cache_read_tokens: params.cacheReadTokens || 0,
    cache_creation_tokens: params.cacheCreationTokens || 0,
    duration_ms: params.durationMs,
    cost_usd: params.costUsd || 0,
  });
}

/**
 * Emit when a tool is executed
 */
export function emitToolUse(params: {
  sessionId: string;
  toolName: string;
  server: string;
  success: boolean;
  durationMs: number;
  error?: string;
}): void {
  emitEvent('ai_governance.tool_use', {
    'session.id': params.sessionId,
    tool_name: params.toolName,
    server: params.server,
    success: params.success,
    duration_ms: params.durationMs,
    ...(params.error ? { error: params.error } : {}),
  });
}

/**
 * Emit when a tool use is denied by hooks
 */
export function emitToolDenied(params: {
  sessionId: string;
  toolName: string;
  reason: string;
  trustLevel: string;
}): void {
  emitEvent('ai_governance.tool_denied', {
    'session.id': params.sessionId,
    tool_name: params.toolName,
    reason: params.reason,
    'trust.level': params.trustLevel,
  });
}

/**
 * Emit when a decision is logged
 */
export function emitDecisionLogged(params: {
  sessionId: string;
  decisionId: string;
  actionType: string;
}): void {
  emitEvent('ai_governance.decision_logged', {
    'session.id': params.sessionId,
    'decision.id': params.decisionId,
    action_type: params.actionType,
  });
}

/**
 * Emit when a session ends
 */
export function emitSessionEnd(params: {
  sessionId: string;
  status: 'completed' | 'failed' | 'blocked';
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  error?: string;
}): void {
  emitEvent('ai_governance.session_end', {
    'session.id': params.sessionId,
    status: params.status,
    total_turns: params.totalTurns,
    total_input_tokens: params.totalInputTokens,
    total_output_tokens: params.totalOutputTokens,
    total_duration_ms: params.totalDurationMs,
    ...(params.error ? { error: params.error } : {}),
  });
}

/**
 * Emit API error event
 */
export function emitApiError(params: {
  sessionId: string;
  model: string;
  error: string;
  statusCode?: number;
  durationMs: number;
  attempt: number;
}): void {
  emitEvent('ai_governance.api_error', {
    'session.id': params.sessionId,
    model: params.model,
    error: params.error,
    status_code: params.statusCode || 0,
    duration_ms: params.durationMs,
    attempt: params.attempt,
  });
}
