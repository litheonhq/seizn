import { NextResponse } from 'next/server';

/**
 * GET /api/summer/cache
 *
 * Semantic Cache API Documentation
 *
 * Returns overview of all cache-related endpoints.
 */
export async function GET() {
  return NextResponse.json({
    name: 'Seizn Summer Semantic Cache API',
    version: '1.0',
    description:
      'Intelligent caching layer that uses embedding similarity to serve cached responses for semantically similar queries.',
    base_path: '/api/summer/cache',
    authentication: 'x-api-key header required for all endpoints',
    endpoints: {
      '/api/summer/cache/query': {
        methods: ['POST', 'GET'],
        description: 'Check cache for semantically similar queries and optionally store new entries',
        features: [
          'Semantic similarity matching using embeddings',
          'Configurable similarity threshold (default: 0.95)',
          'Optional auto-store on cache miss',
          'Pre-computed embedding support',
        ],
      },
      '/api/summer/cache/invalidate': {
        methods: ['DELETE', 'POST', 'GET'],
        description: 'Invalidate cache entries by ID, collection, or cleanup expired',
        features: [
          'Single entry invalidation',
          'Bulk collection invalidation',
          'Expired entry cleanup',
          'User-scoped (only own entries)',
        ],
      },
      '/api/summer/cache/stats': {
        methods: ['GET', 'POST'],
        description: 'Get cache performance metrics and statistics',
        features: [
          'Hit/miss rates',
          'Latency savings',
          'Per-collection breakdown',
          'Router statistics (optional)',
        ],
      },
    },
    concepts: {
      semantic_cache: {
        description:
          'Unlike traditional exact-match caching, semantic cache uses embedding similarity to find cached responses for queries that are semantically similar but not identical.',
        example:
          '"How do I authenticate users?" and "What is the authentication process?" might return the same cached response if their embeddings are similar enough.',
      },
      similarity_threshold: {
        description:
          'The minimum cosine similarity score required for a cache hit. Higher values (closer to 1.0) require more similar queries.',
        default: 0.95,
        range: '0.0 - 1.0',
        recommendation:
          '0.95 for production (high precision), 0.90 for development (higher recall)',
      },
      ttl: {
        description: 'Time-to-live for cached entries in seconds.',
        default: 3600,
        recommendation:
          'Set based on how frequently your underlying data changes. Static content can use longer TTLs.',
      },
      eviction_policy: {
        description: 'Strategy for removing entries when cache is full.',
        options: {
          lru: 'Least Recently Used (default) - removes oldest accessed entries',
          lfu: 'Least Frequently Used - removes least hit entries',
          ttl: 'TTL-based - removes entries closest to expiration',
          fifo: 'First In First Out - removes oldest created entries',
        },
      },
    },
    integration: {
      with_search: {
        description:
          'Use semantic cache with /api/summer/search for RAG query caching',
        workflow: [
          '1. Query cache with search query',
          '2. If hit, return cached results',
          '3. If miss, execute search and store results',
        ],
      },
      with_router: {
        description:
          'Budget Router automatically checks cache before routing to models',
        benefit: 'Zero-cost responses for cache hits',
      },
    },
    configuration: {
      default_settings: {
        similarity_threshold: 0.95,
        default_ttl_seconds: 3600,
        max_entries: 10000,
        eviction_policy: 'lru',
        min_query_length: 3,
        max_query_length: 4000,
      },
      env_variables: {
        SEMANTIC_CACHE_ENABLED: 'Enable/disable cache (default: true)',
        SEMANTIC_CACHE_THRESHOLD: 'Default similarity threshold',
        SEMANTIC_CACHE_TTL: 'Default TTL in seconds',
        SEMANTIC_CACHE_MAX_ENTRIES: 'Maximum cache entries',
      },
    },
    best_practices: [
      'Set appropriate TTL based on data freshness requirements',
      'Use collection-level invalidation when documents are updated',
      'Monitor hit rate to tune similarity threshold',
      'Pre-compute embeddings for batch operations',
      'Use lower thresholds for exploratory/development environments',
    ],
  });
}
