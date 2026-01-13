/**
 * Query Receipt Types and Generation
 *
 * Provides human-readable "receipts" for every retrieval operation,
 * documenting costs, execution path, evidence, and policy compliance.
 */

import { randomUUID } from 'crypto';
import type { StoredTrace, TraceCost, TraceConfig } from '@/lib/fall/flight-recorder/types';

// ============================================
// Receipt Types
// ============================================

/**
 * Cost breakdown for a retrieval operation
 */
export interface ReceiptCost {
  /** Tokens used for query embedding */
  embedding_tokens: number;
  /** Number of candidates considered for reranking */
  rerank_candidates: number;
  /** LLM tokens used (if answer generation enabled) */
  llm_tokens?: number;
  /** Total query units consumed (normalized cost unit) */
  total_query_units: number;
  /** Estimated cost in USD */
  estimated_cost_usd: number;
}

/**
 * Execution information for the retrieval pipeline
 */
export interface ReceiptExecution {
  /** Total latency in milliseconds */
  latency_ms: number;
  /** Pipeline path taken (e.g., "vector->rerank->context") */
  plan_path: string;
  /** Whether results were served from cache */
  cache_hit: boolean;
  /** Breakdown of latency by stage */
  stage_latencies?: {
    embedding_ms?: number;
    search_ms?: number;
    rerank_ms?: number;
    llm_ms?: number;
  };
}

/**
 * Evidence information about retrieval results
 */
export interface ReceiptEvidence {
  /** Total candidates retrieved from vector search */
  candidates_count: number;
  /** Number of candidates after reranking */
  reranked_count: number;
  /** Number of context chunks used */
  context_chunks: number;
  /** Number of chunks blocked due to PII/policy */
  blocked_chunks: number;
  /** Score distribution info */
  score_range?: {
    min: number;
    max: number;
    avg: number;
  };
}

/**
 * Policy compliance information
 */
export interface ReceiptPolicy {
  /** Remaining budget percentage for the billing period */
  budget_remaining_percent: number;
  /** Whether PII scanning was performed */
  pii_scanned: boolean;
  /** Number of redactions applied */
  redactions_applied: number;
  /** Active policies applied to this query */
  policies_applied?: string[];
}

/**
 * Complete Query Receipt
 * Human-readable documentation of a retrieval operation
 */
export interface QueryReceipt {
  /** Unique receipt identifier */
  receipt_id: string;
  /** Trace ID for correlation */
  trace_id: string;
  /** ISO timestamp when receipt was generated */
  timestamp: string;

  /** Cost breakdown */
  cost: ReceiptCost;

  /** Execution details */
  execution: ReceiptExecution;

  /** Evidence/results information */
  evidence: ReceiptEvidence;

  /** Policy compliance */
  policy: ReceiptPolicy;

  /** Original query (truncated if too long) */
  query_preview?: string;

  /** Collection(s) searched */
  collections?: string[];

  /** User plan at time of query */
  plan?: string;
}

// ============================================
// Cost Calculation Constants
// ============================================

/**
 * Default cost rates (can be overridden via config)
 */
export const DEFAULT_COST_RATES = {
  /** Cost per embedding token in USD */
  embeddingPerToken: 0.00002,
  /** Cost per vector search operation */
  vectorSearchPerOp: 0.0001,
  /** Cost per rerank candidate */
  rerankPerCandidate: 0.00005,
  /** Cost per LLM input token */
  llmInputPerToken: 0.00001,
  /** Cost per LLM output token */
  llmOutputPerToken: 0.00003,
};

/**
 * Query unit conversion (normalize costs to a single unit)
 * 1 query unit = ~$0.0001
 */
const USD_PER_QUERY_UNIT = 0.0001;

// ============================================
// Receipt Generation
// ============================================

/**
 * Generate a QueryReceipt from a StoredTrace
 */
export function generateReceipt(
  trace: StoredTrace,
  options?: {
    budgetRemainingPercent?: number;
    policyNames?: string[];
  }
): QueryReceipt {
  const traceCost = trace.trace.cost || { total: 0 };
  const timings = trace.timingsMs || {};
  const resultStats = trace.trace.resultStats;
  const config = trace.effectiveConfig || {};

  // Calculate cost breakdown
  const embeddingTokens = traceCost.tokens?.embeddingInput || estimateEmbeddingTokens(trace.queryText);
  const rerankCandidates = config.topK || trace.resultsCount || 0;
  const llmTokens = (traceCost.tokens?.llmInput || 0) + (traceCost.tokens?.llmOutput || 0);

  const cost: ReceiptCost = {
    embedding_tokens: embeddingTokens,
    rerank_candidates: config.rerankEnabled ? rerankCandidates : 0,
    llm_tokens: llmTokens > 0 ? llmTokens : undefined,
    total_query_units: Math.ceil(traceCost.total / USD_PER_QUERY_UNIT),
    estimated_cost_usd: traceCost.total,
  };

  // Build execution info
  const planPath = buildPlanPath(config, trace.trace.events);
  const cacheHit = trace.trace.events?.some((e) => e.type === 'cache_hit') || false;

  const execution: ReceiptExecution = {
    latency_ms: timings.total || trace.trace.totalDurationMs || 0,
    plan_path: planPath,
    cache_hit: cacheHit,
    stage_latencies: {
      embedding_ms: timings.embedding,
      search_ms: timings.search || timings.vector_search,
      rerank_ms: timings.rerank,
      llm_ms: timings.llm || timings.generation,
    },
  };

  // Build evidence info
  const candidatesEvent = trace.trace.events?.find((e) => e.type === 'candidates');
  const candidatesCount = (candidatesEvent?.payload?.count as number) || config.topK || 0;

  const evidence: ReceiptEvidence = {
    candidates_count: candidatesCount,
    reranked_count: config.rerankEnabled ? (config.rerankTopN || trace.resultsCount || 0) : 0,
    context_chunks: trace.resultsCount || 0,
    blocked_chunks: countBlockedChunks(trace),
    score_range: resultStats?.scores
      ? {
          min: resultStats.scores.min,
          max: resultStats.scores.max,
          avg: resultStats.scores.avg,
        }
      : undefined,
  };

  // Build policy info
  const piiMasked = trace.trace.events?.some((e) => e.piiMasked) || false;
  const redactionsCount = countRedactions(trace);

  const policy: ReceiptPolicy = {
    budget_remaining_percent: options?.budgetRemainingPercent ?? 100,
    pii_scanned: piiMasked || redactionsCount > 0,
    redactions_applied: redactionsCount,
    policies_applied: options?.policyNames,
  };

  return {
    receipt_id: `rcpt_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    trace_id: trace.trace.traceId || trace.id,
    timestamp: new Date().toISOString(),
    cost,
    execution,
    evidence,
    policy,
    query_preview: truncateQuery(trace.queryText),
    collections: trace.collectionIds || (trace.collectionId ? [trace.collectionId] : undefined),
    plan: trace.plan,
  };
}

/**
 * Generate a receipt from raw retrieval result (before storage)
 */
export function generateReceiptFromResult(params: {
  traceId: string;
  queryText?: string;
  collectionId?: string;
  collectionIds?: string[];
  plan?: string;
  config: Partial<TraceConfig>;
  cost: Partial<TraceCost>;
  timings: Record<string, number>;
  resultsCount: number;
  cacheHit?: boolean;
  piiScanned?: boolean;
  redactionsApplied?: number;
  budgetRemainingPercent?: number;
}): QueryReceipt {
  const {
    traceId,
    queryText,
    collectionId,
    collectionIds,
    plan,
    config,
    cost,
    timings,
    resultsCount,
    cacheHit = false,
    piiScanned = false,
    redactionsApplied = 0,
    budgetRemainingPercent = 100,
  } = params;

  const embeddingTokens = cost.tokens?.embeddingInput || estimateEmbeddingTokens(queryText);
  const rerankCandidates = config.topK || resultsCount;
  const llmTokens = (cost.tokens?.llmInput || 0) + (cost.tokens?.llmOutput || 0);
  const totalCostUsd = cost.total || 0;

  return {
    receipt_id: `rcpt_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    cost: {
      embedding_tokens: embeddingTokens,
      rerank_candidates: config.rerankEnabled ? rerankCandidates : 0,
      llm_tokens: llmTokens > 0 ? llmTokens : undefined,
      total_query_units: Math.ceil(totalCostUsd / USD_PER_QUERY_UNIT),
      estimated_cost_usd: totalCostUsd,
    },
    execution: {
      latency_ms: timings.total || 0,
      plan_path: buildPlanPathFromConfig(config),
      cache_hit: cacheHit,
      stage_latencies: {
        embedding_ms: timings.embedding,
        search_ms: timings.search || timings.vector_search,
        rerank_ms: timings.rerank,
        llm_ms: timings.llm || timings.generation,
      },
    },
    evidence: {
      candidates_count: config.topK || resultsCount,
      reranked_count: config.rerankEnabled ? (config.rerankTopN || resultsCount) : 0,
      context_chunks: resultsCount,
      blocked_chunks: 0, // Will be calculated if needed
    },
    policy: {
      budget_remaining_percent: budgetRemainingPercent,
      pii_scanned: piiScanned,
      redactions_applied: redactionsApplied,
    },
    query_preview: truncateQuery(queryText),
    collections: collectionIds || (collectionId ? [collectionId] : undefined),
    plan,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Estimate embedding tokens from query text
 */
function estimateEmbeddingTokens(text?: string): number {
  if (!text) return 0;
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Build plan path string from config and events
 */
function buildPlanPath(
  config: Partial<TraceConfig>,
  events?: Array<{ type: string }>
): string {
  const stages: string[] = [];

  // Check for cache hit first
  if (events?.some((e) => e.type === 'cache_hit')) {
    return 'cache';
  }

  // Embedding stage
  stages.push('embed');

  // Search type
  if (config.searchType === 'hybrid') {
    stages.push('hybrid_search');
  } else if (config.searchType === 'keyword') {
    stages.push('keyword_search');
  } else {
    stages.push('vector_search');
  }

  // Rerank if enabled
  if (config.rerankEnabled) {
    stages.push('rerank');
  }

  // Context/results
  stages.push('context');

  // LLM generation if present
  if (events?.some((e) => e.type === 'llm')) {
    stages.push('generate');
  }

  return stages.join('->');
}

/**
 * Build plan path from config only
 */
function buildPlanPathFromConfig(config: Partial<TraceConfig>): string {
  const stages: string[] = ['embed'];

  if (config.searchType === 'hybrid') {
    stages.push('hybrid_search');
  } else if (config.searchType === 'keyword') {
    stages.push('keyword_search');
  } else {
    stages.push('vector_search');
  }

  if (config.rerankEnabled) {
    stages.push('rerank');
  }

  stages.push('context');

  if (config.llmModel) {
    stages.push('generate');
  }

  return stages.join('->');
}

/**
 * Count blocked chunks from trace events
 */
function countBlockedChunks(trace: StoredTrace): number {
  let blocked = 0;

  for (const event of trace.trace.events || []) {
    if (event.type === 'error' && event.payload?.reason === 'pii_blocked') {
      blocked++;
    }
    if (event.payload?.blocked_count) {
      blocked += event.payload.blocked_count as number;
    }
  }

  return blocked;
}

/**
 * Count redactions applied in trace
 */
function countRedactions(trace: StoredTrace): number {
  let redactions = 0;

  for (const event of trace.trace.events || []) {
    if (event.piiMasked) {
      redactions++;
    }
    if (event.payload?.redactions_count) {
      redactions += event.payload.redactions_count as number;
    }
  }

  return redactions;
}

/**
 * Truncate query for preview (max 100 chars)
 */
function truncateQuery(query?: string, maxLength = 100): string | undefined {
  if (!query) return undefined;
  if (query.length <= maxLength) return query;
  return query.slice(0, maxLength - 3) + '...';
}

// ============================================
// Receipt Formatting
// ============================================

/**
 * Format receipt as human-readable text
 */
export function formatReceiptAsText(receipt: QueryReceipt): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════',
    '                      QUERY RECEIPT',
    '═══════════════════════════════════════════════════════════',
    '',
    `Receipt ID:     ${receipt.receipt_id}`,
    `Trace ID:       ${receipt.trace_id}`,
    `Timestamp:      ${receipt.timestamp}`,
    `Plan:           ${receipt.plan || 'N/A'}`,
    '',
    '───────────────────────── QUERY ──────────────────────────',
    receipt.query_preview || '(No query text)',
    '',
    '───────────────────────── COST ───────────────────────────',
    `Embedding Tokens:    ${receipt.cost.embedding_tokens.toLocaleString()}`,
    `Rerank Candidates:   ${receipt.cost.rerank_candidates}`,
  ];

  if (receipt.cost.llm_tokens) {
    lines.push(`LLM Tokens:          ${receipt.cost.llm_tokens.toLocaleString()}`);
  }

  lines.push(
    `Total Query Units:   ${receipt.cost.total_query_units}`,
    `Estimated Cost:      $${receipt.cost.estimated_cost_usd.toFixed(6)}`,
    '',
    '─────────────────────── EXECUTION ────────────────────────',
    `Total Latency:       ${receipt.execution.latency_ms}ms`,
    `Pipeline Path:       ${receipt.execution.plan_path}`,
    `Cache Hit:           ${receipt.execution.cache_hit ? 'Yes' : 'No'}`
  );

  if (receipt.execution.stage_latencies) {
    const sl = receipt.execution.stage_latencies;
    if (sl.embedding_ms) lines.push(`  Embedding:         ${sl.embedding_ms}ms`);
    if (sl.search_ms) lines.push(`  Search:            ${sl.search_ms}ms`);
    if (sl.rerank_ms) lines.push(`  Rerank:            ${sl.rerank_ms}ms`);
    if (sl.llm_ms) lines.push(`  LLM:               ${sl.llm_ms}ms`);
  }

  lines.push(
    '',
    '─────────────────────── EVIDENCE ─────────────────────────',
    `Candidates:          ${receipt.evidence.candidates_count}`,
    `Reranked:            ${receipt.evidence.reranked_count}`,
    `Context Chunks:      ${receipt.evidence.context_chunks}`,
    `Blocked Chunks:      ${receipt.evidence.blocked_chunks}`
  );

  if (receipt.evidence.score_range) {
    const sr = receipt.evidence.score_range;
    lines.push(`Score Range:         ${sr.min.toFixed(3)} - ${sr.max.toFixed(3)} (avg: ${sr.avg.toFixed(3)})`);
  }

  lines.push(
    '',
    '──────────────────────── POLICY ──────────────────────────',
    `Budget Remaining:    ${receipt.policy.budget_remaining_percent.toFixed(1)}%`,
    `PII Scanned:         ${receipt.policy.pii_scanned ? 'Yes' : 'No'}`,
    `Redactions Applied:  ${receipt.policy.redactions_applied}`
  );

  if (receipt.policy.policies_applied?.length) {
    lines.push(`Policies:            ${receipt.policy.policies_applied.join(', ')}`);
  }

  lines.push(
    '',
    '═══════════════════════════════════════════════════════════',
    `Generated by Seizn | ${new Date().toISOString()}`,
    '═══════════════════════════════════════════════════════════'
  );

  return lines.join('\n');
}

/**
 * Format receipt as JSON for download
 */
export function formatReceiptAsJSON(receipt: QueryReceipt): string {
  return JSON.stringify(receipt, null, 2);
}
