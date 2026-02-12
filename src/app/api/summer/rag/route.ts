import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { ragQuery, ragQueryStream } from '@/lib/summer/rag-pipeline';
import type { RAGOptions, RAGStreamChunk } from '@/lib/summer/rag-pipeline';
import { hasFeature } from '@/lib/plan-limits';
import { buildCorsPreflightHeaders } from '@/lib/security/cors';

// ===========================================
// Request/Response Types
// ===========================================

interface RAGRequestBody {
  query: string;
  collection_id: string;
  options?: RAGOptions;
}

// ===========================================
// POST /api/summer/rag
// ===========================================

/**
 * RAG Query Endpoint
 *
 * Full RAG pipeline: search -> rerank -> context -> LLM -> answer with sources
 *
 * Request:
 * {
 *   "query": "What is the capital of France?",
 *   "collection_id": "uuid",
 *   "options": {
 *     "search_type": "hybrid",      // semantic | keyword | hybrid
 *     "rerank": true,               // Enable reranking (requires plan support)
 *     "llm_model": "claude-3-5-haiku", // claude-3-5-sonnet | claude-3-5-haiku | gpt-4o | gpt-4o-mini
 *     "max_tokens": 2048,           // Max output tokens
 *     "stream": false,              // Enable streaming (SSE)
 *     "temperature": 0.3,           // LLM temperature
 *     "top_k": 10,                  // Top-K results
 *     "rerank_top_n": 20,           // Rerank top-N candidates
 *     "federated": false,           // Enable federated search
 *     "system_prompt": "...",       // Custom system prompt
 *     "include_trace": false        // Include detailed trace in response
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "answer": "The capital of France is Paris [chunk_123].",
 *   "sources": [
 *     { "id": "chunk_123", "content": "...", "score": 0.92, "documentId": "...", "metadata": {...} }
 *   ],
 *   "usage": {
 *     "embedding_tokens": 12,
 *     "llm_input_tokens": 1500,
 *     "llm_output_tokens": 150,
 *     "total_cost_credits": 0.0045
 *   },
 *   "latency_ms": 1234,
 *   "trace_id": "uuid",
 *   "trace": {...}  // If include_trace is true
 * }
 *
 * Streaming Response (SSE):
 * data: {"type":"content","content":"The capital"}
 * data: {"type":"content","content":" of France"}
 * data: {"type":"content","content":" is Paris"}
 * data: {"type":"sources","sources":[...]}
 * data: {"type":"usage","usage":{...},"latency_ms":1234,"trace_id":"uuid"}
 * data: {"type":"done"}
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

    // Check RAG feature availability
    if (!hasFeature(plan, 'ragQuery')) {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rag', method: 'POST', startTime }, 403);
      return NextResponse.json(
        {
          error: {
            code: 'FEATURE_NOT_AVAILABLE',
            message: 'RAG query is not available on your current plan. Please upgrade to access this feature.',
            docs_url: 'https://www.seizn.com/docs#pricing',
          },
        },
        { status: 403 }
      );
    }

    // Parse request body
    const body: RAGRequestBody = await request.json();
    const { query, collection_id, options } = body;

    // Validate required fields
    if (!query || typeof query !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rag', method: 'POST', startTime }, 400);
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'query (string) is required',
          },
        },
        { status: 400 }
      );
    }

    if (!collection_id || typeof collection_id !== 'string') {
      await logRequest({ userId, keyId, endpoint: '/api/summer/rag', method: 'POST', startTime }, 400);
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'collection_id (string) is required',
          },
        },
        { status: 400 }
      );
    }

    // Validate options
    if (options) {
      if (options.search_type && !['semantic', 'keyword', 'hybrid'].includes(options.search_type)) {
        await logRequest({ userId, keyId, endpoint: '/api/summer/rag', method: 'POST', startTime }, 400);
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_REQUEST',
              message: 'options.search_type must be one of: semantic, keyword, hybrid',
            },
          },
          { status: 400 }
        );
      }

      if (
        options.llm_model &&
        !['claude-3-5-sonnet', 'claude-3-5-haiku', 'gpt-4o', 'gpt-4o-mini'].includes(options.llm_model)
      ) {
        await logRequest({ userId, keyId, endpoint: '/api/summer/rag', method: 'POST', startTime }, 400);
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_REQUEST',
              message:
                'options.llm_model must be one of: claude-3-5-sonnet, claude-3-5-haiku, gpt-4o, gpt-4o-mini',
            },
          },
          { status: 400 }
        );
      }
    }

    // Check if streaming is requested
    const isStreaming = options?.stream === true;

    if (isStreaming) {
      // Streaming response (SSE)
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const ragStream = ragQueryStream({
              userId,
              apiKeyId: keyId,
              plan,
              collectionId: collection_id,
              query,
              options,
            });

            for await (const chunk of ragStream) {
              const data = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(encoder.encode(data));

              // Log usage when done
              if (chunk.type === 'usage') {
                logRequest(
                  { userId, keyId, endpoint: '/api/summer/rag', method: 'POST', startTime },
                  200,
                  {
                    input: chunk.usage?.llm_input_tokens,
                    output: chunk.usage?.llm_output_tokens,
                    embedding: chunk.usage?.embedding_tokens,
                  }
                ).catch(console.error);
              }
            }

            controller.close();
          } catch (error) {
            const errorChunk: RAGStreamChunk = {
              type: 'error',
              error: error instanceof Error ? error.message : 'Internal server error',
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
            controller.close();

            logRequest(
              { userId, keyId, endpoint: '/api/summer/rag', method: 'POST', startTime },
              500
            ).catch(console.error);
          }
        },
      });

      const response = new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });

      // Add rate limit headers
      if (rateLimitHeaders) {
        Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
      }

      return response;
    }

    // Non-streaming response
    const result = await ragQuery({
      userId,
      apiKeyId: keyId,
      plan,
      collectionId: collection_id,
      query,
      options,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/summer/rag', method: 'POST', startTime },
      200,
      {
        input: result.usage.llm_input_tokens,
        output: result.usage.llm_output_tokens,
        embedding: result.usage.embedding_tokens,
      }
    );

    const response = NextResponse.json(
      {
        success: true,
        answer: result.answer,
        sources: result.sources,
        usage: result.usage,
        latency_ms: result.latency_ms,
        trace_id: result.trace_id,
        trace: result.trace,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Summer RAG error:', error);

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}

// ===========================================
// OPTIONS (CORS preflight)
// ===========================================

export async function OPTIONS(request: NextRequest) {
  const headers = buildCorsPreflightHeaders(
    request,
    'POST, OPTIONS',
    'Content-Type, x-api-key, Authorization'
  );

  if (!headers) {
    return NextResponse.json(
      {
        error: {
          code: 'CORS_ORIGIN_NOT_ALLOWED',
          message: 'Origin is not allowed',
        },
      },
      { status: 403 }
    );
  }

  return new NextResponse(null, {
    status: 204,
    headers,
  });
}
