import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { metrics } from '@opentelemetry/api';

/**
 * OpenTelemetry configuration for AI Governance
 *
 * Following Anthropic's Claude Code monitoring approach:
 * - Events emitted via console or OTEL logs protocol
 * - Metrics via OTEL metrics API
 * - Configurable via environment variables
 *
 * Note: This is a simplified implementation. For full OTEL SDK setup
 * with exporters, initialize externally and this module will use the
 * global providers.
 */

/**
 * Check if telemetry is enabled
 */
export function isTelemetryEnabled(): boolean {
  return process.env.AI_GOVERNANCE_ENABLE_TELEMETRY === '1';
}

/**
 * Initialize telemetry
 *
 * In a full setup, you'd initialize the OTEL SDK before calling this.
 * This just logs that telemetry is ready.
 */
export function initTelemetry(): void {
  if (!isTelemetryEnabled()) {
    console.log('[Telemetry] Disabled (set AI_GOVERNANCE_ENABLE_TELEMETRY=1 to enable)');
    return;
  }

  console.log('[Telemetry] Enabled');
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    console.log(`[Telemetry] OTLP endpoint: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
  } else {
    console.log('[Telemetry] Using console output (no OTEL_EXPORTER_OTLP_ENDPOINT set)');
  }
}

/**
 * Shutdown telemetry gracefully
 */
export async function shutdownTelemetry(): Promise<void> {
  if (!isTelemetryEnabled()) {
    return;
  }
  console.log('[Telemetry] Shutdown');
}

/**
 * Get the logger for emitting events
 */
export function getLogger(name: string = 'ai-governance') {
  return logs.getLogger(name);
}

/**
 * Get the meter for recording metrics
 */
export function getMeter(name: string = 'ai-governance') {
  return metrics.getMeter(name);
}

/**
 * Emit an event
 *
 * If OTEL is fully configured, emits via OTEL logs.
 * Otherwise, logs to console in a structured format.
 */
export function emitEvent(
  eventName: string,
  attributes: Record<string, string | number | boolean>
): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  const event = {
    name: eventName,
    timestamp: new Date().toISOString(),
    ...attributes,
  };

  // Try OTEL logs first
  try {
    const logger = getLogger();
    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
      body: eventName,
      attributes: {
        'event.name': eventName,
        'event.timestamp': event.timestamp,
        ...attributes,
      },
    });
  } catch {
    // Fall back to console if OTEL not configured
    console.log(`[Event] ${eventName}`, JSON.stringify(event));
  }
}
