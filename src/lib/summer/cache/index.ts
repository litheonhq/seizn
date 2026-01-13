/**
 * Seizn Summer - Semantic Cache Module
 *
 * Exports for the semantic caching system.
 */

// Types
export type {
  CacheEntry,
  CacheConfig,
  CachedResponse,
  CachedResult,
  CacheMetadata,
  SimilarityResult,
  BatchSimilarityResult,
  CacheQueryParams,
  CacheQueryResult,
  CacheStoreParams,
  CacheInvalidateParams,
  CacheInvalidateResult,
  CacheStats,
  CollectionCacheStats,
  CacheEvent,
  CacheEventType,
  EvictionPolicy,
} from './types';

export { DEFAULT_CACHE_CONFIG } from './types';

// Similarity functions
export {
  cosineSimilarity,
  cosineSimilarityNormalized,
  normalizeVector,
  isNormalized,
  findMostSimilar,
  findTopNSimilar,
  batchSimilaritySearch,
  euclideanDistance,
  euclideanToSimilarity,
  dotProduct,
  averageSimilarity,
  areSimilar,
  validateEmbedding,
} from './similarity';

// TTL Manager
export {
  TTLManager,
  getTTLManager,
  formatTtl,
  parseTtl,
} from './ttl-manager';

// Semantic Cache
export {
  SemanticCache,
  getSemanticCache,
  lookupCache,
  storeInCache,
} from './embedding-cache';
