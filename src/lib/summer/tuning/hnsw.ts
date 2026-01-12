export interface HnswIndexRecommendation {
  m: number;
  efConstruction: number;
  reason: string;
}

export interface HnswSearchRecommendation {
  efSearch: number;
  reason: string;
}

/**
 * Very lightweight recommender for pgvector HNSW.
 *
 * NOTES:
 * - `m` and `ef_construction` require REBUILDING the index to change.
 * - `ef_search` can be changed per-query (we already pass `searchEf` to SQL functions).
 *
 * Upgrade path:
 * - Learn from `fall_retrieval_traces.timings_ms` and recall proxy metrics
 * - Recommend separate params per collection/index size
 */
export function recommendHnswIndex(params: {
  vectorCount: number;
  dim: number;
  workload?: 'latency' | 'recall' | 'balanced';
}): HnswIndexRecommendation {
  const workload = params.workload ?? 'balanced';

  // Default baseline (pgvector examples often start around 16/64)
  let m = 16;
  let efConstruction = 64;

  if (params.vectorCount > 5_000_000) {
    m = 32;
    efConstruction = 128;
  } else if (params.vectorCount > 500_000) {
    m = 24;
    efConstruction = 96;
  }

  if (workload === 'latency') {
    // Favor smaller graph (less memory)
    m = Math.max(12, Math.floor(m * 0.75));
    efConstruction = Math.max(48, Math.floor(efConstruction * 0.75));
  }

  if (workload === 'recall') {
    // Favor higher recall
    m = Math.min(48, Math.floor(m * 1.25));
    efConstruction = Math.min(256, Math.floor(efConstruction * 1.5));
  }

  return {
    m,
    efConstruction,
    reason: `Heuristic based on vectorCount=${params.vectorCount}, workload=${workload}.`,
  };
}

export function recommendEfSearch(params: {
  topK: number;
  plan: string;
  mode?: 'fast' | 'balanced' | 'high_recall';
}): HnswSearchRecommendation {
  const mode = params.mode ?? 'balanced';

  // Typical guideline: ef_search >= topK (often 2x~8x)
  let ef = Math.max(20, params.topK * 4);

  if (mode === 'fast') ef = Math.max(16, params.topK * 2);
  if (mode === 'high_recall') ef = Math.max(40, params.topK * 8);

  // Plan guardrails
  const plan = String(params.plan).toLowerCase();
  if (plan === 'free') ef = Math.min(ef, 80);
  if (plan === 'plus') ef = Math.min(ef, 120);

  return {
    efSearch: ef,
    reason: `Heuristic ef_search=${ef} from topK=${params.topK}, mode=${mode}, plan=${plan}.`,
  };
}
