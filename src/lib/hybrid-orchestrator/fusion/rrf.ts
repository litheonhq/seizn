/**
 * Reciprocal Rank Fusion (RRF)
 *
 * A rank-based fusion method that combines results from multiple strategies
 * using the formula: score = sum(1 / (k + rank_i))
 *
 * RRF is effective because:
 * - It's parameter-free (k is stable across datasets)
 * - It works with ranks, not raw scores (no normalization needed)
 * - It naturally handles missing results
 *
 * Reference: Cormack, G. V., Clarke, C. L., & Buettcher, S. (2009).
 * "Reciprocal rank fusion outperforms condorcet and individual rank learning methods."
 */

import type {
  StrategyType,
  StrategyResult,
  FusedResult,
} from '../types';

/**
 * Default k value for RRF
 *
 * k=60 is commonly used in literature.
 * Higher k smooths out ranking differences.
 * Lower k amplifies differences between top ranks.
 */
export const DEFAULT_RRF_K = 60;

/**
 * Reciprocal Rank Fusion
 *
 * Combines results from multiple strategies using rank-based scoring.
 * Results that appear in multiple strategies get higher scores.
 *
 * @param results - Map of strategy type to results
 * @param k - RRF smoothing parameter (default: 60)
 * @param topK - Maximum results to return
 * @returns Fused results sorted by final score
 */
export function reciprocalRankFusion(
  results: Map<StrategyType, StrategyResult[]>,
  k: number = DEFAULT_RRF_K,
  topK?: number
): FusedResult[] {
  // Map to accumulate RRF scores per document
  const rrfScores = new Map<
    string,
    {
      score: number;
      strategies: StrategyType[];
      strategyScores: Record<StrategyType, number>;
      data?: StrategyResult['data'];
    }
  >();

  // Calculate RRF scores
  for (const [strategyType, strategyResults] of results) {
    for (const result of strategyResults) {
      const rrfContribution = 1 / (k + result.rank);

      const existing = rrfScores.get(result.id);
      if (existing) {
        existing.score += rrfContribution;
        existing.strategies.push(strategyType);
        existing.strategyScores[strategyType] = result.score;
        // Prefer data from highest-scoring strategy
        if (!existing.data || result.score > (existing.strategyScores[existing.strategies[0]] ?? 0)) {
          existing.data = result.data;
        }
      } else {
        rrfScores.set(result.id, {
          score: rrfContribution,
          strategies: [strategyType],
          strategyScores: { [strategyType]: result.score } as Record<StrategyType, number>,
          data: result.data,
        });
      }
    }
  }

  // Convert to array and sort by RRF score
  const fusedResults: FusedResult[] = Array.from(rrfScores.entries())
    .map(([id, info]) => ({
      id,
      finalScore: info.score,
      rank: 0, // Will be assigned after sorting
      sourceStrategies: info.strategies,
      strategyScores: info.strategyScores,
      data: info.data,
    }))
    .sort((a, b) => b.finalScore - a.finalScore);

  // Assign ranks
  fusedResults.forEach((result, index) => {
    result.rank = index + 1;
  });

  // Apply topK limit if specified
  if (topK !== undefined && topK > 0) {
    return fusedResults.slice(0, topK);
  }

  return fusedResults;
}

/**
 * Weighted Reciprocal Rank Fusion
 *
 * Variant of RRF that applies strategy-specific weights.
 * Useful when some strategies are known to be more reliable.
 *
 * @param results - Map of strategy type to results
 * @param weights - Strategy weights (should sum to 1.0)
 * @param k - RRF smoothing parameter
 * @param topK - Maximum results to return
 * @returns Fused results sorted by final score
 */
export function weightedReciprocalRankFusion(
  results: Map<StrategyType, StrategyResult[]>,
  weights: Record<StrategyType, number>,
  k: number = DEFAULT_RRF_K,
  topK?: number
): FusedResult[] {
  // Normalize weights
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const normalizedWeights: Record<StrategyType, number> = {} as Record<StrategyType, number>;
  for (const [strategy, weight] of Object.entries(weights)) {
    normalizedWeights[strategy as StrategyType] = weight / totalWeight;
  }

  // Map to accumulate weighted RRF scores
  const rrfScores = new Map<
    string,
    {
      score: number;
      strategies: StrategyType[];
      strategyScores: Record<StrategyType, number>;
      data?: StrategyResult['data'];
    }
  >();

  // Calculate weighted RRF scores
  for (const [strategyType, strategyResults] of results) {
    const weight = normalizedWeights[strategyType] ?? 1;

    for (const result of strategyResults) {
      const rrfContribution = weight * (1 / (k + result.rank));

      const existing = rrfScores.get(result.id);
      if (existing) {
        existing.score += rrfContribution;
        existing.strategies.push(strategyType);
        existing.strategyScores[strategyType] = result.score;
        if (!existing.data) {
          existing.data = result.data;
        }
      } else {
        rrfScores.set(result.id, {
          score: rrfContribution,
          strategies: [strategyType],
          strategyScores: { [strategyType]: result.score } as Record<StrategyType, number>,
          data: result.data,
        });
      }
    }
  }

  // Convert to array and sort
  const fusedResults: FusedResult[] = Array.from(rrfScores.entries())
    .map(([id, info]) => ({
      id,
      finalScore: info.score,
      rank: 0,
      sourceStrategies: info.strategies,
      strategyScores: info.strategyScores,
      data: info.data,
    }))
    .sort((a, b) => b.finalScore - a.finalScore);

  // Assign ranks
  fusedResults.forEach((result, index) => {
    result.rank = index + 1;
  });

  if (topK !== undefined && topK > 0) {
    return fusedResults.slice(0, topK);
  }

  return fusedResults;
}

/**
 * Calculate theoretical maximum RRF score
 *
 * Useful for normalizing RRF scores to 0-1 range.
 *
 * @param numStrategies - Number of strategies
 * @param k - RRF k parameter
 * @returns Maximum possible RRF score
 */
export function maxRRFScore(numStrategies: number, k: number = DEFAULT_RRF_K): number {
  // Max score occurs when document is rank 1 in all strategies
  return numStrategies * (1 / (k + 1));
}

/**
 * Normalize RRF scores to 0-1 range
 *
 * @param results - Fused results with RRF scores
 * @param numStrategies - Number of strategies
 * @param k - RRF k parameter
 * @returns Results with normalized scores
 */
export function normalizeRRFScores(
  results: FusedResult[],
  numStrategies: number,
  k: number = DEFAULT_RRF_K
): FusedResult[] {
  const maxScore = maxRRFScore(numStrategies, k);

  return results.map((result) => ({
    ...result,
    finalScore: result.finalScore / maxScore,
  }));
}
