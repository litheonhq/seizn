/**
 * Recall Benchmark Service
 *
 * Measures HNSW search quality by comparing against exact brute-force results.
 * Use this to tune ef_search and validate recall@K targets.
 *
 * @module spring/memory-v4/recall-benchmark
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface BenchmarkConfig {
  /** k values to test (e.g., [10, 20, 50]) */
  kValues: number[];
  /** ef_search values to test */
  efSearchValues: number[];
  /** Number of queries to run */
  numQueries: number;
  /** Whether to measure latency */
  measureLatency?: boolean;
}

export interface RecallResult {
  k: number;
  efSearch: number;
  recall: number; // 0-1
  avgRankDiff: number;
  latencyMs: number;
  numQueries: number;
}

export interface BenchmarkReport {
  userId: string;
  totalVectors: number;
  timestamp: Date;
  results: RecallResult[];
  recommendations: string[];
}

// =============================================================================
// Recall Benchmark Service
// =============================================================================

export class RecallBenchmarkService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Generate ground truth results using exact distance calculation
   *
   * This bypasses HNSW and computes true nearest neighbors
   */
  async generateGroundTruth(
    userId: string,
    queryEmbedding: number[],
    k: number
  ): Promise<string[]> {
    // Use cosine_distance for exact computation
    // This query doesn't use the HNSW index
    const { data, error } = await this.supabase.rpc('exact_nearest_neighbors', {
      p_user_id: userId,
      p_embedding: queryEmbedding,
      p_limit: k,
    });

    if (error) {
      // Fallback: try the manual query if the RPC doesn't exist
      const { data: fallbackData, error: fallbackError } = await this.supabase
        .from('spring_memory_notes')
        .select('id, embedding')
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('embedding', 'is', null)
        .limit(1000); // Get a sample

      if (fallbackError || !fallbackData) {
        throw new Error(`Ground truth query failed: ${error.message}`);
      }

      // Compute distances manually
      const withDistances = fallbackData
        .map((row) => ({
          id: row.id,
          distance: this.cosineDistance(queryEmbedding, row.embedding),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, k);

      return withDistances.map((r) => r.id);
    }

    return (data || []).map((r: { id: string }) => r.id);
  }

  /**
   * Measure recall@K for a given ef_search setting
   */
  async measureRecall(
    userId: string,
    queryEmbedding: number[],
    k: number,
    efSearch: number
  ): Promise<{
    recall: number;
    avgRankDiff: number;
    latencyMs: number;
  }> {
    // Get ground truth
    const groundTruth = await this.generateGroundTruth(userId, queryEmbedding, k);
    const groundTruthSet = new Set(groundTruth);

    // Run HNSW search with specific ef_search
    const startTime = performance.now();

    // Set ef_search for this query
    await this.supabase.rpc('set_hnsw_ef_search', { p_ef_search: efSearch });

    const { data: hnswResults, error } = await this.supabase.rpc(
      'search_spring_memories',
      {
        p_user_id: userId,
        p_embedding: queryEmbedding,
        p_match_threshold: 0.0,
        p_match_count: k,
        p_filters: { status: ['active'] },
      }
    );

    const latencyMs = performance.now() - startTime;

    if (error || !hnswResults) {
      throw new Error(`HNSW search failed: ${error?.message}`);
    }

    const hnswIds = hnswResults.map((r: { id: string }) => r.id);

    // Calculate recall (intersection / k)
    let hits = 0;
    for (const id of hnswIds) {
      if (groundTruthSet.has(id)) {
        hits++;
      }
    }
    const recall = hits / k;

    // Calculate average rank difference
    let totalRankDiff = 0;
    for (let i = 0; i < hnswIds.length; i++) {
      const gtRank = groundTruth.indexOf(hnswIds[i]);
      if (gtRank !== -1) {
        totalRankDiff += Math.abs(i - gtRank);
      } else {
        totalRankDiff += k; // Penalty for missing items
      }
    }
    const avgRankDiff = totalRankDiff / k;

    return { recall, avgRankDiff, latencyMs };
  }

  /**
   * Run full benchmark across multiple k and ef_search values
   */
  async runBenchmark(
    userId: string,
    queries: number[][],
    config: BenchmarkConfig
  ): Promise<BenchmarkReport> {
    const results: RecallResult[] = [];

    // Get total vector count
    const { count: totalVectors } = await this.supabase
      .from('spring_memory_notes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('embedding', 'is', null);

    // Test each combination
    for (const k of config.kValues) {
      for (const efSearch of config.efSearchValues) {
        let totalRecall = 0;
        let totalRankDiff = 0;
        let totalLatency = 0;
        let successfulQueries = 0;

        for (const query of queries.slice(0, config.numQueries)) {
          try {
            const result = await this.measureRecall(userId, query, k, efSearch);
            totalRecall += result.recall;
            totalRankDiff += result.avgRankDiff;
            totalLatency += result.latencyMs;
            successfulQueries++;
          } catch (error) {
            console.error('Benchmark query failed:', error);
          }
        }

        if (successfulQueries > 0) {
          results.push({
            k,
            efSearch,
            recall: totalRecall / successfulQueries,
            avgRankDiff: totalRankDiff / successfulQueries,
            latencyMs: totalLatency / successfulQueries,
            numQueries: successfulQueries,
          });
        }
      }
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(results, totalVectors || 0);

    return {
      userId,
      totalVectors: totalVectors || 0,
      timestamp: new Date(),
      results,
      recommendations,
    };
  }

  /**
   * Quick recall check with default parameters
   */
  async quickRecallCheck(
    userId: string,
    sampleQueries: number = 5
  ): Promise<{
    recall20: number;
    recall50: number;
    avgLatencyMs: number;
    meetsTarget: boolean;
  }> {
    // Get sample embeddings from existing memories as queries
    const { data: samples } = await this.supabase
      .from('spring_memory_notes')
      .select('embedding')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('embedding', 'is', null)
      .limit(sampleQueries);

    if (!samples || samples.length === 0) {
      return {
        recall20: 0,
        recall50: 0,
        avgLatencyMs: 0,
        meetsTarget: false,
      };
    }

    const queries = samples.map((s) => s.embedding);

    // Test recall@20 with ef_search=100
    let recall20Total = 0;
    let recall50Total = 0;
    let latencyTotal = 0;

    for (const query of queries) {
      try {
        const r20 = await this.measureRecall(userId, query, 20, 100);
        recall20Total += r20.recall;
        latencyTotal += r20.latencyMs;

        const r50 = await this.measureRecall(userId, query, 50, 100);
        recall50Total += r50.recall;
      } catch {
        // Skip failed queries
      }
    }

    const recall20 = recall20Total / queries.length;
    const recall50 = recall50Total / queries.length;
    const avgLatencyMs = latencyTotal / queries.length;

    return {
      recall20,
      recall50,
      avgLatencyMs,
      meetsTarget: recall20 >= 0.95 && recall50 >= 0.90,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Calculate cosine distance between two vectors
   */
  private cosineDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) return 2; // Max distance for mismatched vectors

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 2;

    // Cosine similarity to distance: 1 - similarity
    return 1 - (dotProduct / denominator);
  }

  /**
   * Generate optimization recommendations based on benchmark results
   */
  private generateRecommendations(
    results: RecallResult[],
    totalVectors: number
  ): string[] {
    const recommendations: string[] = [];

    // Find optimal ef_search for recall@20 >= 0.95
    const recall20Results = results.filter((r) => r.k === 20);
    const optimalFor95 = recall20Results.find((r) => r.recall >= 0.95);

    if (optimalFor95) {
      recommendations.push(
        `Recommended ef_search for 95% recall@20: ${optimalFor95.efSearch} (latency: ${optimalFor95.latencyMs.toFixed(1)}ms)`
      );
    } else if (recall20Results.length > 0) {
      const best = recall20Results.reduce((a, b) => (a.recall > b.recall ? a : b));
      recommendations.push(
        `Best achieved recall@20: ${(best.recall * 100).toFixed(1)}% with ef_search=${best.efSearch}. Consider increasing ef_search.`
      );
    }

    // Check latency at optimal recall
    const highRecallResults = results.filter((r) => r.recall >= 0.95);
    if (highRecallResults.length > 0) {
      const avgLatency =
        highRecallResults.reduce((sum, r) => sum + r.latencyMs, 0) / highRecallResults.length;
      if (avgLatency > 100) {
        recommendations.push(
          `High latency at 95%+ recall (avg ${avgLatency.toFixed(1)}ms). Consider using iterative_scan or reducing ef_search with oversample.`
        );
      }
    }

    // Collection size recommendations
    if (totalVectors > 100000) {
      recommendations.push(
        'Large collection detected. Consider partitioning by user or using partial indices.'
      );
    }

    // Recall-latency tradeoff
    const fastResults = results.filter(
      (r) => r.k === 20 && r.efSearch <= 50 && r.recall >= 0.9
    );
    if (fastResults.length > 0) {
      recommendations.push(
        `Fast mode available: ef_search=${fastResults[0].efSearch} achieves ${(fastResults[0].recall * 100).toFixed(1)}% recall@20 in ${fastResults[0].latencyMs.toFixed(1)}ms`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Run with more ef_search values (16-400) for detailed optimization recommendations.'
      );
    }

    return recommendations;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createRecallBenchmarkService(
  supabase: SupabaseClient
): RecallBenchmarkService {
  return new RecallBenchmarkService(supabase);
}

// =============================================================================
// Migration Helper: Create exact_nearest_neighbors function
// =============================================================================

export const EXACT_NN_FUNCTION_SQL = `
-- Create function for exact nearest neighbor search (bypasses HNSW index)
CREATE OR REPLACE FUNCTION exact_nearest_neighbors(
  p_user_id TEXT,
  p_embedding VECTOR(1024),
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  distance FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    n.id,
    (n.embedding <=> p_embedding)::FLOAT AS distance
  FROM spring_memory_notes n
  WHERE n.user_id = p_user_id
    AND n.status = 'active'
    AND n.embedding IS NOT NULL
  ORDER BY n.embedding <=> p_embedding
  LIMIT p_limit;
$$;

-- Create function to set ef_search for current session
CREATE OR REPLACE FUNCTION set_hnsw_ef_search(p_ef_search INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('SET LOCAL hnsw.ef_search = %s', p_ef_search);
END;
$$;
`;
