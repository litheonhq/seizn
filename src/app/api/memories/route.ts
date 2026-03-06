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
import { logServerError } from '@/lib/server/logger';
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
} from '@/lib/memory/query-cache';
import { routeQuery, type SearchMode } from '@/lib/memory/auto-router';
import { detectSlotQuery, getSlots } from '@/lib/memory/slot';
import { parsePagination } from '@/lib/parse-params';
import {
  applyPersonalizedRanking,
  getOrCreateLearningProfile,
} from '@/lib/memory/personalization';
import { analyzeContentIntegrity } from '@/lib/memory/content-integrity';
import { getRequestUser } from '@/lib/api/request-user';
import { ensureCsrfCookie, verifyCsrfToken } from '@/lib/csrf';
import { executeMemorySearch } from '@/lib/memory/search-executor';
import { toCachedMemories, type SearchResultRow } from '@/lib/memory/search-types';
import {
  recordSemanticCacheExperimentEvent,
  resolveSemanticCacheDecision,
} from '@/lib/memory/semantic-cache-experiment';
import {
  attachImageToMemory,
  hasMemoryImagePayload,
  validateMemoryImagePayload,
  type MemoryImageAttachmentRecord,
} from '@/lib/memory/image-attachments';
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
  'id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, importance, companion_meta, source, scope, agent_id, created_at, updated_at';

const ENCRYPTED_PLACEHOLDER = '[encrypted]';
const SEARCH_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.MEMORY_SEARCH_TIMEOUT_MS || '', 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 2500;
})();
const ALLOWED_SEARCH_MODES: SearchMode[] = ['auto', 'slot', 'keyword', 'hybrid', 'vector'];
const IMAGE_ATTACHMENT_CLIENT_ERROR_PATTERNS = [
  'image_url',
  'image_base64',
  'image_mime_type',
  'image_filename',
  'image_relation',
  'unsupported image mime type',
  'decoded image is empty',
  'no image payload provided',
  'image too large',
  'redirect',
  'private or internal ip',
  'hostname',
] as const;

function isMissingContentHashColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  return (error.message || '').toLowerCase().includes('content_hash');
}

function getImageAttachmentClientErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error) || !error.message) return null;
  const lowered = error.message.toLowerCase();
  const matched = IMAGE_ATTACHMENT_CLIENT_ERROR_PATTERNS.some((token) => lowered.includes(token));
  return matched ? error.message : null;
}

type ResolvedAuth =
  | {
      userId: string;
      keyId: string | null;
      plan: string;
      rateLimitHeaders?: Record<string, string>;
    }
  | { error: NextResponse };

function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

async function resolvePlanForUser(userId: string): Promise<string> {
  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle();
  return profile?.plan || 'free';
}

function parseBrowseSort(
  sortRaw: string | null,
  orderRaw: string | null
): { column: BrowseSortColumn; ascending: boolean } {
  if (!sortRaw || sortRaw.trim().length === 0) {
    return { column: 'created_at', ascending: orderRaw === 'asc' };
  }

  const trimmed = sortRaw.trim();
  const normalized = trimmed.replace(/^[-+]/, '');
  const column: BrowseSortColumn = BROWSE_SORT_COLUMNS.includes(normalized as BrowseSortColumn)
    ? (normalized as BrowseSortColumn)
    : 'created_at';

  if (trimmed.startsWith('-')) {
    return { column, ascending: false };
  }
  if (trimmed.startsWith('+')) {
    return { column, ascending: true };
  }

  // Backward-compatible order support: ?sort=created_at&order=asc
  if (orderRaw === 'asc') {
    return { column, ascending: true };
  }
  if (orderRaw === 'desc') {
    return { column, ascending: false };
  }

  return { column, ascending: false };
}

function parseSearchThreshold(searchParams: URLSearchParams): number | null {
  const raw = searchParams.get('threshold');
  if (raw == null || raw.trim().length === 0) return 0.7;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return null;
  }
  return parsed;
}

function parseRequestedMode(searchParams: URLSearchParams): SearchMode | null {
  const raw = (searchParams.get('mode') || 'auto').toLowerCase();
  if (!ALLOWED_SEARCH_MODES.includes(raw as SearchMode)) {
    return null;
  }
  return raw as SearchMode;
}

function shouldUseDegradedKeywordSearchFallback(error: Error): boolean {
  const message = error.message.toLowerCase();
  const missingSearchFunction =
    message.includes('does not exist') &&
    (message.includes('keyword_search_memories') ||
      message.includes('hybrid_search_memories') ||
      message.includes('search_memories'));
  return (
    message.includes('operator does not exist: text = uuid') ||
    missingSearchFunction
  );
}

async function runDegradedKeywordSearch(params: {
  supabase: ReturnType<typeof createServerClient>;
  userId: string;
  queryText: string;
  limit: number;
  namespaceParam: string | null;
}): Promise<{ results: SearchResultRow[] | null; error: Error | null }> {
  let queryBuilder = params.supabase
    .from('memories')
    .select(MEMORY_SELECT_FIELDS)
    .eq('user_id', params.userId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(params.limit);

  if (params.namespaceParam) {
    queryBuilder = queryBuilder.eq('namespace', params.namespaceParam);
  }

  const normalizedQuery = params.queryText.trim();
  if (normalizedQuery.length > 0) {
    const terms = Array.from(
      new Set(
        normalizedQuery
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, ''))
      .filter((term) => term.length >= 2)
      )
    ).slice(0, 5);

    if (terms.length > 0) {
      const orExpr = terms
        .map((term) => `content.ilike.%${escapeLikePattern(term)}%`)
        .join(',');
      queryBuilder = queryBuilder.or(orExpr);
    } else {
      queryBuilder = queryBuilder.ilike('content', `%${escapeLikePattern(normalizedQuery)}%`);
    }
  }

  const { data, error } = await queryBuilder;
  if (error) {
    return { results: null, error: new Error(error.message || 'degraded_keyword_search_failed') };
  }

  return { results: (data as SearchResultRow[] | null) || [], error: null };
}

async function resolveAuth(
  request: NextRequest,
  options?: { skipUsageCheck?: boolean }
): Promise<ResolvedAuth> {
  const bearerToken = getBearerToken(request);
  const hasLegacyApiKey = Boolean(request.headers.get('x-api-key'));

  if (bearerToken && !hasLegacyApiKey && looksLikeJwt(bearerToken)) {
    const jwtUser = await getRequestUser(request);
    if (jwtUser?.id) {
      return {
        userId: jwtUser.id,
        keyId: null,
        plan: await resolvePlanForUser(jwtUser.id),
      };
    }
  }

  // Avoid recording spurious auth failures for session-only requests.
  if (!bearerToken && !hasLegacyApiKey) {
    const sessionUser = await getRequestUser(request);
    if (sessionUser?.id) {
      return {
        userId: sessionUser.id,
        keyId: null,
        plan: await resolvePlanForUser(sessionUser.id),
      };
    }
  }

  const authResult = await authenticateRequest(request, options);
  if (!isAuthError(authResult)) {
    return {
      userId: authResult.userId,
      keyId: authResult.keyId,
      plan: authResult.plan,
      rateLimitHeaders: authResult.rateLimitHeaders,
    };
  }

  // Preserve previous dual-auth behavior when an invalid auth header is sent
  // but a valid dashboard session is present.
  if (bearerToken || hasLegacyApiKey) {
    const requestUser = await getRequestUser(request);
    if (requestUser?.id) {
      return {
        userId: requestUser.id,
        keyId: null,
        plan: await resolvePlanForUser(requestUser.id),
      };
    }
  }

  return { error: authErrorResponse(authResult.authError) };
}

// POST /api/memories - Add a new memory
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let step = 'init';

  try {
    step = 'auth';
    const authResult = await resolveAuth(request);
    if ('error' in authResult) {
      return authResult.error;
    }

    const csrfError = verifyCsrfToken(request);
    if (csrfError) {
      return csrfError;
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
    const hasImageAttachment = hasMemoryImagePayload(body);
    const imageValidationError = validateMemoryImagePayload(body);
    if (imageValidationError) {
      return ValidationErrors.invalidField('image', imageValidationError);
    }

    if (isEncrypted) {
      if (!canUseEncryptedMemories(plan)) {
        if (keyId) {
          await logRequest(
            { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
            403
          );
        }
        return NextResponse.json(getEncryptedMemoryPlanError(), { status: 403 });
      }
      if (!encryptedContent || encryptedContent.trim().length === 0) {
        if (keyId) {
          await logRequest(
            { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
            400
          );
        }
        return ValidationErrors.missingField('encrypted_content');
      }
      if (encryptedContent.length > 20000) {
        return ValidationErrors.invalidField('encrypted_content', 'Encrypted content too long');
      }
    } else {
      if (!body.content || body.content.trim().length === 0) {
        if (keyId) {
          await logRequest(
            { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
            400
          );
        }
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
    if (
      body.companion_meta !== undefined &&
      body.companion_meta !== null &&
      (typeof body.companion_meta !== 'object' || Array.isArray(body.companion_meta))
    ) {
      return ValidationErrors.invalidField('companion_meta', 'Must be a JSON object');
    }

    // Deduplicate tags
    if (body.tags && Array.isArray(body.tags)) {
      body.tags = [...new Set(body.tags)];
    }

    // Sanitize: strip null bytes (PostgreSQL text columns reject \0)

    const sanitizedContent = (body.content || '').replace(/\x00/g, '');
    const integrityWarnings = !isEncrypted
      ? analyzeContentIntegrity(sanitizedContent).warnings
      : [];

    step = 'supabase_client';
    const supabase = createServerClient();

    step = 'embedding';
    let embedding: number[] | null = null;
    if (!isEncrypted) {
      try {
        embedding = await createEmbedding(sanitizedContent);
      } catch (embErr) {
        logServerError(
          '[memory:POST] Embedding failed',
          embErr instanceof Error ? embErr.message : embErr
        );
        return ServerErrors.internal('embedding_failed');
      }
    }

    step = 'insert';
    const namespace = body.namespace || 'default';
    const contentHash =
      isEncrypted || hasImageAttachment
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
      companion_meta: body.companion_meta ?? null,
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
      companion_meta: Record<string, unknown> | null;
      created_at: string;
    } | null = null;
    let insertError: { code?: string | null; message?: string | null } | null = null;

    {
      const result = await supabase
        .from('memories')
        .insert(insertPayload)
        .select('id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, companion_meta, created_at')
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
        .select('id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, companion_meta, created_at')
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
            integrity_warnings: integrityWarnings,
          });
        }
      }

      logServerError(
        '[memory:POST] Insert failed',
        insertError.message || insertError
      );
      return ServerErrors.database('insert_memory');
    }

    if (!memory) {
      return ServerErrors.database('insert_memory');
    }

    let attachments: MemoryImageAttachmentRecord[] = [];
    if (hasImageAttachment) {
      try {
        const attached = await attachImageToMemory({
          supabase,
          userId,
          memoryId: memory.id,
          input: body,
        });
        attachments = [attached];
      } catch (attachmentError) {
        const rollback = await supabase
          .from('memories')
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq('id', memory.id)
          .eq('user_id', userId);
        if (rollback.error) {
          logServerError(
            '[memory:POST] CRITICAL: rollback soft-delete failed for memory',
            rollback.error.message,
            { memoryId: memory.id }
          );
        }

        logServerError('[memory:POST] Attachment failed', attachmentError);
        const clientMessage = getImageAttachmentClientErrorMessage(attachmentError);
        if (clientMessage) {
          return ValidationErrors.invalidField('image', clientMessage);
        }
        return ServerErrors.internal('attach_image');
      }
    }

    step = 'post_insert';
    // Invalidate cache for this namespace
    await incrementMemoryVersion(userId, namespace);

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'POST', startTime },
        200,
        { embedding: isEncrypted ? 0 : sanitizedContent.length }
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        memory: memory,
        attachments,
        integrity_warnings: integrityWarnings,
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logServerError(`[memory:POST] Uncaught at step=${step}`, msg);
    return ServerErrors.internal(`add_memory:${step}`);
  }
}

// GET /api/memories - Search (with query) or Browse (without query)
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await resolveAuth(request);
    if ('error' in authResult) {
      return authResult.error;
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    // Common params
    const query = searchParams.get('query')?.trim() || searchParams.get('q')?.trim() || null;
    const search = searchParams.get('search')?.trim() || null;
    const { limit, offset } = parsePagination(searchParams, { limit: 20 });
    const namespace = searchParams.get('namespace') || 'default';
    const memoryType = searchParams.get('memory_type');
    const tagsParam = searchParams.get('tags');
    const after = searchParams.get('after');
    const before = searchParams.get('before');
    const characterSubtype = searchParams.get('character_subtype');
    const nsfwLevel = searchParams.get('nsfw_level');
    const scenario = searchParams.get('scenario');
    const { column: sort, ascending: orderAsc } = parseBrowseSort(
      searchParams.get('sort'),
      searchParams.get('order')
    );

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
      if (search) {
        q = q.ilike('content', `%${escapeLikePattern(search)}%`);
      }
      if (characterSubtype) {
        q = q.filter('companion_meta->>character_subtype', 'eq', characterSubtype);
      }
      if (nsfwLevel) {
        q = q.filter('companion_meta->>nsfw_level', 'eq', nsfwLevel);
      }
      if (scenario) {
        q = q.filter('companion_meta->>scenario', 'eq', scenario);
      }

      q = q.order(sort, { ascending: orderAsc }).range(offset, offset + limit - 1);

      const { data: memories, error: browseError, count } = await q;

      if (browseError) {
        console.error('[api/memories] Browse error:', browseError);
        if (keyId) {
          await logRequest(
            { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
            500
          );
        }
        return ServerErrors.database('browse_memories');
      }

      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
          200,
          { embedding: 0 }
        );
      }

      logMemoryAccess(request, userId, keyId ?? undefined, 'search', {
        memoryCount: memories?.length || 0,
      }).catch(console.error);

      const response = NextResponse.json({
        success: true,
        mode: 'browse',
        results: memories || [],
        count: memories?.length || 0,
        total: count ?? 0,
        offset,
        limit,
        cached: false,
      });
      const withCsrf = ensureCsrfCookie(request, response);
      return withHeaders(withCsrf, authResult.rateLimitHeaders);
    }

    // ----------------------------------------------
    // SEARCH MODE - query provided
    // ----------------------------------------------
    const threshold = parseSearchThreshold(searchParams);
    if (threshold == null) {
      return ValidationErrors.invalidField('threshold', 'Must be a number between 0 and 1');
    }
    const requestedMode = parseRequestedMode(searchParams);
    if (requestedMode == null) {
      return ValidationErrors.invalidField('mode', `Must be one of: ${ALLOWED_SEARCH_MODES.join(', ')}`);
    }
    const supabase = createServerClient();

    let actualMode: Exclude<SearchMode, 'auto'>;
    let routerDecision = null;

    if (requestedMode === 'auto') {
      routerDecision = routeQuery(query);
      actualMode = routerDecision.strategy;
    } else {
      actualMode = requestedMode as Exclude<SearchMode, 'auto'>;
    }
    const semanticCacheDecision = resolveSemanticCacheDecision({ userId, keyId });
    const semanticCacheInfo = {
      enabled: semanticCacheDecision.enabled,
      variant: semanticCacheDecision.variant,
      scope: semanticCacheDecision.scope,
      read_enabled: semanticCacheDecision.allowRead,
      write_enabled: semanticCacheDecision.allowWrite,
      reason: semanticCacheDecision.reason,
      bucket: semanticCacheDecision.bucket,
    };
    const recordSemanticCacheOutcome = (payload: {
      resolvedMode: string;
      cacheHit: boolean;
      resultCount: number;
      latencyMs: number;
      fallbackReason?: string | null;
      errorCode?: string | null;
    }) => {
      if (!semanticCacheDecision.variant) return;
      recordSemanticCacheExperimentEvent(supabase, {
        userId,
        namespace,
        source: 'v0',
        requestedMode,
        resolvedMode: payload.resolvedMode,
        variant: semanticCacheDecision.variant,
        cacheHit: payload.cacheHit,
        latencyMs: payload.latencyMs,
        resultCount: payload.resultCount,
        fallbackReason: payload.fallbackReason || null,
        errorCode: payload.errorCode || null,
      }).catch(console.error);
    };

    // Handle slot lookups
    if (actualMode === 'slot') {
      const slotKey = detectSlotQuery(query);
      if (slotKey) {
        const slotValues = await getSlots(userId, [slotKey], namespace);
        const slotValue = slotValues.get(slotKey);

        if (keyId) {
          await logRequest(
            { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
            200,
            { embedding: 0 }
          );
        }
        logMemoryAccess(request, userId, keyId ?? undefined, 'read', {
          memoryId: `slot:${slotKey}`,
          query,
        }).catch(console.error);

        if (slotValue) {
          recordSemanticCacheOutcome({
            resolvedMode: 'slot',
            cacheHit: false,
            resultCount: 1,
            latencyMs: Date.now() - startTime,
          });
          const response = NextResponse.json({
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
            semantic_cache: {
              ...semanticCacheInfo,
              hit: false,
            },
            slot: { key: slotKey, value: slotValue },
            routerDecision: routerDecision
              ? { strategy: routerDecision.strategy, confidence: routerDecision.confidence, reason: routerDecision.reason }
              : null,
          });
          const withCsrf = ensureCsrfCookie(request, response);
          return withHeaders(withCsrf, authResult.rateLimitHeaders);
        }
        actualMode = 'keyword';
      } else {
        actualMode = 'keyword';
      }
    }

    // Cache check
    const cacheResult = semanticCacheDecision.allowRead
      ? await getCachedQueryResults(userId, query, namespace, actualMode)
      : { hit: false, results: [], fromCache: false as const, version: undefined };
    const semanticCacheHit = cacheResult.hit && cacheResult.results.length > 0;
    if (semanticCacheHit) {
      const personalizationState = await getOrCreateLearningProfile(supabase, userId, namespace);
      const rankedCachedResults =
        personalizationState.available && personalizationState.profile.personalizationEnabled
          ? applyPersonalizedRanking(cacheResult.results, personalizationState.profile, query)
          : cacheResult.results;

      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
          200,
          { embedding: 0 }
        );
      }
      Promise.all(cacheResult.results.map((m) => trackMemoryAccess(m.id))).catch(console.error);
      logMemoryAccess(request, userId, keyId ?? undefined, 'search', {
        memoryCount: cacheResult.results.length,
        query,
      }).catch(console.error);
      recordSemanticCacheOutcome({
        resolvedMode: actualMode,
        cacheHit: true,
        resultCount: rankedCachedResults.length,
        latencyMs: Date.now() - startTime,
      });

      const response = NextResponse.json({
        success: true,
        mode: actualMode,
        requestedMode,
        results: rankedCachedResults,
        count: rankedCachedResults.length,
        total: rankedCachedResults.length,
        cached: true,
        semantic_cache: {
          ...semanticCacheInfo,
          hit: true,
        },
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
      });
      const withCsrf = ensureCsrfCookie(request, response);
      return withHeaders(withCsrf, authResult.rateLimitHeaders);
    }

    const nsParam = namespace === 'default' ? null : namespace;
    const applyResultFilters = (input: SearchResultRow[] | null): SearchResultRow[] | null => {
      if (!input) return input;
      return input.filter((m: Record<string, unknown>) => {
        if (memoryType && m.memory_type !== memoryType) return false;
        if (after && typeof m.created_at === 'string' && m.created_at <= after) return false;
        if (before && typeof m.created_at === 'string' && m.created_at >= before) return false;
        if (tagsParam) {
          const filterTags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);
          const memTags = Array.isArray(m.tags) ? m.tags as string[] : [];
          if (filterTags.length > 0 && !filterTags.some((t) => memTags.includes(t))) return false;
        }
        if (search) {
          const content = typeof m.content === 'string' ? m.content.toLowerCase() : '';
          if (!content.includes(search.toLowerCase())) return false;
        }
        if (characterSubtype) {
          const cm = (m.companion_meta && typeof m.companion_meta === 'object')
            ? (m.companion_meta as Record<string, unknown>)
            : null;
          if (cm?.character_subtype !== characterSubtype) return false;
        }
        if (nsfwLevel) {
          const cm = (m.companion_meta && typeof m.companion_meta === 'object')
            ? (m.companion_meta as Record<string, unknown>)
            : null;
          if (cm?.nsfw_level !== nsfwLevel) return false;
        }
        if (scenario) {
          const cm = (m.companion_meta && typeof m.companion_meta === 'object')
            ? (m.companion_meta as Record<string, unknown>)
            : null;
          if (cm?.scenario !== scenario) return false;
        }
        return true;
      });
    };
    const searchExecution = await executeMemorySearch<SearchResultRow>({
      rpcCall: async (fn, args) => {
        const { data, error } = await supabase.rpc(fn, args);
        return { data: (data as SearchResultRow[] | null), error };
      },
      initialMode: actualMode,
      queryText: query,
      userId,
      limit,
      namespaceParam: nsParam,
      threshold: routerDecision?.suggestedParams.threshold || threshold,
      searchTimeoutMs: SEARCH_TIMEOUT_MS,
      createQueryEmbedding,
      applyFilters: applyResultFilters,
    });

    let { results, resolvedMode, fallback, error: searchError } = searchExecution;

    if (searchError && shouldUseDegradedKeywordSearchFallback(searchError)) {
      const degraded = await runDegradedKeywordSearch({
        supabase,
        userId,
        queryText: query,
        limit,
        namespaceParam: nsParam,
      });

      if (!degraded.error) {
        results = applyResultFilters(degraded.results);
        fallback = {
          applied: true,
          from: resolvedMode,
          to: 'keyword',
          reason: 'search_error',
        };
        resolvedMode = 'keyword';
        searchError = null;
      } else {
        logServerError(
          '[api/memories] Degraded keyword fallback failed',
          degraded.error
        );
      }
    }

    if (searchError) {
      logServerError('[api/memories] Search error', searchError);
      const isTimeoutError = searchError.message.includes('timeout');
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
          isTimeoutError ? 504 : 500
        );
      }
      if (isTimeoutError) {
        recordSemanticCacheOutcome({
          resolvedMode,
          cacheHit: false,
          resultCount: 0,
          latencyMs: Date.now() - startTime,
          errorCode: 'search_timeout',
        });
        const response = NextResponse.json(
          {
            success: false,
            error: {
              code: 'search_timeout',
              message: 'Search timed out. Try a shorter query or retry.',
            },
            semantic_cache: {
              ...semanticCacheInfo,
              hit: false,
            },
          },
          { status: 504 }
        );
        const withCsrf = ensureCsrfCookie(request, response);
        return withHeaders(withCsrf, authResult.rateLimitHeaders);
      }
      recordSemanticCacheOutcome({
        resolvedMode,
        cacheHit: false,
        resultCount: 0,
        latencyMs: Date.now() - startTime,
        errorCode: 'search_error',
      });
      return ServerErrors.database('search_memories');
    }

    // Cache results
    if (semanticCacheDecision.allowWrite && results && results.length > 0) {
      setCachedQueryResults(userId, query, namespace, resolvedMode, toCachedMemories(results)).catch(
        (error) => logServerError('[api/memories] Cache write failed', error)
      );
    }

    const personalizationState = await getOrCreateLearningProfile(supabase, userId, namespace);
    const rankedResults =
      results && personalizationState.available && personalizationState.profile.personalizationEnabled
        ? applyPersonalizedRanking(results, personalizationState.profile, query)
        : results;

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'GET', startTime },
        200,
        { embedding: resolvedMode !== 'keyword' ? query.length : 0 }
      );
    }

    if (rankedResults && rankedResults.length > 0) {
      Promise.all(rankedResults.map((m: { id: string }) => trackMemoryAccess(m.id))).catch(
        (error) => logServerError('[api/memories] Track access failed', error)
      );
    }

    logMemoryAccess(request, userId, keyId ?? undefined, 'search', {
      memoryCount: rankedResults?.length || 0,
      query,
    }).catch((error) => logServerError('[api/memories] Audit log failed', error));
    recordSemanticCacheOutcome({
      resolvedMode,
      cacheHit: false,
      resultCount: rankedResults?.length || 0,
      latencyMs: Date.now() - startTime,
      fallbackReason: fallback?.reason || null,
    });

    const response = NextResponse.json({
      success: true,
      mode: resolvedMode,
      requestedMode,
      results: rankedResults || [],
      count: rankedResults?.length || 0,
      total: rankedResults?.length || 0,
      cached: false,
      semantic_cache: {
        ...semanticCacheInfo,
        hit: false,
      },
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
      fallback,
    });
    const withCsrf = ensureCsrfCookie(request, response);
    return withHeaders(withCsrf, authResult.rateLimitHeaders);
  } catch (error) {
    logServerError('Search memory error', error);
    return ServerErrors.internal('search_memories');
  }
}

// DELETE /api/memories - Delete memories by IDs
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await resolveAuth(request, { skipUsageCheck: true });
    if ('error' in authResult) {
      return authResult.error;
    }

    const csrfError = verifyCsrfToken(request);
    if (csrfError) {
      return csrfError;
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
      logServerError('Delete error', error);
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/memories', method: 'DELETE', startTime },
          500
        );
      }
      return ServerErrors.database('delete_memories');
    }

    // Invalidate cache
    await incrementMemoryVersion(userId, namespace);

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/memories', method: 'DELETE', startTime },
        200
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        deleted: ids.length,
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    logServerError('Delete memory error', error);
    return ServerErrors.internal('delete_memories');
  }
}
