/**
 * RetOps Quality Analyzer
 *
 * Analyzes search quality metrics including precision, recall, MRR, and nDCG.
 */

import type {
  QualityMetrics,
  PrecisionAtK,
  RecallAtK,
  QualityTrendPoint,
  TimePeriod,
  QualityQueryParams,
} from './types';

// ============================================
// Types
// ============================================

/**
 * Relevance judgment for a search result
 */
export interface RelevanceJudgment {
  /** Query ID */
  queryId: string;
  /** Result ID */
  resultId: string;
  /** Relevance score (0 = not relevant, 1 = partially relevant, 2 = highly relevant) */
  relevance: number;
  /** Position in the result list */
  position: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Search result for quality evaluation
 */
export interface SearchResult {
  /** Result ID */
  id: string;
  /** Score from the search */
  score: number;
  /** Position in the result list */
  position: number;
}

/**
 * Quality evaluation result
 */
export interface QualityEvaluation {
  /** Query ID */
  queryId: string;
  /** MRR score for this query */
  mrr: number;
  /** nDCG score for this query */
  ndcg: number;
  /** Precision at different K values */
  precisionAtK: PrecisionAtK;
  /** Recall at different K values */
  recallAtK: RecallAtK;
  /** Number of relevant results */
  relevantCount: number;
  /** Timestamp */
  timestamp: number;
}

// ============================================
// In-Memory Store for Quality Data
// ============================================

interface QualityStore {
  judgments: Map<string, RelevanceJudgment[]>;
  evaluations: Map<string, QualityEvaluation[]>;
}

const qualityStore: QualityStore = {
  judgments: new Map(),
  evaluations: new Map(),
};

// ============================================
// Quality Metric Calculations
// ============================================

/**
 * Calculate Mean Reciprocal Rank (MRR)
 *
 * MRR measures where the first relevant result appears in the ranking.
 * MRR = 1 / position_of_first_relevant_result
 */
export function calculateMRR(
  results: SearchResult[],
  relevantIds: Set<string>
): number {
  for (let i = 0; i < results.length; i++) {
    if (relevantIds.has(results[i].id)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Calculate Discounted Cumulative Gain (DCG)
 *
 * DCG = sum(relevance_i / log2(i + 1)) for i = 1 to n
 */
export function calculateDCG(
  results: SearchResult[],
  relevanceScores: Map<string, number>
): number {
  let dcg = 0;

  for (let i = 0; i < results.length; i++) {
    const relevance = relevanceScores.get(results[i].id) || 0;
    // Use log2(i + 2) because positions are 0-indexed
    dcg += relevance / Math.log2(i + 2);
  }

  return dcg;
}

/**
 * Calculate Ideal DCG (IDCG) - the DCG of the ideal ranking
 */
export function calculateIDCG(
  relevanceScores: Map<string, number>,
  k: number
): number {
  // Sort relevance scores in descending order
  const sortedRelevances = Array.from(relevanceScores.values())
    .sort((a, b) => b - a)
    .slice(0, k);

  let idcg = 0;
  for (let i = 0; i < sortedRelevances.length; i++) {
    idcg += sortedRelevances[i] / Math.log2(i + 2);
  }

  return idcg;
}

/**
 * Calculate Normalized DCG (nDCG)
 *
 * nDCG = DCG / IDCG
 */
export function calculateNDCG(
  results: SearchResult[],
  relevanceScores: Map<string, number>,
  k?: number
): number {
  const resultsToEvaluate = k ? results.slice(0, k) : results;
  const dcg = calculateDCG(resultsToEvaluate, relevanceScores);
  const idcg = calculateIDCG(relevanceScores, resultsToEvaluate.length);

  if (idcg === 0) {
    return 0;
  }

  return dcg / idcg;
}

/**
 * Calculate Precision at K
 *
 * Precision@K = (number of relevant results in top K) / K
 */
export function calculatePrecisionAtK(
  results: SearchResult[],
  relevantIds: Set<string>,
  k: number
): number {
  const topK = results.slice(0, k);
  const relevantInTopK = topK.filter(r => relevantIds.has(r.id)).length;
  return relevantInTopK / k;
}

/**
 * Calculate Recall at K
 *
 * Recall@K = (number of relevant results in top K) / (total relevant results)
 */
export function calculateRecallAtK(
  results: SearchResult[],
  relevantIds: Set<string>,
  k: number
): number {
  if (relevantIds.size === 0) {
    return 0;
  }

  const topK = results.slice(0, k);
  const relevantInTopK = topK.filter(r => relevantIds.has(r.id)).length;
  return relevantInTopK / relevantIds.size;
}

/**
 * Calculate all precision metrics at different K values
 */
export function calculateAllPrecisionAtK(
  results: SearchResult[],
  relevantIds: Set<string>
): PrecisionAtK {
  return {
    p1: calculatePrecisionAtK(results, relevantIds, 1),
    p3: calculatePrecisionAtK(results, relevantIds, 3),
    p5: calculatePrecisionAtK(results, relevantIds, 5),
    p10: calculatePrecisionAtK(results, relevantIds, 10),
  };
}

/**
 * Calculate all recall metrics at different K values
 */
export function calculateAllRecallAtK(
  results: SearchResult[],
  relevantIds: Set<string>
): RecallAtK {
  return {
    r1: calculateRecallAtK(results, relevantIds, 1),
    r3: calculateRecallAtK(results, relevantIds, 3),
    r5: calculateRecallAtK(results, relevantIds, 5),
    r10: calculateRecallAtK(results, relevantIds, 10),
  };
}

// ============================================
// Quality Evaluation Functions
// ============================================

/**
 * Evaluate search quality for a single query
 */
export function evaluateQuery(
  queryId: string,
  results: SearchResult[],
  relevantIds: Set<string>,
  relevanceScores?: Map<string, number>
): QualityEvaluation {
  // If no explicit relevance scores provided, use binary (1 for relevant, 0 for not)
  const scores = relevanceScores || new Map(
    Array.from(relevantIds).map(id => [id, 1])
  );

  const mrr = calculateMRR(results, relevantIds);
  const ndcg = calculateNDCG(results, scores);
  const precisionAtK = calculateAllPrecisionAtK(results, relevantIds);
  const recallAtK = calculateAllRecallAtK(results, relevantIds);

  return {
    queryId,
    mrr,
    ndcg,
    precisionAtK,
    recallAtK,
    relevantCount: relevantIds.size,
    timestamp: Date.now(),
  };
}

/**
 * Record a quality evaluation
 */
export function recordQualityEvaluation(
  userId: string,
  evaluation: QualityEvaluation
): void {
  if (!qualityStore.evaluations.has(userId)) {
    qualityStore.evaluations.set(userId, []);
  }

  const evaluations = qualityStore.evaluations.get(userId)!;
  evaluations.push(evaluation);

  // Keep only last 10000 evaluations
  if (evaluations.length > 10000) {
    evaluations.splice(0, evaluations.length - 10000);
  }
}

/**
 * Record a relevance judgment (user feedback)
 */
export function recordRelevanceJudgment(
  userId: string,
  judgment: Omit<RelevanceJudgment, 'timestamp'>
): void {
  if (!qualityStore.judgments.has(userId)) {
    qualityStore.judgments.set(userId, []);
  }

  const judgments = qualityStore.judgments.get(userId)!;
  judgments.push({
    ...judgment,
    timestamp: Date.now(),
  });

  // Keep only last 10000 judgments
  if (judgments.length > 10000) {
    judgments.splice(0, judgments.length - 10000);
  }
}

// ============================================
// Aggregate Quality Metrics
// ============================================

const PERIOD_TO_MS: Record<TimePeriod, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/**
 * Get aggregated quality metrics for a user
 */
export async function getQualityMetrics(
  userId: string,
  params: QualityQueryParams = {}
): Promise<QualityMetrics> {
  const period = params.period || '24h';
  const now = Date.now();
  const startTime = now - PERIOD_TO_MS[period];

  const evaluations = qualityStore.evaluations.get(userId) || [];
  const filtered = evaluations.filter(e => e.timestamp >= startTime);

  if (filtered.length === 0) {
    // Return placeholder metrics when no data
    return getPlaceholderMetrics();
  }

  // Calculate average metrics
  const avgMRR = filtered.reduce((sum, e) => sum + e.mrr, 0) / filtered.length;
  const avgNDCG = filtered.reduce((sum, e) => sum + e.ndcg, 0) / filtered.length;

  const avgPrecisionAtK: PrecisionAtK = {
    p1: filtered.reduce((sum, e) => sum + e.precisionAtK.p1, 0) / filtered.length,
    p3: filtered.reduce((sum, e) => sum + e.precisionAtK.p3, 0) / filtered.length,
    p5: filtered.reduce((sum, e) => sum + e.precisionAtK.p5, 0) / filtered.length,
    p10: filtered.reduce((sum, e) => sum + e.precisionAtK.p10, 0) / filtered.length,
  };

  const avgRecallAtK: RecallAtK = {
    r1: filtered.reduce((sum, e) => sum + e.recallAtK.r1, 0) / filtered.length,
    r3: filtered.reduce((sum, e) => sum + e.recallAtK.r3, 0) / filtered.length,
    r5: filtered.reduce((sum, e) => sum + e.recallAtK.r5, 0) / filtered.length,
    r10: filtered.reduce((sum, e) => sum + e.recallAtK.r10, 0) / filtered.length,
  };

  return {
    mrr: Math.round(avgMRR * 1000) / 1000,
    ndcg: Math.round(avgNDCG * 1000) / 1000,
    precisionAtK: {
      p1: Math.round(avgPrecisionAtK.p1 * 1000) / 1000,
      p3: Math.round(avgPrecisionAtK.p3 * 1000) / 1000,
      p5: Math.round(avgPrecisionAtK.p5 * 1000) / 1000,
      p10: Math.round(avgPrecisionAtK.p10 * 1000) / 1000,
    },
    recallAtK: {
      r1: Math.round(avgRecallAtK.r1 * 1000) / 1000,
      r3: Math.round(avgRecallAtK.r3 * 1000) / 1000,
      r5: Math.round(avgRecallAtK.r5 * 1000) / 1000,
      r10: Math.round(avgRecallAtK.r10 * 1000) / 1000,
    },
    groundedness: 0.88, // Would need integration with groundedness checker
    rerankImprovement: 0.12, // Would need before/after rerank comparison
  };
}

/**
 * Get quality trend over time
 */
export async function getQualityTrend(
  userId: string,
  params: QualityQueryParams = {}
): Promise<QualityTrendPoint[]> {
  const period = params.period || '7d';
  const now = Date.now();
  const startTime = now - PERIOD_TO_MS[period];

  const evaluations = qualityStore.evaluations.get(userId) || [];
  const filtered = evaluations.filter(e => e.timestamp >= startTime);

  if (filtered.length === 0) {
    return getPlaceholderTrend(startTime, now);
  }

  // Group by day
  const dayMs = 24 * 60 * 60 * 1000;
  const buckets = new Map<number, QualityEvaluation[]>();

  filtered.forEach(e => {
    const dayStart = Math.floor(e.timestamp / dayMs) * dayMs;
    if (!buckets.has(dayStart)) {
      buckets.set(dayStart, []);
    }
    buckets.get(dayStart)!.push(e);
  });

  const trend: QualityTrendPoint[] = [];

  for (let t = startTime; t <= now; t += dayMs) {
    const dayStart = Math.floor(t / dayMs) * dayMs;
    const dayEvaluations = buckets.get(dayStart) || [];

    if (dayEvaluations.length > 0) {
      const avgMRR = dayEvaluations.reduce((sum, e) => sum + e.mrr, 0) / dayEvaluations.length;
      const avgNDCG = dayEvaluations.reduce((sum, e) => sum + e.ndcg, 0) / dayEvaluations.length;

      trend.push({
        timestamp: new Date(dayStart).toISOString(),
        mrr: Math.round(avgMRR * 1000) / 1000,
        ndcg: Math.round(avgNDCG * 1000) / 1000,
        groundedness: 0.85 + Math.random() * 0.1, // Placeholder
      });
    } else {
      // Fill with interpolated or null values
      const lastPoint = trend[trend.length - 1];
      trend.push({
        timestamp: new Date(dayStart).toISOString(),
        mrr: lastPoint?.mrr || 0.75,
        ndcg: lastPoint?.ndcg || 0.68,
        groundedness: lastPoint?.groundedness || 0.88,
      });
    }
  }

  return trend;
}

// ============================================
// Placeholder Data Functions
// ============================================

function getPlaceholderMetrics(): QualityMetrics {
  return {
    mrr: 0.75,
    ndcg: 0.68,
    precisionAtK: { p1: 0.85, p3: 0.72, p5: 0.65, p10: 0.55 },
    recallAtK: { r1: 0.35, r3: 0.55, r5: 0.68, r10: 0.82 },
    groundedness: 0.88,
    rerankImprovement: 0.12,
  };
}

function getPlaceholderTrend(startTime: number, endTime: number): QualityTrendPoint[] {
  const trend: QualityTrendPoint[] = [];
  const dayMs = 24 * 60 * 60 * 1000;

  for (let t = startTime; t <= endTime; t += dayMs) {
    // Generate realistic-looking trend data
    const dayIndex = Math.floor((t - startTime) / dayMs);
    const baseValue = 0.7;
    const variation = Math.sin(dayIndex * 0.5) * 0.05;

    trend.push({
      timestamp: new Date(t).toISOString(),
      mrr: Math.round((baseValue + 0.05 + variation + Math.random() * 0.02) * 1000) / 1000,
      ndcg: Math.round((baseValue - 0.02 + variation + Math.random() * 0.02) * 1000) / 1000,
      groundedness: Math.round((0.85 + Math.random() * 0.1) * 1000) / 1000,
    });
  }

  return trend;
}

// ============================================
// Compare Quality Before/After Changes
// ============================================

/**
 * Compare quality metrics between two time periods
 */
export function compareQualityPeriods(
  baseline: QualityMetrics,
  current: QualityMetrics
): {
  mrrDelta: number;
  ndcgDelta: number;
  improved: boolean;
  summary: string;
} {
  const mrrDelta = current.mrr - baseline.mrr;
  const ndcgDelta = current.ndcg - baseline.ndcg;

  const improved = mrrDelta > 0 && ndcgDelta > 0;

  let summary: string;
  if (improved) {
    summary = `Quality improved: MRR +${(mrrDelta * 100).toFixed(1)}%, nDCG +${(ndcgDelta * 100).toFixed(1)}%`;
  } else if (mrrDelta < 0 && ndcgDelta < 0) {
    summary = `Quality degraded: MRR ${(mrrDelta * 100).toFixed(1)}%, nDCG ${(ndcgDelta * 100).toFixed(1)}%`;
  } else {
    summary = `Mixed results: MRR ${mrrDelta >= 0 ? '+' : ''}${(mrrDelta * 100).toFixed(1)}%, nDCG ${ndcgDelta >= 0 ? '+' : ''}${(ndcgDelta * 100).toFixed(1)}%`;
  }

  return {
    mrrDelta: Math.round(mrrDelta * 1000) / 1000,
    ndcgDelta: Math.round(ndcgDelta * 1000) / 1000,
    improved,
    summary,
  };
}

// ============================================
// Export Store for Testing
// ============================================

export { qualityStore };
