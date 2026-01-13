/**
 * Cascade Fusion
 *
 * A conditional fusion strategy that uses additional strategies only
 * when the primary strategy doesn't provide confident results.
 *
 * Useful for:
 * - Optimizing latency (fast strategy first, slower fallback)
 * - Handling edge cases (specialized fallback for low-confidence results)
 */

import type {
  StrategyType,
  StrategyResult,
  FusedResult,
  StrategyConfig,
} from '../types';

/**
 * Default cascade threshold
 *
 * If top result score is below this, cascade to next strategy.
 */
export const DEFAULT_CASCADE_THRESHOLD = 0.8;

/**
 * Cascade Fusion
 *
 * Processes strategies in order of priority:
 * 1. Execute primary (first) strategy
 * 2. If top result score >= threshold, return those results
 * 3. Otherwise, execute next strategy and merge results
 * 4. Repeat until threshold is met or all strategies exhausted
 *
 * @param results - Map of strategy type to results (pre-executed)
 * @param strategyOrder - Order of strategy priority
 * @param threshold - Score threshold for early exit
 * @param topK - Maximum results to return
 * @returns Fused results
 */
export function cascadeFusion(
  results: Map<StrategyType, StrategyResult[]>,
  strategyOrder: StrategyType[],
  threshold: number = DEFAULT_CASCADE_THRESHOLD,
  topK?: number
): FusedResult[] {
  const usedStrategies: StrategyType[] = [];
  const accumulatedResults = new Map<string, StrategyResult>();

  for (const strategyType of strategyOrder) {
    const strategyResults = results.get(strategyType);
    if (!strategyResults || strategyResults.length === 0) {
      continue;
    }

    usedStrategies.push(strategyType);

    // Merge new results
    for (const result of strategyResults) {
      const existing = accumulatedResults.get(result.id);
      if (!existing || result.score > existing.score) {
        accumulatedResults.set(result.id, result);
      }
    }

    // Check if threshold is met
    const topResult = getTopResult(accumulatedResults);
    if (topResult && topResult.score >= threshold) {
      break;
    }
  }

  // Convert accumulated results to fused format
  return mapToFusedResults(accumulatedResults, usedStrategies, topK);
}

/**
 * Lazy Cascade Fusion
 *
 * Similar to cascade fusion but executes strategies on-demand.
 * Useful when strategies have different latency costs.
 *
 * @param strategyExecutors - Map of strategy type to executor function
 * @param strategyOrder - Order of strategy priority
 * @param threshold - Score threshold for early exit
 * @param topK - Maximum results to return
 * @returns Fused results and execution metadata
 */
export async function lazyCascadeFusion(
  strategyExecutors: Map<StrategyType, () => Promise<StrategyResult[]>>,
  strategyOrder: StrategyType[],
  threshold: number = DEFAULT_CASCADE_THRESHOLD,
  topK?: number
): Promise<{
  results: FusedResult[];
  executedStrategies: StrategyType[];
  earlyExitAt?: StrategyType;
}> {
  const usedStrategies: StrategyType[] = [];
  const accumulatedResults = new Map<string, StrategyResult>();
  let earlyExitAt: StrategyType | undefined;

  for (const strategyType of strategyOrder) {
    const executor = strategyExecutors.get(strategyType);
    if (!executor) {
      continue;
    }

    // Execute strategy
    const strategyResults = await executor();
    usedStrategies.push(strategyType);

    if (strategyResults.length === 0) {
      continue;
    }

    // Merge results
    for (const result of strategyResults) {
      const existing = accumulatedResults.get(result.id);
      if (!existing || result.score > existing.score) {
        accumulatedResults.set(result.id, result);
      }
    }

    // Check threshold
    const topResult = getTopResult(accumulatedResults);
    if (topResult && topResult.score >= threshold) {
      earlyExitAt = strategyType;
      break;
    }
  }

  return {
    results: mapToFusedResults(accumulatedResults, usedStrategies, topK),
    executedStrategies: usedStrategies,
    earlyExitAt,
  };
}

/**
 * Conditional Cascade Fusion
 *
 * Executes fallback strategies based on result characteristics,
 * not just score threshold.
 *
 * @param results - Map of strategy type to results
 * @param strategyOrder - Order of strategy priority
 * @param condition - Function to check if cascade should continue
 * @param topK - Maximum results to return
 * @returns Fused results
 */
export function conditionalCascadeFusion(
  results: Map<StrategyType, StrategyResult[]>,
  strategyOrder: StrategyType[],
  condition: (accumulated: Map<string, StrategyResult>) => boolean,
  topK?: number
): FusedResult[] {
  const usedStrategies: StrategyType[] = [];
  const accumulatedResults = new Map<string, StrategyResult>();

  for (const strategyType of strategyOrder) {
    const strategyResults = results.get(strategyType);
    if (!strategyResults || strategyResults.length === 0) {
      continue;
    }

    usedStrategies.push(strategyType);

    // Merge results
    for (const result of strategyResults) {
      const existing = accumulatedResults.get(result.id);
      if (!existing || result.score > existing.score) {
        accumulatedResults.set(result.id, result);
      }
    }

    // Check custom condition
    if (!condition(accumulatedResults)) {
      break;
    }
  }

  return mapToFusedResults(accumulatedResults, usedStrategies, topK);
}

/**
 * Fallback Cascade Fusion
 *
 * Only uses secondary strategies if primary returns no results.
 *
 * @param results - Map of strategy type to results
 * @param primaryStrategy - Primary strategy type
 * @param fallbackStrategies - Fallback strategy types in order
 * @param topK - Maximum results to return
 * @returns Fused results
 */
export function fallbackCascadeFusion(
  results: Map<StrategyType, StrategyResult[]>,
  primaryStrategy: StrategyType,
  fallbackStrategies: StrategyType[],
  topK?: number
): FusedResult[] {
  const primaryResults = results.get(primaryStrategy);

  // If primary has results, use only primary
  if (primaryResults && primaryResults.length > 0) {
    return mapToFusedResults(
      new Map(primaryResults.map((r) => [r.id, r])),
      [primaryStrategy],
      topK
    );
  }

  // Otherwise, cascade through fallbacks
  const usedStrategies: StrategyType[] = [];
  const accumulatedResults = new Map<string, StrategyResult>();

  for (const strategyType of fallbackStrategies) {
    const strategyResults = results.get(strategyType);
    if (!strategyResults || strategyResults.length === 0) {
      continue;
    }

    usedStrategies.push(strategyType);

    for (const result of strategyResults) {
      if (!accumulatedResults.has(result.id)) {
        accumulatedResults.set(result.id, result);
      }
    }

    // Stop at first fallback with results
    if (accumulatedResults.size > 0) {
      break;
    }
  }

  return mapToFusedResults(accumulatedResults, usedStrategies, topK);
}

/**
 * Get top result from accumulated results
 */
function getTopResult(
  results: Map<string, StrategyResult>
): StrategyResult | undefined {
  let top: StrategyResult | undefined;

  for (const result of results.values()) {
    if (!top || result.score > top.score) {
      top = result;
    }
  }

  return top;
}

/**
 * Map accumulated results to fused results format
 */
function mapToFusedResults(
  accumulatedResults: Map<string, StrategyResult>,
  usedStrategies: StrategyType[],
  topK?: number
): FusedResult[] {
  const fusedResults: FusedResult[] = Array.from(accumulatedResults.values())
    .map((result) => ({
      id: result.id,
      finalScore: result.score,
      rank: 0,
      sourceStrategies: usedStrategies,
      strategyScores: {} as Record<StrategyType, number>,
      data: result.data,
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
 * Determine optimal cascade order based on strategy characteristics
 *
 * Orders strategies by: latency (ascending), then accuracy (descending)
 */
export function optimizeCascadeOrder(
  strategies: StrategyConfig[],
  stats?: Record<StrategyType, { avgLatencyMs: number; accuracy: number }>
): StrategyType[] {
  if (!stats) {
    // Default order: vector (fast) -> keyword -> multi_query (slow)
    const defaultOrder: StrategyType[] = ['vector', 'keyword', 'multi_query'];
    return strategies
      .map((s) => s.type)
      .sort(
        (a, b) => defaultOrder.indexOf(a) - defaultOrder.indexOf(b)
      );
  }

  return strategies
    .map((s) => s.type)
    .sort((a, b) => {
      const statsA = stats[a] ?? { avgLatencyMs: 100, accuracy: 0.5 };
      const statsB = stats[b] ?? { avgLatencyMs: 100, accuracy: 0.5 };

      // Primary sort: latency ascending
      const latencyDiff = statsA.avgLatencyMs - statsB.avgLatencyMs;
      if (Math.abs(latencyDiff) > 10) {
        return latencyDiff;
      }

      // Secondary sort: accuracy descending
      return statsB.accuracy - statsA.accuracy;
    });
}
