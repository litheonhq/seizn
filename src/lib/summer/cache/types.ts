/**
 * Seizn Summer - Semantic Cache Types
 *
 * Type definitions for the semantic caching system.
 * Provides intelligent caching based on query similarity rather than exact match.
 */

// ===========================================
// Cache Entry Types
// ===========================================

/**
 * Represents a single cached entry
 */
export interface CacheEntry {
  /** Unique cache entry ID */
  id: string;
  /** Original query string */
  query: string;
  /** Query embedding vector */
  embedding: number[];
  /** Cached response data */
  response: CachedResponse;
  /** Collection ID this cache belongs to */
  collectionId: string;
  /** User ID who owns this cache */
  userId: string;
  /** Entry creation timestamp (ISO 8601) */
  createdAt: string;
  /** Last access timestamp (ISO 8601) */
  lastAccessedAt: string;
  /** Number of times this cache was hit */
  hitCount: number;
  /** Time-to-live in seconds */
  ttlSeconds: number;
  /** Expiration timestamp (ISO 8601) */
  expiresAt: string;
  /** Cache entry metadata */
  metadata?: CacheMetadata;
}

/**
 * Cached response structure
 */
export interface CachedResponse {
  /** Search results */
  results: CachedResult[];
  /** Original response latency in ms */
  originalLatencyMs: number;
  /** Search type used */
  searchType: 'vector' | 'keyword' | 'hybrid';
  /** Total result count before limit */
  totalResults: number;
  /** Configuration used for this search */
  config?: Record<string, unknown>;
}

/**
 * Individual cached result item
 */
export interface CachedResult {
  id: string;
  documentId: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Cache entry metadata
 */
export interface CacheMetadata {
  /** Source of the cached query */
  source?: 'api' | 'sdk' | 'internal';
  /** Client identifier */
  clientId?: string;
  /** Request trace ID */
  traceId?: string;
  /** Additional custom fields */
  [key: string]: unknown;
}

// ===========================================
// Cache Configuration
// ===========================================

/**
 * Semantic cache configuration
 */
export interface CacheConfig {
  /** Enable/disable the cache */
  enabled: boolean;
  /** Similarity threshold for cache hit (0.0 - 1.0) */
  similarityThreshold: number;
  /** Default TTL in seconds */
  defaultTtlSeconds: number;
  /** Maximum number of entries in cache */
  maxEntries: number;
  /** Eviction policy when cache is full */
  evictionPolicy: EvictionPolicy;
  /** Minimum query length to cache */
  minQueryLength: number;
  /** Maximum query length to cache */
  maxQueryLength: number;
  /** Collections to exclude from caching */
  excludedCollections?: string[];
  /** Enable cache warming */
  enableWarming?: boolean;
  /** Cache key namespace prefix */
  namespace?: string;
}

/**
 * Cache eviction policies
 */
export type EvictionPolicy = 'lru' | 'lfu' | 'fifo' | 'ttl';

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  similarityThreshold: 0.95,
  defaultTtlSeconds: 3600, // 1 hour
  maxEntries: 10000,
  evictionPolicy: 'lru',
  minQueryLength: 3,
  maxQueryLength: 4000,
  enableWarming: false,
  namespace: 'szn:cache:',
};

// ===========================================
// Similarity Types
// ===========================================

/**
 * Result of a similarity comparison
 */
export interface SimilarityResult {
  /** Cache entry ID */
  entryId: string;
  /** Similarity score (0.0 - 1.0) */
  similarity: number;
  /** Whether this is a cache hit (similarity >= threshold) */
  isHit: boolean;
  /** Original query from cache */
  cachedQuery: string;
  /** The cache entry if hit */
  entry?: CacheEntry;
}

/**
 * Batch similarity comparison result
 */
export interface BatchSimilarityResult {
  /** Query that was compared */
  query: string;
  /** Query embedding */
  embedding: number[];
  /** Best matching result */
  bestMatch: SimilarityResult | null;
  /** Top N matches */
  topMatches: SimilarityResult[];
  /** Time taken for comparison in ms */
  comparisonTimeMs: number;
}

// ===========================================
// Cache Operations
// ===========================================

/**
 * Cache query parameters
 */
export interface CacheQueryParams {
  /** Query string to look up */
  query: string;
  /** Query embedding (optional, will compute if not provided) */
  embedding?: number[];
  /** Collection ID to scope the cache lookup */
  collectionId: string;
  /** User ID for cache scoping */
  userId: string;
  /** Custom similarity threshold (overrides config) */
  similarityThreshold?: number;
}

/**
 * Cache query result
 */
export interface CacheQueryResult {
  /** Whether cache hit occurred */
  hit: boolean;
  /** Cache entry if hit */
  entry?: CacheEntry;
  /** Similarity score */
  similarity: number;
  /** Lookup latency in ms */
  latencyMs: number;
  /** Whether embedding was computed */
  embeddingComputed: boolean;
}

/**
 * Cache store parameters
 */
export interface CacheStoreParams {
  /** Query string */
  query: string;
  /** Query embedding */
  embedding: number[];
  /** Response to cache */
  response: CachedResponse;
  /** Collection ID */
  collectionId: string;
  /** User ID */
  userId: string;
  /** Custom TTL in seconds (overrides config) */
  ttlSeconds?: number;
  /** Additional metadata */
  metadata?: CacheMetadata;
}

/**
 * Cache invalidation parameters
 */
export interface CacheInvalidateParams {
  /** Specific entry ID to invalidate */
  entryId?: string;
  /** Invalidate all entries for a collection */
  collectionId?: string;
  /** Invalidate all entries for a user */
  userId?: string;
  /** Invalidate entries matching a query pattern */
  queryPattern?: string;
  /** Invalidate expired entries only */
  expiredOnly?: boolean;
}

/**
 * Cache invalidation result
 */
export interface CacheInvalidateResult {
  /** Number of entries invalidated */
  invalidatedCount: number;
  /** Entry IDs that were invalidated */
  invalidatedIds: string[];
  /** Operation duration in ms */
  durationMs: number;
}

// ===========================================
// Cache Statistics
// ===========================================

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total number of entries in cache */
  totalEntries: number;
  /** Total cache size in bytes (approximate) */
  totalSizeBytes: number;
  /** Number of cache hits */
  hitCount: number;
  /** Number of cache misses */
  missCount: number;
  /** Cache hit rate (0.0 - 1.0) */
  hitRate: number;
  /** Average similarity score for hits */
  averageHitSimilarity: number;
  /** Average latency savings in ms */
  averageLatencySavingsMs: number;
  /** Number of expired entries pending cleanup */
  expiredEntries: number;
  /** Stats by collection */
  byCollection: Record<string, CollectionCacheStats>;
  /** Stats timestamp */
  timestamp: string;
}

/**
 * Per-collection cache statistics
 */
export interface CollectionCacheStats {
  collectionId: string;
  entryCount: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
}

// ===========================================
// Cache Events
// ===========================================

/**
 * Cache event types
 */
export type CacheEventType =
  | 'hit'
  | 'miss'
  | 'store'
  | 'invalidate'
  | 'evict'
  | 'expire'
  | 'warm';

/**
 * Cache event for logging/monitoring
 */
export interface CacheEvent {
  type: CacheEventType;
  timestamp: string;
  userId: string;
  collectionId: string;
  entryId?: string;
  query?: string;
  similarity?: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}
