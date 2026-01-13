/**
 * RAG Sentry - Fingerprint Generation
 *
 * Generates unique fingerprints for grouping similar incidents.
 * Similar to Sentry's fingerprinting for error grouping.
 */

import { createHash } from 'crypto';
import type { ErrorType, FingerprintInput, FingerprintResult } from './types';

// ============================================
// Constants
// ============================================

const FINGERPRINT_VERSION = 'v1';
const MAX_DOC_IDS_FOR_HASH = 5;

// ============================================
// Main Function
// ============================================

/**
 * Generate a fingerprint for incident grouping
 *
 * Combines multiple signals to create a unique but stable fingerprint:
 * 1. Collection ID - group by data source
 * 2. Planner path - group by execution path
 * 3. Top doc IDs hash - group by similar retrieval results
 * 4. Error type - group by failure mode
 *
 * @param input - Fingerprint input data
 * @returns Fingerprint result with components
 */
export function generateFingerprint(input: FingerprintInput): FingerprintResult {
  const components: string[] = [];

  // Version prefix for future-proofing
  components.push(FINGERPRINT_VERSION);

  // Collection ID (or 'default' if not specified)
  const collectionPart = input.collectionId ?? 'default';
  components.push(`col:${collectionPart.substring(0, 8)}`);

  // Planner path (normalized)
  const plannerPart = normalizePlannerPath(input.plannerPath);
  components.push(`path:${plannerPart}`);

  // Error type
  const errorPart = input.errorType ?? 'unknown';
  components.push(`err:${errorPart}`);

  // Top doc IDs hash (for retrieval-specific issues)
  if (input.topDocIds && input.topDocIds.length > 0) {
    const docHash = hashDocIds(input.topDocIds);
    components.push(`docs:${docHash}`);
  }

  // Generate final fingerprint hash
  const combinedString = components.join('|');
  const fingerprint = createHash('sha256')
    .update(combinedString)
    .digest('hex')
    .substring(0, 32);

  return {
    fingerprint,
    components,
  };
}

/**
 * Generate a query-specific fingerprint
 * Used when the issue is specific to a particular query pattern
 *
 * @param input - Base fingerprint input
 * @param queryHash - Query hash to include
 * @returns Fingerprint result
 */
export function generateQueryFingerprint(
  input: FingerprintInput,
  queryHash: string
): FingerprintResult {
  const baseResult = generateFingerprint(input);

  // Add query hash to components
  const queryPart = `query:${queryHash.substring(0, 8)}`;
  const components = [...baseResult.components, queryPart];

  // Regenerate fingerprint with query hash
  const combinedString = components.join('|');
  const fingerprint = createHash('sha256')
    .update(combinedString)
    .digest('hex')
    .substring(0, 32);

  return {
    fingerprint,
    components,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Normalize planner path for consistent grouping
 */
function normalizePlannerPath(path?: string): string {
  if (!path) return 'default';

  // Normalize common variations
  return path
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[+,]/g, '-')
    .replace(/--+/g, '-')
    .substring(0, 32);
}

/**
 * Hash top document IDs for fingerprinting
 * Uses only the first N doc IDs for stability
 */
function hashDocIds(docIds: string[]): string {
  const idsToHash = docIds.slice(0, MAX_DOC_IDS_FOR_HASH);
  const sorted = [...idsToHash].sort();
  const combined = sorted.join(',');

  return createHash('md5')
    .update(combined)
    .digest('hex')
    .substring(0, 8);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Determine error type from trace data
 */
export function detectErrorType(trace: {
  faithfulness?: number;
  latencyMs?: number;
  error?: string;
  resultsCount?: number;
  policyBlocked?: boolean;
}): ErrorType {
  // Check explicit error first
  if (trace.error) {
    if (trace.error.includes('timeout') || trace.error.includes('TIMEOUT')) {
      return 'timeout';
    }
    if (trace.error.includes('policy') || trace.error.includes('blocked')) {
      return 'policy_blocked';
    }
    if (trace.error.includes('embedding')) {
      return 'embedding_mismatch';
    }
    if (trace.error.includes('rerank')) {
      return 'rerank_failure';
    }
  }

  // Check policy blocked flag
  if (trace.policyBlocked) {
    return 'policy_blocked';
  }

  // Check empty results
  if (trace.resultsCount === 0) {
    return 'empty_results';
  }

  // Check faithfulness
  if (trace.faithfulness !== undefined && trace.faithfulness < 0.5) {
    return 'low_faithfulness';
  }

  // Check timeout (5 second default SLO)
  if (trace.latencyMs !== undefined && trace.latencyMs > 5000) {
    return 'timeout';
  }

  // Check for missing context (low faithfulness with results)
  if (
    trace.faithfulness !== undefined &&
    trace.faithfulness < 0.7 &&
    trace.resultsCount !== undefined &&
    trace.resultsCount > 0
  ) {
    return 'missing_context';
  }

  return 'unknown';
}

/**
 * Determine severity based on error type and occurrence count
 */
export function determineSeverity(
  errorType: ErrorType,
  occurrenceCount: number = 1,
  config?: { minOccurrencesForEscalation?: number }
): 'low' | 'medium' | 'high' | 'critical' {
  const escalationThreshold = config?.minOccurrencesForEscalation ?? 5;

  // Base severity by error type
  const baseSeverity: Record<ErrorType, 'low' | 'medium' | 'high' | 'critical'> = {
    hallucination: 'critical',
    policy_blocked: 'high',
    low_faithfulness: 'high',
    timeout: 'medium',
    missing_context: 'medium',
    embedding_mismatch: 'medium',
    rerank_failure: 'medium',
    stale_context: 'low',
    query_mismatch: 'low',
    empty_results: 'low',
    unknown: 'low',
  };

  let severity = baseSeverity[errorType] ?? 'low';

  // Escalate based on occurrence count
  if (occurrenceCount >= escalationThreshold * 2) {
    if (severity === 'low') severity = 'medium';
    else if (severity === 'medium') severity = 'high';
    else if (severity === 'high') severity = 'critical';
  } else if (occurrenceCount >= escalationThreshold) {
    if (severity === 'low') severity = 'medium';
    else if (severity === 'medium') severity = 'high';
  }

  return severity;
}

/**
 * Generate incident title from error type and context
 */
export function generateIncidentTitle(
  errorType: ErrorType,
  context?: {
    collectionName?: string;
    queryPreview?: string;
  }
): string {
  const errorTitles: Record<ErrorType, string> = {
    missing_context: 'Retrieved documents lack relevant context',
    low_faithfulness: 'Answer not grounded in retrieved documents',
    timeout: 'Request exceeded latency SLO',
    policy_blocked: 'Request blocked by governance policy',
    embedding_mismatch: 'Embedding quality degradation detected',
    rerank_failure: 'Reranker failed or returned degraded results',
    hallucination: 'Generated content not supported by context',
    stale_context: 'Retrieved documents may be outdated',
    query_mismatch: 'Query intent not properly understood',
    empty_results: 'No relevant documents found',
    unknown: 'Unclassified retrieval issue',
  };

  let title = errorTitles[errorType] ?? 'Unknown incident';

  // Add collection context if available
  if (context?.collectionName) {
    title = `[${context.collectionName}] ${title}`;
  }

  return title;
}
