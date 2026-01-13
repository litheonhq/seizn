/**
 * RAG Sentry - Auto Trigger
 *
 * Automatically detects and triggers incidents based on trace data,
 * evaluation results, and user feedback.
 */

import { createServerClient } from '@/lib/supabase';
import { analyzeRootCause } from './rca';
import {
  generateFingerprint,
  detectErrorType,
  determineSeverity,
  generateIncidentTitle,
} from './fingerprint';
import type {
  TriggerConfig,
  TriggerInput,
  TriggerResult,
  DEFAULT_TRIGGER_CONFIG,
} from './types';

// ============================================
// Main Trigger Function
// ============================================

/**
 * Process a trigger input and create/update incident if needed
 *
 * @param input - Trigger input data
 * @param config - Trigger configuration (optional)
 * @returns Trigger result
 */
export async function processTrigger(
  input: TriggerInput,
  config?: Partial<TriggerConfig>
): Promise<TriggerResult> {
  const effectiveConfig: TriggerConfig = {
    enabled: true,
    faithfulnessThreshold: 0.7,
    latencySloMs: 5000,
    errorRateThreshold: 0.05,
    minOccurrencesForEscalation: 5,
    ...config,
  };

  // Check if triggering is enabled
  if (!effectiveConfig.enabled) {
    return { triggered: false, skipReason: 'Triggering disabled' };
  }

  // Validate input
  if (!input.userId || !input.traceId) {
    return { triggered: false, skipReason: 'Missing required fields' };
  }

  // Check trigger conditions
  const shouldTrigger = evaluateTriggerConditions(input, effectiveConfig);
  if (!shouldTrigger.trigger) {
    return { triggered: false, skipReason: shouldTrigger.reason };
  }

  // Analyze root cause
  const rca = analyzeRootCause({
    queryText: input.trace.queryText,
    queryHash: input.trace.queryHash,
    collectionId: input.trace.collectionId,
    plannerPath: input.trace.plannerPath,
    topDocIds: input.trace.topDocIds,
    faithfulness: input.trace.faithfulness,
    latencyMs: input.trace.latencyMs,
    error: input.trace.error,
    response: input.trace.response,
  });

  // Generate fingerprint
  const fingerprint = generateFingerprint({
    collectionId: input.trace.collectionId,
    plannerPath: input.trace.plannerPath,
    topDocIds: input.trace.topDocIds,
    errorType: rca.errorType,
  });

  // Determine severity
  const severity = determineSeverity(rca.errorType);

  // Generate title
  const title = generateIncidentTitle(rca.errorType);

  // Description based on source
  const description = generateDescription(input, rca);

  try {
    const supabase = createServerClient();

    // Use the upsert_incident function
    const { data, error } = await supabase.rpc('upsert_incident', {
      p_user_id: input.userId,
      p_fingerprint: fingerprint.fingerprint,
      p_title: title,
      p_description: description,
      p_severity: severity,
      p_error_type: rca.errorType,
      p_collection_id: input.trace.collectionId ?? null,
      p_org_id: null,
      p_trace_id: input.traceId,
      p_sample_query: input.trace.queryText?.substring(0, 500) ?? null,
      p_rca_candidates: JSON.stringify(rca.candidates),
    });

    if (error) {
      console.error('Failed to create/update incident:', error);
      return { triggered: false, skipReason: `Database error: ${error.message}` };
    }

    const incidentId = data as string;

    // Check if this is a new incident by querying
    const { data: incident } = await supabase
      .from('retops_incidents')
      .select('occurrence_count')
      .eq('id', incidentId)
      .single();

    const isNew = incident?.occurrence_count === 1;

    return {
      triggered: true,
      incidentId,
      isNew,
      rca,
    };
  } catch (err) {
    console.error('Trigger processing error:', err);
    return { triggered: false, skipReason: 'Internal error' };
  }
}

// ============================================
// Condition Evaluation
// ============================================

interface TriggerEvaluation {
  trigger: boolean;
  reason?: string;
}

/**
 * Evaluate whether trigger conditions are met
 */
function evaluateTriggerConditions(
  input: TriggerInput,
  config: TriggerConfig
): TriggerEvaluation {
  // Always trigger for manual requests
  if (input.source === 'manual') {
    return { trigger: true };
  }

  // Trigger for explicit user feedback
  if (input.source === 'user_feedback' && input.feedback) {
    return { trigger: true };
  }

  // Trigger for eval failures
  if (input.source === 'eval_failure') {
    return { trigger: true };
  }

  // Auto-detect conditions
  if (input.source === 'auto_detect') {
    // Check faithfulness threshold
    if (
      input.trace.faithfulness !== undefined &&
      input.trace.faithfulness < config.faithfulnessThreshold
    ) {
      return { trigger: true };
    }

    // Check latency SLO
    if (
      input.trace.latencyMs !== undefined &&
      input.trace.latencyMs > config.latencySloMs
    ) {
      return { trigger: true };
    }

    // Check for errors
    if (input.trace.error) {
      return { trigger: true };
    }

    return { trigger: false, reason: 'No trigger conditions met' };
  }

  return { trigger: false, reason: 'Unknown source type' };
}

/**
 * Generate incident description from input
 */
function generateDescription(
  input: TriggerInput,
  rca: ReturnType<typeof analyzeRootCause>
): string {
  const parts: string[] = [];

  // Source info
  parts.push(`Source: ${input.source}`);

  // User feedback if present
  if (input.feedback) {
    parts.push(`User feedback: ${input.feedback.type}`);
    if (input.feedback.comment) {
      parts.push(`Comment: ${input.feedback.comment}`);
    }
  }

  // Key metrics
  if (input.trace.faithfulness !== undefined) {
    parts.push(`Faithfulness: ${(input.trace.faithfulness * 100).toFixed(1)}%`);
  }
  if (input.trace.latencyMs !== undefined) {
    parts.push(`Latency: ${input.trace.latencyMs}ms`);
  }

  // Primary cause
  const primaryCause = rca.candidates[0];
  if (primaryCause) {
    parts.push(`\nPrimary cause: ${primaryCause.cause}`);
  }

  return parts.join('\n');
}

// ============================================
// Batch Processing
// ============================================

/**
 * Process multiple triggers in batch (for background jobs)
 */
export async function processTriggerBatch(
  inputs: TriggerInput[],
  config?: Partial<TriggerConfig>
): Promise<TriggerResult[]> {
  const results: TriggerResult[] = [];

  for (const input of inputs) {
    const result = await processTrigger(input, config);
    results.push(result);
  }

  return results;
}

// ============================================
// Trigger from Trace
// ============================================

/**
 * Create trigger input from a trace record
 */
export function createTriggerFromTrace(
  userId: string,
  traceId: string,
  trace: {
    query_text?: string;
    query_hash?: string;
    collection_id?: string;
    effective_config?: Record<string, unknown>;
    timings_ms?: Record<string, number>;
    error?: string;
    trace?: Record<string, unknown>;
  },
  source: TriggerInput['source'] = 'auto_detect'
): TriggerInput {
  // Extract planner path from effective_config
  const plannerPath = trace.effective_config?.planner_path as string | undefined;

  // Extract top doc IDs from trace data
  const topDocIds = (trace.trace as Record<string, unknown>)?.topDocIds as string[] | undefined;

  // Extract faithfulness from trace data
  const faithfulness = (trace.trace as Record<string, unknown>)?.faithfulness as number | undefined;

  // Calculate total latency
  const latencyMs = trace.timings_ms
    ? Object.values(trace.timings_ms).reduce((a, b) => a + (b || 0), 0)
    : undefined;

  return {
    userId,
    traceId,
    source,
    trace: {
      queryText: trace.query_text,
      queryHash: trace.query_hash,
      collectionId: trace.collection_id,
      plannerPath,
      topDocIds,
      faithfulness,
      latencyMs,
      error: trace.error,
    },
  };
}

// ============================================
// Trigger from Feedback
// ============================================

/**
 * Create trigger input from user feedback
 */
export function createTriggerFromFeedback(
  userId: string,
  traceId: string,
  feedback: {
    type: 'thumb_down' | 'wrong_answer' | 'irrelevant' | 'outdated';
    comment?: string;
  },
  trace?: {
    queryText?: string;
    collectionId?: string;
  }
): TriggerInput {
  return {
    userId,
    traceId,
    source: 'user_feedback',
    trace: {
      queryText: trace?.queryText,
      collectionId: trace?.collectionId,
    },
    feedback,
  };
}

// ============================================
// Trigger from Eval
// ============================================

/**
 * Create trigger input from evaluation failure
 */
export function createTriggerFromEval(
  userId: string,
  traceId: string,
  evalResult: {
    faithfulness?: number;
    relevance?: number;
    passed: boolean;
    reason?: string;
  },
  trace?: {
    queryText?: string;
    collectionId?: string;
    response?: string;
  }
): TriggerInput {
  return {
    userId,
    traceId,
    source: 'eval_failure',
    trace: {
      queryText: trace?.queryText,
      collectionId: trace?.collectionId,
      faithfulness: evalResult.faithfulness,
      response: trace?.response,
    },
    feedback: evalResult.reason
      ? { type: 'wrong_answer', comment: evalResult.reason }
      : undefined,
  };
}
