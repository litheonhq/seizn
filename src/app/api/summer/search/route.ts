import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { search } from '@/lib/summer/search';
import type { SearchOptions, SearchType, SearchFilter, DateRangeFilter } from '@/lib/summer/search';
import { estimateTokens } from '@/lib/summer/utils/tokens';

/**
 * POST /api/summer/search
 *
 * Summer RAG Gateway - Unified Search API
 *
 * Supports three search types:
 * - vector: Semantic search using embeddings
 * - keyword: BM25 keyword search
 * - hybrid: RRF combination of vector + keyword (default)
 *
 * Request Body:
 * {
 *   "query": "string",                    // Required: search query
 *   "collection_id": "uuid",              // Required: collection to search
 *   "options": {
 *     "top_k": 10,                        // Number of results (default: 10)
 *     "search_type": "hybrid",            // "vector" | "keyword" | "hybrid"
 *     "hybrid_alpha": 0.7,                // Vector weight (0=keyword, 1=vector)
 *     "filters": [                        // Metadata filters
 *       { "field": "category", "operator": "eq", "value": "tech" }
 *     ],
 *     "date_range": {                     // Date range filter
 *       "start": "2024-01-01",
 *       "end": "2024-12-31",
 *       "field": "created_at"
 *     },
 *     "category": "tech",                 // Shorthand for category filter
 *     "threshold": 0.5,                   // Minimum similarity threshold
 *     "search_ef": 40,                    // HNSW ef_search parameter
 *     "include_trace": false              // Include trace info in response
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "results": [
 *     {
 *       "id": "chunk_uuid",
 *       "document_id": "doc_uuid",
 *       "content": "chunk text...",
 *       "score": 0.85,
 *       "metadata": { ... },
 *       "vector_score": 0.9,              // Only for hybrid
 *       "keyword_rank": 2                 // Only for hybrid
 *     }
 *   ],
 *   "latency_ms": 125,
 *   "search_type": "hybrid",
 *   "trace": { ... }                      // If include_trace: true
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

    const { userId, keyId, plan, rateLimitHeaders } = authResult;

    // Parse request body
    const body = await request.json();

    // Validate required fields
    const query = body?.query;
    const collectionId = body?.collection_id;

    if (!query || typeof query !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/summer/search', method: 'POST', startTime }, 400);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'query (string) is required',
          },
        },
        { status: 400 }
      );
    }

    if (!collectionId || typeof collectionId !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/summer/search', method: 'POST', startTime }, 400);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'collection_id (string) is required',
          },
        },
        { status: 400 }
      );
    }

    // Parse and validate options
    const rawOptions = body?.options ?? {};
    const options = parseSearchOptions(rawOptions);

    // Validate search type
    const validSearchTypes = ['vector', 'keyword', 'hybrid'];
    if (options.search_type && !validSearchTypes.includes(options.search_type)) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/search', method: 'POST', startTime }, 400);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: `search_type must be one of: ${validSearchTypes.join(', ')}`,
          },
        },
        { status: 400 }
      );
    }

    // Validate hybrid_alpha range
    if (options.hybrid_alpha !== undefined) {
      if (typeof options.hybrid_alpha !== 'number' || options.hybrid_alpha < 0 || options.hybrid_alpha > 1) {
        await logRequest({ userId, keyId, endpoint: '/api/summer/search', method: 'POST', startTime }, 400);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'hybrid_alpha must be a number between 0 and 1',
            },
          },
          { status: 400 }
        );
      }
    }

    // Validate top_k range
    if (options.top_k !== undefined) {
      if (typeof options.top_k !== 'number' || options.top_k < 1 || options.top_k > 100) {
        await logRequest({ userId, keyId, endpoint: '/api/summer/search', method: 'POST', startTime }, 400);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'top_k must be a number between 1 and 100',
            },
          },
          { status: 400 }
        );
      }
    }

    // Execute search
    const result = await search({
      userId,
      apiKeyId: keyId,
      plan,
      collectionId,
      query,
      options,
    });

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/search', method: 'POST', startTime },
      200,
      { embedding: estimateTokens(query) }
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        results: result.results,
        latency_ms: result.latency_ms,
        search_type: result.search_type,
        trace: result.trace,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Summer search error:', err);

    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const isUserError = errorMessage.includes('not found') || errorMessage.includes('permission');

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isUserError ? 'NOT_FOUND' : 'INTERNAL_ERROR',
          message: isUserError ? errorMessage : 'Internal server error',
        },
      },
      { status: isUserError ? 404 : 500 }
    );
  }
}

/**
 * Parse and validate search options from request body
 */
function parseSearchOptions(raw: Record<string, unknown>): SearchOptions {
  const options: SearchOptions = {};

  // top_k
  if (raw.top_k !== undefined) {
    options.top_k = Number(raw.top_k);
  }

  // search_type
  if (raw.search_type !== undefined) {
    options.search_type = raw.search_type as SearchType;
  }

  // hybrid_alpha
  if (raw.hybrid_alpha !== undefined) {
    options.hybrid_alpha = Number(raw.hybrid_alpha);
  }

  // threshold
  if (raw.threshold !== undefined) {
    options.threshold = Number(raw.threshold);
  }

  // search_ef
  if (raw.search_ef !== undefined) {
    options.search_ef = Number(raw.search_ef);
  }

  // include_trace
  if (raw.include_trace !== undefined) {
    options.include_trace = Boolean(raw.include_trace);
  }

  // category (shorthand)
  if (raw.category !== undefined) {
    options.category = raw.category as string | string[];
  }

  // filters
  if (raw.filters !== undefined && Array.isArray(raw.filters)) {
    options.filters = raw.filters.map(parseFilter).filter((f): f is SearchFilter => f !== null);
  }

  // date_range
  if (raw.date_range !== undefined && typeof raw.date_range === 'object') {
    options.date_range = parseDateRange(raw.date_range as Record<string, unknown>);
  }

  return options;
}

/**
 * Parse a single filter from request body
 */
function parseFilter(raw: unknown): SearchFilter | null {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;

  if (!obj.field || typeof obj.field !== 'string') return null;
  if (!obj.operator || typeof obj.operator !== 'string') return null;
  if (obj.value === undefined) return null;

  const validOperators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains', 'startsWith'];
  if (!validOperators.includes(obj.operator)) return null;

  return {
    field: obj.field,
    operator: obj.operator as SearchFilter['operator'],
    value: obj.value,
  };
}

/**
 * Parse date range from request body
 */
function parseDateRange(raw: Record<string, unknown>): DateRangeFilter | undefined {
  const result: DateRangeFilter = {};

  if (raw.start !== undefined && typeof raw.start === 'string') {
    result.start = raw.start;
  }

  if (raw.end !== undefined && typeof raw.end === 'string') {
    result.end = raw.end;
  }

  if (raw.field !== undefined && typeof raw.field === 'string') {
    result.field = raw.field;
  }

  // Return undefined if no valid fields
  if (!result.start && !result.end) {
    return undefined;
  }

  return result;
}

/**
 * GET /api/summer/search
 *
 * Returns API documentation for the search endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/summer/search',
    method: 'POST',
    description: 'Summer RAG Gateway - Unified Search API',
    authentication: 'x-api-key header required',
    request_body: {
      query: {
        type: 'string',
        required: true,
        description: 'Search query text',
      },
      collection_id: {
        type: 'string (UUID)',
        required: true,
        description: 'Collection ID to search in',
      },
      options: {
        type: 'object',
        required: false,
        properties: {
          top_k: {
            type: 'number',
            default: 10,
            range: '1-100',
            description: 'Number of results to return',
          },
          search_type: {
            type: 'string',
            enum: ['vector', 'keyword', 'hybrid'],
            default: 'hybrid',
            description: 'Type of search to perform',
          },
          hybrid_alpha: {
            type: 'number',
            default: 0.7,
            range: '0-1',
            description: 'Vector weight for hybrid search (0=keyword only, 1=vector only)',
          },
          filters: {
            type: 'array',
            description: 'Metadata filters',
            item_schema: {
              field: 'string',
              operator: 'eq | neq | gt | gte | lt | lte | in | nin | contains | startsWith',
              value: 'any',
            },
          },
          date_range: {
            type: 'object',
            description: 'Date range filter',
            properties: {
              start: 'ISO date string',
              end: 'ISO date string',
              field: 'metadata field name (default: created_at)',
            },
          },
          category: {
            type: 'string | string[]',
            description: 'Shorthand for category metadata filter',
          },
          threshold: {
            type: 'number',
            default: 0.5,
            range: '0-1',
            description: 'Minimum similarity threshold for vector search',
          },
          search_ef: {
            type: 'number',
            default: 40,
            description: 'HNSW ef_search parameter (higher = more accurate, slower)',
          },
          include_trace: {
            type: 'boolean',
            default: false,
            description: 'Include trace information in response',
          },
        },
      },
    },
    response: {
      success: 'boolean',
      results: {
        type: 'array',
        item_schema: {
          id: 'Chunk ID',
          document_id: 'Document ID',
          content: 'Chunk text content',
          score: 'Relevance score (0-1)',
          metadata: 'Chunk metadata object',
          vector_score: 'Original vector similarity (hybrid only)',
          keyword_rank: 'Original keyword rank (hybrid only)',
        },
      },
      latency_ms: 'Total latency in milliseconds',
      search_type: 'Search type used',
      trace: 'Trace information (if include_trace: true)',
    },
    examples: {
      basic: {
        query: 'How to implement authentication?',
        collection_id: 'uuid-here',
      },
      with_filters: {
        query: 'machine learning best practices',
        collection_id: 'uuid-here',
        options: {
          search_type: 'hybrid',
          top_k: 20,
          hybrid_alpha: 0.8,
          filters: [
            { field: 'category', operator: 'eq', value: 'tech' },
            { field: 'year', operator: 'gte', value: 2023 },
          ],
          date_range: {
            start: '2024-01-01',
            end: '2024-12-31',
          },
        },
      },
    },
  });
}
