/**
 * Seizn Eval Pipeline - Extended Metrics Module
 * Implements standard IR evaluation metrics: MRR, Recall@K, NDCG, Precision@K, Hit Rate
 */

import type { EvalCaseMetrics, EvalRunMetrics, KValue } from './types';

// ============================================
// Core Metric Interfaces
// ============================================

export interface RagMetrics {
  context_precision?: number;
  context_recall?: number;
  mrr?: number;
  faithfulness?: number;
  faithfulness_explanation?: string;
}

export interface FaithfulnessInput {
  answer: string;
  contextChunks: { id: string; text: string }[];
}

/**
 * Input for computing retrieval metrics
 */
export interface RetrievalMetricsInput {
  /** Retrieved document/chunk IDs in order */
  retrievedIds: string[];
  /** Expected relevant document/chunk IDs in order of relevance */
  expectedIds: string[];
  /** Graded relevance scores for expected IDs (optional, for NDCG) */
  relevanceScores?: number[];
  /** K values to compute @K metrics for */
  kValues?: KValue[];
}

// ============================================
// Individual Metric Functions
// ============================================

/**
 * Compute Mean Reciprocal Rank (MRR)
 * MRR = 1 / rank of first relevant result
 */
export function computeMRR(
  retrievedIds: string[],
  expectedIds: string[]
): number {
  if (expectedIds.length === 0 || retrievedIds.length === 0) {
    return 0;
  }

  const expectedSet = new Set(expectedIds);

  for (let i = 0; i < retrievedIds.length; i++) {
    if (expectedSet.has(retrievedIds[i])) {
      return 1 / (i + 1);
    }
  }

  return 0;
}

/**
 * Compute Recall@K
 * Recall@K = |relevant in top K| / |total relevant|
 */
export function computeRecallAtK(
  retrievedIds: string[],
  expectedIds: string[],
  k: number
): number {
  if (expectedIds.length === 0) {
    return 0;
  }

  const expectedSet = new Set(expectedIds);
  const topK = retrievedIds.slice(0, k);
  const relevantInTopK = topK.filter((id) => expectedSet.has(id)).length;

  return relevantInTopK / expectedIds.length;
}

/**
 * Compute Precision@K
 * Precision@K = |relevant in top K| / K
 */
export function computePrecisionAtK(
  retrievedIds: string[],
  expectedIds: string[],
  k: number
): number {
  if (k === 0) {
    return 0;
  }

  const expectedSet = new Set(expectedIds);
  const topK = retrievedIds.slice(0, k);
  const relevantInTopK = topK.filter((id) => expectedSet.has(id)).length;

  return relevantInTopK / Math.min(k, topK.length || 1);
}

/**
 * Compute Hit Rate
 * Hit Rate = 1 if at least one relevant result in retrieved, 0 otherwise
 */
export function computeHitRate(
  retrievedIds: string[],
  expectedIds: string[],
  k?: number
): number {
  if (expectedIds.length === 0 || retrievedIds.length === 0) {
    return 0;
  }

  const expectedSet = new Set(expectedIds);
  const searchList = k ? retrievedIds.slice(0, k) : retrievedIds;

  for (const id of searchList) {
    if (expectedSet.has(id)) {
      return 1;
    }
  }

  return 0;
}

/**
 * Compute Discounted Cumulative Gain (DCG)
 */
export function computeDCG(relevanceScores: number[], k?: number): number {
  const scores = k ? relevanceScores.slice(0, k) : relevanceScores;
  let dcg = 0;

  for (let i = 0; i < scores.length; i++) {
    dcg += scores[i] / Math.log2(i + 2);
  }

  return dcg;
}

/**
 * Compute Normalized Discounted Cumulative Gain (NDCG)
 * NDCG = DCG / IDCG where IDCG is the ideal DCG
 */
export function computeNDCG(
  retrievedIds: string[],
  expectedIds: string[],
  relevanceScores?: number[],
  k?: number
): number {
  if (expectedIds.length === 0) {
    return 0;
  }

  const relevanceMap = new Map<string, number>();
  for (let i = 0; i < expectedIds.length; i++) {
    const score = relevanceScores?.[i] ?? (expectedIds.length - i);
    relevanceMap.set(expectedIds[i], score);
  }

  const actualScores: number[] = retrievedIds.map(
    (id) => relevanceMap.get(id) ?? 0
  );
  const idealScores = Array.from(relevanceMap.values()).sort((a, b) => b - a);

  const dcg = computeDCG(actualScores, k);
  const idcg = computeDCG(idealScores, k);

  if (idcg === 0) {
    return 0;
  }

  return dcg / idcg;
}

// ============================================
// Aggregate Metric Functions
// ============================================

/**
 * Compute all retrieval metrics for a single case
 */
export function computeAllMetrics(input: RetrievalMetricsInput): EvalCaseMetrics {
  const { retrievedIds, expectedIds, relevanceScores, kValues = [5, 10, 20] } = input;

  if (expectedIds.length === 0 || retrievedIds.length === 0) {
    return {};
  }

  const metrics: EvalCaseMetrics = {
    mrr: computeMRR(retrievedIds, expectedIds),
    hit_rate: computeHitRate(retrievedIds, expectedIds),
    ndcg: computeNDCG(retrievedIds, expectedIds, relevanceScores),
    context_precision: computePrecisionAtK(retrievedIds, expectedIds, retrievedIds.length),
    context_recall: computeRecallAtK(retrievedIds, expectedIds, retrievedIds.length),
  };

  for (const k of kValues) {
    metrics[`recall_at_${k}`] = computeRecallAtK(retrievedIds, expectedIds, k);
    metrics[`precision_at_${k}`] = computePrecisionAtK(retrievedIds, expectedIds, k);
    metrics[`ndcg_at_${k}`] = computeNDCG(retrievedIds, expectedIds, relevanceScores, k);
  }

  return metrics;
}

function safeDiv(num: number, den: number): number {
  if (den <= 0) return 0;
  return num / den;
}

/**
 * Compute context precision and recall (legacy compatibility)
 */
export function computeContextPrecisionRecall(params: {
  retrievedChunkIds: string[];
  expectedChunkIds?: string[] | null;
}): Pick<RagMetrics, 'context_precision' | 'context_recall' | 'mrr'> {
  const expected = (params.expectedChunkIds ?? []).filter(Boolean);
  const retrieved = params.retrievedChunkIds ?? [];

  if (expected.length === 0 || retrieved.length === 0) {
    return { context_precision: undefined, context_recall: undefined, mrr: undefined };
  }

  const expectedSet = new Set(expected);
  const hits = retrieved.filter((id) => expectedSet.has(id));

  const precision = safeDiv(hits.length, retrieved.length);
  const recall = safeDiv(hits.length, expected.length);
  const mrr = computeMRR(retrieved, expected);

  return { context_precision: precision, context_recall: recall, mrr };
}

/**
 * Compute aggregate metrics from individual case metrics (legacy signature)
 */
export function computeAggregateMetricsLegacy(
  metrics: RagMetrics[]
): Record<string, number | null> {
  const sums: Record<string, { sum: number; count: number }> = {};
  const keys: (keyof RagMetrics)[] = ['context_precision', 'context_recall', 'mrr', 'faithfulness'];

  for (const m of metrics) {
    for (const key of keys) {
      const val = m[key];
      if (typeof val === 'number' && Number.isFinite(val)) {
        if (!sums[key]) sums[key] = { sum: 0, count: 0 };
        sums[key].sum += val;
        sums[key].count += 1;
      }
    }
  }

  const result: Record<string, number | null> = {};
  for (const key of keys) {
    result[`avg_${key}`] = sums[key]?.count ? sums[key].sum / sums[key].count : null;
  }

  return result;
}

/**
 * Compute aggregate metrics from individual case metrics
 */
export function computeAggregateMetrics(
  caseMetrics: EvalCaseMetrics[]
): EvalRunMetrics {
  const total = caseMetrics.length;
  const labeled = caseMetrics.filter(
    (m) => m.mrr !== undefined || m.hit_rate !== undefined
  ).length;

  const summary: EvalRunMetrics = {
    total_cases: total,
    cases_with_labels: labeled,
  };

  const metricKeys = [
    'mrr', 'hit_rate', 'ndcg', 'ndcg_at_5', 'ndcg_at_10', 'ndcg_at_20',
    'recall_at_5', 'recall_at_10', 'recall_at_20',
    'precision_at_5', 'precision_at_10', 'precision_at_20',
    'context_precision', 'context_recall', 'faithfulness',
  ];

  for (const key of metricKeys) {
    const values = caseMetrics
      .map((m) => m[key])
      .filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];

    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      (summary as unknown as Record<string, unknown>)[`avg_${key}`] = avg;
    }
  }

  const mrrValues = caseMetrics
    .map((m) => m.mrr)
    .filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];

  if (mrrValues.length > 0) {
    mrrValues.sort((a, b) => a - b);
    summary.p50_mrr = percentile(mrrValues, 50);
    summary.p90_mrr = percentile(mrrValues, 90);
    summary.p99_mrr = percentile(mrrValues, 99);
    summary.std_mrr = standardDeviation(mrrValues);
  }

  const ndcgValues = caseMetrics
    .map((m) => m.ndcg)
    .filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];

  if (ndcgValues.length > 0) {
    summary.std_ndcg = standardDeviation(ndcgValues);
  }

  return summary;
}

// ============================================
// Metric Comparison Functions
// ============================================

/**
 * Compare metrics between two runs
 */
export function compareMetrics(
  baseline: EvalRunMetrics,
  candidate: EvalRunMetrics
): Record<string, { baseline: number; candidate: number; delta: number; deltaPercent: number }> {
  const result: Record<string, { baseline: number; candidate: number; delta: number; deltaPercent: number }> = {};

  const keys = Object.keys(baseline).filter((k) => k.startsWith('avg_'));

  for (const key of keys) {
    const baselineVal = (baseline as unknown as Record<string, unknown>)[key];
    const candidateVal = (candidate as unknown as Record<string, unknown>)[key];

    if (typeof baselineVal === 'number' && typeof candidateVal === 'number') {
      const delta = candidateVal - baselineVal;
      const deltaPercent = baselineVal !== 0 ? (delta / baselineVal) * 100 : 0;

      result[key] = { baseline: baselineVal, candidate: candidateVal, delta, deltaPercent };
    }
  }

  return result;
}

/**
 * Check if metrics indicate regression
 */
export function checkRegression(
  comparison: ReturnType<typeof compareMetrics>,
  threshold: number = 0.02
): { hasRegression: boolean; regressedMetrics: string[] } {
  const regressedMetrics: string[] = [];

  for (const [key, values] of Object.entries(comparison)) {
    if (values.delta < -threshold) {
      regressedMetrics.push(key);
    }
  }

  return { hasRegression: regressedMetrics.length > 0, regressedMetrics };
}

// ============================================
// Utility Functions
// ============================================

export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);

  return Math.sqrt(variance);
}

// ============================================
// Batch Processing
// ============================================

/**
 * Compute metrics for a batch of cases efficiently
 */
export function computeBatchMetrics(
  cases: Array<{
    retrievedIds: string[];
    expectedIds: string[];
    relevanceScores?: number[];
  }>,
  kValues: KValue[] = [5, 10, 20]
): {
  caseMetrics: EvalCaseMetrics[];
  aggregateMetrics: EvalRunMetrics;
} {
  const caseMetrics = cases.map((c) =>
    computeAllMetrics({
      retrievedIds: c.retrievedIds,
      expectedIds: c.expectedIds,
      relevanceScores: c.relevanceScores,
      kValues,
    })
  );

  const aggregateMetrics = computeAggregateMetrics(caseMetrics);

  return { caseMetrics, aggregateMetrics };
}
