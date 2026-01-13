/**
 * Seizn Budget-aware Planning
 *
 * Cost optimization library for retrieval operations.
 *
 * Features:
 * - Estimate costs for retrieval plans
 * - Optimize plans within budget constraints
 * - Track spending and enforce limits
 * - Manage budget alerts
 *
 * Usage:
 *   import {
 *     checkBudget,
 *     enforceBudgetLimit,
 *     optimizeForBudget,
 *     estimatePlanCost,
 *   } from '@/lib/budget-planner';
 *
 *   // Check user's budget status
 *   const status = await checkBudget(userId);
 *
 *   // Estimate cost for a plan
 *   const estimate = estimatePlanCost(plan, {
 *     queryLength: 100,
 *     expectedChunks: 50,
 *     includeRag: true,
 *   });
 *
 *   // Optimize plan for budget
 *   const optimized = optimizeForBudget(0.05, {
 *     maxCostPerQuery: 0.05,
 *     minQuality: 0.8,
 *   });
 *
 *   // Check if query can proceed
 *   const check = await enforceBudgetLimit(userId, estimate.total);
 *   if (!check.allowed) {
 *     // Handle budget exceeded
 *   }
 */

// Types
export * from './types';

// Pricing
export {
  EMBEDDING_PRICING,
  RERANK_PRICING,
  LLM_PRICING,
  STORAGE_PRICING,
  calculateEmbeddingCost,
  calculateRerankCost,
  calculateLLMCost,
  calculateStorageCost,
  getCheapestEmbeddingModel,
  getCheapestRerankModel,
  getCheapestLLMModel,
  getModelQuality,
  getModelsByPrice,
  getModelsByQuality,
  formatCost,
  formatNumber,
  type EmbeddingPricing,
  type RerankPricing,
  type LLMPricing,
  type StoragePricing,
} from './pricing';

// Estimator
export {
  estimateTokens,
  estimateQueryTokens,
  estimateChunkTokens,
  estimatePlanCost,
  estimateMonthlyCost,
  estimateCostRange,
  comparePlanCosts,
  estimateLatency,
  calculatePlanQuality,
  getCostEfficiency,
  type EstimationParams,
} from './estimator';

// Optimizer
export {
  optimizeForBudget,
  suggestUpgrades,
  getAlternativePlans,
  getPlanForTier,
} from './optimizer';

// Tracker
export {
  checkBudget,
  updateBudgetSettings,
  enforceBudgetLimit,
  recordSpend,
  getUsageSummaries,
  getQueryCostHistory,
  getAlerts,
  acknowledgeAlert,
  acknowledgeAllAlerts,
  getCachedPlan,
  cachePlan,
  getTotalSpending,
  getSpendingTrend,
} from './tracker';
