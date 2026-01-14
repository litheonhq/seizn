import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  multimodalSearch,
  searchTables,
  searchCode,
  searchInPages,
} from '@/lib/multimodal';
import type { BlockType, MultimodalSearchOptions } from '@/lib/multimodal';
import { estimateTokens } from '@/lib/summer/utils/tokens';

/**
 * POST /api/multimodal/search
 *
 * Multimodal search across document blocks with layout awareness.
 *
 * Request Body:
 * {
 *   "query": "search query",
 *   "collection_id": "uuid",
 *   "options": {
 *     "top_k": 10,
 *     "block_types": ["text", "table", "heading"],
 *     "block_type_weights": { "table": 2.0, "heading": 1.5 },
 *     "include_context": true,
 *     "context_window": 2,
 *     "threshold": 0.5,
 *     "page_range": { "start": 1, "end": 10 }
 *   }
 * }
 *
 * Specialized Search Modes:
 * - mode: "tables" - Search only within tables
 * - mode: "code" - Search only within code blocks
 * - mode: "pages" - Search within specific page range (requires page_start, page_end)
 *
 * Response:
 * {
 *   "success": true,
 *   "results": [
 *     {
 *       "blocks": [...],
 *       "score": 0.85,
 *       "highlights": [...]
 *     }
 *   ],
 *   "latency_ms": 234
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse request body
    const body = await request.json();

    const query = body?.query;
    const collectionId = body?.collection_id;
    const mode = body?.mode as string | undefined;
    const rawOptions = body?.options ?? {};

    // Validate required fields
    if (!query || typeof query !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/multimodal/search', method: 'POST', startTime }, 400);
      return ValidationErrors.missingField('query');
    }

    if (!collectionId || typeof collectionId !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/multimodal/search', method: 'POST', startTime }, 400);
      return ValidationErrors.missingField('collection_id');
    }

    // Parse search options
    const options = parseSearchOptions(rawOptions);

    // Execute search based on mode
    let results;

    switch (mode) {
      case 'tables':
        results = await searchTables(userId, collectionId, query, {
          topK: options.topK,
          threshold: options.threshold,
          includeContext: options.includeContext,
        });
        break;

      case 'code':
        results = await searchCode(userId, collectionId, query, {
          topK: options.topK,
          threshold: options.threshold,
          includeContext: options.includeContext,
        });
        break;

      case 'pages':
        const pageStart = body?.page_start ?? options.pageRange?.start ?? 1;
        const pageEnd = body?.page_end ?? options.pageRange?.end ?? 999;
        results = await searchInPages(userId, collectionId, query, pageStart, pageEnd, options);
        break;

      default:
        results = await multimodalSearch(userId, collectionId, query, options);
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/multimodal/search', method: 'POST', startTime },
      200,
      { embedding: estimateTokens(query) }
    );

    const response = NextResponse.json({
      success: true,
      results: results.map((r) => ({
        blocks: r.blocks.map((block) => ({
          id: block.id,
          documentId: block.documentId,
          blockType: block.blockType,
          pageNumber: block.pageNumber,
          content: block.content,
          contentHtml: block.contentHtml,
          bbox: block.bbox,
          metadata: block.metadata,
        })),
        score: r.score,
        highlights: r.highlights,
      })),
      count: results.length,
      mode: mode ?? 'default',
      latency_ms: Date.now() - startTime,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Multimodal search error:', err);
    return ServerErrors.internal('multimodal-search');
  }
}

/**
 * Parse and validate search options
 */
function parseSearchOptions(raw: Record<string, unknown>): MultimodalSearchOptions {
  const options: MultimodalSearchOptions = {};

  // top_k
  if (raw.top_k !== undefined) {
    const topK = Number(raw.top_k);
    if (topK >= 1 && topK <= 100) {
      options.topK = topK;
    }
  }

  // block_types
  if (raw.block_types !== undefined && Array.isArray(raw.block_types)) {
    const validTypes: BlockType[] = ['text', 'table', 'figure', 'heading', 'list', 'code', 'caption'];
    const types = raw.block_types.filter((t): t is BlockType =>
      typeof t === 'string' && validTypes.includes(t as BlockType)
    );
    if (types.length > 0) {
      options.blockTypes = types;
    }
  }

  // block_type_weights
  if (raw.block_type_weights !== undefined && typeof raw.block_type_weights === 'object') {
    const weights = raw.block_type_weights as Record<string, unknown>;
    const validWeights: Partial<Record<BlockType, number>> = {};
    const validTypes: BlockType[] = ['text', 'table', 'figure', 'heading', 'list', 'code', 'caption'];

    for (const [key, value] of Object.entries(weights)) {
      if (validTypes.includes(key as BlockType) && typeof value === 'number') {
        validWeights[key as BlockType] = value;
      }
    }

    if (Object.keys(validWeights).length > 0) {
      options.blockTypeWeights = validWeights;
    }
  }

  // include_context
  if (raw.include_context !== undefined) {
    options.includeContext = Boolean(raw.include_context);
  }

  // context_window
  if (raw.context_window !== undefined) {
    const window = Number(raw.context_window);
    if (window >= 0 && window <= 10) {
      options.contextWindow = window;
    }
  }

  // threshold
  if (raw.threshold !== undefined) {
    const threshold = Number(raw.threshold);
    if (threshold >= 0 && threshold <= 1) {
      options.threshold = threshold;
    }
  }

  // page_range
  if (raw.page_range !== undefined && typeof raw.page_range === 'object') {
    const range = raw.page_range as Record<string, unknown>;
    options.pageRange = {};
    if (range.start !== undefined) {
      options.pageRange.start = Number(range.start);
    }
    if (range.end !== undefined) {
      options.pageRange.end = Number(range.end);
    }
  }

  return options;
}

/**
 * GET /api/multimodal/search
 *
 * Returns API documentation
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/multimodal/search',
    method: 'POST',
    description: 'Multimodal search with layout-aware retrieval',
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
        description: 'Collection to search in',
      },
      mode: {
        type: 'string',
        required: false,
        enum: ['tables', 'code', 'pages'],
        description: 'Specialized search mode',
      },
      page_start: {
        type: 'number',
        required: false,
        description: 'Start page for pages mode',
      },
      page_end: {
        type: 'number',
        required: false,
        description: 'End page for pages mode',
      },
      options: {
        type: 'object',
        required: false,
        properties: {
          top_k: {
            type: 'number',
            default: 10,
            range: '1-100',
            description: 'Number of results',
          },
          block_types: {
            type: 'string[]',
            enum: ['text', 'table', 'figure', 'heading', 'list', 'code', 'caption'],
            description: 'Filter by block types',
          },
          block_type_weights: {
            type: 'object',
            description: 'Custom weights per block type',
            example: { table: 2.0, heading: 1.5 },
          },
          include_context: {
            type: 'boolean',
            default: false,
            description: 'Include surrounding blocks',
          },
          context_window: {
            type: 'number',
            default: 2,
            range: '0-10',
            description: 'Blocks before/after to include',
          },
          threshold: {
            type: 'number',
            default: 0.5,
            range: '0-1',
            description: 'Minimum similarity score',
          },
          page_range: {
            type: 'object',
            description: 'Page range filter',
            properties: {
              start: 'number',
              end: 'number',
            },
          },
        },
      },
    },
    response: {
      success: 'boolean',
      results: {
        type: 'array',
        item_schema: {
          blocks: 'Array of matching blocks (with context if enabled)',
          score: 'Relevance score (0-1)',
          highlights: 'Array of highlight spans',
        },
      },
      count: 'Number of results',
      mode: 'Search mode used',
      latency_ms: 'Processing time',
    },
    examples: {
      basic: {
        query: 'revenue figures for Q4',
        collection_id: 'uuid-here',
      },
      table_search: {
        query: 'sales by region',
        collection_id: 'uuid-here',
        mode: 'tables',
      },
      with_context: {
        query: 'implementation details',
        collection_id: 'uuid-here',
        options: {
          include_context: true,
          context_window: 3,
          block_types: ['text', 'code'],
        },
      },
    },
  });
}
