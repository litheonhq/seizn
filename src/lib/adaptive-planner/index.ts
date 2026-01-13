/**
 * Seizn Adaptive Planner - Main Exports
 *
 * Dynamic query planning based on query characteristics,
 * collection properties, and historical performance.
 */

// ============================================
// Types
// ============================================

export type {
  // Query Features
  QueryIntent,
  QueryComplexity,
  QueryFeatures,
  RetrievalMode,

  // Plan Types
  PlanConfig,
  QueryPlan,
  DefaultQueryPlan,
  PlanMatch,
  PlanSelection,

  // Performance
  PlanPerformanceSummary,
  PlanOutcome,

  // Optimization
  OptimizationResult,
  OptimizationRecommendation,

  // API Types
  CreatePlanRequest,
  UpdatePlanRequest,
  SelectPlanRequest,
  SelectPlanResponse,
  OptimizePlanRequest,
  ListPlansResponse,
  PlanPerformanceResponse,

  // Database Types
  QueryPlanRow,
  PlanSelectionRow,
  DefaultQueryPlanRow,
} from './types';

export { rowToQueryPlan, rowToDefaultPlan } from './types';

// ============================================
// Query Analysis
// ============================================

export {
  analyzeQuery,
  summarizeFeatures,
  featureSimilarity,
} from './analyzer';

// ============================================
// Plan Selection
// ============================================

export {
  selectPlan,
  selectPlanDb,
  selectPlanForQuery,
  getDefaultPlan,
  getUserPlans,
  getDefaultPlans,
} from './selector';

// ============================================
// Plan Optimization
// ============================================

export {
  recordPlanOutcome,
  updateSelectionOutcome,
  optimizePlans,
  updatePlanConfig,
  getPlanPerformance,
  getSelectionHistory,
} from './optimizer';
