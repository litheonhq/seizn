/**
 * Seizn Summer - Budget Router Module
 *
 * Exports for the budget-aware routing system.
 */

// Types
export type {
  BudgetConfig,
  RoutingDecision,
  RoutingContext,
  RoutingStrategy,
  RoutingMetadata,
  FallbackOption,
  FallbackTrigger,
  ModelConfig,
  ModelTier,
  ProviderType,
  OperationType,
  RequestPriority,
  CostOptimizationMode,
  RouterStats,
  RouterEvent,
  RouterEventType,
} from './types';

export { DEFAULT_BUDGET_BY_PLAN, DEFAULT_MODELS } from './types';

// Cost Estimator
export type {
  CostEstimate,
  CostBreakdown,
  CostEstimateParams,
} from './cost-estimator';

export {
  CostEstimator,
  getCostEstimator,
  estimateTokens,
  estimateTokensBatch,
  exceedsTokenLimit,
  calculateModelCost,
  creditsToUsd,
  usdToCredits,
  fitsWithinBudget,
  findCheapestModel,
  findFastestModel,
  findBestQualityModel,
} from './cost-estimator';

// Budget Router
export {
  BudgetRouter,
  getBudgetRouter,
  routeSearch,
  routeRag,
  routeEmbed,
} from './budget-router';
