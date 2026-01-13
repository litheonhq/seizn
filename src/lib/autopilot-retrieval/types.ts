/**
 * Seizn Autopilot Retrieval - Type Definitions
 *
 * Automatic retrieval strategy selection using multi-armed bandit algorithms.
 * The system learns from query outcomes and adapts strategy selection in real-time.
 */

// ===========================================
// Strategy Types
// ===========================================

/**
 * Available retrieval strategies
 */
export type Strategy = 'vector' | 'hybrid' | 'keyword' | 'multi_query' | 'hyde';

/**
 * All available strategies as array (for iteration)
 */
export const ALL_STRATEGIES: Strategy[] = ['vector', 'hybrid', 'keyword', 'multi_query', 'hyde'];

/**
 * Autopilot operation mode
 * - conservative: Lower exploration rate (5%), prefer proven strategies
 * - balanced: Standard exploration rate (10%)
 * - aggressive: Higher exploration rate (20%), faster learning
 * - experimental: Very high exploration rate (30%), for testing new strategies
 */
export type AutopilotMode = 'conservative' | 'balanced' | 'aggressive' | 'experimental';

/**
 * Exploration rates by mode
 */
export const MODE_EXPLORATION_RATES: Record<AutopilotMode, number> = {
  conservative: 0.05,
  balanced: 0.1,
  aggressive: 0.2,
  experimental: 0.3,
};

// ===========================================
// Configuration Types
// ===========================================

/**
 * Strategy weights mapping
 */
export type StrategyWeights = Record<Strategy, number>;

/**
 * Default strategy weights (before learning)
 */
export const DEFAULT_STRATEGY_WEIGHTS: StrategyWeights = {
  vector: 0.3,
  hybrid: 0.4,
  keyword: 0.15,
  multi_query: 0.1,
  hyde: 0.05,
};

/**
 * Constraints for strategy selection
 */
export interface StrategyConstraints {
  /** Maximum acceptable latency in milliseconds */
  maxLatencyMs: number;
  /** Maximum cost per query in dollars */
  maxCostPerQuery: number;
  /** Minimum relevance score to consider successful */
  minRelevanceThreshold: number;
}

/**
 * Default constraints
 */
export const DEFAULT_CONSTRAINTS: StrategyConstraints = {
  maxLatencyMs: 2000,
  maxCostPerQuery: 0.01,
  minRelevanceThreshold: 0.5,
};

/**
 * Autopilot retrieval configuration
 */
export interface AutopilotConfig {
  /** Unique identifier */
  id: string;
  /** Owner user ID */
  userId: string;
  /** Optional: collection-specific config */
  collectionId?: string | null;

  /** Whether autopilot is enabled */
  enabled: boolean;
  /** Operation mode */
  mode: AutopilotMode;

  /** Constraints */
  maxLatencyMs: number;
  maxCostPerQuery: number;
  minRelevanceThreshold: number;

  /** Learned strategy weights */
  strategyWeights: StrategyWeights;

  /** Learning parameters */
  explorationRate: number;
  learningRate: number;
  minSamplesBeforeLearning: number;

  /** Advanced options */
  useThompsonSampling: boolean;
  decayFactor: number;

  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating/updating autopilot config
 */
export interface AutopilotConfigInput {
  collectionId?: string;
  enabled?: boolean;
  mode?: AutopilotMode;
  maxLatencyMs?: number;
  maxCostPerQuery?: number;
  minRelevanceThreshold?: number;
  explorationRate?: number;
  learningRate?: number;
  minSamplesBeforeLearning?: number;
  useThompsonSampling?: boolean;
  decayFactor?: number;
}

// ===========================================
// Bandit State Types
// ===========================================

/**
 * Statistics for a single strategy arm
 */
export interface ArmStats {
  /** Strategy identifier */
  strategy: Strategy;
  /** Total number of times this strategy was used */
  totalUses: number;
  /** Number of successful outcomes (reward > threshold) */
  totalSuccesses: number;
  /** Average latency in milliseconds */
  avgLatencyMs: number;
  /** Average relevance score (0-1) */
  avgRelevance: number;
  /** Average cost per query */
  avgCost: number;
  /** Average reward */
  avgReward: number;
  /** Success rate (successes / uses) */
  successRate: number;

  /** Thompson Sampling: Beta distribution alpha */
  betaAlpha: number;
  /** Thompson Sampling: Beta distribution beta */
  betaBeta: number;

  /** Upper Confidence Bound value */
  ucbValue: number;

  /** Recent stats (last 24h) */
  recentUses: number;
  recentAvgRelevance: number;
  recentAvgReward: number;
  recentSuccessRate: number;
}

/**
 * Complete bandit state for decision making
 */
export interface BanditState {
  /** Config ID this state belongs to */
  configId: string;
  /** Current strategy weights */
  weights: StrategyWeights;
  /** Per-strategy statistics */
  stats: Record<Strategy, ArmStats>;
  /** Total decisions made */
  totalDecisions: number;
  /** Last updated timestamp */
  updatedAt: string;
}

// ===========================================
// Decision Types
// ===========================================

/**
 * Query type classification for context-aware decisions
 */
export type QueryType =
  | 'keyword_like'      // Short, contains special chars/acronyms
  | 'semantic'          // Long, natural language
  | 'code'              // Contains code patterns
  | 'question'          // Question format
  | 'complex'           // Multi-part or compound
  | 'unknown';          // Default

/**
 * Strategy selection result
 */
export interface StrategySelection {
  /** Chosen strategy */
  strategy: Strategy;
  /** Whether this was an exploration choice */
  isExploration: boolean;
  /** Reason for selection */
  reason: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Strategy parameters to use */
  params?: StrategyParams;
}

/**
 * Parameters for executing a strategy
 */
export interface StrategyParams {
  /** Number of results to retrieve */
  topK: number;
  /** Similarity threshold */
  threshold: number;
  /** HNSW search ef parameter */
  searchEf: number;
  /** Enable reranking */
  rerank: boolean;
  /** Number of results to rerank */
  rerankTopN: number;
  /** Weight for keyword search (hybrid mode) */
  keywordWeight: number;
  /** Weight for vector search (hybrid mode) */
  vectorWeight: number;

  // Strategy-specific params
  /** Multi-query: number of query variations */
  numQueries?: number;
  /** HyDE: hypothetical document prompt */
  hydePrompt?: string;
}

/**
 * Decision record (stored in DB)
 */
export interface AutopilotDecision {
  /** Unique identifier */
  id: string;
  /** Config ID */
  configId: string;
  /** Associated trace ID */
  traceId?: string | null;

  /** Query context */
  queryText: string;
  queryLength: number;
  queryType?: QueryType;

  /** Decision */
  chosenStrategy: Strategy;
  strategyParams?: StrategyParams;
  decisionReason: string;
  wasExploration: boolean;
  preDecisionWeights?: StrategyWeights;

  /** Outcome */
  latencyMs?: number;
  relevanceScore?: number;
  cost?: number;
  resultCount?: number;

  /** Feedback */
  userFeedback?: 'positive' | 'negative' | 'neutral' | null;
  feedbackAt?: string | null;

  /** Reward */
  reward?: number;
  rewardComponents?: RewardComponents;

  createdAt: string;
}

// ===========================================
// Reward Types
// ===========================================

/**
 * Components that make up the reward signal
 */
export interface RewardComponents {
  /** Relevance score (0-1), higher is better */
  relevance: number;
  /** Latency score (0-1), higher means faster */
  latency: number;
  /** Cost score (0-1), higher means cheaper */
  cost: number;
  /** Feedback score (-1 to 1) */
  feedback: number;
}

/**
 * Weights for reward calculation
 */
export interface RewardWeights {
  relevance: number;
  latency: number;
  cost: number;
  feedback: number;
}

/**
 * Default reward weights
 */
export const DEFAULT_REWARD_WEIGHTS: RewardWeights = {
  relevance: 0.5,
  latency: 0.2,
  cost: 0.1,
  feedback: 0.2,
};

/**
 * Outcome from strategy execution
 */
export interface StrategyOutcome {
  /** Latency in milliseconds */
  latencyMs: number;
  /** Relevance score (0-1) */
  relevanceScore: number;
  /** Cost in dollars */
  cost: number;
  /** Number of results returned */
  resultCount: number;
  /** Optional user feedback */
  userFeedback?: 'positive' | 'negative' | 'neutral';
}

// ===========================================
// API Types
// ===========================================

/**
 * Request for autopilot decision
 */
export interface DecideRequest {
  /** User ID */
  userId: string;
  /** Collection ID */
  collectionId?: string;
  /** Query text */
  query: string;
  /** Optional config override */
  configOverride?: Partial<AutopilotConfigInput>;
}

/**
 * Response from autopilot decision
 */
export interface DecideResponse {
  /** Selected strategy */
  selection: StrategySelection;
  /** Config used */
  configId: string;
  /** Decision ID (for feedback) */
  decisionId?: string;
}

/**
 * Request for recording feedback
 */
export interface FeedbackRequest {
  /** Decision ID */
  decisionId: string;
  /** Feedback type */
  feedback: 'positive' | 'negative' | 'neutral';
}

/**
 * Response from feedback submission
 */
export interface FeedbackResponse {
  success: boolean;
  message?: string;
}

/**
 * Strategy stats summary for UI
 */
export interface StrategyStatsSummary {
  configId: string;
  strategies: Array<{
    strategy: Strategy;
    totalUses: number;
    successRate: number;
    avgReward: number;
    avgLatencyMs: number;
    avgRelevance: number;
    trend: 'improving' | 'stable' | 'declining';
  }>;
  totalDecisions: number;
  explorationRate: number;
  lastUpdated: string;
}

/**
 * Recent decisions for UI (decision log)
 */
export interface RecentDecision {
  id: string;
  createdAt: string;
  queryText: string;
  chosenStrategy: Strategy;
  wasExploration: boolean;
  latencyMs?: number;
  relevanceScore?: number;
  reward?: number;
  userFeedback?: string | null;
}

// ===========================================
// Database Row Types (for Supabase)
// ===========================================

export interface AutopilotRetrievalConfigRow {
  id: string;
  user_id: string;
  collection_id: string | null;
  enabled: boolean;
  mode: AutopilotMode;
  max_latency_ms: number;
  max_cost_per_query: number;
  min_relevance_threshold: number;
  strategy_weights: StrategyWeights;
  exploration_rate: number;
  learning_rate: number;
  min_samples_before_learning: number;
  use_thompson_sampling: boolean;
  decay_factor: number;
  created_at: string;
  updated_at: string;
}

export interface AutopilotRetrievalDecisionRow {
  id: string;
  config_id: string;
  trace_id: string | null;
  query_text: string;
  query_length: number;
  query_type: QueryType | null;
  chosen_strategy: Strategy;
  strategy_params: StrategyParams | null;
  decision_reason: string;
  was_exploration: boolean;
  pre_decision_weights: StrategyWeights | null;
  latency_ms: number | null;
  relevance_score: number | null;
  cost: number | null;
  result_count: number | null;
  user_feedback: 'positive' | 'negative' | 'neutral' | null;
  feedback_at: string | null;
  reward: number | null;
  reward_components: RewardComponents | null;
  created_at: string;
}

export interface AutopilotStrategyStatsRow {
  id: string;
  config_id: string;
  strategy: Strategy;
  total_uses: number;
  total_successes: number;
  avg_latency_ms: number;
  avg_relevance: number;
  avg_cost: number;
  avg_reward: number;
  success_rate: number;
  recent_uses: number;
  recent_avg_relevance: number;
  recent_avg_reward: number;
  recent_success_rate: number;
  beta_alpha: number;
  beta_beta: number;
  ucb_value: number;
  updated_at: string;
}

// ===========================================
// Utility Types
// ===========================================

/**
 * Convert DB row to config object
 */
export function rowToConfig(row: AutopilotRetrievalConfigRow): AutopilotConfig {
  return {
    id: row.id,
    userId: row.user_id,
    collectionId: row.collection_id,
    enabled: row.enabled,
    mode: row.mode,
    maxLatencyMs: row.max_latency_ms,
    maxCostPerQuery: row.max_cost_per_query,
    minRelevanceThreshold: row.min_relevance_threshold,
    strategyWeights: row.strategy_weights,
    explorationRate: row.exploration_rate,
    learningRate: row.learning_rate,
    minSamplesBeforeLearning: row.min_samples_before_learning,
    useThompsonSampling: row.use_thompson_sampling,
    decayFactor: row.decay_factor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert stats row to ArmStats object
 */
export function rowToArmStats(row: AutopilotStrategyStatsRow): ArmStats {
  return {
    strategy: row.strategy,
    totalUses: row.total_uses,
    totalSuccesses: row.total_successes,
    avgLatencyMs: row.avg_latency_ms,
    avgRelevance: row.avg_relevance,
    avgCost: row.avg_cost,
    avgReward: row.avg_reward,
    successRate: row.success_rate,
    betaAlpha: row.beta_alpha,
    betaBeta: row.beta_beta,
    ucbValue: row.ucb_value,
    recentUses: row.recent_uses,
    recentAvgRelevance: row.recent_avg_relevance,
    recentAvgReward: row.recent_avg_reward,
    recentSuccessRate: row.recent_success_rate,
  };
}
