/**
 * RAG Sentry - Root Cause Analysis
 *
 * Analyzes retrieval traces to identify probable causes and suggest fixes.
 * Uses rule-based heuristics combined with trace data analysis.
 */

import type {
  ErrorType,
  RCACandidate,
  RCAResult,
  TraceSnapshot,
} from './types';
import { detectErrorType } from './fingerprint';

// ============================================
// Types
// ============================================

interface TraceData {
  queryText?: string;
  queryHash?: string;
  collectionId?: string;
  plannerPath?: string;
  topDocIds?: string[];
  faithfulness?: number;
  relevance?: number;
  latencyMs?: number;
  error?: string;
  response?: string;
  resultsCount?: number;
  rerankApplied?: boolean;
  rerankImprovement?: number;
  cacheHit?: boolean;
  embeddingModel?: string;
  timings?: {
    embedding?: number;
    search?: number;
    rerank?: number;
    generation?: number;
  };
  policyBlocked?: boolean;
  blockReason?: string;
}

// ============================================
// Main Function
// ============================================

/**
 * Analyze trace data to identify root causes
 *
 * @param trace - Trace data from retrieval request
 * @returns RCA result with candidates and evidence
 */
export function analyzeRootCause(trace: TraceData): RCAResult {
  const errorType = detectErrorType(trace);
  const candidates: RCACandidate[] = [];

  // Get candidate analyzers based on error type
  const analyzers = getAnalyzersForErrorType(errorType);

  // Run each analyzer
  for (const analyzer of analyzers) {
    const candidate = analyzer(trace, errorType);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  // Sort by confidence
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Create trace snapshot
  const traceSnapshot: TraceSnapshot = {
    query: trace.queryText?.substring(0, 200),
    queryHash: trace.queryHash,
    topDocIds: trace.topDocIds?.slice(0, 5),
    faithfulness: trace.faithfulness,
    latencyMs: trace.latencyMs,
    error: trace.error,
    plannerPath: trace.plannerPath,
    collectionId: trace.collectionId,
  };

  return {
    errorType,
    candidates: candidates.slice(0, 5), // Return top 5
    analyzedAt: new Date().toISOString(),
    traceSnapshot,
  };
}

// ============================================
// Analyzer Registry
// ============================================

type RCAAnalyzer = (trace: TraceData, errorType: ErrorType) => RCACandidate | null;

/**
 * Get relevant analyzers for a given error type
 */
function getAnalyzersForErrorType(errorType: ErrorType): RCAAnalyzer[] {
  const commonAnalyzers: RCAAnalyzer[] = [
    analyzeGenericIssues,
  ];

  const specificAnalyzers: Record<ErrorType, RCAAnalyzer[]> = {
    missing_context: [
      analyzeMissingContext,
      analyzeQueryQuality,
      analyzeChunkingIssues,
    ],
    low_faithfulness: [
      analyzeLowFaithfulness,
      analyzeGenerationIssues,
      analyzeContextRelevance,
    ],
    timeout: [
      analyzeTimeout,
      analyzeSearchPerformance,
      analyzeRerankPerformance,
    ],
    policy_blocked: [
      analyzePolicyBlock,
    ],
    embedding_mismatch: [
      analyzeEmbeddingIssues,
      analyzeModelMismatch,
    ],
    rerank_failure: [
      analyzeRerankFailure,
      analyzeFallbackBehavior,
    ],
    hallucination: [
      analyzeHallucination,
      analyzeContextCoverage,
    ],
    stale_context: [
      analyzeStaleContent,
      analyzeIndexFreshness,
    ],
    query_mismatch: [
      analyzeQueryMismatch,
      analyzeIntentClassification,
    ],
    empty_results: [
      analyzeEmptyResults,
      analyzeIndexCoverage,
    ],
    unknown: [
      analyzeUnknownIssue,
    ],
  };

  return [
    ...(specificAnalyzers[errorType] ?? []),
    ...commonAnalyzers,
  ];
}

// ============================================
// Individual Analyzers
// ============================================

function analyzeMissingContext(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];
  let confidence = 0.5;

  if (trace.resultsCount !== undefined && trace.resultsCount < 3) {
    evidence.push(`Only ${trace.resultsCount} documents retrieved (low coverage)`);
    confidence += 0.2;
  }

  if (trace.relevance !== undefined && trace.relevance < 0.5) {
    evidence.push(`Low relevance score: ${(trace.relevance * 100).toFixed(1)}%`);
    confidence += 0.2;
  }

  if (evidence.length === 0) {
    evidence.push('Retrieved documents may not cover the query topic');
  }

  return {
    cause: 'Documents in the collection do not contain relevant information for this query',
    confidence: Math.min(confidence, 0.95),
    fixSuggestion: 'Review and expand the document collection to cover this topic. Consider adding more specific documentation or FAQs.',
    evidence,
    category: 'data',
  };
}

function analyzeQueryQuality(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];
  let confidence = 0.3;

  const queryLength = trace.queryText?.length ?? 0;
  const wordCount = trace.queryText?.split(/\s+/).length ?? 0;

  if (queryLength < 10) {
    evidence.push(`Query is very short (${queryLength} chars)`);
    confidence += 0.3;
  }

  if (wordCount < 3) {
    evidence.push(`Query has few words (${wordCount})`);
    confidence += 0.2;
  }

  if (evidence.length === 0) {
    return null;
  }

  return {
    cause: 'Query may be too short or ambiguous for effective retrieval',
    confidence: Math.min(confidence, 0.8),
    fixSuggestion: 'Implement query expansion or require users to provide more context. Consider adding query understanding/reformulation.',
    evidence,
    category: 'retrieval',
  };
}

function analyzeChunkingIssues(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];
  let confidence = 0.4;

  if (trace.topDocIds && trace.topDocIds.length >= 5) {
    // If we have many docs but low faithfulness, chunking might be the issue
    if (trace.faithfulness !== undefined && trace.faithfulness < 0.6) {
      evidence.push('Many documents retrieved but answer quality low - possible chunking issue');
      confidence += 0.2;
    }
  }

  if (evidence.length === 0) {
    return null;
  }

  return {
    cause: 'Document chunks may be too small or split at incorrect boundaries',
    confidence: Math.min(confidence, 0.7),
    fixSuggestion: 'Review chunking strategy. Consider larger chunk sizes or semantic chunking to preserve context.',
    evidence,
    category: 'configuration',
  };
}

function analyzeLowFaithfulness(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];
  let confidence = 0.6;

  if (trace.faithfulness !== undefined) {
    evidence.push(`Faithfulness score: ${(trace.faithfulness * 100).toFixed(1)}%`);
    if (trace.faithfulness < 0.5) {
      confidence += 0.2;
    }
  }

  if (trace.resultsCount !== undefined && trace.resultsCount > 0) {
    evidence.push(`${trace.resultsCount} documents were retrieved`);
  }

  return {
    cause: 'Generated answer contains claims not supported by retrieved context',
    confidence: Math.min(confidence, 0.9),
    fixSuggestion: 'Implement stricter faithfulness guardrails. Consider using citation-based generation or adding claim verification.',
    evidence,
    category: 'generation',
  };
}

function analyzeGenerationIssues(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];
  let confidence = 0.4;

  if (trace.timings?.generation !== undefined && trace.timings.generation > 3000) {
    evidence.push(`Generation took ${trace.timings.generation}ms (may indicate complex/long output)`);
    confidence += 0.1;
  }

  if (trace.response && trace.response.length > 2000) {
    evidence.push('Long response generated - higher chance of unfaithful content');
    confidence += 0.2;
  }

  if (evidence.length === 0) {
    return null;
  }

  return {
    cause: 'LLM generation may be adding information beyond the provided context',
    confidence: Math.min(confidence, 0.75),
    fixSuggestion: 'Add explicit instructions to only use provided context. Consider using a smaller, more focused prompt template.',
    evidence,
    category: 'generation',
  };
}

function analyzeContextRelevance(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];
  let confidence = 0.5;

  if (!trace.rerankApplied) {
    evidence.push('Reranking was not applied - context ordering may not be optimal');
    confidence += 0.2;
  }

  if (trace.rerankImprovement !== undefined && trace.rerankImprovement < 0.1) {
    evidence.push(`Rerank improvement was minimal: ${(trace.rerankImprovement * 100).toFixed(1)}%`);
    confidence += 0.1;
  }

  if (evidence.length === 0) {
    return null;
  }

  return {
    cause: 'Retrieved documents may not be the most relevant for the query',
    confidence: Math.min(confidence, 0.8),
    fixSuggestion: 'Enable or tune reranking. Consider increasing the number of candidates before reranking.',
    evidence,
    category: 'retrieval',
  };
}

function analyzeTimeout(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];
  const confidence = 0.7;

  if (trace.latencyMs !== undefined) {
    evidence.push(`Total latency: ${trace.latencyMs}ms`);
  }

  if (trace.timings) {
    if (trace.timings.search !== undefined && trace.timings.search > 2000) {
      evidence.push(`Search took ${trace.timings.search}ms`);
    }
    if (trace.timings.rerank !== undefined && trace.timings.rerank > 1000) {
      evidence.push(`Reranking took ${trace.timings.rerank}ms`);
    }
    if (trace.timings.embedding !== undefined && trace.timings.embedding > 500) {
      evidence.push(`Embedding took ${trace.timings.embedding}ms`);
    }
    if (trace.timings.generation !== undefined && trace.timings.generation > 3000) {
      evidence.push(`Generation took ${trace.timings.generation}ms`);
    }
  }

  return {
    cause: 'Request processing time exceeded acceptable threshold',
    confidence: Math.min(confidence, 0.95),
    fixSuggestion: 'Review and optimize the slowest stage. Consider caching, reducing candidate count, or using faster models.',
    evidence,
    category: 'infrastructure',
  };
}

function analyzeSearchPerformance(trace: TraceData): RCACandidate | null {
  if (!trace.timings?.search || trace.timings.search <= 1000) {
    return null;
  }

  return {
    cause: 'Vector search is slow - possible index or data scaling issue',
    confidence: 0.6,
    fixSuggestion: 'Check vector index health. Consider HNSW tuning, reducing dimensions, or using approximate search.',
    evidence: [`Search latency: ${trace.timings.search}ms`],
    category: 'infrastructure',
  };
}

function analyzeRerankPerformance(trace: TraceData): RCACandidate | null {
  if (!trace.timings?.rerank || trace.timings.rerank <= 500) {
    return null;
  }

  return {
    cause: 'Reranking is a performance bottleneck',
    confidence: 0.6,
    fixSuggestion: 'Reduce number of candidates sent to reranker or use a faster reranking model.',
    evidence: [`Rerank latency: ${trace.timings.rerank}ms`],
    category: 'configuration',
  };
}

function analyzePolicyBlock(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];

  if (trace.blockReason) {
    evidence.push(`Block reason: ${trace.blockReason}`);
  } else {
    evidence.push('Request was blocked by governance policy');
  }

  return {
    cause: 'Query or response triggered a governance policy rule',
    confidence: 0.9,
    fixSuggestion: 'Review policy configuration. If this is a false positive, adjust policy rules or add exceptions.',
    evidence,
    category: 'configuration',
  };
}

function analyzeEmbeddingIssues(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];
  let confidence = 0.5;

  if (trace.embeddingModel) {
    evidence.push(`Embedding model: ${trace.embeddingModel}`);
  }

  if (trace.relevance !== undefined && trace.relevance < 0.4) {
    evidence.push(`Very low semantic similarity: ${(trace.relevance * 100).toFixed(1)}%`);
    confidence += 0.2;
  }

  return {
    cause: 'Embedding quality may be degraded or model may not be suitable for this domain',
    confidence: Math.min(confidence, 0.75),
    fixSuggestion: 'Consider fine-tuning embeddings for your domain or switching to a domain-specific model.',
    evidence,
    category: 'configuration',
  };
}

function analyzeModelMismatch(trace: TraceData): RCACandidate | null {
  if (!trace.embeddingModel) {
    return null;
  }

  return {
    cause: 'Possible mismatch between query and document embedding models',
    confidence: 0.4,
    fixSuggestion: 'Ensure the same embedding model is used for both indexing and querying.',
    evidence: [`Current model: ${trace.embeddingModel}`],
    category: 'configuration',
  };
}

function analyzeRerankFailure(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];

  if (trace.error?.includes('rerank')) {
    evidence.push(`Rerank error: ${trace.error}`);
  }

  if (trace.rerankApplied === false && trace.plannerPath?.includes('rerank')) {
    evidence.push('Reranking was expected but not applied');
  }

  if (evidence.length === 0) {
    return null;
  }

  return {
    cause: 'Reranking service failed or was unavailable',
    confidence: 0.8,
    fixSuggestion: 'Check reranker service health. Implement fallback to non-reranked results if reranker is unavailable.',
    evidence,
    category: 'infrastructure',
  };
}

function analyzeFallbackBehavior(trace: TraceData): RCACandidate | null {
  if (!trace.error) {
    return null;
  }

  return {
    cause: 'System may not have proper fallback handling for service failures',
    confidence: 0.5,
    fixSuggestion: 'Implement graceful degradation. Return cached or non-reranked results when reranker fails.',
    evidence: ['Fallback behavior may need improvement'],
    category: 'configuration',
  };
}

function analyzeHallucination(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];
  let confidence = 0.7;

  if (trace.faithfulness !== undefined && trace.faithfulness < 0.3) {
    evidence.push(`Very low faithfulness: ${(trace.faithfulness * 100).toFixed(1)}%`);
    confidence += 0.2;
  }

  return {
    cause: 'LLM generated content that is not grounded in the retrieved documents',
    confidence: Math.min(confidence, 0.95),
    fixSuggestion: 'Implement strict citation requirements. Add post-generation verification or use constrained generation.',
    evidence,
    category: 'generation',
  };
}

function analyzeContextCoverage(trace: TraceData): RCACandidate | null {
  if (trace.resultsCount !== undefined && trace.resultsCount < 2) {
    return {
      cause: 'Insufficient context provided to LLM for comprehensive answer',
      confidence: 0.6,
      fixSuggestion: 'Increase the number of retrieved documents. Ensure the collection has sufficient coverage.',
      evidence: [`Only ${trace.resultsCount} documents in context`],
      category: 'retrieval',
    };
  }
  return null;
}

function analyzeStaleContent(trace: TraceData): RCACandidate | null {
  return {
    cause: 'Retrieved documents may contain outdated information',
    confidence: 0.5,
    fixSuggestion: 'Implement document freshness tracking. Add metadata for document age and prioritize recent content.',
    evidence: ['Content staleness detected or reported'],
    category: 'data',
  };
}

function analyzeIndexFreshness(trace: TraceData): RCACandidate | null {
  return {
    cause: 'Document index may not reflect recent updates',
    confidence: 0.4,
    fixSuggestion: 'Review indexing pipeline. Ensure incremental updates are processed promptly.',
    evidence: ['Index freshness may be degraded'],
    category: 'infrastructure',
  };
}

function analyzeQueryMismatch(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];

  if (trace.queryText) {
    const hasQuestion = /\?/.test(trace.queryText);
    const isShort = trace.queryText.split(/\s+/).length < 4;

    if (isShort && !hasQuestion) {
      evidence.push('Query appears to be a keyword search rather than a question');
    }
  }

  if (evidence.length === 0) {
    evidence.push('Query intent may not be well understood');
  }

  return {
    cause: 'System may have misinterpreted the query intent',
    confidence: 0.5,
    fixSuggestion: 'Add query understanding/classification. Consider query reformulation or expansion.',
    evidence,
    category: 'retrieval',
  };
}

function analyzeIntentClassification(trace: TraceData): RCACandidate | null {
  return {
    cause: 'Query routing may have selected suboptimal retrieval strategy',
    confidence: 0.4,
    fixSuggestion: 'Review autopilot/router configuration. Add intent classification for better strategy selection.',
    evidence: [trace.plannerPath ? `Planner path: ${trace.plannerPath}` : 'Planner path unknown'],
    category: 'configuration',
  };
}

function analyzeEmptyResults(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];
  let confidence = 0.7;

  evidence.push('No documents matched the query');

  if (trace.queryText && trace.queryText.length > 50) {
    evidence.push('Long query may be too specific for indexed content');
    confidence += 0.1;
  }

  return {
    cause: 'No documents in the collection match the query',
    confidence: Math.min(confidence, 0.9),
    fixSuggestion: 'Expand document collection or relax search parameters. Consider semantic fallback for keyword queries.',
    evidence,
    category: 'data',
  };
}

function analyzeIndexCoverage(trace: TraceData): RCACandidate | null {
  return {
    cause: 'Document collection may have gaps in topic coverage',
    confidence: 0.5,
    fixSuggestion: 'Analyze query patterns to identify missing topics. Add documentation for common unanswered questions.',
    evidence: ['Topic coverage analysis recommended'],
    category: 'data',
  };
}

function analyzeUnknownIssue(trace: TraceData): RCACandidate | null {
  const evidence: string[] = [];

  if (trace.error) {
    evidence.push(`Error: ${trace.error}`);
  }

  return {
    cause: 'Issue could not be automatically classified',
    confidence: 0.3,
    fixSuggestion: 'Manual investigation required. Review full trace data and recent changes.',
    evidence: evidence.length > 0 ? evidence : ['No clear error pattern identified'],
    category: 'retrieval',
  };
}

function analyzeGenericIssues(trace: TraceData): RCACandidate | null {
  // Check for cache miss impact
  if (trace.cacheHit === false && trace.latencyMs !== undefined && trace.latencyMs > 3000) {
    return {
      cause: 'Cache miss contributed to high latency',
      confidence: 0.4,
      fixSuggestion: 'Review cache configuration. Consider warming cache for common queries.',
      evidence: ['Cache miss on slow request'],
      category: 'configuration',
    };
  }

  return null;
}

// ============================================
// Export utilities
// ============================================

/**
 * Get fix suggestions for a list of RCA candidates
 */
export function getFixSuggestions(candidates: RCACandidate[]): string[] {
  return candidates
    .filter(c => c.confidence >= 0.5)
    .map(c => c.fixSuggestion);
}

/**
 * Get the primary cause from RCA result
 */
export function getPrimaryCause(result: RCAResult): RCACandidate | null {
  return result.candidates[0] ?? null;
}

/**
 * Summarize RCA result for display
 */
export function summarizeRCA(result: RCAResult): string {
  const primary = getPrimaryCause(result);
  if (!primary) {
    return 'Unable to determine root cause';
  }

  return `${primary.cause} (${(primary.confidence * 100).toFixed(0)}% confidence)`;
}
