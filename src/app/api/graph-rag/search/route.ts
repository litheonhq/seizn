import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { retrieve, multiHopRetrieve, focusedRetrieve, buildContext } from '@/lib/graph-rag';
import type { GraphRetrievalOptions, RelationType } from '@/lib/graph-rag';

/**
 * POST /api/graph-rag/search
 *
 * Perform graph-augmented retrieval combining vector search with graph traversal.
 *
 * Request Body:
 * {
 *   "query": "string",                    // Required: search query
 *   "collection_id": "uuid",              // Required: collection to search
 *   "options": {
 *     "max_depth": 2,                     // Graph traversal depth (default: 2)
 *     "direction": "both",                // "outgoing" | "incoming" | "both"
 *     "relation_types": ["is_a", ...],    // Filter by relation types
 *     "vector_weight": 0.5,               // Weight for vector similarity
 *     "graph_weight": 0.5,                // Weight for graph connectivity
 *     "vector_top_k": 20,                 // Initial vector search results
 *     "top_k": 10,                        // Final results to return
 *     "include_entity_context": true,     // Include entity info in results
 *     "mode": "hybrid"                    // "hybrid" | "multi_hop" | "focused"
 *   },
 *   "focus": {                            // Only for mode: "focused"
 *     "entity_ids": ["uuid", ...],        // Focus on specific entities
 *     "relation_types": ["is_a", ...],    // Focus relation types
 *     "expand_context": true              // Expand context around focus
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "chunks": [
 *     {
 *       "id": "chunk_uuid",
 *       "content": "...",
 *       "score": 0.85,
 *       "vector_score": 0.8,
 *       "graph_score": 0.9,
 *       "metadata": { ... }
 *     }
 *   ],
 *   "entities": [...],
 *   "relations": [...],
 *   "paths": [...],
 *   "context": "Formatted context string",
 *   "latency_ms": 125
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
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    // Validate required fields
    const query = body?.query;
    const collectionId = body?.collection_id;

    if (!query || typeof query !== 'string') {
      return ValidationErrors.missingField('query');
    }

    if (!collectionId || typeof collectionId !== 'string') {
      return ValidationErrors.missingField('collection_id');
    }

    // Parse options
    const rawOptions = (body?.options || {}) as Record<string, unknown>;
    const mode = rawOptions.mode || 'hybrid';

    // Validate mode
    if (!['hybrid', 'multi_hop', 'focused'].includes(mode as string)) {
      return ValidationErrors.invalidField('options.mode', 'must be hybrid, multi_hop, or focused');
    }

    // Build retrieval options
    const options: GraphRetrievalOptions = {};

    if (typeof rawOptions.max_depth === 'number') {
      if (rawOptions.max_depth < 1 || rawOptions.max_depth > 5) {
        return ValidationErrors.invalidField('options.max_depth', 'must be between 1 and 5');
      }
      options.maxDepth = rawOptions.max_depth;
    }

    if (rawOptions.direction !== undefined) {
      if (!['outgoing', 'incoming', 'both'].includes(rawOptions.direction as string)) {
        return ValidationErrors.invalidField('options.direction', 'must be outgoing, incoming, or both');
      }
      options.direction = rawOptions.direction as 'outgoing' | 'incoming' | 'both';
    }

    if (Array.isArray(rawOptions.relation_types)) {
      options.relationTypes = rawOptions.relation_types as RelationType[];
    }

    if (typeof rawOptions.vector_weight === 'number') {
      if (rawOptions.vector_weight < 0 || rawOptions.vector_weight > 1) {
        return ValidationErrors.invalidField('options.vector_weight', 'must be between 0 and 1');
      }
      options.vectorWeight = rawOptions.vector_weight;
    }

    if (typeof rawOptions.graph_weight === 'number') {
      if (rawOptions.graph_weight < 0 || rawOptions.graph_weight > 1) {
        return ValidationErrors.invalidField('options.graph_weight', 'must be between 0 and 1');
      }
      options.graphWeight = rawOptions.graph_weight;
    }

    if (typeof rawOptions.vector_top_k === 'number') {
      if (rawOptions.vector_top_k < 1 || rawOptions.vector_top_k > 100) {
        return ValidationErrors.invalidField('options.vector_top_k', 'must be between 1 and 100');
      }
      options.vectorTopK = rawOptions.vector_top_k;
    }

    if (typeof rawOptions.top_k === 'number') {
      if (rawOptions.top_k < 1 || rawOptions.top_k > 50) {
        return ValidationErrors.invalidField('options.top_k', 'must be between 1 and 50');
      }
      options.topK = rawOptions.top_k;
    }

    if (rawOptions.include_entity_context !== undefined) {
      options.includeEntityContext = Boolean(rawOptions.include_entity_context);
    }

    const config = {
      userId,
      collectionId,
    };

    // Execute retrieval based on mode
    let result;

    if (mode === 'multi_hop') {
      const hops = typeof rawOptions.hops === 'number' ? rawOptions.hops : 2;
      result = await multiHopRetrieve(config, query, hops, options);
    } else if (mode === 'focused') {
      const focus = (body?.focus || {}) as Record<string, unknown>;
      const focusOptions = {
        focusEntityIds: Array.isArray(focus.entity_ids)
          ? focus.entity_ids as string[]
          : undefined,
        focusRelationTypes: Array.isArray(focus.relation_types)
          ? focus.relation_types as RelationType[]
          : undefined,
        expandContext: focus.expand_context !== false,
      };
      result = await focusedRetrieve(config, query, focusOptions, options);
    } else {
      // Default: hybrid
      result = await retrieve(config, query, options);
    }

    // Build context string
    const context = buildContext(result);

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/graph-rag/search', method: 'POST', startTime },
      200
    );

    const response = NextResponse.json(
      {
        success: true,
        chunks: result.chunks,
        entities: result.entities,
        relations: result.relations,
        paths: result.paths,
        context,
        latency_ms: result.latencyMs,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Graph search error:', error);
    return ServerErrors.internal('graph_search');
  }
}

/**
 * GET /api/graph-rag/search
 *
 * Returns API documentation for the search endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/graph-rag/search',
    method: 'POST',
    description: 'Graph-augmented retrieval combining vector search with graph traversal',
    authentication: 'Authorization: Bearer <api-key> header required',
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
          max_depth: {
            type: 'number',
            default: 2,
            range: '1-5',
            description: 'Maximum graph traversal depth',
          },
          direction: {
            type: 'string',
            enum: ['outgoing', 'incoming', 'both'],
            default: 'both',
            description: 'Direction of graph traversal',
          },
          relation_types: {
            type: 'array',
            description: 'Filter by relation types',
            enum: [
              'is_a',
              'part_of',
              'belongs_to',
              'causes',
              'requires',
              'depends_on',
              'authored_by',
              'affiliated_with',
              'located_in',
              'occurred_at',
              'compares_to',
              'contrasts_with',
            ],
          },
          vector_weight: {
            type: 'number',
            default: 0.5,
            range: '0-1',
            description: 'Weight for vector similarity',
          },
          graph_weight: {
            type: 'number',
            default: 0.5,
            range: '0-1',
            description: 'Weight for graph connectivity',
          },
          vector_top_k: {
            type: 'number',
            default: 20,
            range: '1-100',
            description: 'Initial vector search results',
          },
          top_k: {
            type: 'number',
            default: 10,
            range: '1-50',
            description: 'Final results to return',
          },
          include_entity_context: {
            type: 'boolean',
            default: true,
            description: 'Include entity info in results',
          },
          mode: {
            type: 'string',
            enum: ['hybrid', 'multi_hop', 'focused'],
            default: 'hybrid',
            description: 'Retrieval mode',
          },
          hops: {
            type: 'number',
            default: 2,
            description: 'Number of hops for multi_hop mode',
          },
        },
      },
      focus: {
        type: 'object',
        required: false,
        description: 'Focus options (only for mode: focused)',
        properties: {
          entity_ids: {
            type: 'array',
            description: 'Entity IDs to focus on',
          },
          relation_types: {
            type: 'array',
            description: 'Focus relation types',
          },
          expand_context: {
            type: 'boolean',
            default: true,
            description: 'Expand context around focus',
          },
        },
      },
    },
    response: {
      success: 'boolean',
      chunks: {
        type: 'array',
        item_schema: {
          id: 'Chunk ID',
          content: 'Chunk text content',
          score: 'Combined score',
          vector_score: 'Vector similarity score',
          graph_score: 'Graph connectivity score',
          metadata: 'Chunk metadata',
        },
      },
      entities: 'Array of related entities',
      relations: 'Array of connecting relations',
      paths: 'Array of graph paths traversed',
      context: 'Formatted context string for LLM',
      latency_ms: 'Processing time in milliseconds',
    },
    examples: {
      basic: {
        query: 'What is the relationship between React and Next.js?',
        collection_id: 'uuid-here',
      },
      multi_hop: {
        query: 'Who founded the company that created GPT-4?',
        collection_id: 'uuid-here',
        options: {
          mode: 'multi_hop',
          hops: 3,
        },
      },
      focused: {
        query: 'Explain OpenAI products',
        collection_id: 'uuid-here',
        options: {
          mode: 'focused',
        },
        focus: {
          entity_ids: ['entity-uuid-1'],
          relation_types: ['part_of', 'authored_by'],
        },
      },
    },
  });
}
