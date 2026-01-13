/**
 * Seizn Autopilot Retrieval
 *
 * Automatic retrieval strategy selection using multi-armed bandit algorithms.
 * The system learns from query outcomes and adapts in real-time.
 *
 * Features:
 * - Multi-armed bandit for strategy selection (Epsilon-greedy, UCB, Thompson Sampling)
 * - Context-aware query classification
 * - Reward calculation from multiple signals (relevance, latency, cost, feedback)
 * - Continuous learning from outcomes
 * - Constraint-aware strategy filtering
 *
 * Usage:
 * ```typescript
 * import {
 *   makeDecision,
 *   recordOutcome,
 *   recordFeedback,
 *   getStatsSummary,
 * } from '@/lib/autopilot-retrieval';
 *
 * // 1. Get autopilot decision for a query
 * const { selection, decisionId, config } = await makeDecision(
 *   userId,
 *   'What is the capital of France?',
 *   collectionId
 * );
 *
 * // 2. Execute the strategy and get results
 * const results = await executeStrategy(selection.strategy, selection.params);
 *
 * // 3. Record the outcome
 * await recordOutcome(decisionId, {
 *   latencyMs: 150,
 *   relevanceScore: 0.85,
 *   cost: 0.001,
 *   resultCount: 10,
 * });
 *
 * // 4. Optionally record user feedback
 * await recordFeedback(decisionId, 'positive');
 *
 * // 5. View stats
 * const stats = await getStatsSummary(userId);
 * ```
 */

// ===========================================
// Types
// ===========================================

export type {
  Strategy,
  AutopilotMode,
  StrategyWeights,
  StrategyConstraints,
  AutopilotConfig,
  AutopilotConfigInput,
  ArmStats,
  BanditState,
  QueryType,
  StrategySelection,
  StrategyParams,
  AutopilotDecision,
  RewardComponents,
  RewardWeights,
  StrategyOutcome,
  DecideRequest,
  DecideResponse,
  FeedbackRequest,
  FeedbackResponse,
  StrategyStatsSummary,
  RecentDecision,
} from './types';

export {
  ALL_STRATEGIES,
  MODE_EXPLORATION_RATES,
  DEFAULT_STRATEGY_WEIGHTS,
  DEFAULT_CONSTRAINTS,
  DEFAULT_REWARD_WEIGHTS,
  rowToConfig,
  rowToArmStats,
} from './types';

// ===========================================
// Bandit Algorithm
// ===========================================

export {
  classifyQuery,
  getQueryTypeBias,
  isStrategyFeasible,
  filterFeasibleStrategies,
  epsilonGreedySelect,
  calculateUCB,
  ucbSelect,
  sampleBeta,
  thompsonSamplingSelect,
  selectStrategy,
  getDefaultStrategyParams,
  createInitialBanditState,
  buildBanditState,
} from './bandit';

// ===========================================
// Reward Calculator
// ===========================================

export {
  calculateRelevanceScore,
  calculateLatencyScore,
  calculateCostScore,
  calculateFeedbackScore,
  calculateResultCountModifier,
  calculateRewardComponents,
  calculateReward,
  calculateRewardFromOutcome,
  isSuccessfulOutcome,
  interpretReward,
  analyzeRewardComponents,
  decayReward,
  timeWeightedReward,
} from './reward';

// ===========================================
// Learner
// ===========================================

export {
  updateWeightsGradient,
  updateWeightsEMA,
  updateWeightsSoftmax,
  normalizeWeights,
  updateArmStats,
  updateUCBValue,
  updateBanditState,
  detectPerformanceDecline,
  identifyBestStrategy,
  generateLearningInsights,
  checkWeightConvergence,
  calculateWeightVolatility,
} from './learner';

// ===========================================
// Executor (Main API)
// ===========================================

export {
  getOrCreateConfig,
  updateConfig,
  deleteConfig,
  loadBanditState,
  makeDecision,
  recordOutcome,
  recordFeedback,
  getStatsSummary,
  getRecentDecisions,
  resetLearning,
} from './executor';
