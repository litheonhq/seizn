/**
 * Seizn Vector Cost Engineering
 *
 * Public API for vector storage cost optimization.
 *
 * Features:
 * - Hot/Warm/Cold tiering for storage optimization
 * - Semantic query caching for reduced compute costs
 * - Autopilot for automatic optimization
 * - Cost calculator for estimation and reporting
 * - Analytics for usage pattern analysis
 *
 * @example
 * ```typescript
 * import {
 *   TierManager,
 *   SemanticCache,
 *   CostAutopilot,
 *   CostCalculator,
 *   UsageAnalytics,
 * } from '@/lib/cost-engineering';
 *
 * // Initialize managers
 * const tierManager = new TierManager(userId);
 * const cache = new SemanticCache(userId);
 * const autopilot = new CostAutopilot(userId);
 * const calculator = new CostCalculator(userId);
 * const analytics = new UsageAnalytics(userId);
 *
 * // Record access for tiering
 * await tierManager.recordAccess(['chunk_1', 'chunk_2']);
 *
 * // Check cache before query
 * const cacheResult = await cache.get(query, indexVersion, policyHash, embedding);
 * if (cacheResult.hit) {
 *   return cacheResult.entry.result;
 * }
 *
 * // Run autopilot optimization
 * const optimizationResult = await autopilot.runOptimization();
 *
 * // Get cost estimate
 * const estimate = calculator.estimateMonthlyCost({
 *   vectorCount: 1000000,
 *   dimensions: 1024,
 *   queriesPerMonth: 100000,
 *   averageTopK: 10,
 *   rerankEnabled: true,
 * });
 *
 * // Get usage analytics
 * const usageData = await analytics.getAnalytics(30);
 * ```
 */

// ============================================
// Types
// ============================================

export type {
  // Storage Tiering Types
  StorageTier,
  TierSettings,
  TierConfig,
  IndexType,
  StorageClass,
  HnswParams,
  IvfParams,
  FlatParams,
  ChunkAccessStats,
  TierDistribution,

  // Semantic Cache Types
  SemanticCacheConfig,
  EvictionPolicy,
  CostCacheEntry,
  CachedQueryResult,
  CacheStats,
  CacheHitResult,

  // Autopilot Types
  AutopilotConfig,
  AutopilotMode,
  CostRecommendation,
  RecommendationType,
  ImpactLevel,
  ActionType,
  RecommendationAction,
  AutopilotDecision,

  // Cost Calculator Types
  CostComponents,
  MonthlyCostReport,
  CostEstimate,
  CostEstimateRequest,

  // Analytics Types
  UsageAnalytics as UsageAnalyticsData,
  HotSpot,
  CacheEffectiveness,

  // API Types
  CostEngineeringStats,
  OptimizationTriggerRequest,
  OptimizationResult,
  OptimizationAction,
  MigrationPlan,
  TierMigration,
  MigrationResult,
  MigrationError,
} from './types';

// ============================================
// Default Configurations
// ============================================

export {
  DEFAULT_TIER_CONFIG,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_AUTOPILOT_CONFIG,
} from './types';

// ============================================
// Classes
// ============================================

// Tiering
export {
  TierManager,
  getTierColor,
  getTierLabel,
  calculateStorageCost,
} from './tiering';

// Semantic Cache
export {
  SemanticCache,
  calculateCacheEffectiveness,
} from './semantic-cache';

// Autopilot
export { CostAutopilot } from './autopilot';

// Cost Calculator
export {
  CostCalculator,
  EMBEDDING_PRICING,
  RERANK_PRICING,
  LLM_PRICING,
  STORAGE_PRICING,
  formatCost,
  calculateSavingsPercent,
} from './cost-calculator';

// Analytics
export {
  UsageAnalytics,
  percentile,
  formatBytes,
  formatDuration,
} from './analytics';

// ============================================
// Convenience Functions
// ============================================

import { TierManager } from './tiering';
import { SemanticCache } from './semantic-cache';
import { CostAutopilot } from './autopilot';
import { CostCalculator } from './cost-calculator';
import { UsageAnalytics } from './analytics';
import type {
  TierConfig,
  SemanticCacheConfig,
  AutopilotConfig,
  CostEngineeringStats,
} from './types';

/**
 * Create all cost engineering managers for a user
 */
export function createCostEngineering(
  userId: string,
  config?: {
    tier?: Partial<TierConfig>;
    cache?: Partial<SemanticCacheConfig>;
    autopilot?: Partial<AutopilotConfig>;
  }
) {
  return {
    tierManager: new TierManager(userId, config?.tier),
    cache: new SemanticCache(userId, config?.cache),
    autopilot: new CostAutopilot(userId, config?.autopilot),
    calculator: new CostCalculator(userId, config?.tier),
    analytics: new UsageAnalytics(userId),
  };
}

/**
 * Get cost engineering stats for a user
 */
export async function getCostEngineeringStats(
  userId: string,
  collectionId?: string
): Promise<CostEngineeringStats> {
  const { tierManager, cache, autopilot, calculator, analytics } =
    createCostEngineering(userId);

  const [
    distribution,
    cacheStats,
    recommendations,
    monthlyReport,
  ] = await Promise.all([
    tierManager.getTierDistribution(collectionId),
    cache.getStats(),
    autopilot.getPendingRecommendations(collectionId),
    calculator.generateMonthlyReport(new Date(), collectionId),
  ]);

  return {
    userId,
    collectionId,
    currentMonthCostUsd: monthlyReport.actualCostUsd,
    currentMonthSavingsUsd: monthlyReport.savingsUsd,
    totalVectors: distribution.total,
    tierDistribution: distribution,
    cacheStats,
    activeRecommendations: recommendations.length,
    autopilotEnabled: autopilot.getConfig().enabled,
    lastOptimizationAt: undefined, // TODO: Track this
  };
}

/**
 * Run optimization for a user
 */
export async function runOptimization(
  userId: string,
  options?: {
    collectionId?: string;
    types?: import('./types').RecommendationType[];
    dryRun?: boolean;
  }
): Promise<import('./types').OptimizationResult> {
  const { autopilot } = createCostEngineering(userId);
  return autopilot.runOptimization(
    options?.collectionId,
    options?.types,
    options?.dryRun
  );
}

/**
 * Check cache for a query
 */
export async function checkCache(
  userId: string,
  query: string,
  indexVersion: string,
  policyHash: string,
  embedding?: number[]
): Promise<import('./types').CacheHitResult> {
  const cache = new SemanticCache(userId);
  return cache.get(query, indexVersion, policyHash, embedding);
}

/**
 * Store query result in cache
 */
export async function storeInCache(
  userId: string,
  query: string,
  embedding: number[],
  indexVersion: string,
  policyHash: string,
  result: import('./types').CachedQueryResult
): Promise<void> {
  const cache = new SemanticCache(userId);
  return cache.set(query, embedding, indexVersion, policyHash, result);
}

/**
 * Record chunk access for tiering
 */
export async function recordChunkAccess(
  userId: string,
  chunkIds: string[],
  collectionId: string,
  latencyMs?: number
): Promise<void> {
  const tierManager = new TierManager(userId);
  const analyticsManager = new UsageAnalytics(userId);

  await Promise.all([
    tierManager.recordAccess(chunkIds),
    analyticsManager.trackAccess(chunkIds, collectionId, latencyMs),
  ]);
}
