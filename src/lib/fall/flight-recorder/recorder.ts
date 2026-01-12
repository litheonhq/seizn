import { randomUUID } from 'crypto';
import { getActivePolicy, resolvePolicyConfig, applyPiiPolicy } from '@/lib/winter/policy';
import type { TraceHandle, TraceStartParams, RetrievalEventType, TraceSummary } from './types';
import { SupabaseFlightRecorder } from './supabase';

export interface FlightRecorder {
  start(params: TraceStartParams): Promise<TraceHandle>;
  event(handle: TraceHandle, type: RetrievalEventType, payload: Record<string, unknown>): void;
  finish(handle: TraceHandle, summary?: TraceSummary): Promise<void>;
}

function sampleRateForPlan(plan: string): number {
  // Tweakable: keep storage cost bounded on free plans.
  switch ((plan ?? 'free').toLowerCase()) {
    case 'enterprise':
      return 1.0;
    case 'pro':
      return 0.5;
    case 'plus':
      return 0.25;
    default:
      return 0.1;
  }
}

export async function createFlightRecorder(): Promise<FlightRecorder> {
  return new SupabaseFlightRecorder();
}

/**
 * Create a trace handle with a standardized schema.
 * Applies Winter policy for query text retention/PII masking.
 */
export async function startTrace(params: TraceStartParams): Promise<TraceHandle> {
  const traceId = randomUUID();
  const startedAtMs = Date.now();

  const sampled = Math.random() < sampleRateForPlan(params.plan);

  // If not sampled, skip all extra work.
  if (!sampled) {
    return {
      traceId,
      requestId: params.requestId,
      startedAtMs,
      sampled: false,
      events: [],
      base: {
        ...params,
        queryText: undefined,
      },
    };
  }

  // Apply Winter policy (pii + storeText)
  let queryText: string | undefined = params.queryText;

  if (params.queryText) {
    try {
      const policyRecord = await getActivePolicy(params.userId, 'pii', 'user');
      const cfg = resolvePolicyConfig(policyRecord);

      if (cfg.storeText === false) {
        queryText = undefined;
      } else {
        const pii = applyPiiPolicy(params.queryText, cfg);
        queryText = pii.storedText ?? undefined;
      }
    } catch {
      // If policy lookup fails, fall back to storing hashed query only.
      queryText = undefined;
    }
  }

  return {
    traceId,
    requestId: params.requestId,
    startedAtMs,
    sampled: true,
    events: [],
    base: {
      ...params,
      queryText,
    },
  };
}

export function addEvent(handle: TraceHandle, type: RetrievalEventType, payload: Record<string, unknown>): void {
  if (!handle.sampled) return;

  handle.events.push({
    type,
    ts: new Date().toISOString(),
    payload,
  });
}

/**
 * Flush to storage.
 *
 * IMPORTANT: In serverless runtimes, do not rely on background writes.
 * Callers should `await finishTrace()` when they need durability.
 */
export async function finishTrace(handle: TraceHandle, summary?: TraceSummary): Promise<void> {
  if (!handle.sampled) return;

  const recorder = await createFlightRecorder();
  await recorder.finish(handle, summary);
}
