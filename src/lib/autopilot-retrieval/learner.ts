/**
 * Seizn Autopilot Retrieval - Learner
 *
 * Updates strategy weights and statistics based on observed rewards.
 * Implements the learning loop for the multi-armed bandit.
 */

import type {
  Strategy,
  StrategyWeights,
  BanditState,
  ArmStats,
  AutopilotConfig,
  RewardComponents,
} from './types';
import { ALL_STRATEGIES, DEFAULT_STRATEGY_WEIGHTS } from './types';

// ===========================================
// Weight Update Functions
// ===========================================

/**
 * Update strategy weights using gradient-based approach
 *
 * Increases weight for strategies with above-average rewards,
 * decreases weight for strategies with below-average rewards.
 */
export function updateWeightsGradient(
  currentWeights: StrategyWeights,
  strategy: Strategy,
  reward: number,
  learningRate: number = 0.05
): StrategyWeights {
  const newWeights = { ...currentWeights };

  // Calculate average reward expectation (weighted by current weights)
  const avgRewardExpectation = Object.values(currentWeights).reduce((a, b) => a + b, 0) /
    ALL_STRATEGIES.length;

  // Reward deviation from expectation
  const rewardDelta = reward - 0.5; // Centered around 0.5

  // Update chosen strategy weight
  const currentWeight = newWeights[strategy];
  const weightDelta = learningRate * rewardDelta;
  newWeights[strategy] = Math.max(0.01, Math.min(0.9, currentWeight + weightDelta));

  // Normalize weights to sum to 1
  return normalizeWeights(newWeights);
}

/**
 * Update weights using exponential moving average
 *
 * More stable than gradient updates, good for production.
 */
export function updateWeightsEMA(
  currentWeights: StrategyWeights,
  strategy: Strategy,
  reward: number,
  alpha: number = 0.1
): StrategyWeights {
  const newWeights = { ...currentWeights };

  // Only update if reward is significant
  if (reward > 0.6) {
    // Good outcome: increase weight
    newWeights[strategy] = currentWeights[strategy] * (1 - alpha) + 0.8 * alpha;
  } else if (reward < 0.4) {
    // Bad outcome: decrease weight
    newWeights[strategy] = currentWeights[strategy] * (1 - alpha) + 0.2 * alpha;
  }
  // Neutral outcomes: no change

  return normalizeWeights(newWeights);
}

/**
 * Softmax weight update
 *
 * Uses softmax to convert rewards to probabilities.
 */
export function updateWeightsSoftmax(
  currentWeights: StrategyWeights,
  statsMap: Record<Strategy, ArmStats>,
  temperature: number = 1.0
): StrategyWeights {
  const rewards: Record<Strategy, number> = {} as Record<Strategy, number>;

  // Collect average rewards
  for (const s of ALL_STRATEGIES) {
    const stats = statsMap[s];
    rewards[s] = stats.avgReward || 0.5;
  }

  // Apply softmax
  const expRewards: Record<Strategy, number> = {} as Record<Strategy, number>;
  let sumExp = 0;

  for (const s of ALL_STRATEGIES) {
    const exp = Math.exp(rewards[s] / temperature);
    expRewards[s] = exp;
    sumExp += exp;
  }

  const newWeights: StrategyWeights = {} as StrategyWeights;
  for (const s of ALL_STRATEGIES) {
    newWeights[s] = expRewards[s] / sumExp;
  }

  return newWeights;
}

/**
 * Normalize weights to sum to 1
 */
export function normalizeWeights(weights: StrategyWeights): StrategyWeights {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum === 0) return { ...DEFAULT_STRATEGY_WEIGHTS };

  const normalized: StrategyWeights = {} as StrategyWeights;
  for (const s of ALL_STRATEGIES) {
    normalized[s] = (weights[s] || 0) / sum;
  }
  return normalized;
}

// ===========================================
// Stats Update Functions
// ===========================================

/**
 * Update arm statistics after an outcome
 */
export function updateArmStats(
  currentStats: ArmStats,
  reward: number,
  latencyMs: number,
  relevance: number,
  cost: number,
  successThreshold: number = 0.5
): ArmStats {
  const isSuccess = reward >= successThreshold;
  const newUses = currentStats.totalUses + 1;
  const newSuccesses = currentStats.totalSuccesses + (isSuccess ? 1 : 0);

  // Incremental mean update: new_mean = old_mean + (new_value - old_mean) / n
  const updateMean = (oldMean: number, newValue: number, n: number): number => {
    return oldMean + (newValue - oldMean) / n;
  };

  return {
    ...currentStats,
    totalUses: newUses,
    totalSuccesses: newSuccesses,
    avgLatencyMs: updateMean(currentStats.avgLatencyMs, latencyMs, newUses),
    avgRelevance: updateMean(currentStats.avgRelevance, relevance, newUses),
    avgCost: updateMean(currentStats.avgCost, cost, newUses),
    avgReward: updateMean(currentStats.avgReward, reward, newUses),
    successRate: newSuccesses / newUses,
    // Update Thompson Sampling parameters
    betaAlpha: currentStats.betaAlpha + (isSuccess ? 1 : 0),
    betaBeta: currentStats.betaBeta + (isSuccess ? 0 : 1),
  };
}

/**
 * Update UCB value for an arm
 */
export function updateUCBValue(
  stats: ArmStats,
  totalDecisions: number,
  explorationConstant: number = 2
): number {
  if (stats.totalUses === 0) return Infinity;

  const exploitation = stats.avgReward;
  const exploration =
    explorationConstant * Math.sqrt(Math.log(totalDecisions + 1) / stats.totalUses);

  return exploitation + exploration;
}

// ===========================================
// Bandit State Update
// ===========================================

/**
 * Update complete bandit state after an outcome
 */
export function updateBanditState(
  state: BanditState,
  strategy: Strategy,
  outcome: {
    reward: number;
    latencyMs: number;
    relevanceScore: number;
    cost: number;
  },
  config: Pick<AutopilotConfig, 'learningRate' | 'decayFactor'>
): BanditState {
  const newStats = { ...state.stats };

  // Update stats for chosen strategy
  newStats[strategy] = updateArmStats(
    state.stats[strategy],
    outcome.reward,
    outcome.latencyMs,
    outcome.relevanceScore,
    outcome.cost
  );

  const newTotalDecisions = state.totalDecisions + 1;

  // Update UCB values for all strategies
  for (const s of ALL_STRATEGIES) {
    newStats[s] = {
      ...newStats[s],
      ucbValue: updateUCBValue(newStats[s], newTotalDecisions),
    };
  }

  // Update weights
  const newWeights = updateWeightsGradient(
    state.weights,
    strategy,
    outcome.reward,
    config.learningRate
  );

  return {
    configId: state.configId,
    weights: newWeights,
    stats: newStats,
    totalDecisions: newTotalDecisions,
    updatedAt: new Date().toISOString(),
  };
}

// ===========================================
// Learning Analysis
// ===========================================

/**
 * Detect if a strategy's performance is declining
 */
export function detectPerformanceDecline(stats: ArmStats): {
  declining: boolean;
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  recommendation: string;
} {
  // Need enough recent data to compare
  if (stats.recentUses < 10) {
    return { declining: false, severity: 'none', recommendation: 'Insufficient data' };
  }

  const lifetimeReward = stats.avgReward;
  const recentReward = stats.recentAvgReward;
  const delta = lifetimeReward - recentReward;

  if (delta <= 0.05) {
    return { declining: false, severity: 'none', recommendation: 'Performance stable' };
  }

  if (delta < 0.15) {
    return {
      declining: true,
      severity: 'mild',
      recommendation: 'Monitor for continued decline',
    };
  }

  if (delta < 0.3) {
    return {
      declining: true,
      severity: 'moderate',
      recommendation: 'Consider reducing strategy weight',
    };
  }

  return {
    declining: true,
    severity: 'severe',
    recommendation: 'Strongly recommend reducing strategy usage',
  };
}

/**
 * Identify the best performing strategy based on current stats
 */
export function identifyBestStrategy(
  statsMap: Record<Strategy, ArmStats>,
  minSamples: number = 20
): {
  best: Strategy | null;
  confidence: 'high' | 'medium' | 'low';
  stats: ArmStats | null;
} {
  let bestStrategy: Strategy | null = null;
  let bestReward = -Infinity;
  let totalQualifiedStrategies = 0;

  for (const s of ALL_STRATEGIES) {
    const stats = statsMap[s];
    if (stats.totalUses >= minSamples) {
      totalQualifiedStrategies++;
      if (stats.avgReward > bestReward) {
        bestReward = stats.avgReward;
        bestStrategy = s;
      }
    }
  }

  if (!bestStrategy) {
    return { best: null, confidence: 'low', stats: null };
  }

  // Confidence based on sample size and margin
  const bestStats = statsMap[bestStrategy];
  const secondBest = ALL_STRATEGIES
    .filter(s => s !== bestStrategy && statsMap[s].totalUses >= minSamples)
    .sort((a, b) => statsMap[b].avgReward - statsMap[a].avgReward)[0];

  const margin = secondBest
    ? bestStats.avgReward - statsMap[secondBest].avgReward
    : bestStats.avgReward;

  let confidence: 'high' | 'medium' | 'low';
  if (bestStats.totalUses >= 100 && margin > 0.1) {
    confidence = 'high';
  } else if (bestStats.totalUses >= 50 && margin > 0.05) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { best: bestStrategy, confidence, stats: bestStats };
}

/**
 * Generate learning insights for dashboard
 */
export function generateLearningInsights(
  state: BanditState
): {
  totalSamples: number;
  explorationNeeded: boolean;
  bestStrategy: Strategy | null;
  underexploredStrategies: Strategy[];
  performanceIssues: Array<{ strategy: Strategy; issue: string }>;
  recommendations: string[];
} {
  const insights = {
    totalSamples: state.totalDecisions,
    explorationNeeded: false,
    bestStrategy: null as Strategy | null,
    underexploredStrategies: [] as Strategy[],
    performanceIssues: [] as Array<{ strategy: Strategy; issue: string }>,
    recommendations: [] as string[],
  };

  // Check total samples
  if (state.totalDecisions < 50) {
    insights.explorationNeeded = true;
    insights.recommendations.push(
      'Continue collecting data - need at least 50 samples for reliable learning'
    );
  }

  // Find underexplored strategies
  for (const s of ALL_STRATEGIES) {
    const stats = state.stats[s];
    if (stats.totalUses < 10) {
      insights.underexploredStrategies.push(s);
    }
  }

  if (insights.underexploredStrategies.length > 0) {
    insights.explorationNeeded = true;
    insights.recommendations.push(
      `Strategies need more exploration: ${insights.underexploredStrategies.join(', ')}`
    );
  }

  // Identify best strategy
  const best = identifyBestStrategy(state.stats);
  insights.bestStrategy = best.best;

  if (best.best && best.confidence === 'high') {
    insights.recommendations.push(
      `${best.best} is performing best with ${(best.stats!.avgReward * 100).toFixed(1)}% reward`
    );
  }

  // Check for performance issues
  for (const s of ALL_STRATEGIES) {
    const decline = detectPerformanceDecline(state.stats[s]);
    if (decline.declining) {
      insights.performanceIssues.push({
        strategy: s,
        issue: `Performance declining (${decline.severity}): ${decline.recommendation}`,
      });
    }
  }

  return insights;
}

// ===========================================
// Weight Convergence Check
// ===========================================

/**
 * Check if weights have converged (stable)
 */
export function checkWeightConvergence(
  historicalWeights: StrategyWeights[],
  threshold: number = 0.02
): boolean {
  if (historicalWeights.length < 10) return false;

  // Compare last 5 weight snapshots
  const recent = historicalWeights.slice(-5);

  for (const s of ALL_STRATEGIES) {
    const weights = recent.map(w => w[s]);
    const max = Math.max(...weights);
    const min = Math.min(...weights);
    if (max - min > threshold) return false;
  }

  return true;
}

/**
 * Calculate weight volatility (for monitoring)
 */
export function calculateWeightVolatility(
  historicalWeights: StrategyWeights[]
): Record<Strategy, number> {
  const volatility: Record<Strategy, number> = {} as Record<Strategy, number>;

  for (const s of ALL_STRATEGIES) {
    if (historicalWeights.length < 2) {
      volatility[s] = 0;
      continue;
    }

    const weights = historicalWeights.map(w => w[s]);
    let sumSquaredDiff = 0;
    for (let i = 1; i < weights.length; i++) {
      const diff = weights[i] - weights[i - 1];
      sumSquaredDiff += diff * diff;
    }
    volatility[s] = Math.sqrt(sumSquaredDiff / (weights.length - 1));
  }

  return volatility;
}
