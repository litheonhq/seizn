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
import { logServerError, logServerWarn } from '@/lib/server/logger';
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
import { findDuplicate } from '@/lib/memory/dedup';
import {
  estimateMemorySizeBytes,
  recordBudgetWrite,
  recordRecall,
  reserveHotSpace,
  resolveBudgetEntityId,
  resolveMemoryBudgetOrganizationId,
} from '@/lib/memory/budget';
import {
  filterResultsByPerspective,
  resolveBeliefOrganizationId,
} from '@/lib/memory/belief';
import {
  applyDecayRerank,
  reinforceOnRecall,
  type MemoryWithDecay,
} from '@/lib/memory/decay';
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
import { executeMemorySearch, type SearchExecutionMode } from '@/lib/memory/search-executor';
import { toCachedMemories, type SearchResultRow } from '@/lib/memory/search-types';
import {
  mirrorLegacyMemoryToSpringV4,
  searchViaSpringV4Bridge,
  softDeleteSpringMirrorsByLegacyIds,
} from '@/lib/memory/v1-spring-bridge';
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
import {
  assertRetentionAllowed,
  ComplianceError,
  normalizeAgeBracket,
} from '@/lib/compliance/age-gate';
import { resolveComplianceOrganizationId } from '@/lib/compliance/organization';
import {
  runDegradedKeywordSearch,
  shouldUseDegradedKeywordSearchFallback,
} from '@/lib/memory/degraded-keyword-search';
import {
  DEFAULT_MODERATION_ORGANIZATION_ID,
  isModerationEnabled,
  moderate,
  ModerationError,
  moderateRecallResults,
  resolveModerationOrganizationId,
  type ModerationResult,
} from '@/lib/moderation/guard';
import {
  applySceneBoost,
  resolveSceneContext,
  type SceneContext,
} from '@/lib/memory/scenes';
import { createDetector } from '@/lib/prompt-firewall/scanner';
import { compareThreatLevel } from '@/lib/prompt-firewall/patterns';
import crypto from 'crypto';
import { emitWebhookEvent } from '@/lib/webhook-emit';
import {
  getActiveAssignment,
  recordRequestResult,
  type TrafficAssignment,
} from '@/lib/fall/canary';
import {
  captureNextRoute,
  resolveReplayOrganizationId,
} from '@/lib/replay/snapshot';
import {
  isReplayCaptureActive,
  recordMemoryReads,
  recordMemoryWrite,
  setReplayActor,
} from '@/lib/replay/capture';
import type { AddMemoryRequest } from '@/types/database';

const META = { version: 'v1' as const };
const ENCRYPTED_PLACEHOLDER = '[encrypted]';
const SEARCH_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.MEMORY_SEARCH_TIMEOUT_MS || '', 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 2500;
})();
const MEMORY_V1_SPRING_BRIDGE_SEARCH_ENABLED =
  process.env.MEMORY_V1_SPRING_BRIDGE_SEARCH !== 'false';
const MEMORY_V1_SPRING_BRIDGE_MIRROR_ENABLED =
  process.env.MEMORY_V1_SPRING_BRIDGE_MIRROR !== 'false';
const MEMORY_V1_SPRING_BRIDGE_MIRROR_REQUIRED =
  process.env.MEMORY_V1_SPRING_BRIDGE_MIRROR_REQUIRED === 'true';
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

function getRequestMemoryClass(body: AddMemoryRequest): string | null {
  const raw = (body as unknown as Record<string, unknown>).memory_class;
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  return body.memory_type || null;
}

function getModerationMeta(result: ModerationResult | null): {
  status?: string;
  scores?: Record<string, number>;
} {
  if (!result) return {};
  return {
    status: result.status,
    scores: result.scores,
  };
}

function isMissingContentHashColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  return (error.message || '').toLowerCase().includes('content_hash');
}

function isMissingMemoryComplianceColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return error.code === '42703' && (
    message.includes('subject_id') ||
    message.includes('organization_id')
  );
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function complianceErrorResponse(error: ComplianceError, startTime: number): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
      meta: { ...META, latencyMs: Date.now() - startTime },
    },
    { status: error.status }
  );
}

function isMissingBudgetColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error || error.code !== '42703') return false;
  const message = (error.message || '').toLowerCase();
  return [
    'organization_id',
    'entity_id',
    'tier',
    'pinned',
    'last_recalled_at',
    'recall_count',
    'size_bytes',
  ].some((column) => message.includes(column));
}

function stripBudgetColumns<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  const legacyPayload: Record<string, unknown> = { ...payload };
  delete legacyPayload.organization_id;
  delete legacyPayload.entity_id;
  delete legacyPayload.tier;
  delete legacyPayload.pinned;
  delete legacyPayload.last_recalled_at;
  delete legacyPayload.recall_count;
  delete legacyPayload.size_bytes;
  return legacyPayload;
}

function isMissingDecayColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error || error.code !== '42703') return false;
  const message = (error.message || '').toLowerCase();
  return [
    'memory_class',
    'half_life_hours',
    'base_strength',
    'last_reinforced_at',
  ].some((column) => message.includes(column));
}

function stripDecayColumns<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  const legacyPayload: Record<string, unknown> = { ...payload };
  delete legacyPayload.memory_class;
  delete legacyPayload.half_life_hours;
  delete legacyPayload.base_strength;
  delete legacyPayload.last_reinforced_at;
  return legacyPayload;
}

function isMissingModerationColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error || error.code !== '42703') return false;
  const message = (error.message || '').toLowerCase();
  return ['moderation_status', 'moderation_scores'].some((column) => message.includes(column));
}

function stripModerationColumns<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  const legacyPayload: Record<string, unknown> = { ...payload };
  delete legacyPayload.moderation_status;
  delete legacyPayload.moderation_scores;
  return legacyPayload;
}

function getImageAttachmentClientErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error) || !error.message) return null;
  const lowered = error.message.toLowerCase();
  const matched = IMAGE_ATTACHMENT_CLIENT_ERROR_PATTERNS.some((token) => lowered.includes(token));
  return matched ? error.message : null;
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

function trackRetrievedMemoryIds(
  ids: string[],
  supabase: ReturnType<typeof createServerClient>,
  context: Record<string, unknown>
) {
  if (ids.length === 0) return;
  Promise.all(
    ids.map((id) =>
      Promise.allSettled([
        trackMemoryAccess(id),
        recordRecall(id, supabase),
        reinforceOnRecall(id, supabase),
      ])
    )
  ).catch((error) => {
    logServerError('[v1/memories] Access tracking failed', error, context);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function parseSceneEntityIds(searchParams: URLSearchParams, agentId: string | null): string[] {
  const raw =
    searchParams.get('entity_ids') ||
    searchParams.get('entity_id') ||
    searchParams.get('scene_entity_ids') ||
    '';
  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);
  if (agentId) ids.push(agentId);
  return [...new Set(ids)];
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
    if (isReplayCaptureActive()) {
      setReplayActor({
        userId: authResult.userId,
        apiKeyId: authResult.keyId,
        organizationId: await resolveReplayOrganizationId(authResult.userId, authResult.keyId),
      });
    }
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
    if (isReplayCaptureActive()) {
      setReplayActor({
        userId: session.user.id,
        organizationId: await resolveReplayOrganizationId(session.user.id, null),
      });
    }
    return { userId: session.user.id, keyId: null, plan: profile?.plan || 'free' };
  }

  return { error: authErrorResponse(authResult.authError) };
}

// POST /api/v1/memories
export async function POST(request: NextRequest) {
  const requestBody = await request.clone().json().catch(() => null);
  return captureNextRoute(request, '/api/v1/memories', requestBody, () => handlePost(request));
}

async function handlePost(request: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await resolveAuth(request);
    if ('error' in result) return result.error;

    const { userId, keyId } = result;
    const body: AddMemoryRequest = await safeJsonParse<AddMemoryRequest>(request);
    const rawBody = body as unknown as Record<string, unknown>;
    const subjectId = normalizeOptionalText(rawBody.subject_id) ?? normalizeOptionalText(rawBody.external_id);
    const ageBracket = normalizeAgeBracket(rawBody.age_bracket);
    const isEncrypted = (body as unknown as Record<string, unknown>).is_encrypted === true;
    const encryptedContent = body.encrypted_content;
    const hasImageAttachment = hasMemoryImagePayload(body);
    const imageValidationError = validateMemoryImagePayload(body);
    if (imageValidationError) {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_field', message: imageValidationError }, meta: META },
        { status: 400 }
      );
    }

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
    const organizationId =
      (await resolveComplianceOrganizationId(supabase, { userId, keyId })) ??
      (await resolveMemoryBudgetOrganizationId(supabase, { userId, keyId }));
    const entityId = resolveBudgetEntityId({
      entityId: rawBody.entity_id,
      agentId: body.agent_id,
      sessionId: body.session_id,
      userId,
    });

    try {
      await assertRetentionAllowed(supabase, {
        organizationId,
        subjectId,
        bracket: ageBracket,
      });
    } catch (error) {
      if (error instanceof ComplianceError) {
        if (keyId) {
          await logRequest(
            { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
            error.status
          );
        }
        return complianceErrorResponse(error, startTime);
      }
      throw error;
    }

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
    const sizeBytes = estimateMemorySizeBytes(
      isEncrypted ? encryptedContent || '' : sanitizedContent
    );

    const budgetReservation = await reserveHotSpace(
      { organizationId, entityId, sizeBytes },
      supabase
    );
    if (!budgetReservation.ok) {
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
          429
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'memory_budget_exceeded',
            message: 'Hot memory budget exceeded and no demotable memory remains.',
            demoted_ids: budgetReservation.demotedIds,
          },
          meta: {
            ...META,
            latencyMs: Date.now() - startTime,
            hotUsedBytes: budgetReservation.hotUsedBytes,
            hotBudgetBytes: budgetReservation.hotBudgetBytes,
          },
        },
        { status: 429 }
      );
    }

    let moderationResult: ModerationResult | null = null;
    let moderationOrganizationId: string | null = null;
    if (!isEncrypted && isModerationEnabled()) {
      moderationOrganizationId = await resolveModerationOrganizationId(supabase, { userId, keyId });
      try {
        moderationResult = await moderate({
          organizationId: moderationOrganizationId || DEFAULT_MODERATION_ORGANIZATION_ID,
          memoryClass: getRequestMemoryClass(body),
          content: sanitizedContent,
          supabase,
        });
      } catch (error) {
        if (error instanceof ModerationError) {
          if (keyId) {
            await logRequest(
              { userId, keyId, endpoint: '/api/v1/memories', method: 'POST', startTime },
              400
            );
          }
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'memory_moderation_blocked',
                message: 'Content blocked by moderation policy',
                moderation: error.result,
              },
              meta: { ...META, latencyMs: Date.now() - startTime, integrityWarnings },
            },
            { status: 400 }
          );
        }
        throw error;
      }

      if (moderationResult.status === 'redacted' && moderationResult.redactedContent) {
        sanitizedContent = moderationResult.redactedContent;
      }
    }

    // Dedup check (opt-out with dedup=false)
    let embedding: number[] | null = null;
    if (!isEncrypted) {
      embedding = await createEmbedding(sanitizedContent);

      const dedupEnabled =
        (body as unknown as Record<string, unknown>).dedup !== false && !hasImageAttachment && !subjectId;
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
    const contentHash =
      isEncrypted || hasImageAttachment
        ? null
        : crypto.createHash('sha256').update(sanitizedContent).digest('hex');

    const insertPayload = {
      user_id: userId,
      organization_id: organizationId,
      subject_id: subjectId,
      entity_id: entityId,
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
      memory_class:
        typeof (body as unknown as Record<string, unknown>).memory_class === 'string'
          ? (body as unknown as Record<string, string>).memory_class
          : 'default',
      half_life_hours:
        typeof (body as unknown as Record<string, unknown>).half_life_hours === 'number'
          ? (body as unknown as Record<string, number>).half_life_hours
          : null,
      base_strength: 1.0,
      last_reinforced_at: new Date().toISOString(),
      content_hash: contentHash,
      tier: 'hot',
      pinned: rawBody.pinned === true,
      last_recalled_at: null,
      recall_count: 0,
      size_bytes: sizeBytes,
      ...(moderationResult
        ? {
            moderation_status: moderationResult.status,
            moderation_scores: moderationResult.scores,
          }
        : {}),
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
      moderation_status?: string;
      moderation_scores?: Record<string, number> | null;
      created_at: string;
    } | null = null;

    let insertError: { code?: string | null; message?: string | null } | null = null;
    let legacyInsertPayload: Record<string, unknown> = { ...insertPayload };

    {
      const result = await supabase
        .from('memories')
        .insert(insertPayload)
        .select('id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, importance, created_at')
        .single();
      memory = result.data;
      insertError = result.error;
    }

    // Backward compatibility: if recent additive migrations are not applied yet,
    // retry without optional columns while preserving the legacy memory contract.
    for (let attempt = 0; insertError && attempt < 3; attempt += 1) {
      let changedPayload = false;
      if (isMissingContentHashColumnError(insertError) && 'content_hash' in legacyInsertPayload) {
        delete legacyInsertPayload.content_hash;
        changedPayload = true;
      }
      if (isMissingMemoryComplianceColumnError(insertError)) {
        if ('subject_id' in legacyInsertPayload) {
          delete legacyInsertPayload.subject_id;
          changedPayload = true;
        }
        if ('organization_id' in legacyInsertPayload) {
          delete legacyInsertPayload.organization_id;
          changedPayload = true;
        }
      }
      if (isMissingBudgetColumnError(insertError)) {
        const strippedPayload = stripBudgetColumns(legacyInsertPayload);
        changedPayload =
          changedPayload ||
          Object.keys(strippedPayload).length !== Object.keys(legacyInsertPayload).length;
        legacyInsertPayload = strippedPayload;
      }
      if (isMissingDecayColumnError(insertError)) {
        const strippedPayload = stripDecayColumns(legacyInsertPayload);
        changedPayload =
          changedPayload ||
          Object.keys(strippedPayload).length !== Object.keys(legacyInsertPayload).length;
        legacyInsertPayload = strippedPayload;
      }
      if (isMissingModerationColumnError(insertError)) {
        const strippedPayload = stripModerationColumns(legacyInsertPayload);
        changedPayload =
          changedPayload ||
          Object.keys(strippedPayload).length !== Object.keys(legacyInsertPayload).length;
        legacyInsertPayload = strippedPayload;
      }
      if (!changedPayload) break;
      const retry = await supabase
        .from('memories')
        .insert(legacyInsertPayload)
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

      logServerError('[v1/memories] Insert error', insertError, { userId, namespace });
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

    recordMemoryWrite({
      entityId: body.agent_id || body.session_id || userId,
      memoryId: memory.id,
      op: 'create',
      payload: {
        content: memory.content,
        memory_type: memory.memory_type,
        namespace: memory.namespace,
        tags: memory.tags,
        importance: memory.importance,
        encrypted: memory.is_encrypted,
      },
    });

    recordBudgetWrite(
      { organizationId, entityId, memoryId: memory.id, sizeBytes },
      supabase
    ).catch((error) => {
      logServerError('[v1/memories] Budget write telemetry failed', error, {
        userId,
        namespace,
        memoryId: memory.id,
      });
    });

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
        // Best-effort rollback to avoid keeping a partially-created memory without attachment.
        const rollback = await supabase
          .from('memories')
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq('id', memory.id)
          .eq('user_id', userId);
        if (rollback.error) {
          logServerError(
            '[v1/memories] CRITICAL: rollback soft-delete failed for memory',
            rollback.error.message,
            { memoryId: memory.id, userId }
          );
        }

        logServerError('[v1/memories] Image attachment error', attachmentError);
        const clientMessage = getImageAttachmentClientErrorMessage(attachmentError);
        if (clientMessage) {
          return NextResponse.json(
            { success: false, error: { code: 'invalid_field', message: clientMessage }, meta: META },
            { status: 400 }
          );
        }
        return ServerErrors.internal('attach_image');
      }
    }

    let springMirror: { mirrored: boolean; springNoteId: string | null; skippedReason: string | null } | null = null;
    if (!MEMORY_V1_SPRING_BRIDGE_MIRROR_ENABLED) {
      springMirror = { mirrored: false, springNoteId: null, skippedReason: 'bridge_disabled' };
    } else if (!isEncrypted) {
      try {
        springMirror = await mirrorLegacyMemoryToSpringV4(supabase, {
          userId,
          memoryId: memory.id,
          content: sanitizedContent,
          embedding,
          memoryType: body.memory_type || 'fact',
          tags: body.tags || [],
          namespace,
          scope: body.scope || 'user',
          sessionId: body.session_id || null,
          agentId: body.agent_id || null,
          source: body.source || 'api',
          importance,
          confidence: 1.0,
          createdAt: memory.created_at || null,
        });
      } catch (springMirrorError) {
        springMirror = { mirrored: false, springNoteId: null, skippedReason: 'mirror_failed' };
        logServerError('[v1/memories] Spring v4 mirror error', springMirrorError);
        if (MEMORY_V1_SPRING_BRIDGE_MIRROR_REQUIRED) {
          const rollback = await supabase
            .from('memories')
            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
            .eq('id', memory.id)
            .eq('user_id', userId);
          if (rollback.error) {
            logServerError(
              '[v1/memories] CRITICAL: rollback after spring mirror failure failed',
              rollback.error.message,
              { memoryId: memory.id, userId }
            );
          }
          return ServerErrors.internal('spring_v4_mirror_failed');
        }
      }
    } else {
      springMirror = { mirrored: false, springNoteId: null, skippedReason: 'encrypted_memory' };
    }

    await incrementMemoryVersion(userId, namespace);

    // Emit webhook event (non-blocking)
    emitWebhookEvent(userId, 'memory.created', {
      memory: { id: memory.id, content: memory.content, memory_type: memory.memory_type },
    }, namespace).catch((error) => {
      logServerError('[v1/memories] memory.created webhook emit failed', error, {
        userId,
        namespace,
        memoryId: memory.id,
      });
    });

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
        data: {
          memory,
          attachments,
          budget: {
            entity_id: entityId,
            size_bytes: sizeBytes,
            demoted_ids: budgetReservation.demotedIds,
            hot_budget_bytes: budgetReservation.hotBudgetBytes,
            hot_used_bytes: budgetReservation.hotUsedBytes,
          },
          bridge: {
            springV4: springMirror,
          },
        },
        meta: {
          ...META,
          latencyMs: Date.now() - startTime,
          integrityWarnings,
          moderation: getModerationMeta(moderationResult),
        },
      }),
      result.rateLimitHeaders
    );
  } catch (error) {
    if (error instanceof ComplianceError) {
      return complianceErrorResponse(error, startTime);
    }
    logServerError('[v1/memories] POST error', error);
    return ServerErrors.internal('add_memory');
  }
}

/** Valid sort columns for browse mode */
const BROWSE_SORT_COLUMNS = ['created_at', 'updated_at', 'importance'] as const;
type BrowseSortColumn = (typeof BROWSE_SORT_COLUMNS)[number];

const MEMORY_SELECT_FIELDS =
  'id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, importance, source, scope, agent_id, entity_id, tier, pinned, recall_count, last_recalled_at, size_bytes, memory_class, half_life_hours, base_strength, last_reinforced_at, moderation_status, moderation_scores, created_at, updated_at';

// GET /api/v1/memories - Search (with query) or Browse (without query)
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  return captureNextRoute(
    request,
    '/api/v1/memories',
    { query: Object.fromEntries(url.searchParams.entries()) },
    () => handleGet(request)
  );
}

async function handleGet(request: NextRequest) {
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
    const perspectiveEntityId = searchParams.get('perspective_entity_id')?.trim() || null;
    const asOfParam = searchParams.get('as_of');
    const sortRaw = searchParams.get('sort') || 'created_at';
    const sort: BrowseSortColumn = BROWSE_SORT_COLUMNS.includes(sortRaw as BrowseSortColumn)
      ? (sortRaw as BrowseSortColumn)
      : 'created_at';
    const order = searchParams.get('order') === 'asc' ? true : false; // ascending?
    const supabase = createServerClient();
    const beliefOrganizationId = perspectiveEntityId
      ? await resolveBeliefOrganizationId(supabase, { userId, keyId })
      : null;
    const filterByPerspective = async <T extends { id: string }>(input: T[]) => {
      if (!perspectiveEntityId) return { memories: input, excluded: [] as Array<{ id: string; reason: string }> };
      return filterResultsByPerspective(supabase, {
        organizationId: beliefOrganizationId,
        perspectiveEntityId,
        asOf: asOfParam || undefined,
        memories: input,
      });
    };
    let recallModerationOrgPromise: Promise<string | null> | null = null;
    const getRecallModerationOrgId = async () => {
      if (!isModerationEnabled()) return null;
      recallModerationOrgPromise ||= resolveModerationOrganizationId(supabase, { userId, keyId });
      return (await recallModerationOrgPromise) || DEFAULT_MODERATION_ORGANIZATION_ID;
    };
    const applyRecallModeration = async <
      T extends { content?: unknown; memory_class?: unknown; memory_type?: unknown }
    >(items: T[]) => {
      const organizationId = await getRecallModerationOrgId();
      if (!organizationId || items.length === 0) return items;
      return moderateRecallResults(organizationId, items, supabase);
    };
    const sceneId = searchParams.get('scene_id');
    const sceneEntityIds = parseSceneEntityIds(searchParams, agentId);
    let sceneContextPromise: Promise<SceneContext | null> | null = null;
    const getSceneContext = async () => {
      if (searchParams.get('scene') === 'false') return null;
      sceneContextPromise ||= resolveSceneContext(supabase, {
        userId,
        namespace,
        sceneId,
        entityIds: sceneEntityIds,
      });
      return sceneContextPromise;
    };

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
        logServerError('[v1/memories] Browse error', browseError, { userId, namespace });
        if (keyId) {
          await logRequest(
            { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
            500
          );
        }
        return ServerErrors.database('browse_memories');
      }

      const moderatedBrowseResults = await applyRecallModeration(memories || []);
      const perspectiveResult = await filterByPerspective(moderatedBrowseResults as SearchResultRow[]);
      const browseResults = perspectiveResult.memories;

      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
          200,
          { embedding: 0 }
        );
      }

      logMemoryAccess(request, userId, keyId ?? undefined, 'search', {
        memoryCount: browseResults.length,
      }).catch((error) => {
        logServerError('[v1/memories] Browse audit log failed', error, {
          userId,
          namespace,
        });
      });
      trackRetrievedMemoryIds(
        browseResults.map((memory: { id: string }) => memory.id),
        supabase,
        { userId, namespace, mode: 'browse' }
      );

      recordMemoryReads(browseResults, userId);

      return withHeaders(
        NextResponse.json({
          success: true,
          data: {
            mode: 'browse',
            results: browseResults,
            count: browseResults.length,
            total: count ?? 0,
            offset,
            limit,
            perspective: perspectiveEntityId ? {
              entityId: perspectiveEntityId,
              excluded: perspectiveResult.excluded,
            } : null,
          },
          meta: { ...META, cached: false, latencyMs: Date.now() - startTime },
        }),
        result.rateLimitHeaders
      );
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

    let effectiveQuery = query;
    const queryDetector = createDetector({ mode: 'sanitize' });
    const queryFirewall = queryDetector.scan(query);
    if (queryFirewall.detected && compareThreatLevel(queryFirewall.threatLevel, 'critical') >= 0) {
      return ValidationErrors.invalidField('query', 'Query blocked by security policy');
    }
    if (queryFirewall.sanitizedInput && queryFirewall.sanitizedInput.trim().length > 0) {
      effectiveQuery = queryFirewall.sanitizedInput.trim();
    }
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
    const semanticCacheDecision = resolveSemanticCacheDecision({ userId, keyId });
    const semanticCacheMeta = {
      enabled: semanticCacheDecision.enabled,
      variant: semanticCacheDecision.variant,
      scope: semanticCacheDecision.scope,
      readEnabled: semanticCacheDecision.allowRead,
      writeEnabled: semanticCacheDecision.allowWrite,
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
        source: 'v1',
        requestedMode,
        resolvedMode: payload.resolvedMode,
        variant: semanticCacheDecision.variant,
        cacheHit: payload.cacheHit,
        latencyMs: payload.latencyMs,
        resultCount: payload.resultCount,
        fallbackReason: payload.fallbackReason || null,
        errorCode: payload.errorCode || null,
      }).catch((error) => {
        logServerError('[v1/memories] Semantic cache event failed', error, {
          userId,
          namespace,
          resolvedMode: payload.resolvedMode,
        });
      });
    };

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
        }).catch((error) => {
          logServerError('[v1/memories] Slot audit log failed', error, {
            userId,
            namespace,
            slotKey,
          });
        });

        if (slotValue) {
          const slotResults = await applyRecallModeration([{
            id: `slot:${slotKey}`,
            content: slotValue,
            memory_type: 'fact',
            slot_key: slotKey,
            similarity: 1.0,
          }]);

          recordRouterOutcome(supabase, {
            userId,
            namespace,
            query: effectiveQuery,
            strategy: 'slot',
            latencyMs: Date.now() - startTime,
            resultCount: slotResults.length,
            topScore: slotResults.length > 0 ? 1 : 0,
          }).catch((error) => {
            logServerError('[v1/memories] Slot router outcome failed', error, {
              userId,
              namespace,
              slotKey,
            });
          });

          if (canaryAssignment) {
            try {
              recordRequestResult({
                deploymentId: canaryAssignment.deploymentId,
                version: canaryAssignment.assignedVersion,
                success: true,
                latencyMs: Date.now() - startTime,
                qualityScore: slotResults.length > 0 ? 1 : 0,
              });
            } catch (canaryMetricError) {
              logServerError('[v1/memories] Canary metric record failed', canaryMetricError, {
                userId,
                namespace,
                slotKey,
                assignedVersion: canaryAssignment.assignedVersion,
              });
            }
          }

          const slotLatencyMs = Date.now() - startTime;
          recordSemanticCacheOutcome({
            resolvedMode: 'slot',
            cacheHit: false,
            resultCount: slotResults.length,
            latencyMs: slotLatencyMs,
          });

          return withHeaders(
            NextResponse.json({
              success: true,
              data: {
                mode: 'slot',
                requestedMode,
                results: slotResults,
                count: slotResults.length,
                total: slotResults.length,
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
              meta: {
                ...META,
                cached: false,
                latencyMs: slotLatencyMs,
                semanticCache: {
                  ...semanticCacheMeta,
                  hit: false,
                },
              },
            }),
            result.rateLimitHeaders
          );
        }
        actualMode = 'keyword';
      } else {
        actualMode = 'keyword';
      }
    }

    // Cache check
    const cacheResult = semanticCacheDecision.allowRead
      ? await getCachedQueryResults(userId, effectiveQuery, namespace, actualMode)
      : { hit: false, results: [], fromCache: false as const, version: undefined };
    const semanticCacheHit = cacheResult.hit && cacheResult.results.length > 0;
    if (semanticCacheHit) {
      const personalizationState = await getOrCreateLearningProfile(supabase, userId, namespace);
      const personalizedResults =
        personalizationState.available && personalizationState.profile.personalizationEnabled
          ? applyPersonalizedRanking(cacheResult.results, personalizationState.profile, effectiveQuery)
          : cacheResult.results;
      const moderatedResults = await applyRecallModeration(personalizedResults);
      const sceneContext = await getSceneContext();
      const sceneResults = applySceneBoost(moderatedResults, sceneContext);
      const decayedResults = applyDecayRerank(sceneResults as unknown as MemoryWithDecay[]);
      const perspectiveResult = await filterByPerspective(decayedResults);
      const finalResults = perspectiveResult.memories;
      const finalTopScore = Number(
        (finalResults[0] as { similarity?: number; rrf_score?: number; scene_score?: number } | undefined)?.scene_score
          ?? (finalResults[0] as { similarity?: number; rrf_score?: number } | undefined)?.similarity
          ?? (finalResults[0] as { similarity?: number; rrf_score?: number } | undefined)?.rrf_score
          ?? 0
      );

      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
          200,
          { embedding: 0 }
        );
      }
      trackRetrievedMemoryIds(
        finalResults.map((m) => m.id),
        supabase,
        { userId, namespace, mode: 'cache-hit' }
      );
      logMemoryAccess(request, userId, keyId ?? undefined, 'search', {
        memoryCount: finalResults.length,
        query: effectiveQuery,
      }).catch((error) => {
        logServerError('[v1/memories] Cache-hit audit log failed', error, {
          userId,
          namespace,
        });
      });

      recordRouterOutcome(supabase, {
        userId,
        namespace,
        query: effectiveQuery,
        strategy: actualMode,
        latencyMs: Date.now() - startTime,
        resultCount: finalResults.length,
        topScore: finalTopScore,
      }).catch((error) => {
        logServerError('[v1/memories] Cache-hit router outcome failed', error, {
          userId,
          namespace,
          resolvedMode: actualMode,
        });
      });

      if (canaryAssignment) {
        try {
          recordRequestResult({
            deploymentId: canaryAssignment.deploymentId,
            version: canaryAssignment.assignedVersion,
            success: true,
            latencyMs: Date.now() - startTime,
            qualityScore: clamp(finalTopScore, 0, 1),
          });
        } catch (canaryMetricError) {
          logServerError('[v1/memories] Canary metric record failed', canaryMetricError, {
            userId,
            namespace,
            resolvedMode: actualMode,
            assignedVersion: canaryAssignment.assignedVersion,
          });
        }
      }

      recordSemanticCacheOutcome({
        resolvedMode: actualMode,
        cacheHit: true,
        resultCount: finalResults.length,
        latencyMs: Date.now() - startTime,
      });

      recordMemoryReads(finalResults, userId);

      return withHeaders(
        NextResponse.json({
          success: true,
          data: {
            mode: actualMode,
            requestedMode,
            results: finalResults,
            count: finalResults.length,
            total: finalResults.length,
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
            perspective: perspectiveEntityId ? {
              entityId: perspectiveEntityId,
              excluded: perspectiveResult.excluded,
            } : null,
            scene: sceneContext ? {
              id: sceneContext.id,
              entityIds: sceneContext.entityIds,
              boostedCount: finalResults.filter((row) => row.scene_boost).length,
            } : null,
          },
          meta: {
            ...META,
            cached: true,
            latencyMs: Date.now() - startTime,
            semanticCache: {
              ...semanticCacheMeta,
              hit: true,
            },
          },
        }),
        result.rateLimitHeaders
      );
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
    let results: SearchResultRow[] | null = null;
    let resolvedMode: SearchExecutionMode = actualMode;
    let fallback: { applied: boolean; from: string; to: string; reason: string } | null = null;
    let searchError: Error | null = null;
    let searchBackend: 'spring_v4' | 'legacy' = 'legacy';
    let backendFallbackReason: 'search_error' | 'zero_results' | null = null;

    if (MEMORY_V1_SPRING_BRIDGE_SEARCH_ENABLED) {
      try {
        const bridged = await searchViaSpringV4Bridge(supabase, {
          userId,
          query: effectiveQuery,
          limit,
          mode: actualMode,
          namespace,
          memoryType,
          tags: tagsParam ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean) : [],
          scope,
          agentId,
          after,
          before,
        });
        if (bridged.length > 0) {
          results = bridged;
          searchBackend = 'spring_v4';
        } else {
          backendFallbackReason = 'zero_results';
        }
      } catch (springSearchError) {
        backendFallbackReason = 'search_error';
        logServerError('[v1/memories] Spring v4 bridge search error', springSearchError, {
          userId,
          namespace,
          requestedMode,
          actualMode,
        });
      }
    }

    if (!results) {
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
        searchTimeoutMs: SEARCH_TIMEOUT_MS,
        createQueryEmbedding,
        applyFilters: applyResultFilters,
      });
      results = searchExecution.results;
      resolvedMode = searchExecution.resolvedMode;
      fallback = searchExecution.fallback;
      searchError = searchExecution.error;
      searchBackend = 'legacy';
    }

    if (searchError && shouldUseDegradedKeywordSearchFallback(searchError)) {
      const fallbackFromMode = resolvedMode;
      const degraded = await runDegradedKeywordSearch({
        supabase,
        userId,
        queryText: effectiveQuery,
        limit,
        namespaceParam: nsParam,
      });

      if (!degraded.error) {
        results = applyResultFilters(degraded.results) || [];
        resolvedMode = 'keyword';
        fallback = {
          applied: true,
          from: fallbackFromMode,
          to: 'keyword',
          reason: 'search_error',
        };
        searchError = null;
      } else {
        logServerError('[v1/memories] Degraded keyword fallback failed', degraded.error);
      }
    }

    if (searchError) {
      logServerError('[v1/memories] Search error', searchError);
      const isTimeoutError = searchError.message.includes('timeout');
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
          isTimeoutError ? 504 : 500
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
          logServerError('[v1/memories] Canary failure metric record failed', canaryMetricError, {
            userId,
            namespace,
            resolvedMode,
            assignedVersion: canaryAssignment.assignedVersion,
          });
        }
      }
      recordSemanticCacheOutcome({
        resolvedMode,
        cacheHit: false,
        resultCount: 0,
        latencyMs: Date.now() - startTime,
        errorCode: isTimeoutError ? 'search_timeout' : 'search_error',
      });
      if (isTimeoutError) {
        return withHeaders(
          NextResponse.json(
            {
              success: false,
              error: {
                code: 'search_timeout',
                message: 'Search timed out. Try a shorter query or retry.',
              },
              meta: {
                ...META,
                latencyMs: Date.now() - startTime,
                semanticCache: {
                  ...semanticCacheMeta,
                  hit: false,
                },
              },
            },
            { status: 504 }
          ),
          result.rateLimitHeaders
        );
      }
      return ServerErrors.database('search_memories');
    }

    // Cache base results before personalization (profile can change quickly).
    if (semanticCacheDecision.allowWrite && results && results.length > 0) {
      setCachedQueryResults(
        userId,
        effectiveQuery,
        namespace,
        resolvedMode,
        toCachedMemories(results)
      ).catch((error) => {
        logServerError('[v1/memories] Cache write failed', error, {
          userId,
          namespace,
          resolvedMode,
        });
      });
    }

    const personalizationState = await getOrCreateLearningProfile(supabase, userId, namespace);
    const personalizedResults =
      results && personalizationState.available && personalizationState.profile.personalizationEnabled
        ? applyPersonalizedRanking(results, personalizationState.profile, effectiveQuery)
        : (results || []);
    const moderatedResults = await applyRecallModeration(personalizedResults);
    const sceneContext = await getSceneContext();
    const sceneResults = applySceneBoost(moderatedResults, sceneContext);
    const decayedResults = applyDecayRerank(sceneResults as MemoryWithDecay[]);
    const perspectiveResult = await filterByPerspective(decayedResults);
    const finalResults = perspectiveResult.memories;

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/memories', method: 'GET', startTime },
        200,
        { embedding: resolvedMode !== 'keyword' ? effectiveQuery.length : 0 }
      );
    }

    if (results && results.length > 0) {
      trackRetrievedMemoryIds(
        finalResults.map((m: { id: string }) => m.id),
        supabase,
        { userId, namespace, resolvedMode }
      );
    }

    logMemoryAccess(request, userId, keyId ?? undefined, 'search', {
      memoryCount: finalResults.length,
      query: effectiveQuery,
    }).catch((error) => {
      logServerError('[v1/memories] Search audit log failed', error, {
        userId,
        namespace,
        resolvedMode,
      });
    });

    const topSimilarity = clamp(
      Number((finalResults[0] as { similarity?: number; rrf_score?: number; scene_score?: number } | undefined)?.scene_score
        ?? (finalResults[0] as { similarity?: number; rrf_score?: number } | undefined)?.similarity
        ?? (finalResults[0] as { similarity?: number; rrf_score?: number } | undefined)?.rrf_score
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
      resultCount: finalResults.length,
      topScore: topSimilarity,
    }).catch((error) => {
      logServerError('[v1/memories] Router outcome failed', error, {
        userId,
        namespace,
        resolvedMode,
      });
    });

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
        logServerError('[v1/memories] Canary metric record failed', canaryMetricError, {
          userId,
          namespace,
          resolvedMode,
          assignedVersion: canaryAssignment.assignedVersion,
        });
      }
    }
    recordSemanticCacheOutcome({
      resolvedMode,
      cacheHit: false,
      resultCount: finalResults.length,
      latencyMs: Date.now() - startTime,
      fallbackReason: fallback?.reason || backendFallbackReason || null,
    });

    recordMemoryReads(finalResults, userId);

    return withHeaders(
      NextResponse.json({
        success: true,
        data: {
          mode: resolvedMode,
          requestedMode,
          results: finalResults,
          count: finalResults.length,
          total: finalResults.length,
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
          searchBackend,
          backendFallbackReason,
          personalization: {
            enabled: personalizationState.profile.personalizationEnabled,
            applied:
              personalizationState.available && personalizationState.profile.personalizationEnabled,
            available: personalizationState.available,
          },
          perspective: perspectiveEntityId ? {
            entityId: perspectiveEntityId,
            excluded: perspectiveResult.excluded,
          } : null,
          scene: sceneContext ? {
            id: sceneContext.id,
            entityIds: sceneContext.entityIds,
            boostedCount: finalResults.filter((row) => row.scene_boost).length,
          } : null,
        },
        meta: {
          ...META,
          cached: false,
          latencyMs: Date.now() - startTime,
          semanticCache: {
            ...semanticCacheMeta,
            hit: false,
          },
        },
      }),
      result.rateLimitHeaders
    );
  } catch (error) {
    logServerError('[v1/memories] GET error', error);
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
      logServerError('[v1/memories] Delete error', error, { userId, namespace });
      if (keyId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/v1/memories', method: 'DELETE', startTime },
          500
        );
      }
      return ServerErrors.database('delete_memories');
    }

    await incrementMemoryVersion(userId, namespace);

    let springSync: { deletedCount: number; failedIds: string[] } | null = null;
    try {
      springSync = await softDeleteSpringMirrorsByLegacyIds(supabase, userId, ids);
      if (springSync.failedIds.length > 0) {
        logServerWarn('[v1/memories] Spring mirror soft-delete partial failure', springSync.failedIds, {
          userId,
          namespace,
          deletedCount: springSync.deletedCount,
        });
      }
    } catch (springSyncError) {
      logServerError('[v1/memories] Spring mirror soft-delete failed', springSyncError, {
        userId,
        namespace,
      });
    }

    // Emit webhook event (non-blocking)
    emitWebhookEvent(userId, 'memory.deleted', {
      ids,
      count: ids.length,
    }, namespace).catch((error) => {
      logServerError('[v1/memories] memory.deleted webhook emit failed', error, {
        userId,
        namespace,
      });
    });

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/memories', method: 'DELETE', startTime },
        200
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        data: {
          deleted: ids.length,
          bridge: {
            springV4: springSync,
          },
        },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      result.rateLimitHeaders
    );
  } catch (error) {
    logServerError('[v1/memories] DELETE error', error);
    return ServerErrors.internal('delete_memories');
  }
}
