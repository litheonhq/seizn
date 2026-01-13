/**
 * Seizn Summer - TTL & LRU Cache Manager
 *
 * Manages cache entry lifecycle including:
 * - Time-to-live (TTL) based expiration
 * - Least Recently Used (LRU) eviction
 * - Cache size management
 */

import { getRedis } from '@/lib/redis';
import type {
  CacheEntry,
  CacheConfig,
  CacheInvalidateParams,
  CacheInvalidateResult,
  CacheStats,
  CollectionCacheStats,
  EvictionPolicy,
  DEFAULT_CACHE_CONFIG,
} from './types';

// ===========================================
// Constants
// ===========================================

const CACHE_PREFIX = 'szn:cache:';
const CACHE_INDEX_PREFIX = 'szn:cache:idx:';
const CACHE_STATS_KEY = 'szn:cache:stats';
const CACHE_LRU_KEY = 'szn:cache:lru';

// ===========================================
// TTL Manager Class
// ===========================================

export class TTLManager {
  private readonly config: CacheConfig;
  private readonly prefix: string;

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
    };
    this.prefix = this.config.namespace ?? CACHE_PREFIX;
  }

  // ===========================================
  // TTL Operations
  // ===========================================

  /**
   * Calculate expiration timestamp from TTL.
   */
  calculateExpiration(ttlSeconds?: number): string {
    const ttl = ttlSeconds ?? this.config.defaultTtlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    return expiresAt.toISOString();
  }

  /**
   * Check if an entry has expired.
   */
  isExpired(entry: CacheEntry): boolean {
    const now = new Date();
    const expiresAt = new Date(entry.expiresAt);
    return now >= expiresAt;
  }

  /**
   * Get remaining TTL in seconds for an entry.
   */
  getRemainingTtl(entry: CacheEntry): number {
    const now = Date.now();
    const expiresAt = new Date(entry.expiresAt).getTime();
    const remaining = Math.floor((expiresAt - now) / 1000);
    return Math.max(0, remaining);
  }

  /**
   * Refresh entry TTL (extend expiration).
   */
  async refreshTtl(entryId: string, ttlSeconds?: number): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    const ttl = ttlSeconds ?? this.config.defaultTtlSeconds;
    const key = `${this.prefix}entry:${entryId}`;

    try {
      const exists = await redis.exists(key);
      if (!exists) return false;

      await redis.expire(key, ttl);

      // Update the entry's expiresAt field
      const entry = await redis.get<CacheEntry>(key);
      if (entry) {
        entry.expiresAt = this.calculateExpiration(ttl);
        entry.lastAccessedAt = new Date().toISOString();
        await redis.set(key, entry, { ex: ttl });
      }

      return true;
    } catch (error) {
      console.error('TTL refresh error:', error);
      return false;
    }
  }

  // ===========================================
  // LRU Operations
  // ===========================================

  /**
   * Update LRU tracking for an entry (mark as recently used).
   */
  async touchEntry(entryId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    try {
      const now = Date.now();
      // Use sorted set with timestamp as score for LRU tracking
      await redis.zadd(CACHE_LRU_KEY, { score: now, member: entryId });
    } catch (error) {
      console.error('LRU touch error:', error);
    }
  }

  /**
   * Get least recently used entry IDs.
   */
  async getLruEntries(count: number): Promise<string[]> {
    const redis = getRedis();
    if (!redis) return [];

    try {
      // Get entries with lowest scores (oldest access times)
      const entries = await redis.zrange(CACHE_LRU_KEY, 0, count - 1);
      return entries as string[];
    } catch (error) {
      console.error('LRU get error:', error);
      return [];
    }
  }

  /**
   * Remove entry from LRU tracking.
   */
  async removeFromLru(entryId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    try {
      await redis.zrem(CACHE_LRU_KEY, entryId);
    } catch (error) {
      console.error('LRU remove error:', error);
    }
  }

  // ===========================================
  // Eviction Operations
  // ===========================================

  /**
   * Evict entries based on configured policy.
   */
  async evictIfNeeded(): Promise<string[]> {
    const redis = getRedis();
    if (!redis) return [];

    try {
      const currentCount = await this.getEntryCount();
      if (currentCount <= this.config.maxEntries) {
        return [];
      }

      const toEvict = currentCount - this.config.maxEntries + 100; // Evict extra buffer
      return this.evictEntries(toEvict);
    } catch (error) {
      console.error('Eviction check error:', error);
      return [];
    }
  }

  /**
   * Evict a specific number of entries based on policy.
   */
  async evictEntries(count: number): Promise<string[]> {
    switch (this.config.evictionPolicy) {
      case 'lru':
        return this.evictLru(count);
      case 'ttl':
        return this.evictByTtl(count);
      case 'fifo':
        return this.evictFifo(count);
      case 'lfu':
        return this.evictLfu(count);
      default:
        return this.evictLru(count);
    }
  }

  /**
   * Evict least recently used entries.
   */
  private async evictLru(count: number): Promise<string[]> {
    const entries = await this.getLruEntries(count);
    for (const entryId of entries) {
      await this.deleteEntry(entryId);
    }
    return entries;
  }

  /**
   * Evict entries closest to expiration.
   */
  private async evictByTtl(count: number): Promise<string[]> {
    const redis = getRedis();
    if (!redis) return [];

    try {
      // Get entries with lowest TTL from a TTL tracking sorted set
      const ttlKey = `${this.prefix}ttl`;
      const entries = await redis.zrange(ttlKey, 0, count - 1);

      for (const entryId of entries as string[]) {
        await this.deleteEntry(entryId);
      }

      return entries as string[];
    } catch (error) {
      console.error('TTL eviction error:', error);
      return [];
    }
  }

  /**
   * Evict oldest entries (First In, First Out).
   */
  private async evictFifo(count: number): Promise<string[]> {
    const redis = getRedis();
    if (!redis) return [];

    try {
      const fifoKey = `${this.prefix}fifo`;
      const entries = await redis.lrange(fifoKey, 0, count - 1);

      for (const entryId of entries as string[]) {
        await this.deleteEntry(entryId);
      }

      // Remove from FIFO list
      await redis.ltrim(fifoKey, count, -1);

      return entries as string[];
    } catch (error) {
      console.error('FIFO eviction error:', error);
      return [];
    }
  }

  /**
   * Evict least frequently used entries.
   */
  private async evictLfu(count: number): Promise<string[]> {
    const redis = getRedis();
    if (!redis) return [];

    try {
      const lfuKey = `${this.prefix}lfu`;
      const entries = await redis.zrange(lfuKey, 0, count - 1);

      for (const entryId of entries as string[]) {
        await this.deleteEntry(entryId);
      }

      return entries as string[];
    } catch (error) {
      console.error('LFU eviction error:', error);
      return [];
    }
  }

  // ===========================================
  // Entry Management
  // ===========================================

  /**
   * Delete a cache entry.
   */
  async deleteEntry(entryId: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return false;

    try {
      const key = `${this.prefix}entry:${entryId}`;

      // Get entry first to remove from indexes
      const entry = await redis.get<CacheEntry>(key);
      if (entry) {
        // Remove from collection index
        await redis.srem(
          `${CACHE_INDEX_PREFIX}collection:${entry.collectionId}`,
          entryId
        );
        // Remove from user index
        await redis.srem(
          `${CACHE_INDEX_PREFIX}user:${entry.userId}`,
          entryId
        );
      }

      // Remove from LRU tracking
      await this.removeFromLru(entryId);

      // Remove from LFU tracking
      await redis.zrem(`${this.prefix}lfu`, entryId);

      // Remove from TTL tracking
      await redis.zrem(`${this.prefix}ttl`, entryId);

      // Delete the entry
      await redis.del(key);

      return true;
    } catch (error) {
      console.error('Delete entry error:', error);
      return false;
    }
  }

  /**
   * Get current cache entry count.
   */
  async getEntryCount(): Promise<number> {
    const redis = getRedis();
    if (!redis) return 0;

    try {
      const pattern = `${this.prefix}entry:*`;
      const keys = await redis.keys(pattern);
      return keys.length;
    } catch (error) {
      console.error('Entry count error:', error);
      return 0;
    }
  }

  // ===========================================
  // Invalidation Operations
  // ===========================================

  /**
   * Invalidate cache entries based on parameters.
   */
  async invalidate(params: CacheInvalidateParams): Promise<CacheInvalidateResult> {
    const startTime = Date.now();
    const invalidatedIds: string[] = [];

    const redis = getRedis();
    if (!redis) {
      return {
        invalidatedCount: 0,
        invalidatedIds: [],
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // Specific entry ID
      if (params.entryId) {
        const deleted = await this.deleteEntry(params.entryId);
        if (deleted) {
          invalidatedIds.push(params.entryId);
        }
      }

      // All entries for a collection
      if (params.collectionId) {
        const collectionKey = `${CACHE_INDEX_PREFIX}collection:${params.collectionId}`;
        const entryIds = await redis.smembers(collectionKey);

        for (const entryId of entryIds as string[]) {
          const deleted = await this.deleteEntry(entryId);
          if (deleted) {
            invalidatedIds.push(entryId);
          }
        }
      }

      // All entries for a user
      if (params.userId) {
        const userKey = `${CACHE_INDEX_PREFIX}user:${params.userId}`;
        const entryIds = await redis.smembers(userKey);

        for (const entryId of entryIds as string[]) {
          const deleted = await this.deleteEntry(entryId);
          if (deleted) {
            invalidatedIds.push(entryId);
          }
        }
      }

      // Expired entries only
      if (params.expiredOnly) {
        const cleanedIds = await this.cleanupExpired();
        invalidatedIds.push(...cleanedIds);
      }

      return {
        invalidatedCount: invalidatedIds.length,
        invalidatedIds,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Invalidation error:', error);
      return {
        invalidatedCount: invalidatedIds.length,
        invalidatedIds,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Cleanup expired entries.
   */
  async cleanupExpired(): Promise<string[]> {
    const redis = getRedis();
    if (!redis) return [];

    const cleanedIds: string[] = [];

    try {
      const now = Date.now();
      const ttlKey = `${this.prefix}ttl`;

      // Get entries that have expired (score < now)
      const expiredEntries = await redis.zrange(ttlKey, 0, now, { byScore: true });

      for (const entryId of expiredEntries as string[]) {
        const deleted = await this.deleteEntry(entryId);
        if (deleted) {
          cleanedIds.push(entryId);
        }
      }

      return cleanedIds;
    } catch (error) {
      console.error('Cleanup error:', error);
      return cleanedIds;
    }
  }

  // ===========================================
  // Statistics
  // ===========================================

  /**
   * Get cache statistics.
   */
  async getStats(): Promise<CacheStats> {
    const redis = getRedis();
    const timestamp = new Date().toISOString();

    const defaultStats: CacheStats = {
      totalEntries: 0,
      totalSizeBytes: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      averageHitSimilarity: 0,
      averageLatencySavingsMs: 0,
      expiredEntries: 0,
      byCollection: {},
      timestamp,
    };

    if (!redis) return defaultStats;

    try {
      // Get stored stats
      const storedStats = await redis.get<Partial<CacheStats>>(CACHE_STATS_KEY);

      const totalEntries = await this.getEntryCount();
      const hitCount = storedStats?.hitCount ?? 0;
      const missCount = storedStats?.missCount ?? 0;
      const totalRequests = hitCount + missCount;
      const hitRate = totalRequests > 0 ? hitCount / totalRequests : 0;

      // Count expired entries
      const now = Date.now();
      const ttlKey = `${this.prefix}ttl`;
      const expiredEntries = await redis.zcount(ttlKey, 0, now);

      return {
        totalEntries,
        totalSizeBytes: storedStats?.totalSizeBytes ?? 0,
        hitCount,
        missCount,
        hitRate,
        averageHitSimilarity: storedStats?.averageHitSimilarity ?? 0,
        averageLatencySavingsMs: storedStats?.averageLatencySavingsMs ?? 0,
        expiredEntries: expiredEntries ?? 0,
        byCollection: storedStats?.byCollection ?? {},
        timestamp,
      };
    } catch (error) {
      console.error('Stats error:', error);
      return defaultStats;
    }
  }

  /**
   * Update cache statistics (called on hit/miss).
   */
  async updateStats(
    type: 'hit' | 'miss',
    data?: {
      collectionId?: string;
      similarity?: number;
      latencySavingsMs?: number;
    }
  ): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    try {
      const stats = await redis.get<CacheStats>(CACHE_STATS_KEY) ?? {
        totalEntries: 0,
        totalSizeBytes: 0,
        hitCount: 0,
        missCount: 0,
        hitRate: 0,
        averageHitSimilarity: 0,
        averageLatencySavingsMs: 0,
        expiredEntries: 0,
        byCollection: {},
        timestamp: new Date().toISOString(),
      };

      if (type === 'hit') {
        stats.hitCount++;

        if (data?.similarity) {
          // Rolling average for similarity
          const totalHits = stats.hitCount;
          stats.averageHitSimilarity =
            (stats.averageHitSimilarity * (totalHits - 1) + data.similarity) / totalHits;
        }

        if (data?.latencySavingsMs) {
          // Rolling average for latency savings
          const totalHits = stats.hitCount;
          stats.averageLatencySavingsMs =
            (stats.averageLatencySavingsMs * (totalHits - 1) + data.latencySavingsMs) / totalHits;
        }
      } else {
        stats.missCount++;
      }

      // Update per-collection stats
      if (data?.collectionId) {
        const collectionStats = stats.byCollection[data.collectionId] ?? {
          collectionId: data.collectionId,
          entryCount: 0,
          hitCount: 0,
          missCount: 0,
          hitRate: 0,
        };

        if (type === 'hit') {
          collectionStats.hitCount++;
        } else {
          collectionStats.missCount++;
        }

        const totalRequests = collectionStats.hitCount + collectionStats.missCount;
        collectionStats.hitRate = totalRequests > 0
          ? collectionStats.hitCount / totalRequests
          : 0;

        stats.byCollection[data.collectionId] = collectionStats;
      }

      // Recalculate overall hit rate
      const totalRequests = stats.hitCount + stats.missCount;
      stats.hitRate = totalRequests > 0 ? stats.hitCount / totalRequests : 0;
      stats.timestamp = new Date().toISOString();

      await redis.set(CACHE_STATS_KEY, stats);
    } catch (error) {
      console.error('Update stats error:', error);
    }
  }

  // ===========================================
  // Getters
  // ===========================================

  getConfig(): CacheConfig {
    return { ...this.config };
  }
}

// ===========================================
// Singleton Instance
// ===========================================

let ttlManagerInstance: TTLManager | null = null;

export function getTTLManager(config?: Partial<CacheConfig>): TTLManager {
  if (!ttlManagerInstance || config) {
    ttlManagerInstance = new TTLManager(config);
  }
  return ttlManagerInstance;
}

// ===========================================
// Utility Functions
// ===========================================

/**
 * Format TTL for display.
 */
export function formatTtl(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  } else if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h`;
  } else {
    return `${Math.floor(seconds / 86400)}d`;
  }
}

/**
 * Parse TTL string to seconds.
 */
export function parseTtl(ttlString: string): number {
  const match = ttlString.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid TTL format: ${ttlString}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      throw new Error(`Invalid TTL unit: ${unit}`);
  }
}
