import { createHash, randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import type { FlightRecorder } from './recorder';
import type { TraceHandle, TraceSummary, TraceStartParams, RetrievalEventType } from './types';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Supabase-backed Flight Recorder.
 *
 * NOTE: The recommended integration path is:
 * - startTrace() / addEvent() / finishTrace()
 * This class exists so the implementation can be swapped later (Kafka, ClickHouse, etc).
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
    const queryHash = queryText ? sha256(queryText) : null;

    const tracePayload = {
      request_id: handle.requestId,
      user_id: handle.base.userId,
      api_key_id: handle.base.apiKeyId ?? null,
      plan: handle.base.plan ?? 'free',
      collection_id: handle.base.collectionId ?? null,
      collection_ids: handle.base.collectionIds ?? null,
      query_text: queryText ?? null,
      query_hash: queryHash,
      autopilot_reason: summary?.autopilotReason ?? null,
      effective_config: summary?.effectiveConfig ?? {},
      timings_ms: summary?.timingsMs ?? {},
      results_count: summary?.resultsCount ?? 0,
      error: summary?.error ?? null,
      sampled: true,
      experiment_id: summary?.experimentId ?? null,
      arm_id: summary?.armId ?? null,
      trace: {
        trace_id: handle.traceId,
        started_at: new Date(handle.startedAtMs).toISOString(),
        autopilot: {
          enabled: handle.base.autopilotEnabled ?? true,
        },
        events: handle.events,
      },
    };

    const { error } = await supabase.from('fall_retrieval_traces').insert(tracePayload);
    if (error) throw error;
  }
}
