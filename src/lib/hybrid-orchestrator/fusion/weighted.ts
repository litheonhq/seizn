/**
 * Weighted Sum Fusion
 *
 * Combines results using normalized scores with strategy-specific weights.
 * More suitable when raw scores are comparable across strategies.
 */

import type {
  StrategyType,
  StrategyResult,
  FusedResult,
} from '../types';

/**
 * Weighted Sum Fusion
 *
 * Combines results by:
 * 1. Normalizing scores within each strategy (min-max normalization)
 * 2. Applying strategy weights
 * 3. Summing weighted scores for each document
 *
 * @param results - Map of strategy type to results
 * @param weights - Strategy weights (e.g., { vector: 0.7, keyword: 0.3 })
 * @param topK - Maximum results to return
 * @returns Fused results sorted by final score
 */
export function weightedFusion(
  results: Map<StrategyType, StrategyResult[]>,
  weights: Record<StrategyType, number>,
  topK?: number
): FusedResult[] {
  // Normalize weights
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const normalizedWeights: Record<StrategyType, number> = {} as Record<StrategyType, number>;
  for (const [strategy, weight] of Object.entries(weights)) {
    normalizedWeights[strategy as StrategyType] = weight / totalWeight;
  }

  // Normalize scores within each strategy
  const normalizedResults = new Map<StrategyType, StrategyResult[]>();
  for (const [strategyType, strategyResults] of results) {
    normalizedResults.set(
      strategyType,
      normalizeScores(strategyResults)
    );
  }

  // Accumulate weighted scores
  const combinedScores = new Map<
    string,
    {
      score: number;
      strategies: StrategyType[];
      strategyScores: Record<StrategyType, number>;
      data?: StrategyResult['data'];
    }
  >();

  for (const [strategyType, strategyResults] of normalizedResults) {
    const weight = normalizedWeights[strategyType] ?? 0;

    for (const result of strategyResults) {
      const weightedScore = result.score * weight;

      const existing = combinedScores.get(result.id);
      if (existing) {
        existing.score += weightedScore;
        existing.strategies.push(strategyType);
        existing.strategyScores[strategyType] = result.score;
        if (!existing.data) {
          existing.data = result.data;
        }
      } else {
        combinedScores.set(result.id, {
          score: weightedScore,
          strategies: [strategyType],
          strategyScores: { [strategyType]: result.score } as Record<StrategyType, number>,
          data: result.data,
        });
      }
    }
  }

  // Convert to array and sort
  const fusedResults: FusedResult[] = Array.from(combinedScores.entries())
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
 * Normalize scores using min-max normalization
 *
 * Transforms scores to [0, 1] range within a strategy.
 */
function normalizeScores(results: StrategyResult[]): StrategyResult[] {
  if (results.length === 0) return [];
  if (results.length === 1) {
    return [{ ...results[0], score: 1.0 }];
  }

  const scores = results.map((r) => r.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore;

  // Avoid division by zero
  if (range === 0) {
    return results.map((r) => ({ ...r, score: 1.0 }));
  }

  return results.map((r) => ({
    ...r,
    score: (r.score - minScore) / range,
  }));
}

/**
 * Z-Score Normalization Fusion
 *
 * Alternative normalization using z-scores.
 * Better when score distributions vary significantly across strategies.
 *
 * @param results - Map of strategy type to results
 * @param weights - Strategy weights
 * @param topK - Maximum results to return
 * @returns Fused results sorted by final score
 */
export function zScoreFusion(
  results: Map<StrategyType, StrategyResult[]>,
  weights: Record<StrategyType, number>,
  topK?: number
): FusedResult[] {
  // Normalize weights
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const normalizedWeights: Record<StrategyType, number> = {} as Record<StrategyType, number>;
  for (const [strategy, weight] of Object.entries(weights)) {
    normalizedWeights[strategy as StrategyType] = weight / totalWeight;
  }

  // Z-score normalize within each strategy
  const normalizedResults = new Map<StrategyType, StrategyResult[]>();
  for (const [strategyType, strategyResults] of results) {
    normalizedResults.set(
      strategyType,
      zScoreNormalize(strategyResults)
    );
  }

  // Accumulate weighted z-scores
  const combinedScores = new Map<
    string,
    {
      score: number;
      strategies: StrategyType[];
      strategyScores: Record<StrategyType, number>;
      data?: StrategyResult['data'];
    }
  >();

  for (const [strategyType, strategyResults] of normalizedResults) {
    const weight = normalizedWeights[strategyType] ?? 0;

    for (const result of strategyResults) {
      const weightedScore = result.score * weight;

      const existing = combinedScores.get(result.id);
      if (existing) {
        existing.score += weightedScore;
        existing.strategies.push(strategyType);
        existing.strategyScores[strategyType] = result.score;
        if (!existing.data) {
          existing.data = result.data;
        }
      } else {
        combinedScores.set(result.id, {
          score: weightedScore,
          strategies: [strategyType],
          strategyScores: { [strategyType]: result.score } as Record<StrategyType, number>,
          data: result.data,
        });
      }
    }
  }

  // Convert to array and sort
  const fusedResults: FusedResult[] = Array.from(combinedScores.entries())
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
 * Z-score normalize scores
 *
 * Transforms scores to have mean 0 and std 1.
 */
function zScoreNormalize(results: StrategyResult[]): StrategyResult[] {
  if (results.length === 0) return [];
  if (results.length === 1) {
    return [{ ...results[0], score: 0 }];
  }

  const scores = results.map((r) => r.score);
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const variance =
    scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const std = Math.sqrt(variance);

  // Avoid division by zero
  if (std === 0) {
    return results.map((r) => ({ ...r, score: 0 }));
  }

  return results.map((r) => ({
    ...r,
    score: (r.score - mean) / std,
  }));
}

/**
 * Borda Count Fusion
 *
 * Rank-based fusion that assigns points based on position.
 * Points = n - rank + 1, where n is the number of results.
 *
 * @param results - Map of strategy type to results
 * @param weights - Strategy weights
 * @param topK - Maximum results to return
 * @returns Fused results sorted by final score
 */
export function bordaCountFusion(
  results: Map<StrategyType, StrategyResult[]>,
  weights: Record<StrategyType, number>,
  topK?: number
): FusedResult[] {
  // Normalize weights
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const normalizedWeights: Record<StrategyType, number> = {} as Record<StrategyType, number>;
  for (const [strategy, weight] of Object.entries(weights)) {
    normalizedWeights[strategy as StrategyType] = weight / totalWeight;
  }

  // Accumulate Borda scores
  const bordaScores = new Map<
    string,
    {
      score: number;
      strategies: StrategyType[];
      strategyScores: Record<StrategyType, number>;
      data?: StrategyResult['data'];
    }
  >();

  for (const [strategyType, strategyResults] of results) {
    const weight = normalizedWeights[strategyType] ?? 0;
    const n = strategyResults.length;

    for (const result of strategyResults) {
      // Borda points: n - rank + 1
      const bordaPoints = n - result.rank + 1;
      const weightedPoints = bordaPoints * weight;

      const existing = bordaScores.get(result.id);
      if (existing) {
        existing.score += weightedPoints;
        existing.strategies.push(strategyType);
        existing.strategyScores[strategyType] = result.score;
        if (!existing.data) {
          existing.data = result.data;
        }
      } else {
        bordaScores.set(result.id, {
          score: weightedPoints,
          strategies: [strategyType],
          strategyScores: { [strategyType]: result.score } as Record<StrategyType, number>,
          data: result.data,
        });
      }
    }
  }

  // Convert to array and sort
  const fusedResults: FusedResult[] = Array.from(bordaScores.entries())
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
