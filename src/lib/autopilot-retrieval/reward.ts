/**
 * Seizn Autopilot Retrieval - Reward Calculator
 *
 * Calculates reward signals from strategy execution outcomes.
 * The reward combines multiple factors: relevance, latency, cost, and user feedback.
 */

import type {
  RewardComponents,
  RewardWeights,
  StrategyOutcome,
  StrategyConstraints,
} from './types';
import { DEFAULT_REWARD_WEIGHTS, DEFAULT_CONSTRAINTS } from './types';

// ===========================================
// Reward Component Calculators
// ===========================================

/**
 * Calculate relevance score component (0-1)
 *
 * Higher relevance is better.
 * Applies sigmoid-like scaling to emphasize differences near threshold.
 */
export function calculateRelevanceScore(
  relevanceScore: number,
  minThreshold: number = 0.5
): number {
  if (relevanceScore <= 0) return 0;
  if (relevanceScore >= 1) return 1;

  // Linear scaling with bonus for exceeding threshold
  if (relevanceScore >= minThreshold) {
    // Above threshold: 0.5 to 1.0
    const normalized = (relevanceScore - minThreshold) / (1 - minThreshold);
    return 0.5 + 0.5 * normalized;
  } else {
    // Below threshold: 0 to 0.5
    return 0.5 * (relevanceScore / minThreshold);
  }
}

/**
 * Calculate latency score component (0-1)
 *
 * Lower latency is better. Uses inverse scaling.
 * - Fast (< 100ms): 1.0
 * - Target (< maxLatency): 0.5 - 1.0
 * - Slow (> maxLatency): 0 - 0.5 (penalized)
 */
export function calculateLatencyScore(
  latencyMs: number,
  maxLatencyMs: number = 2000
): number {
  if (latencyMs <= 0) return 1;

  // Very fast is excellent
  if (latencyMs < 100) return 1;

  // Within acceptable range
  if (latencyMs <= maxLatencyMs) {
    // Linear interpolation from 1.0 (100ms) to 0.5 (maxLatency)
    const normalized = (latencyMs - 100) / (maxLatencyMs - 100);
    return 1 - 0.5 * normalized;
  }

  // Over budget: penalize but don't go to zero immediately
  const overBudgetRatio = latencyMs / maxLatencyMs;
  if (overBudgetRatio < 2) {
    // Up to 2x budget: 0.25 - 0.5
    return 0.5 - 0.25 * (overBudgetRatio - 1);
  }

  // Very slow: minimal score
  return Math.max(0, 0.25 / overBudgetRatio);
}

/**
 * Calculate cost score component (0-1)
 *
 * Lower cost is better. Uses inverse scaling.
 */
export function calculateCostScore(
  cost: number,
  maxCostPerQuery: number = 0.01
): number {
  if (cost <= 0) return 1;

  // Very cheap is excellent
  if (cost < maxCostPerQuery * 0.1) return 1;

  // Within budget
  if (cost <= maxCostPerQuery) {
    const normalized = cost / maxCostPerQuery;
    return 1 - 0.5 * normalized;
  }

  // Over budget
  const overBudgetRatio = cost / maxCostPerQuery;
  if (overBudgetRatio < 2) {
    return 0.5 - 0.25 * (overBudgetRatio - 1);
  }

  return Math.max(0, 0.25 / overBudgetRatio);
}

/**
 * Calculate feedback score component (-1 to 1)
 *
 * User feedback directly maps to score:
 * - positive: +1
 * - neutral: 0
 * - negative: -1
 * - no feedback: 0 (neutral)
 */
export function calculateFeedbackScore(
  feedback?: 'positive' | 'negative' | 'neutral' | null
): number {
  switch (feedback) {
    case 'positive':
      return 1;
    case 'negative':
      return -1;
    case 'neutral':
      return 0;
    default:
      return 0;
  }
}

// ===========================================
// Result Count Bonus
// ===========================================

/**
 * Calculate bonus/penalty based on result count
 *
 * - No results: significant penalty
 * - Too few results: slight penalty
 * - Good range (5-20): no modifier
 * - Too many results: slight penalty (may indicate poor filtering)
 */
export function calculateResultCountModifier(
  resultCount: number,
  targetMin: number = 5,
  targetMax: number = 20
): number {
  if (resultCount === 0) return -0.3;
  if (resultCount < targetMin) return -0.1 * (1 - resultCount / targetMin);
  if (resultCount > targetMax * 2) return -0.1;
  return 0;
}

// ===========================================
// Main Reward Calculation
// ===========================================

/**
 * Calculate reward components from outcome
 */
export function calculateRewardComponents(
  outcome: StrategyOutcome,
  constraints: StrategyConstraints = DEFAULT_CONSTRAINTS
): RewardComponents {
  return {
    relevance: calculateRelevanceScore(
      outcome.relevanceScore,
      constraints.minRelevanceThreshold
    ),
    latency: calculateLatencyScore(
      outcome.latencyMs,
      constraints.maxLatencyMs
    ),
    cost: calculateCostScore(
      outcome.cost,
      constraints.maxCostPerQuery
    ),
    feedback: calculateFeedbackScore(outcome.userFeedback),
  };
}

/**
 * Calculate final reward from components and weights
 *
 * The reward is a weighted sum of components, normalized to 0-1 range.
 * Feedback component is special: it can push reward above/below base.
 */
export function calculateReward(
  components: RewardComponents,
  weights: RewardWeights = DEFAULT_REWARD_WEIGHTS
): number {
  // Calculate base reward from non-feedback components
  const baseWeightSum = weights.relevance + weights.latency + weights.cost;
  const baseReward =
    (components.relevance * weights.relevance +
      components.latency * weights.latency +
      components.cost * weights.cost) /
    baseWeightSum;

  // Apply feedback as modifier
  // Positive feedback boosts, negative feedback reduces
  const feedbackModifier = components.feedback * weights.feedback;
  const finalReward = baseReward + feedbackModifier * 0.5;

  // Clamp to valid range
  return Math.max(0, Math.min(1, finalReward));
}

/**
 * Calculate reward from outcome (convenience function)
 */
export function calculateRewardFromOutcome(
  outcome: StrategyOutcome,
  constraints?: StrategyConstraints,
  weights?: RewardWeights
): {
  reward: number;
  components: RewardComponents;
} {
  const components = calculateRewardComponents(
    outcome,
    constraints ?? DEFAULT_CONSTRAINTS
  );

  // Apply result count modifier
  const resultModifier = calculateResultCountModifier(outcome.resultCount);
  components.relevance = Math.max(0, Math.min(1, components.relevance + resultModifier));

  const reward = calculateReward(components, weights ?? DEFAULT_REWARD_WEIGHTS);

  return { reward, components };
}

// ===========================================
// Reward Analysis Utilities
// ===========================================

/**
 * Determine if an outcome is considered a "success"
 */
export function isSuccessfulOutcome(
  reward: number,
  threshold: number = 0.5
): boolean {
  return reward >= threshold;
}

/**
 * Get human-readable reward interpretation
 */
export function interpretReward(reward: number): {
  rating: 'excellent' | 'good' | 'fair' | 'poor' | 'bad';
  description: string;
} {
  if (reward >= 0.9) {
    return { rating: 'excellent', description: 'Outstanding performance' };
  }
  if (reward >= 0.7) {
    return { rating: 'good', description: 'Above average performance' };
  }
  if (reward >= 0.5) {
    return { rating: 'fair', description: 'Acceptable performance' };
  }
  if (reward >= 0.3) {
    return { rating: 'poor', description: 'Below expectations' };
  }
  return { rating: 'bad', description: 'Significant issues detected' };
}

/**
 * Analyze reward components to identify improvement areas
 */
export function analyzeRewardComponents(
  components: RewardComponents
): string[] {
  const issues: string[] = [];

  if (components.relevance < 0.5) {
    issues.push('Low relevance: Results may not match query intent');
  }

  if (components.latency < 0.5) {
    issues.push('High latency: Response time exceeds target');
  }

  if (components.cost < 0.5) {
    issues.push('High cost: Query cost exceeds budget');
  }

  if (components.feedback < 0) {
    issues.push('Negative feedback: User indicated poor results');
  }

  return issues;
}

// ===========================================
// Decay Functions (for non-stationary environments)
// ===========================================

/**
 * Apply exponential decay to old rewards
 *
 * This helps the bandit adapt when strategy performance changes over time.
 */
export function decayReward(
  oldReward: number,
  newReward: number,
  decayFactor: number = 0.99,
  existingCount: number = 0
): number {
  if (existingCount === 0) return newReward;

  // Exponential moving average with decay
  const decayedOld = oldReward * Math.pow(decayFactor, 1);
  return decayedOld * (existingCount / (existingCount + 1)) +
         newReward * (1 / (existingCount + 1));
}

/**
 * Calculate time-weighted reward
 *
 * More recent outcomes have higher weight.
 */
export function timeWeightedReward(
  rewards: Array<{ reward: number; timestamp: number }>,
  halfLifeMs: number = 24 * 60 * 60 * 1000 // 24 hours
): number {
  if (rewards.length === 0) return 0.5;

  const now = Date.now();
  let weightedSum = 0;
  let totalWeight = 0;

  for (const { reward, timestamp } of rewards) {
    const age = now - timestamp;
    const weight = Math.exp(-Math.LN2 * age / halfLifeMs);
    weightedSum += reward * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
}
