import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createEmbedding, createQueryEmbedding } from '@/lib/ai';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { trackMemoryAccess } from '@/lib/memory-optimizer';
import { logMemoryAccess } from '@/lib/audit';
import {
  getCachedQueryResults,
  setCachedQueryResults,
  incrementMemoryVersion,
  type CachedMemory,
} from '@/lib/memory/query-cache';
import { routeQuery, type SearchMode } from '@/lib/memory/auto-router';
import { detectSlotQuery, getSlots } from '@/lib/memory/slot';
import type { AddMemoryRequest } from '@/types/database';

// POST /api/memories - Add a new memory
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: AddMemoryRequest = await request.json();

    if (!body.content || body.content.trim().length === 0) {
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('content');
    }

    const supabase = createServerClient();
    const embedding = await createEmbedding(body.content);

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
      console.error('Insert error:', insertError);
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
        500
      );
      return ServerErrors.database('insert_memory');
    }

    // Invalidate cache for this namespace
    incrementMemoryVersion(userId, body.namespace || 'default').catch(console.error);

    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
      200,
      { embedding: body.content.length }
    );

    return NextResponse.json({
      success: true,
      memory: memory,
    });
  } catch (error) {
    console.error('Add memory error:', error);
    return ServerErrors.internal('add_memory');
  }
}

// GET /api/memories - Search memories
// Supports: mode=auto (default), mode=vector, mode=hybrid, mode=keyword, mode=slot
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const query = searchParams.get('query');
    if (!query) {
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
        400
      );
      return ValidationErrors.missingField('query');
    }

    const limit = parseInt(searchParams.get('limit') || '10');
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');
    const namespace = searchParams.get('namespace') || 'default';
    const requestedMode = (searchParams.get('mode') || 'auto') as SearchMode;

    // Auto router: determine best search strategy
    let actualMode: Exclude<SearchMode, 'auto'>;
    let routerDecision = null;

    if (requestedMode === 'auto') {
      routerDecision = routeQuery(query);
      actualMode = routerDecision.strategy;
    } else {
      actualMode = requestedMode as Exclude<SearchMode, 'auto'>;
    }

    // Handle slot lookups (O(1) deterministic)
    if (actualMode === 'slot') {
      const slotKey = detectSlotQuery(query);
      if (slotKey) {
        const slotValues = await getSlots(userId, [slotKey], namespace);
        const slotValue = slotValues.get(slotKey);

        await logRequest(
          { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
          200,
          { embedding: 0 }
        );

        logMemoryAccess(request, userId, keyId, 'read', {
          memoryId: `slot:${slotKey}`,
          query,
        }).catch(console.error);

        if (slotValue) {
          return NextResponse.json({
            success: true,
            mode: 'slot',
            requestedMode,
            results: [
              {
                id: `slot:${slotKey}`,
                content: slotValue,
                memory_type: 'fact',
                slot_key: slotKey,
                similarity: 1.0,
              },
            ],
            count: 1,
            cached: false,
            slot: { key: slotKey, value: slotValue },
            routerDecision: routerDecision
              ? {
                  strategy: routerDecision.strategy,
                  confidence: routerDecision.confidence,
                  reason: routerDecision.reason,
                }
              : null,
          });
        }

        // Slot not found, fall back to keyword search
        actualMode = 'keyword';
      } else {
        // No slot key detected, fall back to keyword
        actualMode = 'keyword';
      }
    }

    // Check query cache first
    const cacheResult = await getCachedQueryResults(userId, query, namespace, actualMode);
    if (cacheResult.hit && cacheResult.results.length > 0) {
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
        200,
        { embedding: 0 }
      );
      Promise.all(cacheResult.results.map((m) => trackMemoryAccess(m.id))).catch(console.error);
      logMemoryAccess(request, userId, keyId, 'search', {
        memoryCount: cacheResult.results.length,
        query,
      }).catch(console.error);

      return NextResponse.json({
        success: true,
        mode: actualMode,
        requestedMode,
        results: cacheResult.results,
        count: cacheResult.results.length,
        cached: true,
        routerDecision: routerDecision
          ? {
              strategy: routerDecision.strategy,
              confidence: routerDecision.confidence,
              reason: routerDecision.reason,
            }
          : null,
      });
    }

    // Cache miss - perform search
    const supabase = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let results: any[] | null = null;
    let searchError: Error | null = null;
    const nsParam = namespace === 'default' ? null : namespace;

    if (actualMode === 'keyword') {
      const { data, error } = await supabase.rpc('keyword_search_memories', {
        query_text: query,
        match_user_id: userId,
        match_count: limit,
        match_namespace: nsParam,
      });
      results = data;
      searchError = error;
    } else if (actualMode === 'hybrid') {
      const queryEmbedding = await createQueryEmbedding(query);
      const { data, error } = await supabase.rpc('hybrid_search_memories', {
        query_text: query,
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: limit,
        match_threshold: routerDecision?.suggestedParams.threshold || threshold,
        match_namespace: nsParam,
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
        match_threshold: routerDecision?.suggestedParams.threshold || threshold,
        match_namespace: nsParam,
      });
      results = data;
      searchError = error;
    }

    if (searchError) {
      console.error('Search error:', searchError);
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
        500
      );
      return ServerErrors.database('search_memories');
    }

    // Cache results for future queries
    if (results && results.length > 0) {
      const cacheableResults: CachedMemory[] = results.map((r) => ({
        id: r.id,
        content: r.content,
        memory_type: r.memory_type,
        importance: r.importance || 5,
        similarity: r.similarity,
        rrf_score: r.rrf_score,
      }));
      setCachedQueryResults(userId, query, namespace, actualMode, cacheableResults).catch(
        console.error
      );
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
      200,
      { embedding: actualMode !== 'keyword' ? query.length : 0 }
    );

    if (results && results.length > 0) {
      Promise.all(results.map((m: { id: string }) => trackMemoryAccess(m.id))).catch(
        console.error
      );
    }

    logMemoryAccess(request, userId, keyId, 'search', {
      memoryCount: results?.length || 0,
      query,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      mode: actualMode,
      requestedMode,
      results: results || [],
      count: results?.length || 0,
      cached: false,
      routerDecision: routerDecision
        ? {
            strategy: routerDecision.strategy,
            confidence: routerDecision.confidence,
            reason: routerDecision.reason,
          }
        : null,
    });
  } catch (error) {
    console.error('Search memory error:', error);
    return ServerErrors.internal('search_memories');
  }
}

// DELETE /api/memories - Delete memories by IDs
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const ids = searchParams.get('ids')?.split(',').filter(Boolean);
    if (!ids || ids.length === 0) {
      return ValidationErrors.missingField('ids');
    }

    const namespace = searchParams.get('namespace') || 'default';
    const supabase = createServerClient();

    const { error } = await supabase
      .from('memories')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('user_id', userId);

    if (error) {
      console.error('Delete error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'DELETE', startTime },
        500
      );
      return ServerErrors.database('delete_memories');
    }

    // Invalidate cache
    incrementMemoryVersion(userId, namespace).catch(console.error);

    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      deleted: ids.length,
    });
  } catch (error) {
    console.error('Delete memory error:', error);
    return ServerErrors.internal('delete_memories');
  }
}
