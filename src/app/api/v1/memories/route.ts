/**
 * REST API v1 - Memories
 *
 * POST   /api/v1/memories - Add a new memory
 * GET    /api/v1/memories - Search or browse memories
 * DELETE /api/v1/memories - Delete memories by IDs
 *
 * GET supports two modes:
 *   - Search mode (query param provided): vector/keyword/hybrid/slot/auto search
 *   - Browse mode (no query): chronological listing with filters
 *
 * Common GET params:
 *   query       - Search text (optional; omit for browse mode)
 *   limit       - Max results (1-100, default 20)
 *   offset      - Skip N results for pagination (default 0)
 *   namespace   - Memory namespace (default 'default')
 *   memory_type - Filter: fact|preference|experience|relationship|instruction
 *   tags        - Filter: comma-separated, matches memories with ANY of these tags
 *   agent_id    - Filter: agent scope
 *   scope       - Filter: user|session|agent
 *   after       - Filter: created_at > ISO date
 *   before      - Filter: created_at < ISO date
 *   sort        - Sort column: created_at|updated_at|importance (default created_at)
 *   order       - Sort direction: asc|desc (default desc)
 *   mode        - Search strategy: auto|vector|keyword|hybrid|slot (search mode only)
 *   threshold   - Similarity threshold 0-1 (search mode only, default 0.7)
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
import { findDuplicate } from '@/lib/memory/dedup';
import { scoreImportance } from '@/lib/memory/auto-score';
import {
  applyPersonalizedRanking,
  getOrCreateLearningProfile,
} from '@/lib/memory/personalization';
import { analyzeContentIntegrity } from '@/lib/memory/content-integrity';
import {
  applyRouterLearning,
  recordRouterOutcome,
  type RouterLearningDecision,
} from '@/lib/memory/router-learning';
import { executeMemorySearch } from '@/lib/memory/search-executor';
import { createDetector } from '@/lib/prompt-firewall/scanner';
import { compareThreatLevel } from '@/lib/prompt-firewall/patterns';
import crypto from 'crypto';
import { emitWebhookEvent } from '@/lib/webhook-emit';
import {
  getActiveAssignment,
  recordRequestResult,
  type TrafficAssignment,
} from '@/lib/fall/canary';
import type { AddMemoryRequest } from '@/types/database';

const META = { version: 'v1' as const };
const ENCRYPTED_PLACEHOLDER = '[encrypted]';

type SearchResultRow = {
  id: string;
  content: string;
  memory_type: string;
  importance?: number;
  similarity?: number;
  rrf_score?: number;
  created_at?: string;
  tags?: string[];
  companion_meta?: Record<string, unknown>;
  agent_id?: string;
  scope?: string;
};

function isMissingContentHashColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  return (error.message || '').toLowerCase().includes('content_hash');
}

/** Merge extra headers into a NextResponse */
function withHeaders(response: NextResponse, headers?: Record<string, string>): NextResponse {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

function parseCanaryForcedMode(
  assignment: TrafficAssignment | null
): Exclude<SearchMode, 'auto'> | null {
  const raw =
    assignment &&
    assignment.assignedVersion === 'canary' &&
    assignment.version?.config &&
    typeof assignment.version.config === 'object'
      ? (assignment.version.config as Record<string, unknown>).force_mode
      : null;

  if (raw === 'slot' || raw === 'keyword' || raw === 'hybrid' || raw === 'vector') {
    return raw;
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolve userId from API key auth or session auth.
 *
 * Design note: The session fallback exists so that logged-in dashboard users
 * can call v1 endpoints without needing an API key (e.g. the "Try it" panel).
 * When the session fallback is used, we resolve the user's plan from their
 * profile so that plan-gated features (encrypted memory, etc.) work correctly.
 */
async function resolveAuth(
  request: NextRequest
): Promise<
  | { userId: string; keyId: string | null; plan: string | null; rateLimitHeaders?: Record<string, string> }
  | { error: NextResponse }
> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return {
      userId: authResult.userId,
      keyId: authResult.keyId,
      plan: authResult.plan,
      rateLimitHeaders: authResult.rateLimitHeaders,
    };
  }

  const session = await auth();
  if (session?.user?.id) {
    // Resolve plan from profile for session-based users
    const supabase = createServerClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', session.user.id)
      .maybeSingle();
    return { userId: session.user.id, keyId: null, plan: profile?.plan || 'free' };
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
    const body: AddMemoryRequest = await safeJsonParse<AddMemoryRequest>(request);
    const isEncrypted = (body as unknown as Record<string, unknown>).is_encrypted === true;
    const encryptedContent = body.encrypted_content;

    if (isEncrypted) {
      if (!encryptedContent || encryptedContent.trim().length === 0) {
        if (keyId) {
          await logRequest(
            { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
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
            { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
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
      return NextResponse.json(
        { success: false, error: { code: 'invalid_field', message: `memory_type must be one of: ${VALID_MEMORY_TYPES.join(', ')}` }, meta: META },
        { status: 400 }
      );
    }

    // Validate tags
    if (body.tags) {
      if (!Array.isArray(body.tags)) {
        return NextResponse.json(
          { success: false, error: { code: 'invalid_field', message: 'tags must be an array of strings' }, meta: META },
          { status: 400 }
        );
      }
      if (body.tags.length > 50) {
        return NextResponse.json(
          { success: false, error: { code: 'invalid_field', message: 'Maximum 50 tags allowed' }, meta: META },
          { status: 400 }
        );
      }
      if (body.tags.some((t: unknown) => typeof t !== 'string' || (t as string).length > 100)) {
        return NextResponse.json(
          { success: false, error: { code: 'invalid_field', message: 'Each tag must be a string of max 100 characters' }, meta: META },
          { status: 400 }
        );
      }
    }

    // Validate namespace (alphanumeric start, 1-64 chars)
    if (body.namespace && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(body.namespace)) {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_field', message: 'namespace must start with alphanumeric, contain only alphanumeric/hyphens/underscores, and be 1-64 characters' }, meta: META },
        { status: 400 }
      );
    }

    // Deduplicate tags
    if (body.tags && Array.isArray(body.tags)) {
      body.tags = [...new Set(body.tags)];
    }

    const supabase = createServerClient();
    const namespace = body.namespace || 'default';

    if (isEncrypted) {
      let effectivePlan = result.plan;
      if (!effectivePlan) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan')
          .eq('id', userId)
          .maybeSingle();
        effectivePlan = profile?.plan || 'free';
      }

      if (!canUseEncryptedMemories(effectivePlan)) {
        if (keyId) {
          await logRequest(
            { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
            403
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: getEncryptedMemoryPlanError(),
            meta: { ...META, latencyMs: Date.now() - startTime },
          },
          { status: 403 }
        );
      }
    }

    // Sanitize: strip null bytes (PostgreSQL text columns reject \0)
    let sanitizedContent = (body.content || '').replace(/\x00/g, '');
    if (!isEncrypted && sanitizedContent) {
      const detector = createDetector({ mode: 'sanitize' });
      const firewallResult = detector.scan(sanitizedContent);
      if (firewallResult.detected && compareThreatLevel(firewallResult.threatLevel, 'critical') >= 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'prompt_firewall_blocked',
              message: 'Content blocked by security policy',
              threatLevel: firewallResult.threatLevel,
            },
            meta: { ...META, latencyMs: Date.now() - startTime },
          },
          { status: 400 }
        );
      }
      if (firewallResult.sanitizedInput && firewallResult.sanitizedInput.trim().length > 0) {
        sanitizedContent = firewallResult.sanitizedInput;
      }
    }
    const integrityWarnings = !isEncrypted
      ? analyzeContentIntegrity(sanitizedContent).warnings
      : [];

    // Dedup check (opt-out with dedup=false)
    let embedding: number[] | null = null;
    if (!isEncrypted) {
      embedding = await createEmbedding(sanitizedContent);

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
            meta: { ...META, latencyMs: Date.now() - startTime, integrityWarnings },
          });
        }
      }
    }

    // Auto importance scoring (opt-in with auto_score=true)
    let importance = 5;
    if (!isEncrypted && (body as unknown as Record<string, unknown>).auto_score === true) {
      importance = await scoreImportance(sanitizedContent);
    }

    // Compute content hash for dedup safety net (unique index on user_id + namespace + content_hash)
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
      importance,
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
      importance: number;
      created_at: string;
    } | null = null;

    let insertError: { code?: string | null; message?: string | null } | null = null;

    {
      const result = await supabase
        .from('memories')
        .insert(insertPayload)
        .select('id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, importance, created_at')
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
        .select('id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, importance, created_at')
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
          if (keyId) {
            await logRequest(
              { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
              200
            );
          }
          return NextResponse.json({
            success: true,
            data: {
              memory: { id: existing.id, content: existing.content },
              deduplicated: true,
              similarity: 1.0,
            },
            meta: { ...META, latencyMs: Date.now() - startTime, integrityWarnings },
          });
        }
      }

      console.error('[v1/memories] Insert error:', insertError);
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
          500
        );
      }
      return ServerErrors.database('insert_memory');
    }

    if (!memory) {
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
          500
        );
      }
      return ServerErrors.database('insert_memory');
    }

    await incrementMemoryVersion(userId, namespace);

    // Emit webhook event (non-blocking)
    emitWebhookEvent(userId, 'memory.created', {
      memory: { id: memory.id, content: memory.content, memory_type: memory.memory_type },
    }, namespace).catch(console.error);

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
        200,
        { embedding: isEncrypted ? 0 : sanitizedContent.length }
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        data: { memory },
        meta: { ...META, latencyMs: Date.now() - startTime, integrityWarnings },
      }),
      result.rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/memories] POST error:', error);
    return ServerErrors.internal('add_memory');
  }
}

/** Valid sort columns for browse mode */
const BROWSE_SORT_COLUMNS = ['created_at', 'updated_at', 'importance'] as const;
type BrowseSortColumn = (typeof BROWSE_SORT_COLUMNS)[number];

const MEMORY_SELECT_FIELDS =
  'id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, importance, source, scope, agent_id, created_at, updated_at';

// GET /api/v1/memories - Search (with query) or Browse (without query)
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await resolveAuth(request);
    if ('error' in result) return result.error;

    const { userId, keyId } = result;
    const { searchParams } = new URL(request.url);

    // Common params
    const query =
      searchParams.get('query')?.trim() || searchParams.get('q')?.trim() || null;
    const { limit, offset } = parsePagination(searchParams, { limit: 20 });
    const namespace = searchParams.get('namespace') || 'default';
    const agentId = searchParams.get('agent_id');
    const scope = searchParams.get('scope');
    const memoryType = searchParams.get('memory_type');
    const tagsParam = searchParams.get('tags');
    const after = searchParams.get('after');
    const before = searchParams.get('before');
    const sortRaw = searchParams.get('sort') || 'created_at';
    const sort: BrowseSortColumn = BROWSE_SORT_COLUMNS.includes(sortRaw as BrowseSortColumn)
      ? (sortRaw as BrowseSortColumn)
      : 'created_at';
    const order = searchParams.get('order') === 'asc' ? true : false; // ascending?
    const supabase = createServerClient();

    // ----------------------------------------------
    // BROWSE MODE - no query, return paginated list
    // ----------------------------------------------
    if (!query) {
      let q = supabase
        .from('memories')
        .select(MEMORY_SELECT_FIELDS, { count: 'exact' })
        .eq('user_id', userId)
        .eq('is_deleted', false);

      // Namespace filter
      if (namespace !== 'default') {
        q = q.eq('namespace', namespace);
      }

      // Optional filters
      if (memoryType) q = q.eq('memory_type', memoryType);
      if (agentId) q = q.eq('agent_id', agentId);
      if (scope) q = q.eq('scope', scope);
      if (after) q = q.gt('created_at', after);
      if (before) q = q.lt('created_at', before);
      if (tagsParam) {
        const tags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);
        if (tags.length > 0) q = q.overlaps('tags', tags);
      }

      // Sort & paginate
      q = q.order(sort, { ascending: order }).range(offset, offset + limit - 1);

      const { data: memories, error: browseError, count } = await q;

      if (browseError) {
        console.error('[v1/memories] Browse error:', browseError);
        if (keyId) {
          await logRequest(
            { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
            500
          );
        }
        return ServerErrors.database('browse_memories');
      }

      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
          200,
          { embedding: 0 }
        );
      }

      logMemoryAccess(request, userId, keyId ?? undefined, 'search', {
        memoryCount: memories?.length || 0,
      }).catch(console.error);

      return withHeaders(
        NextResponse.json({
          success: true,
          data: {
            mode: 'browse',
            results: memories || [],
            count: memories?.length || 0,
            total: count ?? 0,
            offset,
            limit,
          },
          meta: { ...META, cached: false, latencyMs: Date.now() - startTime },
        }),
        result.rateLimitHeaders
      );
    }

    // ----------------------------------------------
    // SEARCH MODE - query provided
    // ----------------------------------------------
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');
    let effectiveQuery = query;
    const queryDetector = createDetector({ mode: 'sanitize' });
    const queryFirewall = queryDetector.scan(query);
    if (queryFirewall.detected && compareThreatLevel(queryFirewall.threatLevel, 'critical') >= 0) {
      return ValidationErrors.invalidField('query', 'Query blocked by security policy');
    }
    if (queryFirewall.sanitizedInput && queryFirewall.sanitizedInput.trim().length > 0) {
      effectiveQuery = queryFirewall.sanitizedInput.trim();
    }
    const requestedMode = (searchParams.get('mode') || 'auto') as SearchMode;
    const canaryAssignment = getActiveAssignment(userId, {
      collectionId: namespace,
      sessionId: searchParams.get('session_id') || request.headers.get('x-session-id') || undefined,
    });
    const canaryForcedMode = parseCanaryForcedMode(canaryAssignment);
    let canaryOverrideApplied = false;

    let actualMode: Exclude<SearchMode, 'auto'>;
    let routerDecision = null;
    let routerLearningDecision: RouterLearningDecision | null = null;

    if (requestedMode === 'auto') {
      routerDecision = routeQuery(effectiveQuery);
      routerLearningDecision = await applyRouterLearning(
        supabase,
        userId,
        namespace,
        effectiveQuery,
        routerDecision
      );
      actualMode = routerLearningDecision.strategy;
    } else {
      actualMode = requestedMode as Exclude<SearchMode, 'auto'>;
    }

    if (requestedMode === 'auto' && canaryForcedMode && canaryForcedMode !== actualMode) {
      actualMode = canaryForcedMode;
      canaryOverrideApplied = true;
    }

    // Slot lookups
    if (actualMode === 'slot') {
      const slotKey = detectSlotQuery(effectiveQuery);
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
          query: effectiveQuery,
        }).catch(console.error);

        if (slotValue) {
          recordRouterOutcome(supabase, {
            userId,
            namespace,
            query: effectiveQuery,
            strategy: 'slot',
            latencyMs: Date.now() - startTime,
            resultCount: 1,
            topScore: 1,
          }).catch(console.error);

          if (canaryAssignment) {
            try {
              recordRequestResult({
                deploymentId: canaryAssignment.deploymentId,
                version: canaryAssignment.assignedVersion,
                success: true,
                latencyMs: Date.now() - startTime,
                qualityScore: 1,
              });
            } catch (canaryMetricError) {
              console.error('[v1/memories] Canary metric record failed:', canaryMetricError);
            }
          }

          return NextResponse.json({
            success: true,
            data: {
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
              offset: 0,
              limit,
              routerDecision: routerDecision ? {
                strategy: routerDecision.strategy,
                confidence: routerDecision.confidence,
                reason: routerDecision.reason,
              } : null,
              routerLearning: routerLearningDecision ? {
                applied: routerLearningDecision.learningApplied,
                reason: routerLearningDecision.reason,
                queryBucket: routerLearningDecision.queryBucket,
                statsAvailable: routerLearningDecision.statsAvailable,
                sampleCount: routerLearningDecision.sampleCount,
                scoreDelta: routerLearningDecision.scoreDelta,
                scores: routerLearningDecision.scores,
              } : null,
              canary: canaryAssignment ? {
                deploymentId: canaryAssignment.deploymentId,
                assignedVersion: canaryAssignment.assignedVersion,
                overrideApplied: canaryOverrideApplied,
                forcedMode: canaryForcedMode,
              } : null,
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
    const cacheResult = await getCachedQueryResults(userId, effectiveQuery, namespace, actualMode);
    if (cacheResult.hit && cacheResult.results.length > 0) {
      const personalizationState = await getOrCreateLearningProfile(supabase, userId, namespace);
      const personalizedResults =
        personalizationState.available && personalizationState.profile.personalizationEnabled
          ? applyPersonalizedRanking(cacheResult.results, personalizationState.profile, effectiveQuery)
          : cacheResult.results;

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
        query: effectiveQuery,
      }).catch(console.error);

      recordRouterOutcome(supabase, {
        userId,
        namespace,
        query: effectiveQuery,
        strategy: actualMode,
        latencyMs: Date.now() - startTime,
        resultCount: personalizedResults.length,
        topScore: Number((personalizedResults[0] as { similarity?: number; rrf_score?: number } | undefined)?.similarity
          ?? (personalizedResults[0] as { similarity?: number; rrf_score?: number } | undefined)?.rrf_score
          ?? 0),
      }).catch(console.error);

      if (canaryAssignment) {
        try {
          recordRequestResult({
            deploymentId: canaryAssignment.deploymentId,
            version: canaryAssignment.assignedVersion,
            success: true,
            latencyMs: Date.now() - startTime,
            qualityScore: clamp(
              Number((personalizedResults[0] as { similarity?: number; rrf_score?: number } | undefined)?.similarity
                ?? (personalizedResults[0] as { similarity?: number; rrf_score?: number } | undefined)?.rrf_score
                ?? 0),
              0,
              1
            ),
          });
        } catch (canaryMetricError) {
          console.error('[v1/memories] Canary metric record failed:', canaryMetricError);
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          mode: actualMode,
          requestedMode,
          results: personalizedResults,
          count: personalizedResults.length,
          total: personalizedResults.length,
          offset: 0,
          limit,
          routerDecision: routerDecision ? {
            strategy: routerDecision.strategy,
            confidence: routerDecision.confidence,
            reason: routerDecision.reason,
          } : null,
          routerLearning: routerLearningDecision ? {
            applied: routerLearningDecision.learningApplied,
            reason: routerLearningDecision.reason,
            queryBucket: routerLearningDecision.queryBucket,
            statsAvailable: routerLearningDecision.statsAvailable,
            sampleCount: routerLearningDecision.sampleCount,
            scoreDelta: routerLearningDecision.scoreDelta,
            scores: routerLearningDecision.scores,
          } : null,
          canary: canaryAssignment ? {
            deploymentId: canaryAssignment.deploymentId,
            assignedVersion: canaryAssignment.assignedVersion,
            overrideApplied: canaryOverrideApplied,
            forcedMode: canaryForcedMode,
          } : null,
          personalization: {
            enabled: personalizationState.profile.personalizationEnabled,
            applied:
              personalizationState.available && personalizationState.profile.personalizationEnabled,
            available: personalizationState.available,
          },
        },
        meta: { ...META, cached: true, latencyMs: Date.now() - startTime },
      });
    }

    const nsParam = namespace === 'default' ? null : namespace;
    const applyResultFilters = (input: SearchResultRow[] | null): SearchResultRow[] | null => {
      if (!input) return input;
      return input.filter((m: Record<string, unknown>) => {
        if (agentId && m.agent_id !== agentId) return false;
        if (scope && m.scope !== scope) return false;
        if (memoryType && m.memory_type !== memoryType) return false;
        if (after && typeof m.created_at === 'string' && m.created_at <= after) return false;
        if (before && typeof m.created_at === 'string' && m.created_at >= before) return false;
        if (tagsParam) {
          const filterTags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);
          const memTags = Array.isArray(m.tags) ? (m.tags as string[]) : [];
          if (filterTags.length > 0 && !filterTags.some((t) => memTags.includes(t))) return false;
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
      queryText: effectiveQuery,
      userId,
      limit,
      namespaceParam: nsParam,
      threshold: routerDecision?.suggestedParams.threshold || threshold,
      createQueryEmbedding,
      applyFilters: applyResultFilters,
    });

    const { results, resolvedMode, fallback, error: searchError } = searchExecution;

    if (searchError) {
      console.error('[v1/memories] Search error:', searchError);
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
          500
        );
      }
      if (canaryAssignment) {
        try {
          recordRequestResult({
            deploymentId: canaryAssignment.deploymentId,
            version: canaryAssignment.assignedVersion,
            success: false,
            latencyMs: Date.now() - startTime,
            errorMessage: searchError.message || 'search_error',
          });
        } catch (canaryMetricError) {
          console.error('[v1/memories] Canary failure metric record failed:', canaryMetricError);
        }
      }
      return ServerErrors.database('search_memories');
    }

    // Cache base results before personalization (profile can change quickly).
    if (results && results.length > 0) {
      const cacheableResults: CachedMemory[] = results.map((r) => ({
        id: r.id,
        content: r.content,
        memory_type: r.memory_type,
        importance: typeof r.importance === 'number' ? r.importance : 5,
        similarity: typeof r.similarity === 'number' ? r.similarity : undefined,
        rrf_score: typeof r.rrf_score === 'number' ? r.rrf_score : undefined,
      }));
      setCachedQueryResults(userId, effectiveQuery, namespace, resolvedMode, cacheableResults).catch(
        console.error
      );
    }

    const personalizationState = await getOrCreateLearningProfile(supabase, userId, namespace);
    const personalizedResults =
      results && personalizationState.available && personalizationState.profile.personalizationEnabled
        ? applyPersonalizedRanking(results, personalizationState.profile, effectiveQuery)
        : (results || []);

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
        200,
        { embedding: resolvedMode !== 'keyword' ? effectiveQuery.length : 0 }
      );
    }

    if (results && results.length > 0) {
      Promise.all(results.map((m: { id: string }) => trackMemoryAccess(m.id))).catch(
        console.error
      );
    }

    logMemoryAccess(request, userId, keyId ?? undefined, 'search', {
      memoryCount: personalizedResults.length,
      query: effectiveQuery,
    }).catch(console.error);

    const topSimilarity = clamp(
      Number((personalizedResults[0] as { similarity?: number; rrf_score?: number } | undefined)?.similarity
        ?? (personalizedResults[0] as { similarity?: number; rrf_score?: number } | undefined)?.rrf_score
        ?? 0),
      0,
      1
    );

    recordRouterOutcome(supabase, {
      userId,
      namespace,
      query: effectiveQuery,
      strategy: resolvedMode,
      latencyMs: Date.now() - startTime,
      resultCount: personalizedResults.length,
      topScore: topSimilarity,
    }).catch(console.error);

    if (canaryAssignment) {
      try {
        recordRequestResult({
          deploymentId: canaryAssignment.deploymentId,
          version: canaryAssignment.assignedVersion,
          success: true,
          latencyMs: Date.now() - startTime,
          qualityScore: topSimilarity,
        });
      } catch (canaryMetricError) {
        console.error('[v1/memories] Canary metric record failed:', canaryMetricError);
      }
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        data: {
          mode: resolvedMode,
          requestedMode,
          results: personalizedResults,
          count: personalizedResults.length,
          total: personalizedResults.length,
          offset: 0,
          limit,
          routerDecision: routerDecision ? {
            strategy: routerDecision.strategy,
            confidence: routerDecision.confidence,
            reason: routerDecision.reason,
          } : null,
          routerLearning: routerLearningDecision ? {
            applied: routerLearningDecision.learningApplied,
            reason: routerLearningDecision.reason,
            queryBucket: routerLearningDecision.queryBucket,
            statsAvailable: routerLearningDecision.statsAvailable,
            sampleCount: routerLearningDecision.sampleCount,
            scoreDelta: routerLearningDecision.scoreDelta,
            scores: routerLearningDecision.scores,
          } : null,
          canary: canaryAssignment ? {
            deploymentId: canaryAssignment.deploymentId,
            assignedVersion: canaryAssignment.assignedVersion,
            overrideApplied: canaryOverrideApplied,
            forcedMode: canaryForcedMode,
          } : null,
          fallback,
          personalization: {
            enabled: personalizationState.profile.personalizationEnabled,
            applied:
              personalizationState.available && personalizationState.profile.personalizationEnabled,
            available: personalizationState.available,
          },
        },
        meta: { ...META, cached: false, latencyMs: Date.now() - startTime },
      }),
      result.rateLimitHeaders
    );
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

    await incrementMemoryVersion(userId, namespace);

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

    return withHeaders(
      NextResponse.json({
        success: true,
        data: { deleted: ids.length },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      result.rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/memories] DELETE error:', error);
    return ServerErrors.internal('delete_memories');
  }
}
