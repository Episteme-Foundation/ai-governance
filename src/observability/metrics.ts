import type { Counter, Histogram } from '@opentelemetry/api';
import { getMeter, isTelemetryEnabled } from './telemetry';

/**
 * AI Governance Metrics
 *
 * Following Anthropic's Claude Code metrics patterns.
 * Metrics are recorded via OpenTelemetry API.
 */

const getMeterInstance = () => getMeter();

// Counters
let sessionCounter: Counter | null = null;
let tokenCounter: Counter | null = null;
let costCounter: Counter | null = null;
let toolCounter: Counter | null = null;
let decisionCounter: Counter | null = null;

// Histograms
let apiDurationHistogram: Histogram | null = null;
let toolDurationHistogram: Histogram | null = null;

/**
 * Initialize metrics instruments
 * Call this after telemetry is initialized
 */
export function initMetrics(): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  const meter = getMeterInstance();

  sessionCounter = meter.createCounter('ai_governance.session.count', {
    description: 'Count of agent sessions started',
    unit: 'count',
  });

  tokenCounter = meter.createCounter('ai_governance.token.usage', {
    description: 'Number of tokens used',
    unit: 'tokens',
  });

  costCounter = meter.createCounter('ai_governance.cost.usage', {
    description: 'Estimated cost in USD',
    unit: 'USD',
  });

  toolCounter = meter.createCounter('ai_governance.tool.count', {
    description: 'Count of tool executions',
    unit: 'count',
  });

  decisionCounter = meter.createCounter('ai_governance.decision.count', {
    description: 'Count of decisions logged',
    unit: 'count',
  });

  apiDurationHistogram = meter.createHistogram('ai_governance.api.duration', {
    description: 'API request duration in milliseconds',
    unit: 'ms',
  });

  toolDurationHistogram = meter.createHistogram('ai_governance.tool.duration', {
    description: 'Tool execution duration in milliseconds',
    unit: 'ms',
  });
}

/**
 * Record a new session
 */
export function recordSession(attributes: {
  role: string;
  trustLevel: string;
}): void {
  sessionCounter?.add(1, {
    'agent.role': attributes.role,
    'trust.level': attributes.trustLevel,
  });
}

/**
 * Record token usage
 */
export function recordTokens(
  type: 'input' | 'output' | 'cache_read' | 'cache_creation',
  count: number,
  attributes: { model: string }
): void {
  tokenCounter?.add(count, {
    type,
    model: attributes.model,
  });
}

/**
 * Record cost
 */
export function recordCost(costUsd: number, attributes: { model: string }): void {
  costCounter?.add(costUsd, {
    model: attributes.model,
  });
}

/**
 * Record tool execution
 */
export function recordToolUse(attributes: {
  toolName: string;
  server: string;
  success: boolean;
  durationMs: number;
}): void {
  toolCounter?.add(1, {
    tool_name: attributes.toolName,
    server: attributes.server,
    success: String(attributes.success),
  });

  toolDurationHistogram?.record(attributes.durationMs, {
    tool_name: attributes.toolName,
    server: attributes.server,
  });
}

/**
 * Record decision logged
 */
export function recordDecision(attributes: { actionType: string }): void {
  decisionCounter?.add(1, {
    action_type: attributes.actionType,
  });
}

/**
 * Record API request duration
 */
export function recordApiDuration(durationMs: number, attributes: { model: string }): void {
  apiDurationHistogram?.record(durationMs, {
    model: attributes.model,
  });
}
