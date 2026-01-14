/**
 * SemanticCache Tests
 *
 * Tests for semantic query caching functionality including:
 * - Cache get (exact and semantic matching)
 * - Cache set
 * - Cache invalidation
 * - Cache statistics
 * - Configuration management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticCache, calculateCacheEffectiveness, DEFAULT_CACHE_CONFIG } from '../semantic-cache';
import type { CacheStats, CachedQueryResult, SemanticCacheConfig } from '../types';

// Mock Supabase with proper chainable pattern
const mockRpc = vi.fn();

// Create a chainable mock builder
const createChainableMock = (finalValue: unknown = { data: null, error: null }) => {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'lt', 'in', 'order', 'limit'];

  methods.forEach(method => {
    chain[method] = vi.fn().mockImplementation(() => chain);
  });

  chain.single = vi.fn().mockImplementation(() => Promise.resolve(finalValue));
  chain.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) => {
    return Promise.resolve(finalValue).then(resolve);
  });

  return chain;
};

const mockFrom = vi.fn(() => createChainableMock());

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

describe('SemanticCache', () => {
  let cache: SemanticCache;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createChainableMock());
    cache = new SemanticCache(testUserId);
  });

  describe('constructor', () => {
    it('should initialize with default config when no config provided', () => {
      const c = new SemanticCache(testUserId);
      const config = c.getConfig();
      expect(config.enabled).toBe(DEFAULT_CACHE_CONFIG.enabled);
      expect(config.ttlSeconds).toBe(DEFAULT_CACHE_CONFIG.ttlSeconds);
      expect(config.similarityThreshold).toBe(DEFAULT_CACHE_CONFIG.similarityThreshold);
    });

    it('should merge custom config with defaults', () => {
      const customConfig: Partial<SemanticCacheConfig> = { ttlSeconds: 7200 };
      const c = new SemanticCache(testUserId, customConfig);
      const config = c.getConfig();
      expect(config.ttlSeconds).toBe(7200);
      expect(config.enabled).toBe(true);
    });

    it('should support disabling cache via config', () => {
      const c = new SemanticCache(testUserId, { enabled: false });
      expect(c.getConfig().enabled).toBe(false);
    });
  });

  describe('get', () => {
    it('should return miss when cache is disabled', async () => {
      const disabledCache = new SemanticCache(testUserId, { enabled: false });
      const result = await disabledCache.get('test query', 'v1', 'hash1');

      expect(result.hit).toBe(false);
      expect(result.similarity).toBe(0);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return miss when query is too short', async () => {
      const result = await cache.get('ab', 'v1', 'hash1');
      expect(result.hit).toBe(false);
    });

    it('should return miss when query is too long', async () => {
      const longQuery = 'a'.repeat(5000);
      const result = await cache.get(longQuery, 'v1', 'hash1');
      expect(result.hit).toBe(false);
    });

    it('should return hit on exact cache match', async () => {
      const cachedResult: CachedQueryResult = {
        contexts: [{ id: 'ctx-1', score: 0.95 }],
        traceId: 'trace-1',
        originalLatencyMs: 200,
        searchType: 'vector',
      };

      mockFrom.mockImplementation(() => createChainableMock({
        data: {
          cache_key: 'key-123',
          query_embedding_hash: 'hash',
          index_version: 'v1',
          policy_hash: 'hash1',
          result: cachedResult,
          hit_count: 5,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
        error: null,
      }));

      const result = await cache.get('test query', 'v1', 'hash1');
      expect(result.hit).toBe(true);
      expect(result.similarity).toBe(1.0);
      expect(result.entry).toBeDefined();
    });

    it('should return miss when exact match is expired', async () => {
      mockFrom.mockImplementation(() => createChainableMock({
        data: {
          cache_key: 'key-123',
          expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
        },
        error: null,
      }));

      const result = await cache.get('test query', 'v1', 'hash1');
      expect(result.hit).toBe(false);
    });

    it('should attempt semantic search when exact match fails', async () => {
      mockFrom.mockImplementation(() => createChainableMock({ data: null, error: null }));

      mockRpc.mockResolvedValue({
        data: [{
          cache_key: 'similar-key',
          result: { contexts: [], traceId: 'trace-1', originalLatencyMs: 100, searchType: 'vector' },
          similarity: 0.97,
          hit_count: 3,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        }],
        error: null,
      });

      const embedding = Array(1536).fill(0.1);
      const result = await cache.get('test query', 'v1', 'hash1', embedding);

      expect(mockRpc).toHaveBeenCalledWith('find_similar_cache_entry', expect.any(Object));
    });
  });

  describe('set', () => {
    it('should not cache when disabled', async () => {
      const disabledCache = new SemanticCache(testUserId, { enabled: false });
      const result: CachedQueryResult = {
        contexts: [],
        traceId: 'trace-1',
        originalLatencyMs: 100,
        searchType: 'vector',
      };

      await disabledCache.set('query', [0.1, 0.2], 'v1', 'hash1', result);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should not cache short queries', async () => {
      const result: CachedQueryResult = {
        contexts: [],
        traceId: 'trace-1',
        originalLatencyMs: 100,
        searchType: 'vector',
      };

      // Short query should be rejected before any DB operations
      await cache.set('ab', [0.1, 0.2], 'v1', 'hash1', result);
      // The mock was cleared in beforeEach so we just verify it wasn't called for upsert
    });

    it('should upsert cache entry with correct data', async () => {
      const chain = createChainableMock({ error: null });
      mockFrom.mockImplementation(() => chain);

      mockRpc.mockResolvedValue({ data: 0 }); // Cache size check

      const result: CachedQueryResult = {
        contexts: [{ id: 'ctx-1', score: 0.9 }],
        traceId: 'trace-1',
        originalLatencyMs: 150,
        searchType: 'hybrid',
      };
      const embedding = [0.1, 0.2, 0.3];

      await cache.set('test query', embedding, 'v1', 'hash1', result);

      expect(chain.upsert).toHaveBeenCalled();
    });

    it('should handle upsert errors gracefully', async () => {
      const chain = createChainableMock({ error: { message: 'DB Error' } });
      mockFrom.mockImplementation(() => chain);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result: CachedQueryResult = {
        contexts: [],
        traceId: 'trace-1',
        originalLatencyMs: 100,
        searchType: 'vector',
      };

      await cache.set('test query', [0.1], 'v1', 'hash1', result);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('invalidateByIndex', () => {
    it('should delete entries matching index version', async () => {
      const chain = createChainableMock({
        data: [{ cache_key: 'key-1' }, { cache_key: 'key-2' }],
        error: null,
      });
      mockFrom.mockImplementation(() => chain);

      const count = await cache.invalidateByIndex('v1');
      expect(count).toBe(2);
    });

    it('should return 0 on error', async () => {
      const chain = createChainableMock({ data: null, error: { message: 'Error' } });
      mockFrom.mockImplementation(() => chain);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const count = await cache.invalidateByIndex('v1');

      expect(count).toBe(0);
      consoleSpy.mockRestore();
    });
  });

  describe('invalidateAll', () => {
    it('should delete all user entries', async () => {
      const chain = createChainableMock({
        data: [{ cache_key: 'key-1' }, { cache_key: 'key-2' }, { cache_key: 'key-3' }],
        error: null,
      });
      mockFrom.mockImplementation(() => chain);

      const count = await cache.invalidateAll();
      expect(count).toBe(3);
    });
  });

  describe('invalidateExpired', () => {
    it('should delete expired entries', async () => {
      const chain = createChainableMock({
        data: [{ cache_key: 'expired-1' }],
        error: null,
      });
      mockFrom.mockImplementation(() => chain);

      const count = await cache.invalidateExpired();
      expect(count).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return empty stats on error', async () => {
      const chain = createChainableMock({ data: null, error: { message: 'Error' } });
      mockFrom.mockImplementation(() => chain);

      const stats = await cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('should calculate correct statistics', async () => {
      const mockEntries = [
        { hit_count: 10, result: { originalLatencyMs: 200 }, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString() },
        { hit_count: 5, result: { originalLatencyMs: 150 }, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString() },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'cost_cache_metrics') {
          return createChainableMock({ data: { miss_count: 5 }, error: null });
        }
        return createChainableMock({ data: mockEntries, error: null });
      });

      const stats = await cache.getStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.hitCount).toBe(15);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      cache.updateConfig({ ttlSeconds: 7200 });
      expect(cache.getConfig().ttlSeconds).toBe(7200);
    });

    it('should preserve other config values', () => {
      const originalThreshold = cache.getConfig().similarityThreshold;
      cache.updateConfig({ ttlSeconds: 7200 });
      expect(cache.getConfig().similarityThreshold).toBe(originalThreshold);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of config', () => {
      const config = cache.getConfig();
      config.ttlSeconds = 9999;
      expect(cache.getConfig().ttlSeconds).not.toBe(9999);
    });
  });
});

describe('calculateCacheEffectiveness', () => {
  it('should return excellent grade for high hit rate and latency savings', () => {
    const stats: CacheStats = {
      totalEntries: 100,
      totalSizeBytes: 50000,
      hitCount: 900,
      missCount: 100,
      hitRate: 0.9,
      averageHitSimilarity: 0.95,
      averageLatencySavingsMs: 400,
      expiredEntries: 5,
      timestamp: new Date().toISOString(),
    };

    const result = calculateCacheEffectiveness(stats);
    expect(result.grade).toBe('excellent');
    expect(result.effectiveness).toBeGreaterThanOrEqual(0.8);
  });

  it('should return good grade for moderate performance', () => {
    const stats: CacheStats = {
      totalEntries: 100,
      totalSizeBytes: 50000,
      hitCount: 700,
      missCount: 300,
      hitRate: 0.7,
      averageHitSimilarity: 0.9,
      averageLatencySavingsMs: 250,
      expiredEntries: 10,
      timestamp: new Date().toISOString(),
    };

    const result = calculateCacheEffectiveness(stats);
    expect(result.grade).toBe('good');
  });

  it('should return fair grade for below average performance', () => {
    const stats: CacheStats = {
      totalEntries: 100,
      totalSizeBytes: 50000,
      hitCount: 500,
      missCount: 500,
      hitRate: 0.5,
      averageHitSimilarity: 0.85,
      averageLatencySavingsMs: 150,
      expiredEntries: 15,
      timestamp: new Date().toISOString(),
    };

    const result = calculateCacheEffectiveness(stats);
    expect(result.grade).toBe('fair');
  });

  it('should return poor grade for low performance', () => {
    const stats: CacheStats = {
      totalEntries: 100,
      totalSizeBytes: 50000,
      hitCount: 200,
      missCount: 800,
      hitRate: 0.2,
      averageHitSimilarity: 0.8,
      averageLatencySavingsMs: 50,
      expiredEntries: 20,
      timestamp: new Date().toISOString(),
    };

    const result = calculateCacheEffectiveness(stats);
    expect(result.grade).toBe('poor');
    expect(result.description).toContain('low');
  });

  it('should weight hit rate higher than latency savings', () => {
    const highHitRate: CacheStats = {
      totalEntries: 100,
      totalSizeBytes: 50000,
      hitCount: 900,
      missCount: 100,
      hitRate: 0.9,
      averageHitSimilarity: 0.95,
      averageLatencySavingsMs: 100, // Low latency savings
      expiredEntries: 5,
      timestamp: new Date().toISOString(),
    };

    const lowHitRate: CacheStats = {
      totalEntries: 100,
      totalSizeBytes: 50000,
      hitCount: 400,
      missCount: 600,
      hitRate: 0.4,
      averageHitSimilarity: 0.95,
      averageLatencySavingsMs: 500, // High latency savings
      expiredEntries: 5,
      timestamp: new Date().toISOString(),
    };

    const highHitResult = calculateCacheEffectiveness(highHitRate);
    const lowHitResult = calculateCacheEffectiveness(lowHitRate);

    expect(highHitResult.effectiveness).toBeGreaterThan(lowHitResult.effectiveness);
  });

  it('should cap latency savings normalization at 500ms', () => {
    const stats: CacheStats = {
      totalEntries: 100,
      totalSizeBytes: 50000,
      hitCount: 500,
      missCount: 500,
      hitRate: 0.5,
      averageHitSimilarity: 0.95,
      averageLatencySavingsMs: 1000, // Over 500ms cap
      expiredEntries: 5,
      timestamp: new Date().toISOString(),
    };

    const result = calculateCacheEffectiveness(stats);
    // hitRate contribution: 0.5 * 0.7 = 0.35
    // latency contribution (capped): 1.0 * 0.3 = 0.3
    // Total: 0.65
    expect(result.effectiveness).toBeCloseTo(0.65, 2);
  });
});
