/**
 * Seizn Summer - Budget Router Types
 *
 * Type definitions for the budget-aware routing system.
 * Routes requests based on cost constraints and performance requirements.
 */

// ===========================================
// Budget Configuration
// ===========================================

/**
 * Budget configuration for routing decisions
 */
export interface BudgetConfig {
  /** Maximum latency allowed in milliseconds */
  maxLatencyMs: number;
  /** Maximum cost per request in credits */
  maxCostCredits: number;
  /** Maximum tokens to process */
  maxTokens: number;
  /** Preferred model tier */
  preferredTier: ModelTier;
  /** Enable fallback to cheaper options */
  enableFallback: boolean;
  /** Cost optimization mode */
  costOptimization: CostOptimizationMode;
}

/**
 * Model tiers for routing
 */
export type ModelTier = 'premium' | 'standard' | 'economy';

/**
 * Cost optimization modes
 */
export type CostOptimizationMode =
  | 'quality'    // Prioritize quality over cost
  | 'balanced'   // Balance quality and cost
  | 'cost'       // Prioritize cost savings
  | 'latency';   // Prioritize low latency

/**
 * Default budget configuration by plan
 */
export const DEFAULT_BUDGET_BY_PLAN: Record<string, BudgetConfig> = {
  free: {
    maxLatencyMs: 3000,
    maxCostCredits: 5,
    maxTokens: 4000,
    preferredTier: 'economy',
    enableFallback: true,
    costOptimization: 'cost',
  },
  pro: {
    maxLatencyMs: 5000,
    maxCostCredits: 50,
    maxTokens: 16000,
    preferredTier: 'standard',
    enableFallback: true,
    costOptimization: 'balanced',
  },
  enterprise: {
    maxLatencyMs: 10000,
    maxCostCredits: 500,
    maxTokens: 32000,
    preferredTier: 'premium',
    enableFallback: false,
    costOptimization: 'quality',
  },
};

// ===========================================
// Routing Decision
// ===========================================

/**
 * Routing decision result
 */
export interface RoutingDecision {
  /** Whether to use cache */
  useCache: boolean;
  /** Selected model ID */
  modelId: string;
  /** Selected model tier */
  modelTier: ModelTier;
  /** Selected provider */
  provider: ProviderType;
  /** Estimated cost in credits */
  estimatedCost: number;
  /** Estimated latency in ms */
  estimatedLatencyMs: number;
  /** Routing strategy used */
  strategy: RoutingStrategy;
  /** Fallback options if primary fails */
  fallbacks: FallbackOption[];
  /** Decision reasoning */
  reasoning: string;
  /** Decision metadata */
  metadata: RoutingMetadata;
}

/**
 * Provider types for routing
 */
export type ProviderType =
  | 'voyage'       // Voyage AI for embeddings
  | 'openai'       // OpenAI
  | 'anthropic'    // Anthropic Claude
  | 'cohere'       // Cohere for reranking
  | 'local'        // Local/self-hosted
  | 'cache';       // Cache (no API call)

/**
 * Routing strategies
 */
export type RoutingStrategy =
  | 'cache_first'    // Check cache before API
  | 'direct'         // Direct API call
  | 'fallback_chain' // Try multiple providers
  | 'parallel'       // Parallel requests
  | 'hybrid';        // Combined approach

/**
 * Fallback option for routing
 */
export interface FallbackOption {
  /** Provider for fallback */
  provider: ProviderType;
  /** Model ID */
  modelId: string;
  /** Trigger condition */
  triggerOn: FallbackTrigger;
  /** Estimated cost if fallback used */
  estimatedCost: number;
}

/**
 * Fallback triggers
 */
export type FallbackTrigger =
  | 'timeout'        // Primary times out
  | 'error'          // Primary returns error
  | 'rate_limit'     // Primary is rate limited
  | 'over_budget'    // Primary exceeds budget
  | 'quality_low';   // Primary quality below threshold

/**
 * Routing decision metadata
 */
export interface RoutingMetadata {
  /** Request ID */
  requestId: string;
  /** User plan */
  plan: string;
  /** Budget used for decision */
  budgetConfig: BudgetConfig;
  /** Cache lookup result */
  cacheResult?: {
    checked: boolean;
    hit: boolean;
    similarity?: number;
  };
  /** Model selection details */
  modelSelection?: {
    considered: string[];
    rejected: { modelId: string; reason: string }[];
  };
  /** Timestamp */
  decidedAt: string;
}

// ===========================================
// Request Context
// ===========================================

/**
 * Request context for routing decisions
 */
export interface RoutingContext {
  /** User ID */
  userId: string;
  /** User plan */
  plan: string;
  /** API key ID */
  apiKeyId?: string;
  /** Collection ID (for RAG) */
  collectionId?: string;
  /** Query text */
  query: string;
  /** Query embedding (if pre-computed) */
  embedding?: number[];
  /** Estimated input tokens */
  inputTokens: number;
  /** Operation type */
  operation: OperationType;
  /** Custom budget override */
  budgetOverride?: Partial<BudgetConfig>;
  /** Request priority */
  priority?: RequestPriority;
  /** Request metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Operation types
 */
export type OperationType =
  | 'embed'        // Embedding generation
  | 'search'       // Vector search
  | 'rerank'       // Document reranking
  | 'generate'     // Text generation
  | 'rag';         // Full RAG pipeline

/**
 * Request priority levels
 */
export type RequestPriority = 'low' | 'normal' | 'high' | 'critical';

// ===========================================
// Model Configuration
// ===========================================

/**
 * Model configuration for routing
 */
export interface ModelConfig {
  /** Model ID */
  id: string;
  /** Provider */
  provider: ProviderType;
  /** Model tier */
  tier: ModelTier;
  /** Operations supported */
  operations: OperationType[];
  /** Cost per 1000 tokens */
  costPer1kTokens: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Maximum context length */
  maxContextTokens: number;
  /** Quality score (0-1) */
  qualityScore: number;
  /** Availability (0-1) */
  availability: number;
  /** Whether model is enabled */
  enabled: boolean;
}

/**
 * Default model configurations
 */
export const DEFAULT_MODELS: ModelConfig[] = [
  // Embedding models
  {
    id: 'voyage-3',
    provider: 'voyage',
    tier: 'standard',
    operations: ['embed'],
    costPer1kTokens: 0.06,
    avgLatencyMs: 200,
    maxContextTokens: 32000,
    qualityScore: 0.95,
    availability: 0.999,
    enabled: true,
  },
  {
    id: 'voyage-3-lite',
    provider: 'voyage',
    tier: 'economy',
    operations: ['embed'],
    costPer1kTokens: 0.02,
    avgLatencyMs: 150,
    maxContextTokens: 16000,
    qualityScore: 0.90,
    availability: 0.999,
    enabled: true,
  },
  // Rerank models
  {
    id: 'rerank-v3.5',
    provider: 'cohere',
    tier: 'standard',
    operations: ['rerank'],
    costPer1kTokens: 0.1,
    avgLatencyMs: 300,
    maxContextTokens: 4096,
    qualityScore: 0.92,
    availability: 0.998,
    enabled: true,
  },
  // Generation models
  {
    id: 'claude-3-5-sonnet',
    provider: 'anthropic',
    tier: 'premium',
    operations: ['generate', 'rag'],
    costPer1kTokens: 3.0,
    avgLatencyMs: 1500,
    maxContextTokens: 200000,
    qualityScore: 0.98,
    availability: 0.997,
    enabled: true,
  },
  {
    id: 'claude-3-5-haiku',
    provider: 'anthropic',
    tier: 'standard',
    operations: ['generate', 'rag'],
    costPer1kTokens: 0.8,
    avgLatencyMs: 800,
    maxContextTokens: 200000,
    qualityScore: 0.92,
    availability: 0.998,
    enabled: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    tier: 'economy',
    operations: ['generate', 'rag'],
    costPer1kTokens: 0.15,
    avgLatencyMs: 600,
    maxContextTokens: 128000,
    qualityScore: 0.88,
    availability: 0.998,
    enabled: true,
  },
];

// ===========================================
// Router Statistics
// ===========================================

/**
 * Router statistics
 */
export interface RouterStats {
  /** Total routing decisions made */
  totalDecisions: number;
  /** Cache hit count */
  cacheHits: number;
  /** Cache miss count */
  cacheMisses: number;
  /** Total cost in credits */
  totalCostCredits: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Decisions by strategy */
  byStrategy: Record<RoutingStrategy, number>;
  /** Decisions by model */
  byModel: Record<string, number>;
  /** Fallback usage count */
  fallbackCount: number;
  /** Budget exceeded count */
  budgetExceededCount: number;
  /** Stats timestamp */
  timestamp: string;
}

// ===========================================
// Router Events
// ===========================================

/**
 * Router event types
 */
export type RouterEventType =
  | 'decision'
  | 'fallback'
  | 'budget_exceeded'
  | 'model_unavailable'
  | 'latency_exceeded';

/**
 * Router event for logging
 */
export interface RouterEvent {
  type: RouterEventType;
  timestamp: string;
  requestId: string;
  userId: string;
  decision?: RoutingDecision;
  error?: string;
  metadata?: Record<string, unknown>;
}
