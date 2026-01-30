import Anthropic from '@anthropic-ai/sdk';
import {
  isLangfuseEnabled,
  queryTraces,
  getTrace,
  queryScores,
  addScore,
  getMetrics,
} from '../../observability/langfuse';

/**
 * Langfuse MCP Server
 *
 * Provides tools for agents to inspect their own operations:
 * - Query past sessions/traces
 * - Analyze patterns in tool usage
 * - Add evaluation scores
 * - Get aggregated metrics
 *
 * This enables the self-improvement loop: agents can examine
 * what happened, evaluate quality, and propose improvements.
 */
export class LangfuseServer {
  /**
   * Get tool definitions for Claude API
   */
  getToolDefinitions(): Anthropic.Tool[] {
    if (!isLangfuseEnabled()) {
      return [];
    }

    return [
      {
        name: 'langfuse_query_traces',
        description:
          'Query past agent sessions/traces. Use this to find sessions by role, tag, time range, etc. Returns summary info about matching traces.',
        input_schema: {
          type: 'object' as const,
          properties: {
            name: {
              type: 'string',
              description: 'Filter by trace name (e.g., role name like "Maintainer", "Reception")',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags (e.g., ["pr-review", "elevated-trust"])',
            },
            from_timestamp: {
              type: 'string',
              description: 'Start of time range (ISO 8601 format)',
            },
            to_timestamp: {
              type: 'string',
              description: 'End of time range (ISO 8601 format)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of traces to return (default: 20)',
            },
          },
          required: [],
        },
      },
      {
        name: 'langfuse_get_trace',
        description:
          'Get detailed information about a specific trace/session, including all generations (LLM calls) and spans (tool uses).',
        input_schema: {
          type: 'object' as const,
          properties: {
            trace_id: {
              type: 'string',
              description: 'The trace ID to retrieve',
            },
          },
          required: ['trace_id'],
        },
      },
      {
        name: 'langfuse_query_scores',
        description:
          'Query evaluation scores attached to traces. Scores indicate quality assessments, success/failure, user feedback, etc.',
        input_schema: {
          type: 'object' as const,
          properties: {
            trace_id: {
              type: 'string',
              description: 'Filter by specific trace ID',
            },
            name: {
              type: 'string',
              description: 'Filter by score name (e.g., "quality", "success", "user_feedback")',
            },
            from_timestamp: {
              type: 'string',
              description: 'Start of time range (ISO 8601 format)',
            },
            to_timestamp: {
              type: 'string',
              description: 'End of time range (ISO 8601 format)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of scores to return (default: 50)',
            },
          },
          required: [],
        },
      },
      {
        name: 'langfuse_add_score',
        description:
          'Add an evaluation score to a trace or observation. Use this to record quality assessments, success/failure, or other evaluations.',
        input_schema: {
          type: 'object' as const,
          properties: {
            trace_id: {
              type: 'string',
              description: 'The trace ID to score',
            },
            observation_id: {
              type: 'string',
              description: 'Optional: specific observation (generation/span) within the trace to score',
            },
            name: {
              type: 'string',
              description: 'Score name (e.g., "quality", "success", "helpfulness", "decision_quality")',
            },
            value: {
              type: ['number', 'string', 'boolean'],
              description: 'Score value - numeric (0-1), categorical string, or boolean',
            },
            data_type: {
              type: 'string',
              enum: ['NUMERIC', 'CATEGORICAL', 'BOOLEAN'],
              description: 'Type of score value',
            },
            comment: {
              type: 'string',
              description: 'Optional comment explaining the score',
            },
          },
          required: ['trace_id', 'name', 'value'],
        },
      },
      {
        name: 'langfuse_get_metrics',
        description:
          'Get aggregated metrics about agent operations: token usage, costs, latencies, etc. Useful for understanding patterns across many sessions.',
        input_schema: {
          type: 'object' as const,
          properties: {
            trace_name: {
              type: 'string',
              description: 'Filter by trace name (role)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags',
            },
            from_timestamp: {
              type: 'string',
              description: 'Start of time range (ISO 8601 format)',
            },
            to_timestamp: {
              type: 'string',
              description: 'End of time range (ISO 8601 format)',
            },
            group_by: {
              type: 'string',
              enum: ['traceName', 'userId', 'model', 'day'],
              description: 'How to group the metrics',
            },
          },
          required: [],
        },
      },
      {
        name: 'langfuse_analyze_sessions',
        description:
          'High-level analysis helper: finds sessions matching criteria and provides summary statistics. Good starting point for self-evaluation.',
        input_schema: {
          type: 'object' as const,
          properties: {
            role: {
              type: 'string',
              description: 'Filter by agent role',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags',
            },
            days_back: {
              type: 'number',
              description: 'Look back this many days (default: 7)',
            },
            include_low_scores: {
              type: 'boolean',
              description: 'Focus on sessions with low quality scores',
            },
          },
          required: [],
        },
      },
    ];
  }

  /**
   * Execute a tool by name
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (!isLangfuseEnabled()) {
      return {
        error: 'Langfuse is not configured. Set LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY.',
      };
    }

    switch (toolName) {
      case 'langfuse_query_traces':
        return this.handleQueryTraces(args);
      case 'langfuse_get_trace':
        return this.handleGetTrace(args);
      case 'langfuse_query_scores':
        return this.handleQueryScores(args);
      case 'langfuse_add_score':
        return this.handleAddScore(args);
      case 'langfuse_get_metrics':
        return this.handleGetMetrics(args);
      case 'langfuse_analyze_sessions':
        return this.handleAnalyzeSessions(args);
      default:
        throw new Error(`Unknown Langfuse tool: ${toolName}`);
    }
  }

  private async handleQueryTraces(args: Record<string, unknown>) {
    const traces = await queryTraces({
      name: args.name as string | undefined,
      tags: args.tags as string[] | undefined,
      fromTimestamp: args.from_timestamp
        ? new Date(args.from_timestamp as string)
        : undefined,
      toTimestamp: args.to_timestamp
        ? new Date(args.to_timestamp as string)
        : undefined,
      limit: (args.limit as number) || 20,
    });

    return {
      count: traces.length,
      traces: traces.map((t: unknown) => {
        const trace = t as Record<string, unknown>;
        return {
          id: trace.id,
          name: trace.name,
          timestamp: trace.timestamp,
          tags: trace.tags,
          input: trace.input,
          output: trace.output,
          metadata: trace.metadata,
        };
      }),
    };
  }

  private async handleGetTrace(args: Record<string, unknown>) {
    const traceId = args.trace_id as string;
    if (!traceId) {
      return { error: 'trace_id is required' };
    }

    const trace = await getTrace(traceId);
    if (!trace) {
      return { error: `Trace not found: ${traceId}` };
    }

    return trace;
  }

  private async handleQueryScores(args: Record<string, unknown>) {
    const scores = await queryScores({
      traceId: args.trace_id as string | undefined,
      name: args.name as string | undefined,
      fromTimestamp: args.from_timestamp
        ? new Date(args.from_timestamp as string)
        : undefined,
      toTimestamp: args.to_timestamp
        ? new Date(args.to_timestamp as string)
        : undefined,
      limit: (args.limit as number) || 50,
    });

    return {
      count: scores.length,
      scores,
    };
  }

  private async handleAddScore(args: Record<string, unknown>) {
    const result = await addScore({
      traceId: args.trace_id as string,
      observationId: args.observation_id as string | undefined,
      name: args.name as string,
      value: args.value as number | string | boolean,
      dataType: args.data_type as 'NUMERIC' | 'CATEGORICAL' | 'BOOLEAN' | undefined,
      comment: args.comment as string | undefined,
    });

    return {
      success: true,
      score: result,
    };
  }

  private async handleGetMetrics(args: Record<string, unknown>) {
    const metrics = await getMetrics({
      traceName: args.trace_name as string | undefined,
      tags: args.tags as string[] | undefined,
      fromTimestamp: args.from_timestamp
        ? new Date(args.from_timestamp as string)
        : undefined,
      toTimestamp: args.to_timestamp
        ? new Date(args.to_timestamp as string)
        : undefined,
      groupBy: args.group_by as 'traceName' | 'userId' | 'model' | 'day' | undefined,
    });

    return metrics;
  }

  private async handleAnalyzeSessions(args: Record<string, unknown>) {
    const daysBack = (args.days_back as number) || 7;
    const fromTimestamp = new Date();
    fromTimestamp.setDate(fromTimestamp.getDate() - daysBack);

    // Get traces
    const traces = await queryTraces({
      name: args.role as string | undefined,
      tags: args.tags as string[] | undefined,
      fromTimestamp,
      limit: 100,
    });

    // Get scores for analysis
    const scores = await queryScores({
      fromTimestamp,
      limit: 500,
    });

    // Build analysis
    const traceIds = new Set(traces.map((t: unknown) => (t as Record<string, unknown>).id));
    const relevantScores = scores.filter(
      (s: unknown) => traceIds.has((s as Record<string, unknown>).traceId)
    );

    // Calculate statistics
    const scoresByName: Record<string, number[]> = {};
    for (const score of relevantScores as Array<Record<string, unknown>>) {
      const name = score.name as string;
      const value = score.value;
      if (typeof value === 'number') {
        if (!scoresByName[name]) scoresByName[name] = [];
        scoresByName[name].push(value);
      }
    }

    const scoreStats: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    for (const [name, values] of Object.entries(scoresByName)) {
      scoreStats[name] = {
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length,
      };
    }

    // Find low-scoring sessions if requested
    let lowScoringTraces: unknown[] = [];
    if (args.include_low_scores) {
      const lowScoreTraceIds = new Set(
        (relevantScores as Array<Record<string, unknown>>)
          .filter((s) => typeof s.value === 'number' && (s.value as number) < 0.5)
          .map((s) => s.traceId)
      );
      lowScoringTraces = traces.filter((t: unknown) =>
        lowScoreTraceIds.has((t as Record<string, unknown>).id)
      );
    }

    return {
      summary: {
        total_sessions: traces.length,
        time_range: {
          from: fromTimestamp.toISOString(),
          to: new Date().toISOString(),
        },
        days_analyzed: daysBack,
      },
      score_statistics: scoreStats,
      low_scoring_sessions: lowScoringTraces.length > 0
        ? {
            count: lowScoringTraces.length,
            sessions: lowScoringTraces.slice(0, 10).map((t: unknown) => {
              const trace = t as Record<string, unknown>;
              return {
                id: trace.id,
                name: trace.name,
                timestamp: trace.timestamp,
                input: trace.input,
              };
            }),
          }
        : undefined,
    };
  }
}
