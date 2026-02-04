/**
 * Seizn - Vector Operations Module
 *
 * Provides utilities for vector search optimization:
 * - HNSW parameter tuning
 * - Index health monitoring
 * - Memory estimation
 * - Workload analysis
 *
 * @module vector
 */

export {
  HnswOptimizer,
  optimizeConfig,
  analyzeWorkload,
  checkIndexHealth,
  estimateIndexMemory,
  estimateBuildTime,
  getAdaptiveEfSearch,
  type HnswConfig,
  type IndexStats,
  type WorkloadProfile,
  type OptimizationRecommendation,
  type IndexHealth,
} from './hnsw-optimizer';
