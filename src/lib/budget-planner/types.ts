/**
 * Seizn Budget-aware Planning - Types
 *
 * Type definitions for budget management and cost optimization.
 */

// ============================================
// Budget Configuration
// ============================================

export interface BudgetSettings {
  /** Daily budget limit in USD */
  dailyBudgetUsd: number;
  /** Monthly budget limit in USD */
  monthlyBudgetUsd: number;
  /** Maximum cost per query in USD */
  perQueryMaxUsd: number;
  /** Alert threshold percentage (0-100) */
  alertAtPercent: number;
  /** Budget enforcement mode */
  mode: BudgetMode;
  /** Fallback strategy when over budget */
  fallbackStrategy: FallbackStrategy;
}

export type BudgetMode = 'soft' | 'hard';
// soft: warn but allow queries
// hard: reject queries that exceed budget

export type FallbackStrategy = 'degrade' | 'reject' | 'queue';
// degrade: use cheaper models/fewer results
// reject: return error
// queue: queue for later processing

export const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  dailyBudgetUsd: 10.0,
  monthlyBudgetUsd: 100.0,
  perQueryMaxUsd: 0.05,
  alertAtPercent: 80,
  mode: 'soft',
  fallbackStrategy: 'degrade',
};

// ============================================
// Budget Status
// ============================================

export interface BudgetStatus {
  /** Whether user has configured budget */
  hasBudget: boolean;
  /** Daily budget limit */
  dailyBudget: number;
  /** Monthly budget limit */
  monthlyBudget: number;
  /** Max cost per query */
  perQueryMax: number;
  /** Amount spent today */
  dailySpent: number;
  /** Amount spent this month */
  monthlySpent: number;
  /** Remaining daily budget */
  dailyRemaining: number;
  /** Remaining monthly budget */
  monthlyRemaining: number;
  /** Daily usage percentage */
  dailyUsagePct: number;
  /** Monthly usage percentage */
  monthlyUsagePct: number;
  /** Budget mode */
  mode: BudgetMode;
  /** Fallback strategy */
  fallbackStrategy: FallbackStrategy;
  /** Whether over daily budget */
  isOverDaily: boolean;
  /** Whether over monthly budget */
  isOverMonthly: boolean;
  /** Alert threshold percentage */
  alertAtPercent: number;
}

export interface BudgetCheckResult {
  /** Whether query is allowed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
  /** Whether fallback should be used */
  useFallback: boolean;
  /** Recommended fallback plan */
  fallbackPlan?: RetrievalPlanConfig;
  /** Remaining budget */
  remainingDaily: number;
  remainingMonthly: number;
  /** Estimated cost for the query */
  estimatedCost: number;
}

// ============================================
// Query Cost
// ============================================

export interface QueryCost {
  /** Cost ID */
  id?: string;
  /** User ID */
  userId: string;
  /** Trace ID */
  traceId?: string;
  /** Embedding cost in USD */
  embeddingCost: number;
  /** Rerank cost in USD */
  rerankCost: number;
  /** LLM cost in USD */
  llmCost: number;
  /** Storage cost in USD */
  storageCost: number;
  /** Total cost in USD */
  totalCost: number;
  /** Embedding model used */
  embeddingModel?: string;
  /** Embedding tokens used */
  embeddingTokens?: number;
  /** Embedding dimensions */
  embeddingDimensions?: number;
  /** Rerank model used */
  rerankModel?: string;
  /** Number of rerank pairs */
  rerankPairs?: number;
  /** LLM model used */
  llmModel?: string;
  /** LLM input tokens */
  llmTokensIn?: number;
  /** LLM output tokens */
  llmTokensOut?: number;
  /** Query type */
  queryType?: QueryType;
  /** Number of results returned */
  resultCount?: number;
  /** Query latency in ms */
  latencyMs?: number;
  /** Whether query was over budget */
  wasOverBudget?: boolean;
  /** Whether fallback was used */
  usedFallback?: boolean;
  /** Timestamp */
  createdAt?: string;
}

export type QueryType = 'search' | 'rag' | 'hybrid' | 'semantic' | 'keyword';

// ============================================
// Cost Estimate
// ============================================

export interface CostEstimate {
  /** Embedding cost */
  embedding: number;
  /** Rerank cost */
  rerank: number;
  /** LLM cost */
  llm: number;
  /** Storage cost */
  storage: number;
  /** Total estimated cost */
  total: number;
  /** Detailed breakdown */
  breakdown: CostBreakdown;
  /** Confidence in estimate (0-1) */
  confidence: number;
}

export interface CostBreakdown {
  /** Embedding details */
  embedding: {
    model: string;
    tokens: number;
    pricePerMToken: number;
    cost: number;
  };
  /** Rerank details */
  rerank: {
    model: string | null;
    pairs: number;
    pricePerSearch: number;
    cost: number;
  };
  /** LLM details */
  llm: {
    model: string | null;
    tokensIn: number;
    tokensOut: number;
    pricePerMTokenIn: number;
    pricePerMTokenOut: number;
    cost: number;
  };
  /** Storage details */
  storage: {
    vectors: number;
    dimensions: number;
    pricePerVector: number;
    cost: number;
  };
}

// ============================================
// Retrieval Plan Configuration
// ============================================

export interface RetrievalPlanConfig {
  /** Embedding model to use */
  embeddingModel: EmbeddingModel;
  /** Whether to enable reranking */
  rerankEnabled: boolean;
  /** Rerank model to use (if enabled) */
  rerankModel?: RerankModel;
  /** LLM model for RAG (if applicable) */
  llmModel?: LLMModel;
  /** Number of results to retrieve */
  topK: number;
  /** Whether to use semantic cache */
  useCache: boolean;
  /** Chunk strategy */
  chunkStrategy: ChunkStrategy;
  /** Search type */
  searchType: SearchType;
  /** Quality tier (affects model selection) */
  qualityTier: QualityTier;
}

export type EmbeddingModel =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002'
  | 'voyage-3'
  | 'voyage-3-lite'
  | 'gemini-embedding';

export type RerankModel =
  | 'cohere-rerank-v3'
  | 'cohere-rerank-english-v3'
  | 'bge-reranker-v2-m3'
  | 'jina-reranker-v2';

export type LLMModel =
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-turbo'
  | 'claude-3-5-sonnet'
  | 'claude-3-5-haiku'
  | 'claude-3-opus'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash';

export type ChunkStrategy = 'small' | 'balanced' | 'large' | 'semantic';

export type SearchType = 'semantic' | 'hybrid' | 'keyword';

export type QualityTier = 'economy' | 'standard' | 'premium';

export const DEFAULT_PLAN_CONFIG: RetrievalPlanConfig = {
  embeddingModel: 'text-embedding-3-small',
  rerankEnabled: false,
  llmModel: 'gpt-4o-mini',
  topK: 10,
  useCache: true,
  chunkStrategy: 'balanced',
  searchType: 'hybrid',
  qualityTier: 'standard',
};

// ============================================
// Optimized Plan
// ============================================

export interface OptimizedPlan {
  /** The plan configuration */
  plan: RetrievalPlanConfig;
  /** Estimated cost */
  estimatedCost: number;
  /** Estimated quality (0-1) */
  estimatedQuality: number;
  /** Estimated latency in ms */
  estimatedLatencyMs: number;
  /** Tradeoffs made */
  tradeoffs: string[];
  /** Whether this is a fallback plan */
  isFallback: boolean;
  /** Reason for any limitations */
  limitationReason?: string;
}

export interface UpgradeSuggestion {
  /** Current config */
  current: Partial<RetrievalPlanConfig>;
  /** Suggested upgrade */
  suggested: Partial<RetrievalPlanConfig>;
  /** Additional cost */
  additionalCost: number;
  /** Quality improvement (0-1) */
  qualityImprovement: number;
  /** Description of improvement */
  description: string;
  /** Priority (higher = more impactful) */
  priority: number;
}

// ============================================
// Plan Constraints
// ============================================

export interface PlanConstraints {
  /** Maximum cost per query */
  maxCostPerQuery: number;
  /** Minimum quality target (0-1) */
  minQuality?: number;
  /** Maximum latency in ms */
  maxLatencyMs?: number;
  /** Required search type */
  requiredSearchType?: SearchType;
  /** Must include reranking */
  mustRerank?: boolean;
  /** Must use specific embedding model */
  requiredEmbeddingModel?: EmbeddingModel;
  /** Minimum topK */
  minTopK?: number;
  /** Maximum topK */
  maxTopK?: number;
}

// ============================================
// Daily Summary
// ============================================

export interface DailyCostSummary {
  /** Date */
  date: string;
  /** Total queries */
  totalQueries: number;
  /** Total cost */
  totalCostUsd: number;
  /** Embedding cost */
  embeddingCostUsd: number;
  /** Rerank cost */
  rerankCostUsd: number;
  /** LLM cost */
  llmCostUsd: number;
  /** Storage cost */
  storageCostUsd: number;
  /** Total embedding tokens */
  totalEmbeddingTokens: number;
  /** Total LLM input tokens */
  totalLlmTokensIn: number;
  /** Total LLM output tokens */
  totalLlmTokensOut: number;
  /** Average cost per query */
  avgCostPerQuery: number;
  /** Average latency */
  avgLatencyMs: number;
  /** Budget utilization percentage */
  budgetUtilizationPct: number;
  /** Queries that exceeded budget */
  overBudgetQueries: number;
  /** Queries that used fallback */
  fallbackQueries: number;
}

// ============================================
// Budget Alert
// ============================================

export type BudgetAlertType =
  | 'daily_threshold'
  | 'monthly_threshold'
  | 'daily_exceeded'
  | 'monthly_exceeded'
  | 'query_rejected'
  | 'fallback_triggered';

export interface BudgetAlert {
  /** Alert ID */
  id: string;
  /** User ID */
  userId: string;
  /** Alert type */
  alertType: BudgetAlertType;
  /** Threshold percentage (if applicable) */
  thresholdPct?: number;
  /** Current amount spent */
  currentSpent: number;
  /** Budget limit */
  budgetLimit: number;
  /** Alert title */
  title: string;
  /** Alert message */
  message?: string;
  /** Whether acknowledged */
  acknowledged: boolean;
  /** When acknowledged */
  acknowledgedAt?: string;
  /** When created */
  createdAt: string;
}

// ============================================
// API Request/Response Types
// ============================================

export interface GetBudgetRequest {
  userId: string;
}

export interface GetBudgetResponse {
  success: boolean;
  budget: BudgetStatus;
}

export interface UpdateBudgetRequest {
  userId: string;
  settings: Partial<BudgetSettings>;
}

export interface UpdateBudgetResponse {
  success: boolean;
  budget: BudgetStatus;
}

export interface GetUsageRequest {
  userId: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface GetUsageResponse {
  success: boolean;
  summaries: DailyCostSummary[];
  totalCost: number;
  totalQueries: number;
}

export interface OptimizePlanRequest {
  userId: string;
  budget: number;
  constraints?: PlanConstraints;
  queryType?: QueryType;
}

export interface OptimizePlanResponse {
  success: boolean;
  plan: OptimizedPlan;
  alternatives: OptimizedPlan[];
  upgrades: UpgradeSuggestion[];
}

export interface EstimateCostRequest {
  plan: Partial<RetrievalPlanConfig>;
  queryLength: number;
  expectedChunks: number;
  includeRag?: boolean;
}

export interface EstimateCostResponse {
  success: boolean;
  estimate: CostEstimate;
}

export interface RecordCostRequest {
  cost: Omit<QueryCost, 'id' | 'createdAt'>;
}

export interface RecordCostResponse {
  success: boolean;
  costId: string;
  totalCost: number;
  dailySpent: number;
  monthlySpent: number;
  wasOverBudget: boolean;
  alertTriggered?: string;
}

export interface GetAlertsRequest {
  userId: string;
  unacknowledgedOnly?: boolean;
  limit?: number;
}

export interface GetAlertsResponse {
  success: boolean;
  alerts: BudgetAlert[];
}

export interface AcknowledgeAlertRequest {
  alertId: string;
}

export interface AcknowledgeAlertResponse {
  success: boolean;
}
