/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  ValidationErrors,
  ServerErrors,
} from '@/lib/api-error';
import { indexDocuments } from '@/lib/summer/indexer';
import { estimateTokens } from '@/lib/summer/utils/tokens';
import { logServerError } from '@/lib/server/logger';
import type {
  IndexRequest,
  IndexResponse,
  ChunkingStrategy,
  EmbeddingModel,
} from '@/lib/summer/types';

// Valid chunking strategies
const VALID_CHUNKING_STRATEGIES: ChunkingStrategy[] = [
  'sliding_window',
  'sentence',
  'paragraph',
  'semantic',
];

// Valid embedding models
const VALID_EMBEDDING_MODELS: EmbeddingModel[] = [
  'voyage-3',
  'voyage-3-lite',
  'voyage-code-3',
  'voyage-finance-2',
];

/**
 * POST /api/summer/index
 *
 * Index documents into the Summer RAG vector store.
 *
 * Request body:
 * {
 *   "collection_id": "uuid",
 *   "documents": [
 *     {
 *       "id": "optional-external-id",
 *       "content": "document content to index",
 *       "metadata": { "key": "value" },
 *       "title": "optional title",
 *       "source": "optional source url"
 *     }
 *   ],
 *   "options": {
 *     "chunking_strategy": "sliding_window" | "sentence" | "paragraph" | "semantic",
 *     "chunk_size": 512,
 *     "chunk_overlap": 64,
 *     "embedding_model": "voyage-3" | "voyage-3-lite" | "voyage-code-3" | "voyage-finance-2",
 *     "skip_duplicates": false
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "indexed_count": 5,
 *   "chunks_created": 25,
 *   "duration_ms": 1234,
 *   "results": [
 *     {
 *       "document_id": "uuid",
 *       "external_id": "optional-external-id",
 *       "chunk_count": 5,
 *       "status": "created" | "updated" | "skipped" | "error"
 *     }
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId: string | undefined;
  let keyId: string | undefined;

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    userId = authResult.userId;
    keyId = authResult.keyId;
    const { plan, rateLimitHeaders } = authResult;

    // Parse request body
    let body: IndexRequest;
    try {
      body = await request.json();
    } catch {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidBody('Invalid JSON in request body');
    }

    // Validate collection_id
    const collectionId = body?.collection_id;
    if (!collectionId || typeof collectionId !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('collection_id');
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(collectionId)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidFormat('collection_id', 'UUID');
    }

    // Validate documents array
    const documents = body?.documents;
    if (!Array.isArray(documents) || documents.length === 0) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('documents');
    }

    // Validate individual documents
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      if (!doc || typeof doc !== 'object') {
        await logRequest(
          { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
          400
        );
        return ValidationErrors.invalidField(`documents[${i}]`, 'must be an object');
      }
      if (!doc.content || typeof doc.content !== 'string') {
        await logRequest(
          { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
          400
        );
        return ValidationErrors.missingField(`documents[${i}].content`);
      }
    }

    // Validate options
    const options = body?.options ?? {};

    if (
      options.chunking_strategy &&
      !VALID_CHUNKING_STRATEGIES.includes(options.chunking_strategy)
    ) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidField(
        'options.chunking_strategy',
        `must be one of: ${VALID_CHUNKING_STRATEGIES.join(', ')}`
      );
    }

    if (options.embedding_model && !VALID_EMBEDDING_MODELS.includes(options.embedding_model)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidField(
        'options.embedding_model',
        `must be one of: ${VALID_EMBEDDING_MODELS.join(', ')}`
      );
    }

    if (options.chunk_size !== undefined) {
      if (typeof options.chunk_size !== 'number' || options.chunk_size < 64 || options.chunk_size > 8192) {
        await logRequest(
          { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
          400
        );
        return ValidationErrors.invalidField('options.chunk_size', 'must be between 64 and 8192');
      }
    }

    if (options.chunk_overlap !== undefined) {
      if (
        typeof options.chunk_overlap !== 'number' ||
        options.chunk_overlap < 0 ||
        options.chunk_overlap >= (options.chunk_size ?? 512)
      ) {
        await logRequest(
          { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
          400
        );
        return ValidationErrors.invalidField('options.chunk_overlap', 'must be >= 0 and less than chunk_size');
      }
    }

    // Execute indexing
    const result: IndexResponse = await indexDocuments({
      userId,
      collectionId,
      documents,
      options,
    });

    // Calculate approximate embedding tokens for usage tracking
    const approxEmbeddingTokens = documents
      .map((d: any) => estimateTokens(String(d?.content ?? '')))
      .reduce((a: number, b: number) => a + b, 0);

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
      200,
      { embedding: approxEmbeddingTokens }
    );

    // Build response
    const response = NextResponse.json({
      success: result.success,
      plan,
      indexed_count: result.indexed_count,
      chunks_created: result.chunks_created,
      duration_ms: result.duration_ms,
      results: result.results,
    });

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (err) {
    logServerError('Summer index error', err, { userId, keyId });

    // Log error
    if (userId && keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/summer/index', method: 'POST', startTime },
        500
      ).catch((logError) => {
        logServerError('Summer index failure log failed', logError, { userId, keyId });
      });
    }

    // Return appropriate error response
    if (err instanceof Error) {
      if (err.message.includes('VOYAGE_API_KEY')) {
        return ServerErrors.embedding();
      }
      if (err.message.includes('collection') || err.message.includes('foreign key')) {
        return ValidationErrors.invalidField('collection_id', 'Collection not found or access denied');
      }
    }

    return ServerErrors.internal('indexing');
  }
}
