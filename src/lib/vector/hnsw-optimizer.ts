/**
 * Seizn - Advanced HNSW Optimizer
 *
 * Provides intelligent HNSW parameter tuning based on:
 * - Workload analysis from retrieval traces
 * - Index health monitoring
 * - Memory/performance trade-off optimization
 * - Automatic threshold adjustment
 *
 * @module vector/hnsw-optimizer
 */

import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface HnswConfig {
  m: number;                    // Connections per node (default: 16)
  efConstruction: number;       // Build-time search width (default: 64)
  efSearch: number;             // Query-time search width (default: 40)
}

export interface IndexStats {
  vectorCount: number;
  dimension: number;
  indexSizeBytes: number;
  buildTimeMs?: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgRecall?: number;
}

export interface WorkloadProfile {
  avgTopK: number;
  p95TopK: number;
  avgLatencyMs: number;
  targetLatencyMs: number;
  queryVolumePerHour: number;
  recallSensitivity: 'low' | 'medium' | 'high';
}

export interface OptimizationRecommendation {
  currentConfig: HnswConfig;
  recommendedConfig: HnswConfig;
  expectedImprovement: {
    latencyReductionPercent?: number;
    recallImprovementPercent?: number;
    memoryChangePercent?: number;
  };
  priority: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string[];
  requiresRebuild: boolean;
  estimatedRebuildTimeMs?: number;
}

export interface IndexHealth {
  status: 'healthy' | 'degraded' | 'needs_rebuild';
  fragmentation: number;      // 0-1, estimated
  staleness: number;          // Hours since last rebuild
  vectorGrowthRate: number;   // Vectors per day
  recommendations: string[];
}

// ============================================
// Constants
// ============================================

const HNSW_LIMITS = {
  m: { min: 4, max: 64, default: 16 },
  efConstruction: { min: 32, max: 512, default: 64 },
  efSearch: { min: 10, max: 500, default: 40 },
};

// Memory estimation: ~4 * m * dim * vectors bytes for the graph
const BYTES_PER_VECTOR_BASE = 4; // float32

// ============================================
// Memory Estimation
// ============================================

/**
 * Estimate index memory usage
 */
export function estimateIndexMemory(params: {
  vectorCount: number;
  dimension: number;
  m: number;
}): {
  graphMemoryMB: number;
  vectorMemoryMB: number;
  totalMemoryMB: number;
} {
  const { vectorCount, dimension, m } = params;

  // Vector storage: dim * 4 bytes (float32) per vector
  const vectorMemory = vectorCount * dimension * BYTES_PER_VECTOR_BASE;

  // Graph storage: ~2 * m * 8 bytes (pointers) per vector
  // Plus some overhead for metadata
  const graphMemory = vectorCount * m * 2 * 8 * 1.2; // 1.2x overhead factor

  return {
    graphMemoryMB: Math.round(graphMemory / (1024 * 1024)),
    vectorMemoryMB: Math.round(vectorMemory / (1024 * 1024)),
    totalMemoryMB: Math.round((graphMemory + vectorMemory) / (1024 * 1024)),
  };
}

/**
 * Estimate build time for HNSW index
 */
export function estimateBuildTime(params: {
  vectorCount: number;
  dimension: number;
  m: number;
  efConstruction: number;
}): {
  estimatedSeconds: number;
  confidence: 'low' | 'medium' | 'high';
} {
  const { vectorCount, dimension, m, efConstruction } = params;

  // Empirical formula based on pgvector benchmarks
  // Build time scales roughly as O(n * log(n) * m * efConstruction / dim^0.5)
  const logFactor = Math.log2(Math.max(vectorCount, 2));
  const baseFactor = vectorCount * logFactor * m * efConstruction;
  const dimFactor = Math.sqrt(dimension);

  // Calibration constant (tuned for typical hardware)
  const calibration = 1e-9;

  const estimatedSeconds = baseFactor * calibration / dimFactor;

  // Confidence based on vector count
  let confidence: 'low' | 'medium' | 'high' = 'medium';
  if (vectorCount < 10000) confidence = 'high';
  else if (vectorCount > 1000000) confidence = 'low';

  return {
    estimatedSeconds: Math.round(estimatedSeconds),
    confidence,
  };
}

// ============================================
// Workload Analysis
// ============================================

/**
 * Analyze workload from retrieval traces
 */
export async function analyzeWorkload(
  collectionId?: string,
  daysBack: number = 7
): Promise<WorkloadProfile | null> {
  const supabase = createServerClient();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  let query = supabase
    .from('fall_retrieval_traces')
    .select('top_k, timings_ms, created_at')
    .gte('created_at', startDate.toISOString());

  if (collectionId) {
    query = query.eq('collection_id', collectionId);
  }

  const { data: traces, error } = await query.limit(10000);

  if (error || !traces || traces.length === 0) {
    return null;
  }

  // Calculate statistics
  const topKs = traces.map((t) => t.top_k || 10);
  const latencies = traces
    .map((t) => t.timings_ms?.total || t.timings_ms?.search || 0)
    .filter((l) => l > 0);

  topKs.sort((a, b) => a - b);
  latencies.sort((a, b) => a - b);

  const avgTopK = topKs.reduce((a, b) => a + b, 0) / topKs.length;
  const p95TopK = topKs[Math.floor(topKs.length * 0.95)] || avgTopK;

  const avgLatency = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  const queryVolumePerHour = traces.length / (daysBack * 24);

  // Determine recall sensitivity based on use case
  // Higher volume = more latency sensitive, lower volume = more recall sensitive
  let recallSensitivity: 'low' | 'medium' | 'high' = 'medium';
  if (queryVolumePerHour > 100) recallSensitivity = 'low';
  else if (queryVolumePerHour < 10) recallSensitivity = 'high';

  return {
    avgTopK,
    p95TopK,
    avgLatencyMs: avgLatency,
    targetLatencyMs: avgLatency < 100 ? 50 : avgLatency * 0.7,
    queryVolumePerHour,
    recallSensitivity,
  };
}

// ============================================
// Parameter Optimization
// ============================================

/**
 * Generate optimized HNSW configuration based on workload
 */
export function optimizeConfig(params: {
  vectorCount: number;
  dimension: number;
  workload?: WorkloadProfile;
  currentConfig?: Partial<HnswConfig>;
  memoryBudgetMB?: number;
}): OptimizationRecommendation {
  const { vectorCount, dimension, workload, currentConfig, memoryBudgetMB } = params;

  // Default current config
  const current: HnswConfig = {
    m: currentConfig?.m || HNSW_LIMITS.m.default,
    efConstruction: currentConfig?.efConstruction || HNSW_LIMITS.efConstruction.default,
    efSearch: currentConfig?.efSearch || HNSW_LIMITS.efSearch.default,
  };

  // Start with defaults based on scale
  let recommendedM = HNSW_LIMITS.m.default;
  let recommendedEfConstruction = HNSW_LIMITS.efConstruction.default;
  let recommendedEfSearch = HNSW_LIMITS.efSearch.default;
  const reasoning: string[] = [];

  // Scale-based adjustments
  if (vectorCount > 10_000_000) {
    recommendedM = 32;
    recommendedEfConstruction = 128;
    reasoning.push(`Large dataset (${vectorCount} vectors): increased m and ef_construction`);
  } else if (vectorCount > 1_000_000) {
    recommendedM = 24;
    recommendedEfConstruction = 96;
    reasoning.push(`Medium-large dataset: moderately increased parameters`);
  } else if (vectorCount < 50_000) {
    recommendedM = 12;
    recommendedEfConstruction = 48;
    reasoning.push(`Small dataset: using efficient parameters`);
  }

  // Workload-based adjustments
  if (workload) {
    const topK = workload.p95TopK || workload.avgTopK;

    // efSearch should be at least 2x topK, ideally 4-8x
    recommendedEfSearch = Math.max(
      HNSW_LIMITS.efSearch.min,
      Math.min(HNSW_LIMITS.efSearch.max, topK * 4)
    );

    if (workload.recallSensitivity === 'high') {
      recommendedM = Math.min(HNSW_LIMITS.m.max, Math.round(recommendedM * 1.25));
      recommendedEfConstruction = Math.min(HNSW_LIMITS.efConstruction.max, Math.round(recommendedEfConstruction * 1.5));
      recommendedEfSearch = Math.min(HNSW_LIMITS.efSearch.max, Math.round(recommendedEfSearch * 1.5));
      reasoning.push(`High recall sensitivity: increased all parameters`);
    } else if (workload.recallSensitivity === 'low') {
      recommendedM = Math.max(HNSW_LIMITS.m.min, Math.round(recommendedM * 0.75));
      recommendedEfConstruction = Math.max(HNSW_LIMITS.efConstruction.min, Math.round(recommendedEfConstruction * 0.75));
      recommendedEfSearch = Math.max(HNSW_LIMITS.efSearch.min, Math.round(recommendedEfSearch * 0.7));
      reasoning.push(`Latency-sensitive workload: reduced parameters for speed`);
    }

    // Latency target adjustment
    if (workload.avgLatencyMs > workload.targetLatencyMs * 1.5) {
      recommendedEfSearch = Math.max(
        HNSW_LIMITS.efSearch.min,
        Math.round(recommendedEfSearch * 0.8)
      );
      reasoning.push(`Current latency exceeds target: reducing ef_search`);
    }
  }

  // Memory budget constraint
  if (memoryBudgetMB) {
    const estimated = estimateIndexMemory({ vectorCount, dimension, m: recommendedM });
    if (estimated.totalMemoryMB > memoryBudgetMB) {
      // Reduce m to fit memory budget
      while (recommendedM > HNSW_LIMITS.m.min) {
        const newEstimate = estimateIndexMemory({ vectorCount, dimension, m: recommendedM - 2 });
        if (newEstimate.totalMemoryMB <= memoryBudgetMB) {
          recommendedM -= 2;
          break;
        }
        recommendedM -= 2;
      }
      reasoning.push(`Adjusted m to fit memory budget of ${memoryBudgetMB}MB`);
    }
  }

  // Calculate expected improvements
  const requiresRebuild = recommendedM !== current.m || recommendedEfConstruction !== current.efConstruction;

  let latencyReductionPercent: number | undefined;
  let recallImprovementPercent: number | undefined;

  if (recommendedEfSearch < current.efSearch) {
    latencyReductionPercent = Math.round((1 - recommendedEfSearch / current.efSearch) * 30);
  }

  if (recommendedM > current.m || recommendedEfConstruction > current.efConstruction) {
    recallImprovementPercent = Math.round(
      ((recommendedM - current.m) / current.m + (recommendedEfConstruction - current.efConstruction) / current.efConstruction) * 10
    );
  }

  // Memory change estimate
  const currentMemory = estimateIndexMemory({ vectorCount, dimension, m: current.m });
  const newMemory = estimateIndexMemory({ vectorCount, dimension, m: recommendedM });
  const memoryChangePercent = Math.round(
    ((newMemory.totalMemoryMB - currentMemory.totalMemoryMB) / currentMemory.totalMemoryMB) * 100
  );

  // Determine priority
  let priority: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (requiresRebuild && (recallImprovementPercent || 0) > 15) priority = 'high';
  else if ((latencyReductionPercent || 0) > 20) priority = 'medium';
  else if (requiresRebuild) priority = 'medium';

  const buildTime = estimateBuildTime({
    vectorCount,
    dimension,
    m: recommendedM,
    efConstruction: recommendedEfConstruction,
  });

  return {
    currentConfig: current,
    recommendedConfig: {
      m: recommendedM,
      efConstruction: recommendedEfConstruction,
      efSearch: recommendedEfSearch,
    },
    expectedImprovement: {
      latencyReductionPercent: latencyReductionPercent || undefined,
      recallImprovementPercent: recallImprovementPercent || undefined,
      memoryChangePercent: memoryChangePercent || undefined,
    },
    priority,
    reasoning,
    requiresRebuild,
    estimatedRebuildTimeMs: requiresRebuild ? buildTime.estimatedSeconds * 1000 : undefined,
  };
}

// ============================================
// Index Health
// ============================================

/**
 * Check HNSW index health
 */
export async function checkIndexHealth(
  tableName: string = 'memories',
  indexName: string = 'idx_memories_embedding_hnsw'
): Promise<IndexHealth> {
  const supabase = createServerClient();
  const recommendations: string[] = [];

  // Get index stats from pg_stat_user_indexes
  const { data: indexStats, error: statsError } = await supabase.rpc('get_index_stats', {
    p_table_name: tableName,
    p_index_name: indexName,
  }).single();

  // Get recent query performance
  const lastDay = new Date();
  lastDay.setDate(lastDay.getDate() - 1);

  const { data: recentTraces } = await supabase
    .from('fall_retrieval_traces')
    .select('timings_ms, created_at')
    .gte('created_at', lastDay.toISOString())
    .limit(1000);

  // Estimate fragmentation based on index size vs expected
  let fragmentation = 0;
  if (indexStats?.idx_tup_read && indexStats?.idx_tup_fetch) {
    // High ratio of reads to fetches suggests fragmentation
    fragmentation = 1 - (indexStats.idx_tup_fetch / (indexStats.idx_tup_read || 1));
    fragmentation = Math.max(0, Math.min(1, fragmentation));
  }

  // Check for performance degradation
  let hasPerformanceIssue = false;
  if (recentTraces && recentTraces.length > 10) {
    const latencies = recentTraces
      .map((t) => t.timings_ms?.search || 0)
      .filter((l) => l > 0);

    if (latencies.length > 0) {
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      if (avgLatency > 200) {
        hasPerformanceIssue = true;
        recommendations.push(`High average latency (${Math.round(avgLatency)}ms) - consider increasing ef_search or rebuilding index`);
      }
    }
  }

  // Determine overall status
  let status: 'healthy' | 'degraded' | 'needs_rebuild' = 'healthy';

  if (fragmentation > 0.3 || hasPerformanceIssue) {
    status = 'degraded';
    if (fragmentation > 0.3) {
      recommendations.push(`Index fragmentation is ${Math.round(fragmentation * 100)}% - consider REINDEX`);
    }
  }

  if (fragmentation > 0.5) {
    status = 'needs_rebuild';
    recommendations.push('Index rebuild strongly recommended for optimal performance');
  }

  return {
    status,
    fragmentation,
    staleness: 0, // Would need index creation time tracking
    vectorGrowthRate: 0, // Would need historical tracking
    recommendations,
  };
}

// ============================================
// Dynamic ef_search Adjustment
// ============================================

/**
 * Get adaptive ef_search for a specific query
 */
export function getAdaptiveEfSearch(params: {
  topK: number;
  queryComplexity?: 'simple' | 'moderate' | 'complex';
  recallRequirement?: 'standard' | 'high' | 'critical';
  maxLatencyMs?: number;
}): number {
  const { topK, queryComplexity = 'moderate', recallRequirement = 'standard', maxLatencyMs } = params;

  // Base ef_search: 4x topK
  let efSearch = topK * 4;

  // Query complexity adjustment
  if (queryComplexity === 'simple') {
    efSearch = Math.round(efSearch * 0.75);
  } else if (queryComplexity === 'complex') {
    efSearch = Math.round(efSearch * 1.25);
  }

  // Recall requirement adjustment
  if (recallRequirement === 'high') {
    efSearch = Math.round(efSearch * 1.5);
  } else if (recallRequirement === 'critical') {
    efSearch = Math.round(efSearch * 2);
  }

  // Latency constraint
  if (maxLatencyMs) {
    // Rough heuristic: higher ef_search = higher latency
    // Cap ef_search based on latency budget
    const latencyFactor = maxLatencyMs / 100; // Normalized to 100ms baseline
    const maxEfForLatency = Math.round(50 * latencyFactor);
    efSearch = Math.min(efSearch, maxEfForLatency);
  }

  // Clamp to limits
  return Math.max(
    HNSW_LIMITS.efSearch.min,
    Math.min(HNSW_LIMITS.efSearch.max, efSearch)
  );
}

// ============================================
// Export
// ============================================

export const HnswOptimizer = {
  estimateMemory: estimateIndexMemory,
  estimateBuildTime,
  analyzeWorkload,
  optimizeConfig,
  checkHealth: checkIndexHealth,
  getAdaptiveEfSearch,
  limits: HNSW_LIMITS,
};
