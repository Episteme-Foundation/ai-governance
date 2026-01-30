/**
 * Observability Module
 *
 * OpenTelemetry-based observability for AI Governance,
 * following Anthropic's Claude Code monitoring approach.
 */

export {
  initTelemetry,
  shutdownTelemetry,
  isTelemetryEnabled,
  emitEvent,
  getLogger,
} from './telemetry';

export {
  emitSessionStart,
  emitSessionEnd,
  emitApiRequest,
  emitApiError,
  emitToolUse,
  emitToolDenied,
  emitDecisionLogged,
} from './events';

export {
  initMetrics,
  recordSession,
  recordTokens,
  recordCost,
  recordToolUse,
  recordDecision,
  recordApiDuration,
} from './metrics';

export {
  isLangfuseEnabled,
  getLangfuse,
  createTrace,
  createGeneration,
  createSpan,
  addScore,
  flushLangfuse,
  shutdownLangfuse,
  queryTraces,
  getTrace,
  queryScores,
  getMetrics,
} from './langfuse';
