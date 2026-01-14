/**
 * Seizn Vector Cost Engineering - Types
 *
 * Type definitions for the cost engineering system.
 * Provides tiering, caching, autopilot, and cost calculation capabilities.
 */

// ============================================
// Storage Tiering Types
// ============================================

/**
 * Storage tier levels
 */
export type StorageTier = 'hot' | 'warm' | 'cold';

/**
 * Configuration for each storage tier
 */
export interface TierSettings {
  /** Maximum age in days before demotion */
  maxAgeDays: number;
  /** Minimum access count to maintain tier */
  minAccessCount: number;
  /** Index type for this tier */
  indexType: IndexType;
  /** Index parameters */
  indexParams: HnswParams | IvfParams | FlatParams;
  /** Storage class */
  storageClass: StorageClass;
  /** Cost per 1M vectors per month in USD */
  costPerMVectors: number;
  /** Expected latency in ms */
  expectedLatencyMs: number;
}

export type IndexType = 'hnsw' | 'ivf' | 'flat';
export type StorageClass = 'memory' | 'ssd' | 'hdd' | 'object';

export interface HnswParams {
  /** ef parameter for search */
  ef: number;
  /** m parameter for graph construction */
  m: number;
}

export interface IvfParams {
  /** Number of clusters */
  nlist: number;
  /** Number of probes */
  nprobe: number;
}

export interface FlatParams {
  /** Compression type */
  compression?: 'none' | 'pq' | 'sq';
}

/**
 * Complete tier configuration
 */
export interface TierConfig {
  hot: TierSettings;
  warm: TierSettings;
  cold: TierSettings;
}

/**
 * Default tier configuration
 */
export const DEFAULT_TIER_CONFIG: TierConfig = {
  hot: {
    maxAgeDays: 7,
    minAccessCount: 3,
    indexType: 'hnsw',
    indexParams: { ef: 128, m: 32 } as HnswParams,
    storageClass: 'memory',
    costPerMVectors: 10.0,
    expectedLatencyMs: 50,
  },
  warm: {
    maxAgeDays: 30,
    minAccessCount: 1,
    indexType: 'hnsw',
    indexParams: { ef: 64, m: 16 } as HnswParams,
    storageClass: 'ssd',
    costPerMVectors: 3.0,
    expectedLatencyMs: 100,
  },
  cold: {
    maxAgeDays: Infinity,
    minAccessCount: 0,
    indexType: 'flat',
    indexParams: { compression: 'pq' } as FlatParams,
    storageClass: 'object',
    costPerMVectors: 0.5,
    expectedLatencyMs: 500,
  },
};

/**
 * Chunk access statistics
 */
export interface ChunkAccessStats {
  /** Chunk ID */
  chunkId: string;
  /** Collection ID */
  collectionId: string;
  /** User ID */
  userId: string;
  /** Access count */
  accessCount: number;
  /** Last accessed timestamp */
  lastAccessedAt: Date;
  /** Creation timestamp */
  createdAt: Date;
  /** Current tier */
  tier: StorageTier;
}

/**
 * Tier distribution statistics
 */
export interface TierDistribution {
  hot: number;
  warm: number;
  cold: number;
  total: number;
}

// ============================================
// Semantic Cache Types
// ============================================

/**
 * Cache configuration
 */
export interface SemanticCacheConfig {
  /** Enable/disable cache */
  enabled: boolean;
  /** Time-to-live in seconds */
  ttlSeconds: number;
  /** Maximum cache size in MB */
  maxSizeMb: number;
  /** Similarity threshold for cache hit (0-1) */
  similarityThreshold: number;
  /** Minimum query length to cache */
  minQueryLength: number;
  /** Maximum query length to cache */
  maxQueryLength: number;
  /** Eviction policy */
  evictionPolicy: EvictionPolicy;
  /** Cache namespace prefix */
  namespace: string;
}

export type EvictionPolicy = 'lru' | 'lfu' | 'fifo' | 'ttl';

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: SemanticCacheConfig = {
  enabled: true,
  ttlSeconds: 3600,
  maxSizeMb: 100,
  similarityThreshold: 0.95,
  minQueryLength: 3,
  maxQueryLength: 4000,
  evictionPolicy: 'lru',
  namespace: 'szn:cost:cache:',
};

/**
 * Cache entry
 */
export interface CostCacheEntry {
  /** Cache key */
  key: string;
  /** Query embedding hash */
  queryEmbeddingHash: string;
  /** Index version */
  indexVersion: string;
  /** Policy hash */
  policyHash: string;
  /** Cached result */
  result: CachedQueryResult;
  /** Hit count */
  hitCount: number;
  /** Created timestamp */
  createdAt: Date;
  /** Expiration timestamp */
  expiresAt: Date;
}

/**
 * Cached query result
 */
export interface CachedQueryResult {
  /** Retrieved context IDs with scores */
  contexts: Array<{ id: string; score: number; content?: string }>;
  /** Original trace ID */
  traceId: string;
  /** Original latency in ms */
  originalLatencyMs: number;
  /** Search type used */
  searchType: 'vector' | 'hybrid' | 'keyword';
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total entries */
  totalEntries: number;
  /** Total size in bytes */
  totalSizeBytes: number;
  /** Hit count */
  hitCount: number;
  /** Miss count */
  missCount: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Average similarity score for hits */
  averageHitSimilarity: number;
  /** Average latency savings in ms */
  averageLatencySavingsMs: number;
  /** Expired entries pending cleanup */
  expiredEntries: number;
  /** Stats timestamp */
  timestamp: string;
}

/**
 * Cache hit result
 */
export interface CacheHitResult {
  /** Whether cache hit occurred */
  hit: boolean;
  /** Cache entry if hit */
  entry?: CostCacheEntry;
  /** Similarity score */
  similarity: number;
  /** Lookup latency in ms */
  latencyMs: number;
}

// ============================================
// Autopilot Types
// ============================================

/**
 * Autopilot configuration
 */
export interface AutopilotConfig {
  /** Enable/disable autopilot */
  enabled: boolean;
  /** Optimization mode */
  mode: AutopilotMode;
  /** Minimum quality threshold (0-1) */
  qualityThreshold: number;
  /** Maximum cost reduction percentage */
  maxCostReductionPercent: number;
  /** Check interval in minutes */
  checkIntervalMinutes: number;
  /** Auto-apply recommendations */
  autoApply: boolean;
}

export type AutopilotMode = 'conservative' | 'balanced' | 'aggressive';

/**
 * Default autopilot configuration
 */
export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  enabled: false,
  mode: 'balanced',
  qualityThreshold: 0.85,
  maxCostReductionPercent: 30,
  checkIntervalMinutes: 60,
  autoApply: false,
};

/**
 * Cost recommendation
 */
export interface CostRecommendation {
  /** Recommendation ID */
  id: string;
  /** Type of recommendation */
  type: RecommendationType;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Estimated savings in USD */
  estimatedSavingsUsd: number;
  /** Impact level */
  impact: ImpactLevel;
  /** Confidence score (0-1) */
  confidence: number;
  /** Action to take */
  action: RecommendationAction;
  /** Whether this has been applied */
  applied: boolean;
  /** Applied timestamp */
  appliedAt?: string;
  /** Created timestamp */
  createdAt: string;
}

export type RecommendationType =
  | 'tiering'
  | 'caching'
  | 'compression'
  | 'query_optimization'
  | 'batch_processing'
  | 'model_selection';

export type ImpactLevel = 'low' | 'medium' | 'high';

export interface RecommendationAction {
  /** Action type */
  type: ActionType;
  /** Target resource */
  target: string;
  /** Parameters for the action */
  params: Record<string, unknown>;
}

export type ActionType =
  | 'enable_cache'
  | 'adjust_cache_ttl'
  | 'migrate_tier'
  | 'enable_compression'
  | 'reduce_topk'
  | 'switch_model'
  | 'batch_queries';

/**
 * Autopilot decision
 */
export interface AutopilotDecision {
  /** Decision ID */
  id: string;
  /** User ID */
  userId: string;
  /** Recommendation that was acted upon */
  recommendationId: string;
  /** Decision type */
  decision: 'apply' | 'skip' | 'defer';
  /** Reason for decision */
  reason: string;
  /** Actual savings if applied */
  actualSavingsUsd?: number;
  /** Quality impact if applied */
  qualityImpact?: number;
  /** Decision timestamp */
  createdAt: string;
}

// ============================================
// Cost Calculator Types
// ============================================

/**
 * Cost components
 */
export interface CostComponents {
  /** Storage cost per tier */
  storage: {
    hot: number;
    warm: number;
    cold: number;
    total: number;
  };
  /** Query cost components */
  query: {
    embedding: number;
    search: number;
    rerank: number;
    total: number;
  };
  /** Cache savings */
  cacheSavings: number;
  /** Tiering savings */
  tieringSavings: number;
  /** Total cost */
  totalCost: number;
  /** Total savings */
  totalSavings: number;
}

/**
 * Monthly cost report
 */
export interface MonthlyCostReport {
  /** Report period start */
  periodStart: Date;
  /** Report period end */
  periodEnd: Date;
  /** Total queries */
  totalQueries: number;
  /** Cache hits */
  cacheHits: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Tier distribution */
  tierDistribution: TierDistribution;
  /** Estimated cost without optimization */
  baselineCostUsd: number;
  /** Actual cost with optimization */
  actualCostUsd: number;
  /** Savings from optimization */
  savingsUsd: number;
  /** Savings percentage */
  savingsPercent: number;
  /** Cost components breakdown */
  components: CostComponents;
  /** Recommendations for further savings */
  recommendations: CostRecommendation[];
}

/**
 * Cost estimate request
 */
export interface CostEstimateRequest {
  /** Number of vectors */
  vectorCount: number;
  /** Vector dimensions */
  dimensions: number;
  /** Expected queries per month */
  queriesPerMonth: number;
  /** Average query topK */
  averageTopK: number;
  /** Whether reranking is enabled */
  rerankEnabled: boolean;
  /** Expected cache hit rate */
  expectedCacheHitRate?: number;
  /** Tier configuration */
  tierConfig?: TierConfig;
}

/**
 * Cost estimate response
 */
export interface CostEstimate {
  /** Monthly storage cost */
  monthlyCostUsd: number;
  /** Monthly query cost */
  monthlyQueryCostUsd: number;
  /** Total monthly cost */
  totalMonthlyCostUsd: number;
  /** Cost per 1000 queries */
  costPer1000Queries: number;
  /** Cost breakdown */
  breakdown: CostComponents;
  /** Optimization suggestions */
  optimizations: CostRecommendation[];
}

// ============================================
// Analytics Types
// ============================================

/**
 * Usage analytics
 */
export interface UsageAnalytics {
  /** Period start */
  periodStart: string;
  /** Period end */
  periodEnd: string;
  /** Total queries */
  totalQueries: number;
  /** Queries by hour distribution */
  queriesByHour: Record<number, number>;
  /** Average query latency */
  avgLatencyMs: number;
  /** P95 latency */
  p95LatencyMs: number;
  /** Tier access distribution */
  tierAccessDistribution: TierDistribution;
  /** Hot spots (frequently accessed chunks) */
  hotSpots: HotSpot[];
  /** Cold data percentage */
  coldDataPercent: number;
  /** Cache effectiveness */
  cacheEffectiveness: CacheEffectiveness;
}

export interface HotSpot {
  /** Chunk ID */
  chunkId: string;
  /** Collection ID */
  collectionId: string;
  /** Access count */
  accessCount: number;
  /** Percentage of total queries */
  queryPercent: number;
}

export interface CacheEffectiveness {
  /** Hit rate */
  hitRate: number;
  /** Average latency with cache */
  avgLatencyWithCacheMs: number;
  /** Average latency without cache */
  avgLatencyWithoutCacheMs: number;
  /** Latency improvement percentage */
  latencyImprovementPercent: number;
  /** Cost savings from cache */
  costSavingsUsd: number;
}

// ============================================
// API Types
// ============================================

/**
 * Cost engineering stats response
 */
export interface CostEngineeringStats {
  /** User ID */
  userId: string;
  /** Collection ID (optional) */
  collectionId?: string;
  /** Current month cost */
  currentMonthCostUsd: number;
  /** Current month savings */
  currentMonthSavingsUsd: number;
  /** Total vectors */
  totalVectors: number;
  /** Tier distribution */
  tierDistribution: TierDistribution;
  /** Cache stats */
  cacheStats: CacheStats;
  /** Active recommendations count */
  activeRecommendations: number;
  /** Autopilot enabled */
  autopilotEnabled: boolean;
  /** Last optimization timestamp */
  lastOptimizationAt?: string;
}

/**
 * Optimization trigger request
 */
export interface OptimizationTriggerRequest {
  /** User ID */
  userId: string;
  /** Collection ID (optional) */
  collectionId?: string;
  /** Optimization types to run */
  types?: RecommendationType[];
  /** Dry run mode */
  dryRun?: boolean;
}

/**
 * Optimization result
 */
export interface OptimizationResult {
  /** Whether optimization was successful */
  success: boolean;
  /** Actions taken */
  actions: OptimizationAction[];
  /** Total savings achieved */
  totalSavingsUsd: number;
  /** Recommendations generated */
  recommendations: CostRecommendation[];
  /** Duration in ms */
  durationMs: number;
}

export interface OptimizationAction {
  /** Action type */
  type: ActionType;
  /** Target */
  target: string;
  /** Status */
  status: 'success' | 'failed' | 'skipped';
  /** Error message if failed */
  error?: string;
  /** Savings from this action */
  savingsUsd: number;
}

/**
 * Migration plan
 */
export interface MigrationPlan {
  /** Demotions (moving to lower tier) */
  demotions: TierMigration[];
  /** Promotions (moving to higher tier) */
  promotions: TierMigration[];
  /** Estimated cost change */
  estimatedCostChange: number;
}

export interface TierMigration {
  /** Chunk ID */
  chunkId: string;
  /** Source tier */
  from: StorageTier;
  /** Target tier */
  to: StorageTier;
  /** Reason for migration */
  reason: string;
}

/**
 * Migration result
 */
export interface MigrationResult {
  /** Number of chunks demoted */
  demoted: number;
  /** Number of chunks promoted */
  promoted: number;
  /** Errors during migration */
  errors: MigrationError[];
  /** Duration in ms */
  durationMs: number;
}

export interface MigrationError {
  /** Chunk ID */
  chunkId: string;
  /** Error message */
  error: string;
}
