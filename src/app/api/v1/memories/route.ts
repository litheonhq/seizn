/**
 * REST API v1 - Memories
 *
 * POST   /api/v1/memories - Add a new memory
 * GET    /api/v1/memories - Search memories
 * DELETE /api/v1/memories - Delete memories by IDs
 *
 * Supports dual auth: API key (Bearer/x-api-key) first, session fallback.
 * Returns v1 envelope: { success, data, meta: { version: "v1" } }
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
import { auth } from '@/lib/auth';
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
import { boundedInt } from '@/lib/parse-params';
import { findDuplicate } from '@/lib/memory/dedup';
import { scoreImportance } from '@/lib/memory/auto-score';
import { emitWebhookEvent } from '@/lib/webhook-emit';
import type { AddMemoryRequest } from '@/types/database';

const META = { version: 'v1' as const };

/**
 * Resolve userId from API key auth or session auth.
 */
async function resolveAuth(
  request: NextRequest
): Promise<
  | { userId: string; keyId: string | null }
  | { error: NextResponse }
> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return { userId: authResult.userId, keyId: authResult.keyId };
  }

  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null };
  }

  return { error: authErrorResponse(authResult.authError) };
}

// POST /api/v1/memories
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await resolveAuth(request);
    if ('error' in result) return result.error;

    const { userId, keyId } = result;
    const body: AddMemoryRequest = await request.json();

    if (!body.content || body.content.trim().length === 0) {
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
          400
        );
      }
      return ValidationErrors.missingField('content');
    }

    const supabase = createServerClient();
    const embedding = await createEmbedding(body.content);
    const namespace = body.namespace || 'default';

    // Dedup check (opt-out with dedup=false)
    const dedupEnabled = (body as unknown as Record<string, unknown>).dedup !== false;
    if (dedupEnabled) {
      const duplicate = await findDuplicate(userId, embedding, namespace);
      if (duplicate) {
        if (keyId) {
          await logRequest(
            { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
            200
          );
        }
        return NextResponse.json({
          success: true,
          data: {
            memory: { id: duplicate.id, content: duplicate.content },
            deduplicated: true,
            similarity: duplicate.similarity,
          },
          meta: { ...META, latencyMs: Date.now() - startTime },
        });
      }
    }

    // Auto importance scoring (opt-in with auto_score=true)
    let importance = 5;
    if ((body as unknown as Record<string, unknown>).auto_score === true) {
      importance = await scoreImportance(body.content);
    }

    const { data: memory, error: insertError } = await supabase
      .from('memories')
      .insert({
        user_id: userId,
        content: body.content,
        embedding,
        memory_type: body.memory_type || 'fact',
        tags: body.tags || [],
        namespace,
        scope: body.scope || 'user',
        session_id: body.session_id || null,
        agent_id: body.agent_id || null,
        source: body.source || 'api',
        confidence: 1.0,
        importance,
      })
      .select('id, content, memory_type, tags, namespace, importance, created_at')
      .single();

    if (insertError) {
      console.error('[v1/memories] Insert error:', insertError);
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
          500
        );
      }
      return ServerErrors.database('insert_memory');
    }

    incrementMemoryVersion(userId, namespace).catch(console.error);

    // Emit webhook event (non-blocking)
    emitWebhookEvent(userId, 'memory.created', {
      memory: { id: memory.id, content: memory.content, memory_type: memory.memory_type },
    }, namespace).catch(console.error);

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
        200,
        { embedding: body.content.length }
      );
    }

    return NextResponse.json({
      success: true,
      data: { memory },
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    console.error('[v1/memories] POST error:', error);
    return ServerErrors.internal('add_memory');
  }
}

// GET /api/v1/memories
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await resolveAuth(request);
    if ('error' in result) return result.error;

    const { userId, keyId } = result;
    const { searchParams } = new URL(request.url);

    const query = searchParams.get('query');
    if (!query) {
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
          400
        );
      }
      return ValidationErrors.missingField('query');
    }

    const limit = boundedInt(searchParams.get('limit'), 10, 1, 100);
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');
    const namespace = searchParams.get('namespace') || 'default';
    const requestedMode = (searchParams.get('mode') || 'auto') as SearchMode;
    const agentId = searchParams.get('agent_id');
    const scope = searchParams.get('scope');

    let actualMode: Exclude<SearchMode, 'auto'>;
    let routerDecision = null;

    if (requestedMode === 'auto') {
      routerDecision = routeQuery(query);
      actualMode = routerDecision.strategy;
    } else {
      actualMode = requestedMode as Exclude<SearchMode, 'auto'>;
    }

    // Slot lookups
    if (actualMode === 'slot') {
      const slotKey = detectSlotQuery(query);
      if (slotKey) {
        const slotValues = await getSlots(userId, [slotKey], namespace);
        const slotValue = slotValues.get(slotKey);

        if (keyId) {
          await logRequest(
            { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
            200,
            { embedding: 0 }
          );
        }
        logMemoryAccess(request, userId, keyId ?? undefined, 'read', {
          memoryId: `slot:${slotKey}`,
          query,
        }).catch(console.error);

        if (slotValue) {
          return NextResponse.json({
            success: true,
            data: {
              mode: 'slot',
              results: [{
                id: `slot:${slotKey}`,
                content: slotValue,
                memory_type: 'fact',
                slot_key: slotKey,
                similarity: 1.0,
              }],
              count: 1,
            },
            meta: { ...META, cached: false, latencyMs: Date.now() - startTime },
          });
        }
        actualMode = 'keyword';
      } else {
        actualMode = 'keyword';
      }
    }

    // Cache check
    const cacheResult = await getCachedQueryResults(userId, query, namespace, actualMode);
    if (cacheResult.hit && cacheResult.results.length > 0) {
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
          200,
          { embedding: 0 }
        );
      }
      Promise.all(cacheResult.results.map((m) => trackMemoryAccess(m.id))).catch(console.error);
      logMemoryAccess(request, userId, keyId ?? undefined, 'search', {
        memoryCount: cacheResult.results.length,
        query,
      }).catch(console.error);

      return NextResponse.json({
        success: true,
        data: {
          mode: actualMode,
          requestedMode,
          results: cacheResult.results,
          count: cacheResult.results.length,
          routerDecision: routerDecision ? {
            strategy: routerDecision.strategy,
            confidence: routerDecision.confidence,
            reason: routerDecision.reason,
          } : null,
        },
        meta: { ...META, cached: true, latencyMs: Date.now() - startTime },
      });
    }

    // Search
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
      console.error('[v1/memories] Search error:', searchError);
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
          500
        );
      }
      return ServerErrors.database('search_memories');
    }

    // Multi-agent filtering (post-search)
    if (results && (agentId || scope)) {
      results = results.filter((m: Record<string, unknown>) => {
        if (agentId && m.agent_id !== agentId) return false;
        if (scope && m.scope !== scope) return false;
        return true;
      });
    }

    // Cache results
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

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
        200,
        { embedding: actualMode !== 'keyword' ? query.length : 0 }
      );
    }

    if (results && results.length > 0) {
      Promise.all(results.map((m: { id: string }) => trackMemoryAccess(m.id))).catch(
        console.error
      );
    }

    logMemoryAccess(request, userId, keyId ?? undefined, 'search', {
      memoryCount: results?.length || 0,
      query,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      data: {
        mode: actualMode,
        requestedMode,
        results: results || [],
        count: results?.length || 0,
        routerDecision: routerDecision ? {
          strategy: routerDecision.strategy,
          confidence: routerDecision.confidence,
          reason: routerDecision.reason,
        } : null,
      },
      meta: { ...META, cached: false, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    console.error('[v1/memories] GET error:', error);
    return ServerErrors.internal('search_memories');
  }
}

// DELETE /api/v1/memories
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await resolveAuth(request);
    if ('error' in result) return result.error;

    const { userId, keyId } = result;
    const { searchParams } = new URL(request.url);

    const ids = searchParams.get('ids')?.split(',').filter(Boolean);
    if (!ids || ids.length === 0) {
      return ValidationErrors.missingField('ids');
    }

    if (ids.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete more than 100 memories at once' },
        { status: 400 }
      );
    }

    const namespace = searchParams.get('namespace') || 'default';
    const supabase = createServerClient();

    const { error } = await supabase
      .from('memories')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('user_id', userId);

    if (error) {
      console.error('[v1/memories] Delete error:', error);
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'DELETE', startTime },
          500
        );
      }
      return ServerErrors.database('delete_memories');
    }

    incrementMemoryVersion(userId, namespace).catch(console.error);

    // Emit webhook event (non-blocking)
    emitWebhookEvent(userId, 'memory.deleted', {
      ids,
      count: ids.length,
    }, namespace).catch(console.error);

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/memories', method: 'DELETE', startTime },
        200
      );
    }

    return NextResponse.json({
      success: true,
      data: { deleted: ids.length },
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    console.error('[v1/memories] DELETE error:', error);
    return ServerErrors.internal('delete_memories');
  }
}
