/**
 * Example: Applying the new error system to /api/memories route
 *
 * This file demonstrates how to migrate existing API routes to use
 * the new standardized error system with SEIZN_XXX error codes.
 *
 * Key changes from the old system:
 * 1. Import from '@/lib/errors' instead of '@/lib/api-error'
 * 2. Use generateTraceId() for request tracking
 * 3. Use withErrorHandler() wrapper for automatic error handling
 * 4. Use parseJsonBody() for type-safe JSON parsing
 * 5. Use validateRequiredFields() for field validation
 * 6. Use createSuccessResponse() for consistent success responses
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
  // Error helpers
  ValidationErrors,
  ResourceErrors,
  ExternalErrors,
  InternalErrors,
  // Middleware utilities
  withErrorHandler,
  parseJsonBody,
  validateRequiredFields,
  createSuccessResponse,
  generateTraceId,
  // Types
  type SeizApiErrorResponse,
} from '@/lib/errors';
import { trackMemoryAccess } from '@/lib/memory-optimizer';
import { logMemoryAccess } from '@/lib/audit';
import type { AddMemoryRequest } from '@/types/database';

// ============================================
// POST /api/memories - Add a new memory
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
  const startTime = Date.now();
  const traceId = generateTraceId();

  // 1. Authenticate request
  const authResult = await authenticateRequest(request);
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId } = authResult;

  // 2. Parse and validate request body
  const parsed = await parseJsonBody<AddMemoryRequest>(request, traceId);
  if ('error' in parsed) {
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
      400
    );
    return parsed.error;
  }

  const body = parsed.data;

  // 3. Validate required fields
  const validation = validateRequiredFields(body as unknown as Record<string, unknown>, ['content'], traceId);
  if (!validation.valid) {
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
      400
    );
    return validation.error;
  }

  // 4. Additional validation: content must not be empty after trim
  if (body.content.trim().length === 0) {
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
      400
    );
    return ValidationErrors.missingField('content', traceId);
  }

  // 5. Validate memory_type enum if provided
  const validMemoryTypes = ['fact', 'preference', 'experience', 'relationship', 'instruction'];
  if (body.memory_type && !validMemoryTypes.includes(body.memory_type)) {
    return ValidationErrors.invalidEnumValue(
      'memory_type',
      body.memory_type,
      validMemoryTypes,
      traceId
    );
  }

  const supabase = createServerClient();

  // 6. Create embedding for the memory content
  let embedding: number[];
  try {
    embedding = await createEmbedding(body.content);
  } catch (error) {
    console.error(`[${traceId}] Embedding error:`, error);
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
      502
    );
    return ExternalErrors.embeddingFailed(
      error instanceof Error ? error.message : 'Unknown error',
      traceId
    );
  }

  // 7. Insert memory into database
  const { data: memory, error: insertError } = await supabase
    .from('memories')
    .insert({
      user_id: userId,
      content: body.content,
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
    })
    .select('id, content, memory_type, tags, namespace, created_at')
    .single();

  if (insertError) {
    console.error(`[${traceId}] Insert error:`, insertError);
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
      500
    );
    return ExternalErrors.databaseError('insert_memory', traceId);
  }

  // 8. Log successful request
  await logRequest(
    { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
    200,
    { embedding: body.content.length }
  );

  // 9. Return success response
  const latencyMs = Date.now() - startTime;
  return createSuccessResponse(
    { memory },
    { operation: 'create' },
    traceId,
    latencyMs
  );
});

// ============================================
// GET /api/memories - Search memories
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
  const startTime = Date.now();
  const traceId = generateTraceId();

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
      { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
      400
    );
    return ValidationErrors.missingField('query', traceId);
  }

  // 3. Parse search parameters with validation
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 10;
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return ValidationErrors.fieldOutOfRange('limit', limit, 1, 100, traceId);
  }

  const thresholdParam = searchParams.get('threshold');
  const threshold = thresholdParam ? parseFloat(thresholdParam) : 0.7;
  if (isNaN(threshold) || threshold < 0 || threshold > 1) {
    return ValidationErrors.fieldOutOfRange('threshold', threshold, 0, 1, traceId);
  }

  const namespace = searchParams.get('namespace') || null;
  const mode = searchParams.get('mode') || 'vector';

  // 4. Validate search mode
  const validModes = ['vector', 'hybrid', 'keyword'];
  if (!validModes.includes(mode)) {
    return ValidationErrors.invalidEnumValue('mode', mode, validModes, traceId);
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
    console.error(`[${traceId}] Search error:`, error);
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
      502
    );

    if (error instanceof Error && error.message.includes('embedding')) {
      return ExternalErrors.embeddingFailed(error.message, traceId);
    }
    return ExternalErrors.databaseError('search_memories', traceId);
  }

  if (searchError) {
    console.error(`[${traceId}] Search error:`, searchError);
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
      500
    );
    return ExternalErrors.databaseError('search_memories', traceId);
  }

  // 6. Log successful request
  await logRequest(
    { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
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

  // 9. Return success response
  const latencyMs = Date.now() - startTime;
  return createSuccessResponse(
    {
      mode,
      results: results || [],
      count: results?.length || 0,
    },
    { operation: 'search' },
    traceId,
    latencyMs
  );
});

// ============================================
// DELETE /api/memories - Delete memories by IDs
// ============================================

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const startTime = Date.now();
  const traceId = generateTraceId();

  // 1. Authenticate request
  const authResult = await authenticateRequest(request, { skipUsageCheck: true });
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId } = authResult;
  const { searchParams } = new URL(request.url);

  // 2. Validate IDs parameter
  const idsParam = searchParams.get('ids');
  if (!idsParam) {
    return ValidationErrors.missingField('ids', traceId);
  }

  const ids = idsParam.split(',').filter(Boolean);
  if (ids.length === 0) {
    return ValidationErrors.missingField('ids', traceId);
  }

  // 3. Validate array size
  if (ids.length > 100) {
    return ValidationErrors.fieldOutOfRange('ids', ids.length, 1, 100, traceId);
  }

  // 4. Validate UUID format for each ID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const id of ids) {
    if (!uuidRegex.test(id)) {
      return ValidationErrors.invalidFormat('ids', `UUID format (got: ${id})`, traceId);
    }
  }

  const supabase = createServerClient();

  // 5. Soft delete memories (only user's own)
  const { error, count } = await supabase
    .from('memories')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .in('id', ids)
    .eq('user_id', userId);

  if (error) {
    console.error(`[${traceId}] Delete error:`, error);
    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'DELETE', startTime },
      500
    );
    return ExternalErrors.databaseError('delete_memories', traceId);
  }

  // 6. Log successful request
  await logRequest(
    { userId, keyId, endpoint: '/api/memories', method: 'DELETE', startTime },
    200
  );

  // 7. Return success response
  const latencyMs = Date.now() - startTime;
  return createSuccessResponse(
    {
      deleted: count || ids.length,
      ids,
    },
    { operation: 'delete' },
    traceId,
    latencyMs
  );
});

// ============================================
// GET /api/memories/:id - Get single memory
// ============================================

export async function getMemoryById(
  request: NextRequest,
  memoryId: string
): Promise<NextResponse> {
  const startTime = Date.now();
  const traceId = generateTraceId();

  // 1. Authenticate request
  const authResult = await authenticateRequest(request, { skipUsageCheck: true });
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId } = authResult;

  // 2. Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(memoryId)) {
    return ValidationErrors.invalidFormat('id', 'UUID format', traceId);
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
    console.error(`[${traceId}] Fetch memory error:`, error);
    await logRequest(
      { userId, keyId, endpoint: `/api/memories/${memoryId}`, method: 'GET', startTime },
      404
    );
    return ResourceErrors.memoryNotFound(memoryId, traceId);
  }

  // 4. Log successful request
  await logRequest(
    { userId, keyId, endpoint: `/api/memories/${memoryId}`, method: 'GET', startTime },
    200
  );

  // 5. Track access (non-blocking)
  trackMemoryAccess(memoryId).catch(console.error);

  // 6. Return success response
  const latencyMs = Date.now() - startTime;
  return createSuccessResponse({ memory }, undefined, traceId, latencyMs);
}
