import { randomUUID } from 'crypto';
import { getActivePolicy, resolvePolicyConfig, applyPiiPolicy } from '@/lib/winter/policy';
import type {
  TraceHandle,
  TraceStartParams,
  RetrievalEventType,
  TraceSummary,
  FlightRecorderConfig,
  Span,
  SpanName,
  TraceCost,
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

// Default cost rates for estimation
const DEFAULT_COST_RATES = {
  embeddingPerToken: 0.00001,
  vectorSearchPerOp: 0.000001,
  rerankPerItem: 0.00002,
  llmInputPerToken: 0.00003,
  llmOutputPerToken: 0.00006,
};

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
      spans: [],
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
    spans: [],
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

// ============================================
// Span Management
// ============================================

/**
 * Start a new span in the trace
 */
export function startSpan(
  handle: TraceHandle,
  name: SpanName | string,
  input?: Record<string, unknown>,
  config?: FlightRecorderConfig
): Span {
  if (!handle.sampled) {
    return {
      name,
      startedAt: new Date().toISOString(),
      status: 'success',
    };
  }

  const cfg = { ...globalConfig, ...config };
  const piiConfig = { ...DEFAULT_PII_MASKING_CONFIG, ...cfg.piiMasking };

  const span: Span = {
    name,
    startedAt: new Date().toISOString(),
    status: 'running',
    input: input && piiConfig.maskEventPayloads
      ? maskPayloadPII(input, piiConfig)
      : input,
  };

  handle.spans.push(span);
  handle.activeSpan = span;

  if (cfg.debug) {
    console.log('[FlightRecorder] startSpan', {
      traceId: handle.traceId,
      spanName: name,
    });
  }

  return span;
}

/**
 * End an active span
 */
export function endSpan(
  handle: TraceHandle,
  span: Span,
  output?: Record<string, unknown>,
  error?: string,
  config?: FlightRecorderConfig
): void {
  if (!handle.sampled) return;

  const cfg = { ...globalConfig, ...config };
  const piiConfig = { ...DEFAULT_PII_MASKING_CONFIG, ...cfg.piiMasking };

  const endedAt = new Date();
  span.endedAt = endedAt.toISOString();
  span.durationMs = endedAt.getTime() - new Date(span.startedAt).getTime();

  if (error) {
    span.status = 'error';
    span.error = error;
  } else {
    span.status = 'success';
    span.output = output && piiConfig.maskEventPayloads
      ? maskPayloadPII(output, piiConfig)
      : output;
  }

  // Clear active span if it's the current one
  if (handle.activeSpan === span) {
    handle.activeSpan = undefined;
  }

  if (cfg.debug) {
    console.log('[FlightRecorder] endSpan', {
      traceId: handle.traceId,
      spanName: span.name,
      durationMs: span.durationMs,
      status: span.status,
    });
  }
}

/**
 * Create a span wrapper function for async operations
 */
export async function withSpan<T>(
  handle: TraceHandle,
  name: SpanName | string,
  input: Record<string, unknown>,
  fn: () => Promise<T>,
  config?: FlightRecorderConfig
): Promise<{ result: T; span: Span }> {
  const span = startSpan(handle, name, input, config);

  try {
    const result = await fn();
    const output = summarizeResult(result);
    endSpan(handle, span, output, undefined, config);
    return { result, span };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    endSpan(handle, span, undefined, errorMessage, config);
    throw err;
  }
}

/**
 * Summarize a result for span output (avoid storing large payloads)
 */
function summarizeResult(result: unknown): Record<string, unknown> {
  if (result === null || result === undefined) {
    return { value: null };
  }

  if (typeof result !== 'object') {
    return { value: result };
  }

  if (Array.isArray(result)) {
    return {
      _type: 'array',
      length: result.length,
      sample: result.slice(0, 3).map((item) =>
        typeof item === 'object' ? { _type: typeof item } : item
      ),
    };
  }

  const obj = result as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      summary[key] = { _type: 'array', length: value.length };
    } else if (typeof value === 'object' && value !== null) {
      summary[key] = { _type: 'object', keys: Object.keys(value).length };
    } else if (typeof value === 'string' && value.length > 100) {
      summary[key] = value.slice(0, 100) + '...';
    } else {
      summary[key] = value;
    }
  }

  return summary;
}

// ============================================
// Cost Calculation
// ============================================

/**
 * Calculate estimated cost for a trace
 */
export function calculateTraceCost(
  params: {
    embeddingTokens?: number;
    vectorSearchOps?: number;
    rerankItems?: number;
    llmInputTokens?: number;
    llmOutputTokens?: number;
  },
  config?: FlightRecorderConfig
): TraceCost {
  const rates = { ...DEFAULT_COST_RATES, ...config?.costRates };

  const embedding = (params.embeddingTokens || 0) * rates.embeddingPerToken;
  const vectorSearch = (params.vectorSearchOps || 0) * rates.vectorSearchPerOp;
  const rerank = (params.rerankItems || 0) * rates.rerankPerItem;
  const llmInput = (params.llmInputTokens || 0) * rates.llmInputPerToken;
  const llmOutput = (params.llmOutputTokens || 0) * rates.llmOutputPerToken;
  const llm = llmInput + llmOutput;

  return {
    embedding,
    vectorSearch,
    rerank,
    llm,
    total: embedding + vectorSearch + rerank + llm,
    tokens: {
      embeddingInput: params.embeddingTokens,
      llmInput: params.llmInputTokens,
      llmOutput: params.llmOutputTokens,
    },
  };
}

/**
 * Extract timing summary from spans
 */
export function extractTimingsFromSpans(spans: Span[]): Record<string, number> {
  const timings: Record<string, number> = {};
  let total = 0;

  for (const span of spans) {
    if (span.durationMs !== undefined) {
      timings[span.name] = span.durationMs;
      total += span.durationMs;
    }
  }

  timings.total = total;
  return timings;
}

// Re-export for convenience
export { shouldSample, recordMetricsSample } from './sampling';
export { maskExtendedPII, maskChunkText, maskPayloadPII } from './pii-safe';
