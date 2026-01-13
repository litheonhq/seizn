import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface WorkloadStats {
  collectionId: string;
  totalQueries: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgResultsCount: number;
  avgTopK: number;
  queryTypes: QueryTypeBreakdown;
  timeRange: {
    from: string;
    to: string;
  };
}

export interface QueryTypeBreakdown {
  semantic: number; // Pure vector search
  hybrid: number; // Vector + keyword
  filtered: number; // With metadata filters
  federated: number; // Multi-collection
}

export interface WorkloadPattern {
  pattern: 'latency_sensitive' | 'recall_focused' | 'balanced' | 'high_throughput';
  confidence: number;
  indicators: string[];
}

export interface WorkloadRecommendation {
  m: number;
  efConstruction: number;
  efSearch: number;
  reasoning: string[];
  estimatedImprovement: {
    latencyReduction?: string;
    recallImprovement?: string;
  };
  workloadPattern: WorkloadPattern;
  basedOnQueries: number;
}

interface TraceRow {
  collection_id: string;
  timings_ms: Record<string, number>;
  results_count: number;
  effective_config: Record<string, unknown>;
  created_at: string;
}

// ============================================
// Workload Analyzer
// ============================================

export async function analyzeWorkload(params: {
  userId: string;
  collectionId?: string;
  daysBack?: number;
}): Promise<WorkloadStats[]> {
  const supabase = createServerClient();
  const daysBack = params.daysBack ?? 7;

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysBack);

  let query = supabase
    .from('fall_retrieval_traces')
    .select('collection_id, timings_ms, results_count, effective_config, created_at')
    .eq('user_id', params.userId)
    .gte('created_at', fromDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(5000);

  if (params.collectionId) {
    query = query.eq('collection_id', params.collectionId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const traces = (data ?? []) as TraceRow[];

  // Group by collection
  const byCollection = new Map<string, TraceRow[]>();
  for (const trace of traces) {
    if (!trace.collection_id) continue;
    const existing = byCollection.get(trace.collection_id) ?? [];
    existing.push(trace);
    byCollection.set(trace.collection_id, existing);
  }

  const stats: WorkloadStats[] = [];

  for (const [collectionId, collectionTraces] of byCollection) {
    const latencies = collectionTraces
      .map((t) => t.timings_ms?.total ?? t.timings_ms?.candidates ?? 0)
      .filter((l) => l > 0)
      .sort((a, b) => a - b);

    if (latencies.length === 0) continue;

    const queryTypes = classifyQueryTypes(collectionTraces);

    stats.push({
      collectionId,
      totalQueries: collectionTraces.length,
      avgLatencyMs: average(latencies),
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      p99LatencyMs: percentile(latencies, 99),
      avgResultsCount: average(collectionTraces.map((t) => t.results_count)),
      avgTopK: average(
        collectionTraces.map((t) => (t.effective_config?.topK as number) ?? 20)
      ),
      queryTypes,
      timeRange: {
        from: collectionTraces[collectionTraces.length - 1]?.created_at ?? '',
        to: collectionTraces[0]?.created_at ?? '',
      },
    });
  }

  return stats;
}

function classifyQueryTypes(traces: TraceRow[]): QueryTypeBreakdown {
  let semantic = 0;
  let hybrid = 0;
  let filtered = 0;
  let federated = 0;

  for (const trace of traces) {
    const config = trace.effective_config ?? {};

    // Check for federated (multi-collection)
    if (Array.isArray(config.collectionIds) && config.collectionIds.length > 1) {
      federated++;
      continue;
    }

    // Check for hybrid (keyword + vector)
    if (config.hybridAlpha !== undefined && (config.hybridAlpha as number) > 0) {
      hybrid++;
      continue;
    }

    // Check for filtered
    if (config.filters && Object.keys(config.filters as object).length > 0) {
      filtered++;
      continue;
    }

    // Default: pure semantic
    semantic++;
  }

  return { semantic, hybrid, filtered, federated };
}

// ============================================
// Pattern Detection
// ============================================

export function detectWorkloadPattern(stats: WorkloadStats): WorkloadPattern {
  const indicators: string[] = [];
  let pattern: WorkloadPattern['pattern'] = 'balanced';
  let confidence = 0.5;

  // Latency-sensitive indicators
  if (stats.p95LatencyMs < 50) {
    indicators.push('P95 latency already under 50ms');
    pattern = 'latency_sensitive';
    confidence = 0.7;
  } else if (stats.p95LatencyMs > 200) {
    indicators.push('P95 latency above 200ms - optimization needed');
    pattern = 'latency_sensitive';
    confidence = 0.8;
  }

  // High throughput indicators
  if (stats.totalQueries > 1000) {
    indicators.push('High query volume (>1000/week)');
    if (pattern === 'balanced') {
      pattern = 'high_throughput';
      confidence = 0.65;
    }
  }

  // Recall-focused indicators
  if (stats.avgTopK > 50) {
    indicators.push('High average topK (>50)');
    pattern = 'recall_focused';
    confidence = 0.75;
  }

  if (stats.avgResultsCount > 30) {
    indicators.push('High average results count (>30)');
    if (pattern !== 'latency_sensitive') {
      pattern = 'recall_focused';
      confidence = 0.7;
    }
  }

  // Hybrid/filtered workloads need more recall
  const hybridRatio =
    (stats.queryTypes.hybrid + stats.queryTypes.filtered) / stats.totalQueries;
  if (hybridRatio > 0.5) {
    indicators.push('High ratio of hybrid/filtered queries');
    pattern = 'recall_focused';
    confidence = Math.max(confidence, 0.7);
  }

  // Federated workloads need balanced approach
  const federatedRatio = stats.queryTypes.federated / stats.totalQueries;
  if (federatedRatio > 0.3) {
    indicators.push('Significant federated query usage');
    pattern = 'balanced';
    confidence = 0.6;
  }

  return { pattern, confidence, indicators };
}

// ============================================
// Recommendations
// ============================================

export function generateWorkloadRecommendation(
  stats: WorkloadStats,
  currentParams?: { m?: number; efConstruction?: number; efSearch?: number }
): WorkloadRecommendation {
  const workloadPattern = detectWorkloadPattern(stats);
  const reasoning: string[] = [];

  // Base parameters
  let m = 16;
  let efConstruction = 64;
  let efSearch = Math.max(20, Math.floor(stats.avgTopK * 4));

  // Adjust based on pattern
  switch (workloadPattern.pattern) {
    case 'latency_sensitive':
      m = 12;
      efConstruction = 48;
      efSearch = Math.max(16, Math.floor(stats.avgTopK * 2));
      reasoning.push(
        'Reduced m/ef_construction for faster search at slight recall cost'
      );
      reasoning.push('Lower ef_search for sub-50ms latency target');
      break;

    case 'recall_focused':
      m = 24;
      efConstruction = 128;
      efSearch = Math.max(40, Math.floor(stats.avgTopK * 6));
      reasoning.push('Increased m for better graph connectivity');
      reasoning.push('Higher ef_construction for improved index quality');
      reasoning.push('Higher ef_search for better recall on high-topK queries');
      break;

    case 'high_throughput':
      m = 16;
      efConstruction = 64;
      efSearch = Math.max(20, Math.floor(stats.avgTopK * 3));
      reasoning.push('Balanced m/ef_construction for predictable throughput');
      reasoning.push('Moderate ef_search to maintain consistent latency');
      break;

    case 'balanced':
    default:
      reasoning.push('Balanced configuration for mixed workload');
      break;
  }

  // Scale up for large collections (inferred from query volume)
  if (stats.totalQueries > 5000) {
    m = Math.min(32, m + 8);
    efConstruction = Math.min(192, efConstruction + 32);
    reasoning.push('Scaled up parameters for high-volume collection');
  }

  // Estimate improvements
  const estimatedImprovement: WorkloadRecommendation['estimatedImprovement'] = {};

  if (currentParams?.efSearch && efSearch < currentParams.efSearch) {
    const reduction = Math.round(
      ((currentParams.efSearch - efSearch) / currentParams.efSearch) * 100
    );
    estimatedImprovement.latencyReduction = `~${reduction}% latency reduction`;
  }

  if (currentParams?.m && m > currentParams.m) {
    estimatedImprovement.recallImprovement = `~${(m - currentParams.m) * 2}% recall improvement`;
  }

  return {
    m,
    efConstruction,
    efSearch,
    reasoning,
    estimatedImprovement,
    workloadPattern,
    basedOnQueries: stats.totalQueries,
  };
}

// ============================================
// Helpers
// ============================================

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)] ?? 0;
}
