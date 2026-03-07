import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { logServerError } from '@/lib/server/logger';
import { getSemanticCache, lookupCache as _lookupCache, storeInCache } from '@/lib/summer/cache';
import { getEmbeddingProvider } from '@/lib/summer/embedding';
import type { CachedResponse } from '@/lib/summer/cache';

/**
 * POST /api/summer/cache/query
 *
 * Semantic Cache Query API
 *
 * Checks cache for semantically similar queries and optionally stores new entries.
 *
 * Request Body:
 * {
 *   "query": "string",                    // Required: query to check
 *   "collection_id": "uuid",              // Required: collection scope
 *   "embedding": [0.1, 0.2, ...],        // Optional: pre-computed embedding
 *   "threshold": 0.95,                    // Optional: similarity threshold
 *   "store_on_miss": false,               // Optional: store response on miss
 *   "response": { ... },                  // Required if store_on_miss is true
 *   "ttl_seconds": 3600                   // Optional: TTL for stored entry
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "hit": true/false,
 *   "similarity": 0.97,
 *   "entry": { ... },                     // If hit
 *   "latency_ms": 15,
 *   "embedding_computed": false
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse request body
    const body = await request.json();

    // Validate required fields
    const query = body?.query;
    const collectionId = body?.collection_id;

    if (!query || typeof query !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/cache/query', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('query');
    }

    if (!collectionId || typeof collectionId !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/cache/query', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('collection_id');
    }

    // Parse options
    const embedding = body?.embedding as number[] | undefined;
    const threshold = body?.threshold as number | undefined;
    const storeOnMiss = body?.store_on_miss === true;
    const responseData = body?.response as CachedResponse | undefined;
    const ttlSeconds = body?.ttl_seconds as number | undefined;

    // Validate threshold if provided
    if (threshold !== undefined) {
      if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
        await logRequest(
          { userId, keyId, endpoint: '/api/summer/cache/query', method: 'POST', startTime },
          400
        );
        return ValidationErrors.invalidField('threshold', 'must be a number between 0 and 1');
      }
    }

    // Validate embedding if provided
    if (embedding !== undefined) {
      if (!Array.isArray(embedding) || embedding.length === 0) {
        await logRequest(
          { userId, keyId, endpoint: '/api/summer/cache/query', method: 'POST', startTime },
          400
        );
        return ValidationErrors.invalidField('embedding', 'must be a non-empty array');
      }
    }

    // If store_on_miss is true, response is required
    if (storeOnMiss && !responseData) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/cache/query', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('response (required when store_on_miss is true)');
    }

    // Query cache
    const cache = getSemanticCache();
    const cacheResult = await cache.query({
      query,
      collectionId,
      userId,
      embedding,
      similarityThreshold: threshold,
    });

    // If miss and store_on_miss is true, store the new entry
    let storedEntry = null;
    if (!cacheResult.hit && storeOnMiss && responseData) {
      // Compute embedding if not provided
      let queryEmbedding = embedding;
      if (!queryEmbedding) {
        const provider = getEmbeddingProvider();
        const embeddings = await provider.embed([query], 'query');
        queryEmbedding = embeddings[0];
      }

      storedEntry = await storeInCache(
        query,
        queryEmbedding,
        responseData,
        collectionId,
        userId,
        { ttlSeconds }
      );
    }

    // Log successful request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/cache/query', method: 'POST', startTime },
      200,
      { embedding: cacheResult.embeddingComputed ? query.length : 0 }
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        hit: cacheResult.hit,
        similarity: cacheResult.similarity,
        entry: cacheResult.entry ?? undefined,
        stored: storedEntry ? true : undefined,
        stored_entry_id: storedEntry?.id ?? undefined,
        latency_ms: cacheResult.latencyMs,
        embedding_computed: cacheResult.embeddingComputed,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    logServerError('Cache query error', err);
    return ServerErrors.internal('cache_query');
  }
}

/**
 * GET /api/summer/cache/query
 *
 * Returns API documentation for the cache query endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/summer/cache/query',
    method: 'POST',
    description: 'Semantic Cache Query - Check for cached responses by semantic similarity',
    authentication: 'Authorization: Bearer <api-key> header required',
    request_body: {
      query: {
        type: 'string',
        required: true,
        description: 'Query text to check in cache',
      },
      collection_id: {
        type: 'string (UUID)',
        required: true,
        description: 'Collection ID to scope the cache lookup',
      },
      embedding: {
        type: 'number[]',
        required: false,
        description: 'Pre-computed query embedding (optional, will compute if not provided)',
      },
      threshold: {
        type: 'number',
        required: false,
        default: 0.95,
        range: '0-1',
        description: 'Minimum similarity threshold for cache hit',
      },
      store_on_miss: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Whether to store the response in cache on miss',
      },
      response: {
        type: 'object',
        required: 'When store_on_miss is true',
        description: 'Response data to cache if store_on_miss is true',
      },
      ttl_seconds: {
        type: 'number',
        required: false,
        default: 3600,
        description: 'Time-to-live for cached entry in seconds',
      },
    },
    response: {
      success: 'boolean',
      hit: 'Whether cache hit occurred',
      similarity: 'Similarity score with best match (0-1)',
      entry: 'Cached entry if hit (query, response, metadata)',
      stored: 'Whether a new entry was stored (if store_on_miss)',
      stored_entry_id: 'ID of stored entry (if stored)',
      latency_ms: 'Cache lookup latency in milliseconds',
      embedding_computed: 'Whether embedding was computed for this request',
    },
    examples: {
      basic_lookup: {
        query: 'How do I implement authentication?',
        collection_id: 'uuid-here',
      },
      with_threshold: {
        query: 'How do I implement authentication?',
        collection_id: 'uuid-here',
        threshold: 0.92,
      },
      store_on_miss: {
        query: 'How do I implement authentication?',
        collection_id: 'uuid-here',
        store_on_miss: true,
        response: {
          results: [
            { id: 'chunk1', content: '...', score: 0.95 }
          ],
          originalLatencyMs: 150,
          searchType: 'hybrid',
          totalResults: 5,
        },
        ttl_seconds: 7200,
      },
    },
  });
}
