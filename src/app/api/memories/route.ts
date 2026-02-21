/**
 * REST API v0 — Memories (DEPRECATED)
 *
 * This is the legacy v0 API. New integrations should use /api/v1/memories instead.
 * v0 will continue to be supported but will not receive new features.
 *
 * Migration guide:
 *   - Replace /api/memories → /api/v1/memories
 *   - Response shape changes: v1 wraps data in { success, data: {...}, meta }
 *   - v1 supports dual auth (API key + session fallback)
 *   - v1 adds dedup, auto-scoring, webhook events, and encrypted memory support
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
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { safeJsonParse } from '@/lib/safe-json';
import { trackMemoryAccess } from '@/lib/memory-optimizer';
import { logMemoryAccess } from '@/lib/audit';
import {
  canUseEncryptedMemories,
  getEncryptedMemoryPlanError,
} from '@/lib/memory/entitlements';
import {
  getCachedQueryResults,
  setCachedQueryResults,
  incrementMemoryVersion,
  type CachedMemory,
} from '@/lib/memory/query-cache';
import { routeQuery, type SearchMode } from '@/lib/memory/auto-router';
import { detectSlotQuery, getSlots } from '@/lib/memory/slot';
import { parsePagination } from '@/lib/parse-params';
import {
  applyPersonalizedRanking,
  getOrCreateLearningProfile,
} from '@/lib/memory/personalization';
import type { AddMemoryRequest } from '@/types/database';
import crypto from 'crypto';

/** Merge extra headers into a NextResponse */
function withHeaders(response: NextResponse, headers?: Record<string, string>): NextResponse {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

/** Valid sort columns for browse mode */
const BROWSE_SORT_COLUMNS = ['created_at', 'updated_at', 'importance'] as const;
type BrowseSortColumn = (typeof BROWSE_SORT_COLUMNS)[number];

const MEMORY_SELECT_FIELDS =
  'id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, importance, source, scope, agent_id, created_at, updated_at';

const ENCRYPTED_PLACEHOLDER = '[encrypted]';

function isMissingContentHashColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  return (error.message || '').toLowerCase().includes('content_hash');
}

// POST /api/memories - Add a new memory
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let step = 'init';

  try {
    step = 'auth';
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, plan } = authResult;

    step = 'parse_body';
    let body: AddMemoryRequest;
    try {
      body = await safeJsonParse<AddMemoryRequest>(request);
    } catch (parseErr) {
      return ValidationErrors.invalidBody(
        parseErr instanceof SyntaxError
          ? 'Invalid JSON: check for unescaped backslashes or special characters'
          : 'Could not parse request body'
      );
    }

    step = 'validate';
    const isEncrypted = (body as unknown as Record<string, unknown>).is_encrypted === true;
    const encryptedContent = body.encrypted_content;

    if (isEncrypted) {
      if (!canUseEncryptedMemories(plan)) {
        await logRequest(
          { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
          403
        );
        return NextResponse.json(getEncryptedMemoryPlanError(), { status: 403 });
      }
      if (!encryptedContent || encryptedContent.trim().length === 0) {
        await logRequest(
          { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
          400
        );
        return ValidationErrors.missingField('encrypted_content');
      }
      if (encryptedContent.length > 20000) {
        return ValidationErrors.invalidField('encrypted_content', 'Encrypted content too long');
      }
    } else {
      if (!body.content || body.content.trim().length === 0) {
        await logRequest(
          { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
          400
        );
        return ValidationErrors.missingField('content');
      }
      if (body.content.length > 10000) {
        return ValidationErrors.invalidField('content', 'Content too long (max 10,000 chars)');
      }
    }

    // Validate memory_type
    const VALID_MEMORY_TYPES = ['fact', 'preference', 'experience', 'relationship', 'instruction'];
    if (body.memory_type && !VALID_MEMORY_TYPES.includes(body.memory_type)) {
      return ValidationErrors.invalidField('memory_type', `Must be one of: ${VALID_MEMORY_TYPES.join(', ')}`);
    }

    // Validate tags
    if (body.tags) {
      if (!Array.isArray(body.tags)) {
        return ValidationErrors.invalidField('tags', 'Must be an array of strings');
      }
      if (body.tags.length > 50) {
        return ValidationErrors.invalidField('tags', 'Maximum 50 tags allowed');
      }
      if (body.tags.some((t: unknown) => typeof t !== 'string' || (t as string).length > 100)) {
        return ValidationErrors.invalidField('tags', 'Each tag must be a string of max 100 characters');
      }
    }

    // Validate namespace (alphanumeric start, 1-64 chars)
    if (body.namespace && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(body.namespace)) {
      return ValidationErrors.invalidField('namespace', 'Must start with alphanumeric, contain only alphanumeric/hyphens/underscores, and be 1-64 characters');
    }

    // Deduplicate tags
    if (body.tags && Array.isArray(body.tags)) {
      body.tags = [...new Set(body.tags)];
    }

    // Sanitize: strip null bytes (PostgreSQL text columns reject \0)

    const sanitizedContent = (body.content || '').replace(/\x00/g, '');

    step = 'supabase_client';
    const supabase = createServerClient();

    step = 'embedding';
    let embedding: number[] | null = null;
    if (!isEncrypted) {
      try {
        embedding = await createEmbedding(sanitizedContent);
      } catch (embErr) {
        console.error('[memory:POST] Embedding failed:', embErr instanceof Error ? embErr.message : embErr);
        return ServerErrors.internal('embedding_failed');
      }
    }

    step = 'insert';
    const namespace = body.namespace || 'default';
    const contentHash = isEncrypted
      ? null
      : crypto.createHash('sha256').update(sanitizedContent).digest('hex');

    const insertPayload = {
      user_id: userId,
      content: isEncrypted ? ENCRYPTED_PLACEHOLDER : sanitizedContent,
      encrypted_content: isEncrypted ? encryptedContent : null,
      is_encrypted: isEncrypted,
      embedding: isEncrypted ? null : embedding,
      memory_type: body.memory_type || 'fact',
      tags: body.tags || [],
      namespace,
      scope: body.scope || 'user',
      session_id: body.session_id || null,
      agent_id: body.agent_id || null,
      source: body.source || 'api',
      confidence: 1.0,
      importance: 5,
      content_hash: contentHash,
    };

    let memory: {
      id: string;
      content: string;
      encrypted_content: string | null;
      is_encrypted: boolean;
      memory_type: string;
      tags: string[];
      namespace: string;
      created_at: string;
    } | null = null;
    let insertError: { code?: string | null; message?: string | null } | null = null;

    {
      const result = await supabase
        .from('memories')
        .insert(insertPayload)
        .select('id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, created_at')
        .single();
      memory = result.data;
      insertError = result.error;
    }

    // Backward compatibility: if migration isn't applied yet, retry without content_hash.
    if (insertError && isMissingContentHashColumnError(insertError)) {
      const { content_hash: _ignored, ...legacyPayload } = insertPayload;
      const retry = await supabase
        .from('memories')
        .insert(legacyPayload)
        .select('id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, created_at')
        .single();
      memory = retry.data;
      insertError = retry.error;
    }

    if (insertError) {
      // Handle unique constraint violation (concurrent duplicate insert)
      if (insertError.code === '23505' && !isEncrypted && contentHash) {
        const { data: existing } = await supabase
          .from('memories')
          .select('id, content')
          .eq('user_id', userId)
          .eq('namespace', namespace)
          .eq('content_hash', contentHash)
          .eq('is_deleted', false)
          .single();

        if (existing) {
          return NextResponse.json({
            success: true,
            memory: existing,
            deduplicated: true,
          });
        }
      }

      console.error('[memory:POST] Insert failed:', insertError.message || insertError);
      return ServerErrors.database('insert_memory');
    }

    if (!memory) {
      return ServerErrors.database('insert_memory');
    }

    step = 'post_insert';
    // Invalidate cache for this namespace
    await incrementMemoryVersion(userId, namespace);

    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
      200,
      { embedding: isEncrypted ? 0 : sanitizedContent.length }
    );

    return NextResponse.json({
      success: true,
      memory: memory,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[memory:POST] Uncaught at step=${step}:`, msg);
    return ServerErrors.internal(`add_memory:${step}`);
  }
}

// GET /api/memories - Search (with query) or Browse (without query)
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    // Common params
    const query = searchParams.get('query');
    const { limit, offset } = parsePagination(searchParams, { limit: 20 });
    const namespace = searchParams.get('namespace') || 'default';
    const memoryType = searchParams.get('memory_type');
    const tagsParam = searchParams.get('tags');
    const after = searchParams.get('after');
    const before = searchParams.get('before');
    const sortRaw = searchParams.get('sort') || 'created_at';
    const sort: BrowseSortColumn = BROWSE_SORT_COLUMNS.includes(sortRaw as BrowseSortColumn)
      ? (sortRaw as BrowseSortColumn)
      : 'created_at';
    const orderAsc = searchParams.get('order') === 'asc';

    // ----------------------------------------------
    // BROWSE MODE - no query, return paginated list
    // ----------------------------------------------
    if (!query) {
      const supabase = createServerClient();

      let q = supabase
        .from('memories')
        .select(MEMORY_SELECT_FIELDS, { count: 'exact' })
        .eq('user_id', userId)
        .eq('is_deleted', false);

      if (namespace !== 'default') q = q.eq('namespace', namespace);
      if (memoryType) q = q.eq('memory_type', memoryType);
      if (after) q = q.gt('created_at', after);
      if (before) q = q.lt('created_at', before);
      if (tagsParam) {
        const tags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);
        if (tags.length > 0) q = q.overlaps('tags', tags);
      }

      q = q.order(sort, { ascending: orderAsc }).range(offset, offset + limit - 1);

      const { data: memories, error: browseError, count } = await q;

      if (browseError) {
        console.error('[api/memories] Browse error:', browseError);
        await logRequest(
          { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
          500
        );
        return ServerErrors.database('browse_memories');
      }

      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
        200,
        { embedding: 0 }
      );

      logMemoryAccess(request, userId, keyId, 'search', {
        memoryCount: memories?.length || 0,
      }).catch(console.error);

      return withHeaders(
        NextResponse.json({
          success: true,
          mode: 'browse',
          results: memories || [],
          count: memories?.length || 0,
          total: count ?? 0,
          offset,
          limit,
          cached: false,
        }),
        authResult.rateLimitHeaders
      );
    }

    // ----------------------------------------------
    // SEARCH MODE - query provided
    // ----------------------------------------------
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');
    const requestedMode = (searchParams.get('mode') || 'auto') as SearchMode;
    const supabase = createServerClient();

    let actualMode: Exclude<SearchMode, 'auto'>;
    let routerDecision = null;

    if (requestedMode === 'auto') {
      routerDecision = routeQuery(query);
      actualMode = routerDecision.strategy;
    } else {
      actualMode = requestedMode as Exclude<SearchMode, 'auto'>;
    }

    // Handle slot lookups
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
            results: [{
              id: `slot:${slotKey}`,
              content: slotValue,
              memory_type: 'fact',
              slot_key: slotKey,
              similarity: 1.0,
            }],
            count: 1,
            total: 1,
            cached: false,
            slot: { key: slotKey, value: slotValue },
            routerDecision: routerDecision
              ? { strategy: routerDecision.strategy, confidence: routerDecision.confidence, reason: routerDecision.reason }
              : null,
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
      const personalizationState = await getOrCreateLearningProfile(supabase, userId, namespace);
      const rankedCachedResults =
        personalizationState.available && personalizationState.profile.personalizationEnabled
          ? applyPersonalizedRanking(cacheResult.results, personalizationState.profile, query)
          : cacheResult.results;

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

      return withHeaders(
        NextResponse.json({
          success: true,
          mode: actualMode,
          requestedMode,
          results: rankedCachedResults,
          count: rankedCachedResults.length,
          total: rankedCachedResults.length,
          cached: true,
          personalization: {
            enabled: personalizationState.profile.personalizationEnabled,
            applied:
              personalizationState.available && personalizationState.profile.personalizationEnabled,
            available: personalizationState.available,
            reason: personalizationState.reason || null,
          },
          routerDecision: routerDecision
            ? { strategy: routerDecision.strategy, confidence: routerDecision.confidence, reason: routerDecision.reason }
            : null,
        }),
        authResult.rateLimitHeaders
      );
    }

    // Search
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
      console.error('[api/memories] Search error:', searchError);
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
        500
      );
      return ServerErrors.database('search_memories');
    }

    // Post-search filtering
    if (results) {
      results = results.filter((m: Record<string, unknown>) => {
        if (memoryType && m.memory_type !== memoryType) return false;
        if (after && typeof m.created_at === 'string' && m.created_at <= after) return false;
        if (before && typeof m.created_at === 'string' && m.created_at >= before) return false;
        if (tagsParam) {
          const filterTags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);
          const memTags = Array.isArray(m.tags) ? m.tags as string[] : [];
          if (filterTags.length > 0 && !filterTags.some((t) => memTags.includes(t))) return false;
        }
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

    const personalizationState = await getOrCreateLearningProfile(supabase, userId, namespace);
    const rankedResults =
      results && personalizationState.available && personalizationState.profile.personalizationEnabled
        ? applyPersonalizedRanking(results, personalizationState.profile, query)
        : results;

    await logRequest(
      { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
      200,
      { embedding: actualMode !== 'keyword' ? query.length : 0 }
    );

    if (rankedResults && rankedResults.length > 0) {
      Promise.all(rankedResults.map((m: { id: string }) => trackMemoryAccess(m.id))).catch(
        console.error
      );
    }

    logMemoryAccess(request, userId, keyId, 'search', {
      memoryCount: rankedResults?.length || 0,
      query,
    }).catch(console.error);

    return withHeaders(
      NextResponse.json({
        success: true,
        mode: actualMode,
        requestedMode,
        results: rankedResults || [],
        count: rankedResults?.length || 0,
        total: rankedResults?.length || 0,
        cached: false,
        personalization: {
          enabled: personalizationState.profile.personalizationEnabled,
          applied:
            personalizationState.available && personalizationState.profile.personalizationEnabled,
          available: personalizationState.available,
          reason: personalizationState.reason || null,
        },
        routerDecision: routerDecision
          ? { strategy: routerDecision.strategy, confidence: routerDecision.confidence, reason: routerDecision.reason }
          : null,
      }),
      authResult.rateLimitHeaders
    );
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
    await incrementMemoryVersion(userId, namespace);

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
