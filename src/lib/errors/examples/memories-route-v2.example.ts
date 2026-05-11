/**
 * Example: Applying the new error system V2 to /api/memories route
 *
 * This file demonstrates how to use the V2 error system with request_id support.
 * All responses include trace_id and request_id at the top level.
 *
 * Key changes from V1:
 * 1. Use withRequestContext() wrapper instead of withErrorHandler()
 * 2. Use createRequestContext() to get ctx with traceId, requestId, startTime
 * 3. Use successResponse() and errorResponse() which take ctx as parameter
 * 4. Use parseJsonBodyV2() and validateRequiredFieldsV2() with ctx
 *
 * Response Format:
 * Success: { "success": true, "data": {...}, "trace_id": "...", "request_id": "...", "meta": {...} }
 * Error:   { "success": false, "error": {...}, "trace_id": "...", "request_id": "..." }
 *
 * @example
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createEmbedding, createQueryEmbedding } from '@/lib/ai';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  // V2 imports
  withRequestContext,
  createRequestContext,
  successResponse,
  errorResponse,
  parseJsonBodyV2,
  validateRequiredFieldsV2,
  ValidationErrorsV2,
  ResourceErrorsV2,
  type RequestContext,
  // Error codes
  SEIZN_ERROR_CODES,
} from '@/lib/errors';
import { trackMemoryAccess } from '@/lib/memory-optimizer';
import { logMemoryAccess } from '@/lib/audit';
import type { AddMemoryRequest } from '@/types/database';

// ============================================
// POST /api/memories - Add a new memory (V2)
// ============================================

export const POST = withRequestContext(async (request: NextRequest, ctx: RequestContext) => {
  // 1. Authenticate request
  const authResult = await authenticateRequest(request);
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId } = authResult;

  // 2. Parse and validate request body
  const parsed = await parseJsonBodyV2<AddMemoryRequest>(request, ctx);
  if ('error' in parsed) {
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime: ctx.startTime },
      400
    );
    return parsed.error;
  }

  const body = parsed.data;

  // 3. Validate required fields
  const validation = validateRequiredFieldsV2(body as unknown as Record<string, unknown>, ['content'], ctx);
  if (!validation.valid) {
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime: ctx.startTime },
      400
    );
    return validation.error;
  }

  // 4. Additional validation: content must not be empty after trim
  const content = body.content ?? '';
  if (content.trim().length === 0) {
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime: ctx.startTime },
      400
    );
    return ValidationErrorsV2.missingField('content', ctx);
  }

  // 5. Validate memory_type enum if provided
  const validMemoryTypes = ['fact', 'preference', 'experience', 'relationship', 'instruction'];
  if (body.memory_type && !validMemoryTypes.includes(body.memory_type)) {
    return ValidationErrorsV2.invalidEnumValue(
      'memory_type',
      body.memory_type,
      validMemoryTypes,
      ctx
    );
  }

  const supabase = createServerClient();

  // 6. Create embedding for the memory content
  let embedding: number[];
  try {
    embedding = await createEmbedding(content);
  } catch (error) {
    console.error(`[${ctx.traceId}][${ctx.requestId}] Embedding error:`, error);
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime: ctx.startTime },
      502
    );
    return errorResponse(
      {
        code: SEIZN_ERROR_CODES.EMBEDDING_FAILED,
        message: 'Failed to generate embedding',
        status: 502,
        details: { reason: error instanceof Error ? error.message : 'Unknown error' },
      },
      ctx
    );
  }

  // 7. Insert memory into database
  const { data: memory, error: insertError } = await supabase
    .from('memories')
    .insert({
      user_id: userId,
      content,
      embedding: embedding,
      memory_type: body.memory_type || 'fact',
      tags: body.tags || [],
      namespace: body.namespace || 'default',
      scope: body.scope || 'user',
      session_id: body.session_id || null,
      agent_id: body.agent_id || null,
      source: body.source || 'api',
      confidence: 1.0,
      importance: 5,
      is_encrypted: false,
      is_deleted: false,
      deleted_at: null,
    })
    .select('id, content, memory_type, tags, namespace, created_at')
    .single();

  if (insertError) {
    console.error(`[${ctx.traceId}][${ctx.requestId}] Insert error:`, insertError);
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime: ctx.startTime },
      500
    );
    return errorResponse(
      {
        code: SEIZN_ERROR_CODES.DATABASE_ERROR,
        message: 'Database operation failed: insert_memory',
        status: 500,
        details: { operation: 'insert_memory' },
      },
      ctx
    );
  }

  // 8. Log successful request
  await logRequest(
    { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime: ctx.startTime },
    200,
    { embedding: content.length }
  );

  // 9. Return success response with trace_id and request_id at top level
  return successResponse(
    { memory },
    ctx,
    { operation: 'create' }
  );
});

// ============================================
// GET /api/memories - Search memories (V2)
// ============================================

export const GET = withRequestContext(async (request: NextRequest, ctx: RequestContext) => {
  // 1. Authenticate request
  const authResult = await authenticateRequest(request);
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId } = authResult;
  const { searchParams } = new URL(request.url);

  // 2. Validate query parameter
  const query = searchParams.get('query');
  if (!query || query.trim() === '') {
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime: ctx.startTime },
      400
    );
    return ValidationErrorsV2.missingField('query', ctx);
  }

  // 3. Parse search parameters with validation
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 10;
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return errorResponse(
      {
        code: SEIZN_ERROR_CODES.FIELD_OUT_OF_RANGE,
        message: `Field "limit" value ${limit} is out of range (min: 1, max: 100)`,
        details: { field: 'limit', value: limit, min: 1, max: 100 },
      },
      ctx
    );
  }

  const thresholdParam = searchParams.get('threshold');
  const threshold = thresholdParam ? parseFloat(thresholdParam) : 0.7;
  if (isNaN(threshold) || threshold < 0 || threshold > 1) {
    return errorResponse(
      {
        code: SEIZN_ERROR_CODES.FIELD_OUT_OF_RANGE,
        message: `Field "threshold" value ${threshold} is out of range (min: 0, max: 1)`,
        details: { field: 'threshold', value: threshold, min: 0, max: 1 },
      },
      ctx
    );
  }

  const namespace = searchParams.get('namespace') || null;
  const mode = searchParams.get('mode') || 'vector';

  // 4. Validate search mode
  const validModes = ['vector', 'hybrid', 'keyword'];
  if (!validModes.includes(mode)) {
    return ValidationErrorsV2.invalidEnumValue('mode', mode, validModes, ctx);
  }

  const supabase = createServerClient();

  // 5. Execute search based on mode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let results: any[] | null = null;
  let searchError: Error | null = null;

  try {
    if (mode === 'keyword') {
      const { data, error } = await supabase.rpc('keyword_search_memories', {
        query_text: query,
        match_user_id: userId,
        match_count: limit,
        match_namespace: namespace,
      });
      results = data;
      searchError = error;
    } else if (mode === 'hybrid') {
      const queryEmbedding = await createQueryEmbedding(query);
      const { data, error } = await supabase.rpc('hybrid_search_memories', {
        query_text: query,
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: limit,
        match_threshold: threshold,
        match_namespace: namespace,
        keyword_weight: 0.3,
        vector_weight: 0.7,
      });
      results = data;
      searchError = error;
    } else {
      const queryEmbedding = await createQueryEmbedding(query);
      const { data, error } = await supabase.rpc('search_memories', {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: limit,
        match_threshold: threshold,
        match_namespace: namespace,
      });
      results = data;
      searchError = error;
    }
  } catch (error) {
    console.error(`[${ctx.traceId}][${ctx.requestId}] Search error:`, error);
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime: ctx.startTime },
      502
    );

    if (error instanceof Error && error.message.includes('embedding')) {
      return errorResponse(
        {
          code: SEIZN_ERROR_CODES.EMBEDDING_FAILED,
          message: 'Failed to generate embedding',
          status: 502,
          details: { reason: error.message },
        },
        ctx
      );
    }
    return errorResponse(
      {
        code: SEIZN_ERROR_CODES.DATABASE_ERROR,
        message: 'Database operation failed: search_memories',
        status: 500,
        details: { operation: 'search_memories' },
      },
      ctx
    );
  }

  if (searchError) {
    console.error(`[${ctx.traceId}][${ctx.requestId}] Search error:`, searchError);
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime: ctx.startTime },
      500
    );
    return errorResponse(
      {
        code: SEIZN_ERROR_CODES.DATABASE_ERROR,
        message: 'Database operation failed: search_memories',
        status: 500,
        details: { operation: 'search_memories' },
      },
      ctx
    );
  }

  // 6. Log successful request
  await logRequest(
    { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime: ctx.startTime },
    200,
    { embedding: mode !== 'keyword' ? query.length : 0 }
  );

  // 7. Track access for returned memories (background, non-blocking)
  if (results && results.length > 0) {
    Promise.all(
      results.map((m: { id: string }) => trackMemoryAccess(m.id))
    ).catch(console.error);
  }

  // 8. Audit log (non-blocking)
  logMemoryAccess(request, userId, keyId, 'search', {
    memoryCount: results?.length || 0,
    query,
  }).catch(console.error);

  // 9. Return success response with trace_id and request_id at top level
  return successResponse(
    {
      mode,
      results: results || [],
      count: results?.length || 0,
    },
    ctx,
    { operation: 'search' }
  );
});

// ============================================
// GET /api/memories/:id - Get single memory (V2)
// ============================================

export async function getMemoryById(
  request: NextRequest,
  memoryId: string
): Promise<NextResponse> {
  const ctx = createRequestContext(request);

  // 1. Authenticate request
  const authResult = await authenticateRequest(request, { skipUsageCheck: true });
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId } = authResult;

  // 2. Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(memoryId)) {
    return errorResponse(
      {
        code: SEIZN_ERROR_CODES.INVALID_FORMAT,
        message: 'Invalid format for field "id": expected UUID format',
        details: { field: 'id', expected_format: 'UUID' },
      },
      ctx
    );
  }

  const supabase = createServerClient();

  // 3. Fetch memory
  const { data: memory, error } = await supabase
    .from('memories')
    .select('id, content, memory_type, tags, namespace, created_at, updated_at')
    .eq('id', memoryId)
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .single();

  if (error || !memory) {
    console.error(`[${ctx.traceId}][${ctx.requestId}] Fetch memory error:`, error);
    await logRequest(
      { userId, keyId, endpoint: `/api/memories/${memoryId}`, method: 'GET', startTime: ctx.startTime },
      404
    );
    return ResourceErrorsV2.notFound('Memory', memoryId, ctx);
  }

  // 4. Log successful request
  await logRequest(
    { userId, keyId, endpoint: `/api/memories/${memoryId}`, method: 'GET', startTime: ctx.startTime },
    200
  );

  // 5. Track access (non-blocking)
  trackMemoryAccess(memoryId).catch(console.error);

  // 6. Return success response with trace_id and request_id at top level
  return successResponse({ memory }, ctx);
}
