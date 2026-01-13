import { randomUUID } from 'crypto';
import { getActivePolicy, resolvePolicyConfig, applyPiiPolicy } from '@/lib/winter/policy';
import type {
  TraceHandle,
  TraceStartParams,
  RetrievalEventType,
  TraceSummary,
  FlightRecorderConfig,
} from './types';
import { SupabaseFlightRecorder } from './supabase';
import {
  maskExtendedPII,
  maskPayloadPII,
  maskChunkText,
  DEFAULT_PII_MASKING_CONFIG,
} from './pii-safe';
import {
  shouldSample,
  recordMetricsSample,
  DEFAULT_SAMPLING_CONFIG,
} from './sampling';

export interface FlightRecorder {
  start(params: TraceStartParams): Promise<TraceHandle>;
  event(handle: TraceHandle, type: RetrievalEventType, payload: Record<string, unknown>): void;
  finish(handle: TraceHandle, summary?: TraceSummary): Promise<void>;
}

// Global configuration (can be set at startup)
let globalConfig: FlightRecorderConfig = {};

/**
 * Configure the flight recorder globally
 */
export function configureFlightRecorder(config: FlightRecorderConfig): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get current flight recorder configuration
 */
export function getFlightRecorderConfig(): FlightRecorderConfig {
  return { ...globalConfig };
}

/**
 * @deprecated Use dynamic sampling via shouldSample() instead
 */
function _sampleRateForPlan(plan: string): number {
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
 * Uses dynamic sampling based on tier, error rate, and latency.
 */
export async function startTrace(
  params: TraceStartParams,
  config?: FlightRecorderConfig
): Promise<TraceHandle> {
  const traceId = randomUUID();
  const startedAtMs = Date.now();
  const cfg = { ...globalConfig, ...config };
  const piiConfig = { ...DEFAULT_PII_MASKING_CONFIG, ...cfg.piiMasking };
  const samplingConfig = { ...DEFAULT_SAMPLING_CONFIG, ...cfg.sampling };

  // Dynamic sampling decision
  const samplingDecision = shouldSample(
    params.userId,
    params.requestId,
    params.plan,
    samplingConfig
  );

  // If not sampled, skip all extra work.
  if (!samplingDecision.sampled) {
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
      samplingInfo: {
        rate: samplingDecision.rate,
        reason: samplingDecision.reason,
      },
    };
  }

  // Apply Winter policy (pii + storeText) AND extended PII masking
  let queryText: string | undefined = params.queryText;

  if (params.queryText && piiConfig.maskQueryText) {
    try {
      // First apply Winter policy
      const policyRecord = await getActivePolicy(params.userId, 'pii', 'user');
      const policyCfg = resolvePolicyConfig(policyRecord);

      if (policyCfg.storeText === false) {
        queryText = undefined;
      } else {
        const pii = applyPiiPolicy(params.queryText, policyCfg);
        queryText = pii.storedText ?? undefined;

        // Then apply extended PII masking (configurable patterns)
        if (queryText) {
          const { maskedText } = maskExtendedPII(queryText, piiConfig);
          queryText = maskedText;
        }
      }
    } catch {
      // If policy lookup fails, still apply extended PII masking
      if (params.queryText) {
        const { maskedText } = maskExtendedPII(params.queryText, piiConfig);
        queryText = maskedText;
      }
    }
  }

  if (cfg.debug) {
    console.log('[FlightRecorder] startTrace', {
      traceId,
      requestId: params.requestId,
      samplingDecision,
      queryTextMasked: queryText !== params.queryText,
    });
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
    samplingInfo: {
      rate: samplingDecision.rate,
      reason: samplingDecision.reason,
    },
  };
}

/**
 * Add an event to the trace with optional PII masking
 */
export function addEvent(
  handle: TraceHandle,
  type: RetrievalEventType,
  payload: Record<string, unknown>,
  config?: FlightRecorderConfig
): void {
  if (!handle.sampled) return;

  const cfg = { ...globalConfig, ...config };
  const piiConfig = { ...DEFAULT_PII_MASKING_CONFIG, ...cfg.piiMasking };

  // Mask PII in event payload
  let maskedPayload = payload;
  let piiMasked = false;

  if (piiConfig.maskEventPayloads) {
    maskedPayload = maskPayloadPII(payload, piiConfig);
    // Check if any masking occurred
    piiMasked = JSON.stringify(maskedPayload) !== JSON.stringify(payload);
  }

  handle.events.push({
    type,
    ts: new Date().toISOString(),
    payload: maskedPayload,
    piiMasked,
  });

  if (cfg.debug) {
    console.log('[FlightRecorder] addEvent', {
      traceId: handle.traceId,
      type,
      piiMasked,
    });
  }
}

/**
 * Add a context event with chunk texts (PII-masked)
 */
export function addContextEvent(
  handle: TraceHandle,
  chunks: Array<{ id: string; text: string; metadata?: Record<string, unknown> }>,
  config?: FlightRecorderConfig
): void {
  if (!handle.sampled) return;

  const cfg = { ...globalConfig, ...config };
  const piiConfig = { ...DEFAULT_PII_MASKING_CONFIG, ...cfg.piiMasking };

  // Mask chunk texts if configured
  const maskedChunks = piiConfig.maskChunkText
    ? chunks.map((chunk) => {
        const { text, piiDetected } = maskChunkText(chunk.text, piiConfig);
        const maskedMetadata = chunk.metadata
          ? maskPayloadPII(chunk.metadata, piiConfig)
          : undefined;
        return {
          id: chunk.id,
          text,
          metadata: maskedMetadata,
          piiMasked: piiDetected,
        };
      })
    : chunks.map((chunk) => ({
        id: chunk.id,
        text: chunk.text,
        metadata: chunk.metadata,
        piiMasked: false,
      }));

  const anyPiiMasked = maskedChunks.some((c) => c.piiMasked);

  handle.events.push({
    type: 'context',
    ts: new Date().toISOString(),
    payload: {
      chunks: maskedChunks,
      chunkCount: maskedChunks.length,
    },
    piiMasked: anyPiiMasked,
  });

  if (cfg.debug) {
    console.log('[FlightRecorder] addContextEvent', {
      traceId: handle.traceId,
      chunkCount: chunks.length,
      anyPiiMasked,
    });
  }
}

/**
 * Flush to storage and record metrics for sampling.
 *
 * IMPORTANT: In serverless runtimes, do not rely on background writes.
 * Callers should await finishTrace() when they need durability.
 */
export async function finishTrace(
  handle: TraceHandle,
  summary?: TraceSummary,
  config?: FlightRecorderConfig
): Promise<void> {
  const cfg = { ...globalConfig, ...config };
  const piiConfig = { ...DEFAULT_PII_MASKING_CONFIG, ...cfg.piiMasking };

  // Record metrics for dynamic sampling (even for non-sampled requests)
  const latencyMs = Date.now() - handle.startedAtMs;
  const isError = !!summary?.error;

  recordMetricsSample(handle.base.userId, isError, latencyMs, cfg.sampling);

  if (!handle.sampled) return;

  // Mask chunk texts in summary if present
  let maskedSummary = summary;
  if (summary?.chunkTexts && piiConfig.maskChunkText) {
    maskedSummary = {
      ...summary,
      chunkTexts: summary.chunkTexts.map(
        (text) => maskChunkText(text, piiConfig).text
      ),
    };
  }

  const recorder = await createFlightRecorder();
  await recorder.finish(handle, maskedSummary);

  if (cfg.debug) {
    console.log('[FlightRecorder] finishTrace', {
      traceId: handle.traceId,
      latencyMs,
      isError,
      eventCount: handle.events.length,
    });
  }
}

// Re-export for convenience
export { shouldSample, recordMetricsSample } from './sampling';
export { maskExtendedPII, maskChunkText, maskPayloadPII } from './pii-safe';
