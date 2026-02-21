/**
 * Query Result Cache for Memory Search
 *
 * Caches search results in Redis to avoid repeated DB queries.
 * Uses memory_version for automatic cache invalidation.
 *
 * Cache key format: qcache:{userId}:{namespace}:{queryHash}:{memoryVersion}
 * TTL: 10 minutes (configurable)
 */

import { getRedis } from '../redis';
import crypto from 'crypto';

// Cache configuration
const QUERY_CACHE_PREFIX = 'qcache:';
const QUERY_CACHE_TTL = 60 * 10; // 10 minutes
const HOT_BUNDLE_PREFIX = 'hotbundle:';
const HOT_BUNDLE_TTL = 60 * 30; // 30 minutes
const VERSION_PREFIX = 'memver:';

// Types
export interface CachedMemory {
  id: string;
  content: string;
  memory_type: string;
  importance: number;
  similarity?: number;
  rrf_score?: number;
}

export interface QueryCacheResult {
  hit: boolean;
  results: CachedMemory[];
  fromCache: boolean;
  version?: number;
}

export interface HotBundle {
  memories: CachedMemory[];
  slots: Record<string, string>;
  updatedAt: string;
}

/**
 * Generate a hash for the query string
 */
function hashQuery(query: string): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

/**
 * Get the memory version for a user/namespace
 * Returns 0 if no version is set (first time)
 */
export async function getMemoryVersion(
  userId: string,
  namespace: string = 'default'
): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  try {
    const key = `${VERSION_PREFIX}${userId}:${namespace}`;
    const version = await redis.get<number>(key);
    return version || 0;
  } catch (error) {
    console.error('Error getting memory version:', error);
    return 0;
  }
}

/**
 * Increment the memory version (called on INSERT/UPDATE/DELETE)
 */
export async function incrementMemoryVersion(
  userId: string,
  namespace: string = 'default'
): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  try {
    const key = `${VERSION_PREFIX}${userId}:${namespace}`;
    const newVersion = await redis.incr(key);
    return newVersion;
  } catch (error) {
    console.error('Error incrementing memory version:', error);
    return 0;
  }
}

/**
 * Get cached query results
 */
export async function getCachedQueryResults(
  userId: string,
  query: string,
  namespace: string = 'default',
  mode: string = 'vector'
): Promise<QueryCacheResult> {
  const redis = getRedis();
  if (!redis) {
    return { hit: false, results: [], fromCache: false };
  }

  try {
    const version = await getMemoryVersion(userId, namespace);
    const queryHash = hashQuery(query);
    const key = `${QUERY_CACHE_PREFIX}${userId}:${namespace}:${mode}:${queryHash}:${version}`;

    const cached = await redis.get<CachedMemory[]>(key);
    if (cached) {
      return {
        hit: true,
        results: cached,
        fromCache: true,
        version,
      };
    }

    return { hit: false, results: [], fromCache: false, version };
  } catch (error) {
    console.error('Error getting cached query results:', error);
    return { hit: false, results: [], fromCache: false };
  }
}

/**
 * Cache query results
 */
export async function setCachedQueryResults(
  userId: string,
  query: string,
  namespace: string = 'default',
  mode: string = 'vector',
  results: CachedMemory[],
  ttl: number = QUERY_CACHE_TTL
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const version = await getMemoryVersion(userId, namespace);
    const queryHash = hashQuery(query);
    const key = `${QUERY_CACHE_PREFIX}${userId}:${namespace}:${mode}:${queryHash}:${version}`;

    await redis.set(key, results, { ex: ttl });
  } catch (error) {
    console.error('Error caching query results:', error);
  }
}

/**
 * Get hot memory bundle for a user
 * Contains top N most important/recent memories for instant context
 */
export async function getHotBundle(
  userId: string,
  namespace: string = 'default'
): Promise<HotBundle | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const version = await getMemoryVersion(userId, namespace);
    const key = `${HOT_BUNDLE_PREFIX}${userId}:${namespace}:${version}`;
    return await redis.get<HotBundle>(key);
  } catch (error) {
    console.error('Error getting hot bundle:', error);
    return null;
  }
}

/**
 * Set hot memory bundle
 */
export async function setHotBundle(
  userId: string,
  namespace: string = 'default',
  bundle: HotBundle,
  ttl: number = HOT_BUNDLE_TTL
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const version = await getMemoryVersion(userId, namespace);
    const key = `${HOT_BUNDLE_PREFIX}${userId}:${namespace}:${version}`;
    await redis.set(key, bundle, { ex: ttl });
  } catch (error) {
    console.error('Error setting hot bundle:', error);
  }
}

/**
 * Get cache statistics
 */
export async function getQueryCacheStats(): Promise<{
  queryCacheKeys: number;
  hotBundleKeys: number;
  versionKeys: number;
} | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    // Note: This is approximate - Upstash doesn't support SCAN easily
    const totalKeys = await redis.dbsize();
    return {
      queryCacheKeys: 0, // Would need SCAN to count accurately
      hotBundleKeys: 0,
      versionKeys: 0,
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return null;
  }
}

/**
 * Clear all cache for a user (called on bulk operations)
 */
export async function clearUserCache(
  userId: string,
  namespace?: string
): Promise<void> {
  // Simply incrementing the version effectively invalidates all cache
  // because the cache key includes the version
  if (namespace) {
    await incrementMemoryVersion(userId, namespace);
  } else {
    await incrementMemoryVersion(userId, 'default');
  }
}
