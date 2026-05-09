import { createHash, randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { queueTraceForExport, isOTelEnabled } from '@/lib/otel';
import { sanitizeForLogs } from '@/lib/server/logger';
import type { FlightRecorder } from './recorder';
import type { TraceHandle, TraceSummary, TraceStartParams, RetrievalEventType, StoredTrace, TraceConfig } from './types';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Supabase-backed Flight Recorder.
 *
 * NOTE: The recommended integration path is:
 * - startTrace() / addEvent() / finishTrace()
 * This class exists so the implementation can be swapped later (Kafka, ClickHouse, etc).
 *
 * OTEL Export:
 * When OTEL_EXPORTER_ENABLED=true, traces are also exported to the configured
 * OTLP endpoint for external observability tools (Jaeger, Datadog, Grafana, etc).
 */
export class SupabaseFlightRecorder implements FlightRecorder {
  async start(params: TraceStartParams): Promise<TraceHandle> {
    // Fallback: minimal handle (no policy application). Prefer startTrace().
    return {
      traceId: randomUUID(),
      requestId: params.requestId,
      startedAtMs: Date.now(),
      sampled: true,
      events: [],
      spans: [],
      base: params,
    };
  }

  event(handle: TraceHandle, type: RetrievalEventType, payload: Record<string, unknown>): void {
    if (!handle.sampled) return;
    handle.events.push({
      type,
      ts: new Date().toISOString(),
      payload,
    });
  }

  async finish(handle: TraceHandle, summary?: TraceSummary): Promise<void> {
    const supabase = createServerClient();

    const queryText = handle.base.queryText;
    const sanitizedQueryText = queryText ? String(sanitizeForLogs(queryText)) : null;
    const queryHash = queryText ? sha256(queryText) : null;
    const now = new Date();
    const endedAt = now.toISOString();
    const totalDurationMs = now.getTime() - handle.startedAtMs;

    const tracePayload = {
      request_id: handle.requestId,
      user_id: handle.base.userId,
      api_key_id: handle.base.apiKeyId ?? null,
      plan: handle.base.plan ?? 'free',
      collection_id: handle.base.collectionId ?? null,
      collection_ids: handle.base.collectionIds ?? null,
      query_text: sanitizedQueryText,
      query_hash: queryHash,
      autopilot_reason: summary?.autopilotReason ?? null,
      effective_config: sanitizeForLogs(summary?.effectiveConfig ?? {}),
      timings_ms: sanitizeForLogs(summary?.timingsMs ?? {}),
      results_count: summary?.resultsCount ?? 0,
      error: sanitizeForLogs(summary?.error ?? null),
      sampled: true,
      experiment_id: summary?.experimentId ?? null,
      arm_id: summary?.armId ?? null,
      trace: sanitizeForLogs({
        trace_id: handle.traceId,
        started_at: new Date(handle.startedAtMs).toISOString(),
        ended_at: endedAt,
        total_duration_ms: totalDurationMs,
        autopilot: {
          enabled: handle.base.autopilotEnabled ?? true,
        },
        events: handle.events,
        spans: handle.spans,
        cost: summary?.cost,
        result_stats: summary?.resultStats,
      }),
    };

    const { error } = await supabase.from('fall_retrieval_traces').insert(tracePayload);
    if (error) throw error;

    // Export to OTEL if enabled
    if (isOTelEnabled()) {
      try {
        const storedTrace = this.convertToStoredTrace(handle, summary, tracePayload);
        queueTraceForExport(storedTrace);
      } catch (otelError) {
        // Log but don't fail the main trace storage
        console.error('[SupabaseFlightRecorder] OTEL export error:', otelError);
      }
    }
  }

  /**
   * Convert internal trace payload to StoredTrace format for OTEL export
   */
  private convertToStoredTrace(
    handle: TraceHandle,
    summary: TraceSummary | undefined,
    tracePayload: Record<string, unknown>
  ): StoredTrace {
    const now = new Date();
    const endedAt = now.toISOString();
    const totalDurationMs = now.getTime() - handle.startedAtMs;

    return {
      id: handle.traceId,
      requestId: handle.requestId,
      userId: handle.base.userId,
      apiKeyId: handle.base.apiKeyId,
      plan: handle.base.plan,
      collectionId: handle.base.collectionId,
      collectionIds: handle.base.collectionIds,
      queryText: handle.base.queryText,
      queryHash: tracePayload.query_hash as string | undefined,
      autopilotReason: summary?.autopilotReason,
      effectiveConfig: (summary?.effectiveConfig as TraceConfig) || {},
      timingsMs: summary?.timingsMs || {},
      resultsCount: summary?.resultsCount || 0,
      error: summary?.error,
      sampled: handle.sampled,
      experimentId: summary?.experimentId,
      armId: summary?.armId,
      trace: {
        traceId: handle.traceId,
        startedAt: new Date(handle.startedAtMs).toISOString(),
        endedAt,
        totalDurationMs,
        autopilot: {
          enabled: handle.base.autopilotEnabled ?? true,
          reason: summary?.autopilotReason,
        },
        config: (summary?.effectiveConfig as TraceConfig) || {},
        spans: handle.spans,
        events: handle.events,
        resultStats: summary?.resultStats,
        cost: summary?.cost,
      },
      createdAt: now.toISOString(),
    };
  }
}
