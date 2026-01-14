/**
 * Seizn Vector Cost Engineering - Semantic Cache
 *
 * Provides intelligent caching based on query similarity.
 * Caches search results and reuses them for semantically similar queries.
 */

import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import {
  DEFAULT_CACHE_CONFIG,
  type SemanticCacheConfig,
  type CostCacheEntry,
  type CachedQueryResult,
  type CacheStats,
  type CacheHitResult,
} from './types';

// Re-export default config
export { DEFAULT_CACHE_CONFIG };

/**
 * Semantic Cache Manager
 *
 * Handles cache operations with semantic similarity matching.
 */
export class SemanticCache {
  private config: SemanticCacheConfig;
  private userId: string;

  constructor(userId: string, config?: Partial<SemanticCacheConfig>) {
    this.userId = userId;
    this.config = {
      ...DEFAULT_CACHE_CONFIG,
      ...config,
    } as SemanticCacheConfig;
  }

  /**
   * Look up cache for a query
   *
   * First checks for exact match, then semantic similarity.
   */
  async get(
    query: string,
    indexVersion: string,
    policyHash: string,
    embedding?: number[]
  ): Promise<CacheHitResult> {
    const startTime = Date.now();

    if (!this.config.enabled) {
      return {
        hit: false,
        similarity: 0,
        latencyMs: Date.now() - startTime,
      };
    }

    // Validate query length
    if (
      query.length < this.config.minQueryLength ||
      query.length > this.config.maxQueryLength
    ) {
      return {
        hit: false,
        similarity: 0,
        latencyMs: Date.now() - startTime,
      };
    }

    // 1. Check exact cache key
    const exactKey = this.generateCacheKey(query, indexVersion, policyHash);
    const exactHit = await this.getByKey(exactKey);

    if (exactHit) {
      await this.incrementHitCount(exactKey);
      return {
        hit: true,
        entry: exactHit,
        similarity: 1.0,
        latencyMs: Date.now() - startTime,
      };
    }

    // 2. Check semantic similarity (if embedding provided and threshold < 1.0)
    if (embedding && this.config.similarityThreshold < 1.0) {
      const similarEntry = await this.findSimilar(
        embedding,
        indexVersion,
        policyHash
      );

      if (similarEntry) {
        await this.incrementHitCount(similarEntry.entry.key);
        return {
          hit: true,
          entry: similarEntry.entry,
          similarity: similarEntry.similarity,
          latencyMs: Date.now() - startTime,
        };
      }
    }

    return {
      hit: false,
      similarity: 0,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Store a query result in cache
   */
  async set(
    query: string,
    embedding: number[],
    indexVersion: string,
    policyHash: string,
    result: CachedQueryResult
  ): Promise<void> {
    if (!this.config.enabled) return;

    // Validate query length
    if (
      query.length < this.config.minQueryLength ||
      query.length > this.config.maxQueryLength
    ) {
      return;
    }

    const supabase = createServerClient();
    const key = this.generateCacheKey(query, indexVersion, policyHash);
    const embeddingHash = this.hashEmbedding(embedding);
    const expiresAt = new Date(Date.now() + this.config.ttlSeconds * 1000);

    // Upsert cache entry
    const { error } = await supabase.from('cost_query_cache').upsert(
      {
        cache_key: key,
        user_id: this.userId,
        query_embedding_hash: embeddingHash,
        index_version: indexVersion,
        policy_hash: policyHash,
        result: result,
        embedding: embedding,
        hit_count: 0,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'cache_key',
      }
    );

    if (error) {
      console.error('Failed to store cache entry:', error);
      return;
    }

    // Check if eviction is needed
    await this.evictIfNeeded();
  }

  /**
   * Invalidate cache entries by index version
   */
  async invalidateByIndex(indexVersion: string): Promise<number> {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('cost_query_cache')
      .delete()
      .eq('user_id', this.userId)
      .eq('index_version', indexVersion)
      .select('cache_key');

    if (error) {
      console.error('Failed to invalidate cache:', error);
      return 0;
    }

    return data?.length || 0;
  }

  /**
   * Invalidate all cache entries for user
   */
  async invalidateAll(): Promise<number> {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('cost_query_cache')
      .delete()
      .eq('user_id', this.userId)
      .select('cache_key');

    if (error) {
      console.error('Failed to invalidate all cache:', error);
      return 0;
    }

    return data?.length || 0;
  }

  /**
   * Invalidate expired entries
   */
  async invalidateExpired(): Promise<number> {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('cost_query_cache')
      .delete()
      .eq('user_id', this.userId)
      .lt('expires_at', new Date().toISOString())
      .select('cache_key');

    if (error) {
      console.error('Failed to invalidate expired cache:', error);
      return 0;
    }

    return data?.length || 0;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const supabase = createServerClient();

    // Get basic stats
    const { data: entries, error } = await supabase
      .from('cost_query_cache')
      .select('hit_count, result, created_at, expires_at')
      .eq('user_id', this.userId);

    if (error || !entries) {
      return this.emptyStats();
    }

    const now = new Date();
    let totalHits = 0;
    let totalSizeBytes = 0;
    let expiredEntries = 0;
    let totalLatencySavings = 0;
    let hitCount = 0;

    for (const entry of entries) {
      totalHits += entry.hit_count;
      totalSizeBytes += JSON.stringify(entry.result).length;

      if (new Date(entry.expires_at) < now) {
        expiredEntries++;
      }

      // Calculate latency savings
      const result = entry.result as CachedQueryResult;
      if (result?.originalLatencyMs && entry.hit_count > 0) {
        totalLatencySavings += result.originalLatencyMs * entry.hit_count;
        hitCount += entry.hit_count;
      }
    }

    // Get miss count from metrics (if available)
    const { data: metrics } = await supabase
      .from('cost_cache_metrics')
      .select('miss_count')
      .eq('user_id', this.userId)
      .single();

    const missCount = metrics?.miss_count || 0;
    const totalQueries = totalHits + missCount;
    const hitRate = totalQueries > 0 ? totalHits / totalQueries : 0;
    const avgLatencySavings = hitCount > 0 ? totalLatencySavings / hitCount : 0;

    return {
      totalEntries: entries.length,
      totalSizeBytes,
      hitCount: totalHits,
      missCount,
      hitRate,
      averageHitSimilarity: 0.97, // TODO: Track this properly
      averageLatencySavingsMs: avgLatencySavings,
      expiredEntries,
      timestamp: now.toISOString(),
    };
  }

  /**
   * Update cache configuration
   */
  updateConfig(config: Partial<SemanticCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SemanticCacheConfig {
    return { ...this.config };
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Generate cache key from query, index version, and policy hash
   */
  private generateCacheKey(
    query: string,
    indexVersion: string,
    policyHash: string
  ): string {
    const content = `${this.userId}|${query}|${indexVersion}|${policyHash}`;
    return createHash('sha256').update(content).digest('hex').slice(0, 32);
  }

  /**
   * Hash embedding for grouping similar queries
   */
  private hashEmbedding(embedding: number[]): string {
    // Quantize embedding to reduce precision and group similar vectors
    const quantized = embedding.map((v) => Math.round(v * 100));
    return createHash('md5').update(quantized.join(',')).digest('hex').slice(0, 16);
  }

  /**
   * Get cache entry by exact key
   */
  private async getByKey(key: string): Promise<CostCacheEntry | null> {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('cost_query_cache')
      .select('*')
      .eq('cache_key', key)
      .eq('user_id', this.userId)
      .single();

    if (error || !data) {
      return null;
    }

    // Check expiration
    if (new Date(data.expires_at) < new Date()) {
      return null;
    }

    return this.mapToEntry(data);
  }

  /**
   * Find semantically similar cache entry
   */
  private async findSimilar(
    queryEmbedding: number[],
    indexVersion: string,
    policyHash: string
  ): Promise<{ entry: CostCacheEntry; similarity: number } | null> {
    const supabase = createServerClient();
    const threshold = this.config.similarityThreshold;
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Use pgvector for similarity search
    const { data, error } = await supabase.rpc('find_similar_cache_entry', {
      p_user_id: this.userId,
      p_embedding: embeddingStr,
      p_index_version: indexVersion,
      p_policy_hash: policyHash,
      p_threshold: threshold,
    });

    if (error || !data || data.length === 0) {
      return null;
    }

    const row = data[0];
    return {
      entry: this.mapToEntry(row),
      similarity: row.similarity,
    };
  }

  /**
   * Increment hit count for a cache entry
   */
  private async incrementHitCount(key: string): Promise<void> {
    const supabase = createServerClient();

    await supabase
      .from('cost_query_cache')
      .update({
        hit_count: supabase.rpc('increment', 1),
        updated_at: new Date().toISOString(),
      })
      .eq('cache_key', key);
  }

  /**
   * Evict entries if cache size exceeds limit
   */
  private async evictIfNeeded(): Promise<void> {
    const supabase = createServerClient();

    // Get current cache size
    const { data: sizeData } = await supabase.rpc('get_cache_size', {
      p_user_id: this.userId,
    });

    const currentSizeMb = (sizeData || 0) / (1024 * 1024);

    if (currentSizeMb <= this.config.maxSizeMb) {
      return;
    }

    // Calculate how many entries to delete
    const targetSizeMb = this.config.maxSizeMb * 0.8;
    const deleteRatio = 1 - targetSizeMb / currentSizeMb;
    const { count } = await supabase
      .from('cost_query_cache')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', this.userId);

    const toDelete = Math.ceil((count || 0) * deleteRatio);

    if (toDelete <= 0) return;

    // Delete based on eviction policy
    let orderBy: string;
    switch (this.config.evictionPolicy) {
      case 'lru':
        orderBy = 'updated_at';
        break;
      case 'lfu':
        orderBy = 'hit_count';
        break;
      case 'fifo':
        orderBy = 'created_at';
        break;
      case 'ttl':
        orderBy = 'expires_at';
        break;
      default:
        orderBy = 'updated_at';
    }

    // Delete oldest/least used entries
    const { data: toDeleteEntries } = await supabase
      .from('cost_query_cache')
      .select('cache_key')
      .eq('user_id', this.userId)
      .order(orderBy, { ascending: true })
      .limit(toDelete);

    if (toDeleteEntries && toDeleteEntries.length > 0) {
      const keys = toDeleteEntries.map((e) => e.cache_key);
      await supabase.from('cost_query_cache').delete().in('cache_key', keys);
    }
  }

  /**
   * Map database row to cache entry
   */
  private mapToEntry(row: any): CostCacheEntry {
    return {
      key: row.cache_key,
      queryEmbeddingHash: row.query_embedding_hash,
      indexVersion: row.index_version,
      policyHash: row.policy_hash,
      result: row.result as CachedQueryResult,
      hitCount: row.hit_count,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
    };
  }

  /**
   * Return empty stats object
   */
  private emptyStats(): CacheStats {
    return {
      totalEntries: 0,
      totalSizeBytes: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      averageHitSimilarity: 0,
      averageLatencySavingsMs: 0,
      expiredEntries: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Calculate cache effectiveness
 */
export function calculateCacheEffectiveness(stats: CacheStats): {
  effectiveness: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  description: string;
} {
  const hitRate = stats.hitRate;
  const latencySavings = stats.averageLatencySavingsMs;

  // Weighted score: 70% hit rate, 30% latency savings (normalized)
  const normalizedLatency = Math.min(latencySavings / 500, 1); // 500ms max savings
  const effectiveness = hitRate * 0.7 + normalizedLatency * 0.3;

  let grade: 'excellent' | 'good' | 'fair' | 'poor';
  let description: string;

  if (effectiveness >= 0.8) {
    grade = 'excellent';
    description = 'Cache is highly effective, providing significant cost and latency savings.';
  } else if (effectiveness >= 0.6) {
    grade = 'good';
    description = 'Cache is performing well. Consider adjusting similarity threshold for more hits.';
  } else if (effectiveness >= 0.4) {
    grade = 'fair';
    description = 'Cache could be improved. Query diversity may be high, consider warming cache.';
  } else {
    grade = 'poor';
    description = 'Cache hit rate is low. Review query patterns and consider pre-warming.';
  }

  return { effectiveness, grade, description };
}
