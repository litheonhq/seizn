/**
 * Signal Collector for Network Learning
 *
 * Collects anonymized signals from consented users.
 * PII is stripped before storage. No individual user data is stored.
 */

import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';
import { randomUUID } from 'crypto';
import { hasConsent } from '../consent/consent-manager';
import type {
  SignalType,
  AnonymizedSignal,
  SignalRecord,
  NetworkLearningConfig,
} from '../types';
import { DEFAULT_NETWORK_LEARNING_CONFIG } from '../types';

// ============================================
// Query Clustering
// ============================================

/**
 * Simple hash-based clustering for queries.
 * Produces consistent cluster IDs for similar queries without storing original text.
 */
function computeQueryCluster(
  query: string,
  _config: NetworkLearningConfig = DEFAULT_NETWORK_LEARNING_CONFIG
): string {
  // Normalize query: lowercase, trim, remove extra whitespace
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');

  // Extract key tokens (remove stopwords, keep semantically meaningful words)
  const stopwords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in',
    'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'under',
    'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 's', 't', 'just', 'don', 'now', 'what', 'which', 'who',
  ]);

  const tokens = normalized
    .split(' ')
    .filter((t) => t.length > 2 && !stopwords.has(t))
    .sort()
    .slice(0, 5); // Take top 5 tokens for clustering

  // Create a deterministic cluster ID from sorted tokens
  const clusterKey = tokens.join('_') || 'generic';

  // Hash to ensure no PII leaks
  return hashString(clusterKey);
}

/**
 * Simple hash function for strings (no crypto dependency for edge runtime)
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to positive hex string with prefix
  return `cluster_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

// ============================================
// Signal Collection
// ============================================

export interface CollectSignalInput {
  userId: string;
  signalType: SignalType;
  query?: string;
  planPath?: string[];
  latencyMs: number;
  resultsCount: number;
  feedbackScore?: number;
}

/**
 * Collect a signal if user has consented
 * Returns the anonymized signal ID if collected, null otherwise
 */
export async function collectSignal(
  input: CollectSignalInput,
  config: NetworkLearningConfig = DEFAULT_NETWORK_LEARNING_CONFIG
): Promise<string | null> {
  const { userId, signalType, query, planPath, latencyMs, resultsCount, feedbackScore } = input;

  // Verify consent before collecting
  const consented = await hasConsent(userId, signalType);
  if (!consented) {
    return null;
  }

  // Anonymize the signal
  const anonymizedSignal = anonymizeSignal({
    signalType,
    query,
    planPath: planPath ?? [],
    latencyMs,
    resultsCount,
    feedbackScore,
  }, config);

  // Store the anonymized signal
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('network_learning_signals')
    .insert({
      id: anonymizedSignal.id,
      signal_type: anonymizedSignal.signalType,
      query_cluster: anonymizedSignal.queryCluster,
      plan_path: anonymizedSignal.planPath,
      latency_ms: anonymizedSignal.metrics.latencyMs,
      results_count: anonymizedSignal.metrics.resultsCount,
      feedback_score: anonymizedSignal.metrics.feedbackScore ?? null,
    })
    .select('id')
    .single();

  if (error) {
    logServerError('Failed to store signal', error);
    return null;
  }

  return data.id;
}

/**
 * Batch collect signals for multiple metrics from a single request
 */
export async function collectBatchSignals(
  inputs: CollectSignalInput[],
  config: NetworkLearningConfig = DEFAULT_NETWORK_LEARNING_CONFIG
): Promise<string[]> {
  const collected: string[] = [];

  // Process in parallel with consent checks
  const results = await Promise.allSettled(
    inputs.map((input) => collectSignal(input, config))
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      collected.push(result.value);
    }
  }

  return collected;
}

// ============================================
// Anonymization
// ============================================

interface RawSignalData {
  signalType: SignalType;
  query?: string;
  planPath: string[];
  latencyMs: number;
  resultsCount: number;
  feedbackScore?: number;
}

/**
 * Anonymize a signal by removing all PII
 */
function anonymizeSignal(
  data: RawSignalData,
  config: NetworkLearningConfig = DEFAULT_NETWORK_LEARNING_CONFIG
): AnonymizedSignal {
  // Generate unique ID (not linked to user)
  const id = `sig_${randomUUID().replace(/-/g, '')}`;

  // Compute query cluster (anonymized representation)
  const queryCluster = data.query
    ? computeQueryCluster(data.query, config)
    : 'no_query';

  // Sanitize plan path (remove any potential PII from step names)
  const sanitizedPlanPath = sanitizePlanPath(data.planPath);

  return {
    id,
    signalType: data.signalType,
    queryCluster,
    planPath: sanitizedPlanPath,
    metrics: {
      latencyMs: Math.round(data.latencyMs),
      resultsCount: data.resultsCount,
      feedbackScore: data.feedbackScore,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Sanitize plan path to remove any potential PII
 */
function sanitizePlanPath(path: string[]): string[] {
  // Only keep known safe step types
  const safeStepTypes = new Set([
    'retrieve',
    'rerank',
    'generate',
    'cache_check',
    'cache_write',
    'embedding',
    'filter',
    'aggregate',
    'format',
    'validate',
  ]);

  return path.map((step) => {
    const lowerStep = step.toLowerCase();
    // Return only if it's a known safe step type
    if (safeStepTypes.has(lowerStep)) {
      return lowerStep;
    }
    // Generic fallback for unknown steps
    return 'custom_step';
  });
}

// ============================================
// Signal Retrieval (for aggregation)
// ============================================

export interface GetSignalsOptions {
  signalType?: SignalType;
  queryCluster?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * Get anonymized signals for aggregation
 * Only accessible for aggregation purposes, not individual inspection
 */
export async function getSignals(
  options: GetSignalsOptions = {}
): Promise<AnonymizedSignal[]> {
  const supabase = createServerClient();
  const { signalType, queryCluster, startDate, endDate, limit = 1000 } = options;

  let query = supabase
    .from('network_learning_signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (signalType) {
    query = query.eq('signal_type', signalType);
  }

  if (queryCluster) {
    query = query.eq('query_cluster', queryCluster);
  }

  if (startDate) {
    query = query.gte('created_at', startDate);
  }

  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  const { data, error } = await query;

  if (error) {
    logServerError('Failed to get signals', error);
    throw error;
  }

  return (data ?? []).map(recordToAnonymizedSignal);
}

/**
 * Get signal count for a query cluster
 */
export async function getSignalCount(queryCluster: string): Promise<number> {
  const supabase = createServerClient();

  const { count, error } = await supabase
    .from('network_learning_signals')
    .select('*', { count: 'exact', head: true })
    .eq('query_cluster', queryCluster);

  if (error) {
    logServerError('Failed to get signal count', error);
    return 0;
  }

  return count ?? 0;
}

// ============================================
// Helper Functions
// ============================================

function recordToAnonymizedSignal(record: SignalRecord): AnonymizedSignal {
  return {
    id: record.id,
    signalType: record.signal_type,
    queryCluster: record.query_cluster,
    planPath: record.plan_path,
    metrics: {
      latencyMs: record.latency_ms,
      resultsCount: record.results_count,
      feedbackScore: record.feedback_score ?? undefined,
    },
    timestamp: record.created_at,
  };
}
