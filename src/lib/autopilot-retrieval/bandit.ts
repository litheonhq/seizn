/**
 * Seizn Autopilot Retrieval - Multi-Armed Bandit Algorithm
 *
 * Implements strategy selection using:
 * - Epsilon-greedy: Simple exploration with fixed probability
 * - UCB (Upper Confidence Bound): Optimistic exploration
 * - Thompson Sampling: Bayesian approach using Beta distributions
 */

import type {
  Strategy,
  StrategyWeights,
  BanditState,
  ArmStats,
  StrategySelection,
  StrategyConstraints,
  AutopilotConfig,
  QueryType,
} from './types';
import { ALL_STRATEGIES, DEFAULT_STRATEGY_WEIGHTS } from './types';

// ===========================================
// Query Classification
// ===========================================

/**
 * Classify query type for context-aware strategy selection
 */
export function classifyQuery(query: string): QueryType {
  const q = query.trim();

  // Code patterns
  if (/[`{}[\]()=>]/.test(q) || /\w+\.\w+\(/.test(q)) {
    return 'code';
  }

  // Question format
  if (/^(what|why|how|when|where|who|which|can|could|would|should|is|are|do|does)\s/i.test(q)) {
    return 'question';
  }

  // Keyword-like: short, acronyms, special chars, paths
  if (q.length <= 20) return 'keyword_like';
  if (/[\/\\:]/.test(q)) return 'keyword_like';
  if (/[A-Z]{3,}/.test(q)) return 'keyword_like';
  if (q.includes('"') || q.includes("'")) return 'keyword_like';

  // Complex: multiple sentences or very long
  if (q.length > 150 || (q.match(/[.!?]/g) || []).length > 1) {
    return 'complex';
  }

  // Semantic: natural language, medium length
  if (q.length >= 40) return 'semantic';

  return 'unknown';
}

/**
 * Get strategy bias based on query type
 */
export function getQueryTypeBias(queryType: QueryType): Partial<StrategyWeights> {
  switch (queryType) {
    case 'keyword_like':
      return { keyword: 0.15, hybrid: 0.1 };
    case 'semantic':
      return { vector: 0.15, hyde: 0.05 };
    case 'code':
      return { keyword: 0.2, hybrid: 0.1 };
    case 'question':
      return { hyde: 0.1, multi_query: 0.05 };
    case 'complex':
      return { multi_query: 0.15, hybrid: 0.05 };
    default:
      return {};
  }
}

// ===========================================
// Strategy Feasibility Check
// ===========================================

/**
 * Estimated latency per strategy (in ms) - rough estimates
 */
const STRATEGY_LATENCY_ESTIMATES: Record<Strategy, number> = {
  keyword: 50,
  vector: 100,
  hybrid: 150,
  multi_query: 400,
  hyde: 600,
};

/**
 * Estimated cost per strategy (in $) - rough estimates
 */
const STRATEGY_COST_ESTIMATES: Record<Strategy, number> = {
  keyword: 0.0001,
  vector: 0.0005,
  hybrid: 0.0006,
  multi_query: 0.002,
  hyde: 0.003,
};

/**
 * Check if strategy meets constraints
 */
export function isStrategyFeasible(
  strategy: Strategy,
  constraints: StrategyConstraints,
  stats?: ArmStats
): boolean {
  // Use actual stats if available, otherwise use estimates
  const latency = stats?.avgLatencyMs || STRATEGY_LATENCY_ESTIMATES[strategy];
  const cost = stats?.avgCost || STRATEGY_COST_ESTIMATES[strategy];

  // Check latency constraint (with 50% buffer for variance)
  if (latency * 1.5 > constraints.maxLatencyMs) {
    return false;
  }

  // Check cost constraint (with 20% buffer)
  if (cost * 1.2 > constraints.maxCostPerQuery) {
    return false;
  }

  return true;
}

/**
 * Filter strategies by constraints
 */
export function filterFeasibleStrategies(
  strategies: Strategy[],
  constraints: StrategyConstraints,
  statsMap?: Record<Strategy, ArmStats>
): Strategy[] {
  return strategies.filter(s =>
    isStrategyFeasible(s, constraints, statsMap?.[s])
  );
}

// ===========================================
// Epsilon-Greedy Selection
// ===========================================

/**
 * Epsilon-greedy strategy selection
 *
 * With probability epsilon, explore (random selection)
 * Otherwise, exploit (select best based on weights)
 */
export function epsilonGreedySelect(
  weights: StrategyWeights,
  epsilon: number,
  feasibleStrategies: Strategy[]
): { strategy: Strategy; isExploration: boolean } {
  if (feasibleStrategies.length === 0) {
    // Fallback to hybrid if no strategies are feasible
    return { strategy: 'hybrid', isExploration: false };
  }

  // Explore with probability epsilon
  if (Math.random() < epsilon) {
    const randomIdx = Math.floor(Math.random() * feasibleStrategies.length);
    return {
      strategy: feasibleStrategies[randomIdx],
      isExploration: true,
    };
  }

  // Exploit: select strategy with highest weight among feasible
  let bestStrategy = feasibleStrategies[0];
  let bestWeight = weights[bestStrategy] ?? 0;

  for (const s of feasibleStrategies) {
    const w = weights[s] ?? 0;
    if (w > bestWeight) {
      bestWeight = w;
      bestStrategy = s;
    }
  }

  return { strategy: bestStrategy, isExploration: false };
}

// ===========================================
// Upper Confidence Bound (UCB)
// ===========================================

/**
 * Calculate UCB value for a strategy
 *
 * UCB = mean_reward + c * sqrt(ln(total_trials) / arm_trials)
 *
 * The exploration term increases for arms that haven't been tried much
 */
export function calculateUCB(
  stats: ArmStats,
  totalDecisions: number,
  explorationConstant: number = 2
): number {
  if (stats.totalUses === 0) {
    return Infinity; // Always try untested strategies first
  }

  const exploitation = stats.avgReward;
  const exploration =
    explorationConstant * Math.sqrt(Math.log(totalDecisions + 1) / stats.totalUses);

  return exploitation + exploration;
}

/**
 * UCB strategy selection
 */
export function ucbSelect(
  statsMap: Record<Strategy, ArmStats>,
  totalDecisions: number,
  feasibleStrategies: Strategy[],
  explorationConstant?: number
): { strategy: Strategy; isExploration: boolean } {
  if (feasibleStrategies.length === 0) {
    return { strategy: 'hybrid', isExploration: false };
  }

  let bestStrategy = feasibleStrategies[0];
  let bestUCB = -Infinity;

  for (const s of feasibleStrategies) {
    const stats = statsMap[s];
    const ucb = calculateUCB(stats, totalDecisions, explorationConstant);

    if (ucb > bestUCB) {
      bestUCB = ucb;
      bestStrategy = s;
    }
  }

  // Consider it exploration if we picked an arm with few trials
  const chosenStats = statsMap[bestStrategy];
  const isExploration = chosenStats.totalUses < 10;

  return { strategy: bestStrategy, isExploration };
}

// ===========================================
// Thompson Sampling
// ===========================================

/**
 * Sample from Beta distribution
 *
 * Uses the Joehnk's algorithm for sampling
 */
export function sampleBeta(alpha: number, beta: number): number {
  if (alpha <= 0) alpha = 1;
  if (beta <= 0) beta = 1;

  // Simple approximation using gamma variates
  // For production, consider using a proper statistics library
  const gammaAlpha = sampleGamma(alpha);
  const gammaBeta = sampleGamma(beta);

  return gammaAlpha / (gammaAlpha + gammaBeta);
}

/**
 * Sample from Gamma distribution (Marsaglia and Tsang's method)
 */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    return sampleGamma(1 + shape) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    do {
      x = normalRandom();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Box-Muller transform for normal distribution
 */
function normalRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Thompson Sampling strategy selection
 *
 * For each arm, sample from its Beta(alpha, beta) posterior
 * Select the arm with highest sample
 */
export function thompsonSamplingSelect(
  statsMap: Record<Strategy, ArmStats>,
  feasibleStrategies: Strategy[]
): { strategy: Strategy; isExploration: boolean; samples: Record<Strategy, number> } {
  if (feasibleStrategies.length === 0) {
    return {
      strategy: 'hybrid',
      isExploration: false,
      samples: {} as Record<Strategy, number>,
    };
  }

  const samples: Record<Strategy, number> = {} as Record<Strategy, number>;
  let bestStrategy = feasibleStrategies[0];
  let bestSample = -Infinity;

  for (const s of feasibleStrategies) {
    const stats = statsMap[s];
    const sample = sampleBeta(stats.betaAlpha, stats.betaBeta);
    samples[s] = sample;

    if (sample > bestSample) {
      bestSample = sample;
      bestStrategy = s;
    }
  }

  // Exploration if chosen arm has low confidence
  const chosenStats = statsMap[bestStrategy];
  const isExploration = chosenStats.totalUses < 20;

  return { strategy: bestStrategy, isExploration, samples };
}

// ===========================================
// Main Selection Function
// ===========================================

/**
 * Select strategy using configured algorithm
 */
export function selectStrategy(
  config: AutopilotConfig,
  state: BanditState,
  query: string,
  constraints?: StrategyConstraints
): StrategySelection {
  const effectiveConstraints = constraints ?? {
    maxLatencyMs: config.maxLatencyMs,
    maxCostPerQuery: config.maxCostPerQuery,
    minRelevanceThreshold: config.minRelevanceThreshold,
  };

  // Filter to feasible strategies
  const feasibleStrategies = filterFeasibleStrategies(
    ALL_STRATEGIES,
    effectiveConstraints,
    state.stats
  );

  // Classify query for context-aware bias
  const queryType = classifyQuery(query);
  const queryBias = getQueryTypeBias(queryType);

  // Apply query bias to weights
  const biasedWeights = { ...config.strategyWeights };
  for (const [s, bias] of Object.entries(queryBias)) {
    const strategy = s as Strategy;
    biasedWeights[strategy] = (biasedWeights[strategy] ?? 0) + bias;
  }

  // Normalize weights
  const totalWeight = Object.values(biasedWeights).reduce((a, b) => a + b, 0);
  for (const s of ALL_STRATEGIES) {
    biasedWeights[s] = biasedWeights[s] / totalWeight;
  }

  let result: { strategy: Strategy; isExploration: boolean };
  let reason: string;

  if (config.useThompsonSampling) {
    // Thompson Sampling
    const tsResult = thompsonSamplingSelect(state.stats, feasibleStrategies);
    result = { strategy: tsResult.strategy, isExploration: tsResult.isExploration };
    reason = `Thompson Sampling selected ${tsResult.strategy} (query_type: ${queryType})`;
  } else if (state.totalDecisions >= config.minSamplesBeforeLearning) {
    // UCB after enough samples
    result = ucbSelect(
      state.stats,
      state.totalDecisions,
      feasibleStrategies
    );
    reason = `UCB selected ${result.strategy} (query_type: ${queryType})`;
  } else {
    // Epsilon-greedy during warm-up
    result = epsilonGreedySelect(
      biasedWeights,
      config.explorationRate,
      feasibleStrategies
    );
    reason = result.isExploration
      ? `Exploration: randomly selected ${result.strategy}`
      : `Exploitation: selected ${result.strategy} (weight: ${biasedWeights[result.strategy].toFixed(3)}, query_type: ${queryType})`;
  }

  // Calculate confidence based on usage
  const strategyStats = state.stats[result.strategy];
  const confidence = Math.min(1, strategyStats.totalUses / 100);

  return {
    strategy: result.strategy,
    isExploration: result.isExploration,
    reason,
    confidence,
    params: getDefaultStrategyParams(result.strategy),
  };
}

/**
 * Get default parameters for a strategy
 */
export function getDefaultStrategyParams(
  strategy: Strategy
): import('./types').StrategyParams {
  const base = {
    topK: 10,
    threshold: 0.5,
    searchEf: 32,
    rerank: true,
    rerankTopN: 10,
    keywordWeight: 0.3,
    vectorWeight: 0.7,
  };

  switch (strategy) {
    case 'vector':
      return { ...base, keywordWeight: 0, vectorWeight: 1 };
    case 'keyword':
      return { ...base, keywordWeight: 1, vectorWeight: 0, rerank: false };
    case 'hybrid':
      return base;
    case 'multi_query':
      return { ...base, numQueries: 3 };
    case 'hyde':
      return {
        ...base,
        hydePrompt: 'Generate a hypothetical document that would answer this query:',
      };
    default:
      return base;
  }
}

// ===========================================
// State Initialization
// ===========================================

/**
 * Create initial bandit state
 */
export function createInitialBanditState(configId: string): BanditState {
  const stats: Record<Strategy, ArmStats> = {} as Record<Strategy, ArmStats>;

  for (const s of ALL_STRATEGIES) {
    stats[s] = {
      strategy: s,
      totalUses: 0,
      totalSuccesses: 0,
      avgLatencyMs: STRATEGY_LATENCY_ESTIMATES[s],
      avgRelevance: 0.5,
      avgCost: STRATEGY_COST_ESTIMATES[s],
      avgReward: 0.5,
      successRate: 0.5,
      betaAlpha: 1,
      betaBeta: 1,
      ucbValue: 0,
      recentUses: 0,
      recentAvgRelevance: 0,
      recentAvgReward: 0,
      recentSuccessRate: 0,
    };
  }

  return {
    configId,
    weights: { ...DEFAULT_STRATEGY_WEIGHTS },
    stats,
    totalDecisions: 0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Build bandit state from database stats
 */
export function buildBanditState(
  configId: string,
  weights: StrategyWeights,
  statsRows: import('./types').ArmStats[]
): BanditState {
  const stats: Record<Strategy, ArmStats> = {} as Record<Strategy, ArmStats>;
  let totalDecisions = 0;

  for (const row of statsRows) {
    stats[row.strategy] = row;
    totalDecisions += row.totalUses;
  }

  // Fill in missing strategies with defaults
  for (const s of ALL_STRATEGIES) {
    if (!stats[s]) {
      stats[s] = {
        strategy: s,
        totalUses: 0,
        totalSuccesses: 0,
        avgLatencyMs: STRATEGY_LATENCY_ESTIMATES[s],
        avgRelevance: 0.5,
        avgCost: STRATEGY_COST_ESTIMATES[s],
        avgReward: 0.5,
        successRate: 0.5,
        betaAlpha: 1,
        betaBeta: 1,
        ucbValue: 0,
        recentUses: 0,
        recentAvgRelevance: 0,
        recentAvgReward: 0,
        recentSuccessRate: 0,
      };
    }
  }

  return {
    configId,
    weights,
    stats,
    totalDecisions,
    updatedAt: new Date().toISOString(),
  };
}
