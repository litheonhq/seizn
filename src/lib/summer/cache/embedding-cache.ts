/**
 * Seizn Summer - Semantic Embedding Cache
 *
 * Intelligent caching layer that uses embedding similarity
 * to serve cached responses for semantically similar queries.
 */

import { randomUUID } from 'crypto';
import { getRedis } from '@/lib/redis';
import { getEmbeddingProvider } from '../embedding';
import { cosineSimilarity, findMostSimilar, validateEmbedding } from './similarity';
import { getTTLManager, TTLManager } from './ttl-manager';
import type {
  CacheConfig,
  CacheEntry,
  CacheQueryParams,
  CacheQueryResult,
  CacheStoreParams,
  CachedResponse,
  CacheStats,
  CacheEvent,
  DEFAULT_CACHE_CONFIG,
  SimilarityResult,
} from './types';

// ===========================================
// Constants
// ===========================================

const CACHE_PREFIX = 'szn:cache:';
const CACHE_INDEX_PREFIX = 'szn:cache:idx:';
const CACHE_EMBEDDING_INDEX = 'szn:cache:embeddings:';

// ===========================================
// Semantic Cache Class
// ===========================================

export class SemanticCache {
  private readonly config: CacheConfig;
  private readonly ttlManager: TTLManager;
  private readonly embeddingProvider;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      similarityThreshold: config.similarityThreshold ?? 0.95,
      defaultTtlSeconds: config.defaultTtlSeconds ?? 3600,
      maxEntries: config.maxEntries ?? 10000,
      evictionPolicy: config.evictionPolicy ?? 'lru',
      minQueryLength: config.minQueryLength ?? 3,
      maxQueryLength: config.maxQueryLength ?? 4000,
      enableWarming: config.enableWarming ?? false,
      namespace: config.namespace ?? CACHE_PREFIX,
      excludedCollections: config.excludedCollections,
    };
    this.ttlManager = getTTLManager(this.config);
    this.embeddingProvider = getEmbeddingProvider();
  }

  // ===========================================
  // Query (Cache Lookup)
  // ===========================================

  /**
   * Query the cache for a semantically similar entry.
   *
   * @param params - Cache query parameters
   * @returns Cache query result with hit/miss status
   */
  async query(params: CacheQueryParams): Promise<CacheQueryResult> {
    const startTime = Date.now();

    // Check if caching is enabled
    if (!this.config.enabled) {
      return {
        hit: false,
        similarity: 0,
        latencyMs: Date.now() - startTime,
        embeddingComputed: false,
      };
    }

    // Check if collection is excluded
    if (this.config.excludedCollections?.includes(params.collectionId)) {
      return {
        hit: false,
        similarity: 0,
        latencyMs: Date.now() - startTime,
        embeddingComputed: false,
      };
    }

    // Validate query length
    if (
      params.query.length < this.config.minQueryLength ||
      params.query.length > this.config.maxQueryLength
    ) {
      return {
        hit: false,
        similarity: 0,
        latencyMs: Date.now() - startTime,
        embeddingComputed: false,
      };
    }

    const redis = getRedis();
    if (!redis) {
      return {
        hit: false,
        similarity: 0,
        latencyMs: Date.now() - startTime,
        embeddingComputed: false,
      };
    }

    try {
      // Get or compute query embedding
      let embedding = params.embedding;
      let embeddingComputed = false;

      if (!embedding) {
        const embeddings = await this.embeddingProvider.embed([params.query], 'query');
        embedding = embeddings[0];
        embeddingComputed = true;
      }

      validateEmbedding(embedding);

      // Get candidate entries for this collection/user
      const candidates = await this.getCandidateEntries(
        params.collectionId,
        params.userId
      );

      if (candidates.length === 0) {
        await this.logCacheEvent('miss', params);
        await this.ttlManager.updateStats('miss', { collectionId: params.collectionId });

        return {
          hit: false,
          similarity: 0,
          latencyMs: Date.now() - startTime,
          embeddingComputed,
        };
      }

      // Find most similar entry
      const threshold = params.similarityThreshold ?? this.config.similarityThreshold;
      const bestMatch = findMostSimilar(embedding, candidates, threshold);

      if (bestMatch && bestMatch.isHit && bestMatch.entry) {
        // Cache hit
        const entry = bestMatch.entry;

        // Check if entry is expired
        if (this.ttlManager.isExpired(entry)) {
          // Entry expired, treat as miss and cleanup
          await this.ttlManager.deleteEntry(entry.id);
          await this.logCacheEvent('expire', params, entry.id);
          await this.ttlManager.updateStats('miss', { collectionId: params.collectionId });

          return {
            hit: false,
            similarity: bestMatch.similarity,
            latencyMs: Date.now() - startTime,
            embeddingComputed,
          };
        }

        // Update access tracking
        await this.updateEntryAccess(entry.id);
        await this.logCacheEvent('hit', params, entry.id, bestMatch.similarity);
        await this.ttlManager.updateStats('hit', {
          collectionId: params.collectionId,
          similarity: bestMatch.similarity,
          latencySavingsMs: entry.response.originalLatencyMs,
        });

        return {
          hit: true,
          entry,
          similarity: bestMatch.similarity,
          latencyMs: Date.now() - startTime,
          embeddingComputed,
        };
      }

      // Cache miss
      await this.logCacheEvent('miss', params);
      await this.ttlManager.updateStats('miss', { collectionId: params.collectionId });

      return {
        hit: false,
        similarity: bestMatch?.similarity ?? 0,
        latencyMs: Date.now() - startTime,
        embeddingComputed,
      };
    } catch (error) {
      console.error('Semantic cache query error:', error);
      return {
        hit: false,
        similarity: 0,
        latencyMs: Date.now() - startTime,
        embeddingComputed: false,
      };
    }
  }

  // ===========================================
  // Store (Cache Write)
  // ===========================================

  /**
   * Store a query-response pair in the cache.
   *
   * @param params - Cache store parameters
   * @returns Created cache entry or null on failure
   */
  async store(params: CacheStoreParams): Promise<CacheEntry | null> {
    if (!this.config.enabled) {
      return null;
    }

    // Check if collection is excluded
    if (this.config.excludedCollections?.includes(params.collectionId)) {
      return null;
    }

    // Validate query length
    if (
      params.query.length < this.config.minQueryLength ||
      params.query.length > this.config.maxQueryLength
    ) {
      return null;
    }

    const redis = getRedis();
    if (!redis) {
      return null;
    }

    try {
      validateEmbedding(params.embedding);

      // Check if we need to evict entries
      await this.ttlManager.evictIfNeeded();

      const ttlSeconds = params.ttlSeconds ?? this.config.defaultTtlSeconds;
      const entryId = `cache_${randomUUID()}`;
      const now = new Date().toISOString();

      const entry: CacheEntry = {
        id: entryId,
        query: params.query,
        embedding: params.embedding,
        response: params.response,
        collectionId: params.collectionId,
        userId: params.userId,
        createdAt: now,
        lastAccessedAt: now,
        hitCount: 0,
        ttlSeconds,
        expiresAt: this.ttlManager.calculateExpiration(ttlSeconds),
        metadata: params.metadata,
      };

      // Store the entry
      const entryKey = `${CACHE_PREFIX}entry:${entryId}`;
      await redis.set(entryKey, entry, { ex: ttlSeconds });

      // Add to collection index
      await redis.sadd(
        `${CACHE_INDEX_PREFIX}collection:${params.collectionId}`,
        entryId
      );

      // Add to user index
      await redis.sadd(
        `${CACHE_INDEX_PREFIX}user:${params.userId}`,
        entryId
      );

      // Add to LRU tracking
      await this.ttlManager.touchEntry(entryId);

      // Add to TTL tracking (score = expiration timestamp)
      const expirationTs = new Date(entry.expiresAt).getTime();
      await redis.zadd(`${CACHE_PREFIX}ttl`, { score: expirationTs, member: entryId });

      // Log store event
      await this.logCacheEvent('store', {
        query: params.query,
        collectionId: params.collectionId,
        userId: params.userId,
      }, entryId);

      return entry;
    } catch (error) {
      console.error('Semantic cache store error:', error);
      return null;
    }
  }

  // ===========================================
  // Helper Methods
  // ===========================================

  /**
   * Get candidate cache entries for similarity comparison.
   */
  private async getCandidateEntries(
    collectionId: string,
    userId: string
  ): Promise<CacheEntry[]> {
    const redis = getRedis();
    if (!redis) return [];

    try {
      // Get entry IDs for this collection
      const entryIds = await redis.smembers(
        `${CACHE_INDEX_PREFIX}collection:${collectionId}`
      );

      if (!entryIds || entryIds.length === 0) {
        return [];
      }

      // Fetch entries
      const entries: CacheEntry[] = [];
      for (const entryId of entryIds as string[]) {
        const entry = await redis.get<CacheEntry>(
          `${CACHE_PREFIX}entry:${entryId}`
        );
        if (entry && entry.userId === userId) {
          entries.push(entry);
        }
      }

      return entries;
    } catch (error) {
      console.error('Get candidate entries error:', error);
      return [];
    }
  }

  /**
   * Update entry access tracking.
   */
  private async updateEntryAccess(entryId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    try {
      const entryKey = `${CACHE_PREFIX}entry:${entryId}`;
      const entry = await redis.get<CacheEntry>(entryKey);

      if (entry) {
        entry.lastAccessedAt = new Date().toISOString();
        entry.hitCount++;

        // Get remaining TTL and preserve it
        const remainingTtl = this.ttlManager.getRemainingTtl(entry);
        if (remainingTtl > 0) {
          await redis.set(entryKey, entry, { ex: remainingTtl });
        } else {
          await redis.set(entryKey, entry);
        }

        // Update LRU tracking
        await this.ttlManager.touchEntry(entryId);

        // Update LFU tracking
        await redis.zincrby(`${CACHE_PREFIX}lfu`, 1, entryId);
      }
    } catch (error) {
      console.error('Update entry access error:', error);
    }
  }

  /**
   * Log cache event for monitoring.
   */
  private async logCacheEvent(
    type: CacheEvent['type'],
    params: Partial<CacheQueryParams>,
    entryId?: string,
    similarity?: number
  ): Promise<void> {
    // In production, this would send to a logging service
    // For now, just log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Cache ${type}]`, {
        query: params.query?.substring(0, 50),
        collectionId: params.collectionId,
        entryId,
        similarity,
      });
    }
  }

  // ===========================================
  // Public API
  // ===========================================

  /**
   * Get cache statistics.
   */
  async getStats(): Promise<CacheStats> {
    return this.ttlManager.getStats();
  }

  /**
   * Invalidate cache entries.
   */
  async invalidate(params: {
    entryId?: string;
    collectionId?: string;
    userId?: string;
    expiredOnly?: boolean;
  }) {
    return this.ttlManager.invalidate(params);
  }

  /**
   * Cleanup expired entries.
   */
  async cleanup(): Promise<string[]> {
    return this.ttlManager.cleanupExpired();
  }

  /**
   * Check if caching is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current configuration.
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<CacheConfig>): void {
    Object.assign(this.config, updates);
  }
}

// ===========================================
// Singleton Instance
// ===========================================

let semanticCacheInstance: SemanticCache | null = null;

export function getSemanticCache(config?: Partial<CacheConfig>): SemanticCache {
  if (!semanticCacheInstance || config) {
    semanticCacheInstance = new SemanticCache(config);
  }
  return semanticCacheInstance;
}

// ===========================================
// Convenience Functions
// ===========================================

/**
 * Quick cache lookup for a query.
 */
export async function lookupCache(
  query: string,
  collectionId: string,
  userId: string,
  options?: { embedding?: number[]; threshold?: number }
): Promise<CacheQueryResult> {
  const cache = getSemanticCache();
  return cache.query({
    query,
    collectionId,
    userId,
    embedding: options?.embedding,
    similarityThreshold: options?.threshold,
  });
}

/**
 * Quick cache store for a query-response pair.
 */
export async function storeInCache(
  query: string,
  embedding: number[],
  response: CachedResponse,
  collectionId: string,
  userId: string,
  options?: { ttlSeconds?: number }
): Promise<CacheEntry | null> {
  const cache = getSemanticCache();
  return cache.store({
    query,
    embedding,
    response,
    collectionId,
    userId,
    ttlSeconds: options?.ttlSeconds,
  });
}
