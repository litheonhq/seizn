import { createServerClient } from '@/lib/supabase';
import { hasFeature } from '@/lib/plan-limits';
import { logServerWarn } from '@/lib/server/logger';
import { getActiveReplayTraceId } from '@/lib/replay/snapshot';
import {
  validateCanonContent,
  type CanonLock,
  type CanonLockScope,
  type CanonSeverity,
  type CanonViolationVerdict,
} from './validator';

type SupabaseLike = ReturnType<typeof createServerClient>;

export interface CanonViolationRecord {
  id: number;
  studioId: string;
  lockId: string | null;
  memoryId: string | null;
  sessionId: string | null;
  npcId: string | null;
  attemptedContent: string;
  verdict: CanonViolationVerdict | Record<string, unknown>;
  severity: CanonSeverity;
  createdAt: string;
  lock?: Pick<CanonLock, 'statement' | 'scope' | 'severity'> | null;
}

export type CanonEnforcementResult =
  | { ok: true; violation?: CanonLock; verdict?: CanonViolationVerdict }
  | { ok: false; violation: CanonLock; verdict: CanonViolationVerdict };

const VALID_SCOPES: CanonLockScope[] = ['never_say', 'always_say', 'must_not_know', 'must_know'];
const VALID_SEVERITIES: CanonSeverity[] = ['hard', 'soft'];

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLock(row: Record<string, unknown>): CanonLock {
  const scope = VALID_SCOPES.includes(row.scope as CanonLockScope)
    ? (row.scope as CanonLockScope)
    : 'never_say';
  const severity = VALID_SEVERITIES.includes(row.severity as CanonSeverity)
    ? (row.severity as CanonSeverity)
    : 'hard';

  return {
    id: String(row.id),
    studioId: String(row.studio_id),
    npcId: normalizeOptionalString(row.npc_id),
    scope,
    statement: String(row.statement || ''),
    regexFastpath: normalizeOptionalString(row.regex_fastpath),
    severity,
    active: row.active !== false,
    requiresTeamReview: row.requires_team_review === true,
    createdBy: normalizeOptionalString(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeViolation(row: Record<string, unknown>): CanonViolationRecord {
  const lockRow = Array.isArray(row.canon_locks)
    ? row.canon_locks[0]
    : row.canon_locks;
  const lock =
    lockRow && typeof lockRow === 'object'
      ? normalizeLock({
          id: row.lock_id || '00000000-0000-0000-0000-000000000000',
          studio_id: row.studio_id,
          npc_id: row.npc_id,
          active: true,
          requires_team_review: false,
          created_at: row.created_at,
          updated_at: row.created_at,
          ...(lockRow as Record<string, unknown>),
        })
      : null;

  return {
    id: Number(row.id),
    studioId: String(row.studio_id),
    lockId: normalizeOptionalString(row.lock_id),
    memoryId: normalizeOptionalString(row.memory_id),
    sessionId: normalizeOptionalString(row.session_id),
    npcId: normalizeOptionalString(row.npc_id),
    attemptedContent: String(row.attempted_content || ''),
    verdict: typeof row.verdict === 'object' && row.verdict !== null
      ? (row.verdict as CanonViolationRecord['verdict'])
      : {},
    severity: VALID_SEVERITIES.includes(row.severity as CanonSeverity)
      ? (row.severity as CanonSeverity)
      : 'hard',
    createdAt: String(row.created_at),
    lock: lock
      ? {
          statement: lock.statement,
          scope: lock.scope,
          severity: lock.severity,
        }
      : null,
  };
}

export function parseCanonScope(value: unknown): CanonLockScope | null {
  return VALID_SCOPES.includes(value as CanonLockScope) ? (value as CanonLockScope) : null;
}

export function parseCanonSeverity(value: unknown): CanonSeverity | null {
  return VALID_SEVERITIES.includes(value as CanonSeverity) ? (value as CanonSeverity) : null;
}

export function resolveCanonNpcId(input: {
  entityId?: unknown;
  agentId?: unknown;
  companionMeta?: unknown;
}): string | null {
  const companion =
    input.companionMeta && typeof input.companionMeta === 'object'
      ? (input.companionMeta as Record<string, unknown>)
      : {};

  return (
    normalizeOptionalString(input.entityId) ||
    normalizeOptionalString(companion.npc_id) ||
    normalizeOptionalString(companion.npcId) ||
    normalizeOptionalString(companion.character_id) ||
    normalizeOptionalString(companion.characterId) ||
    normalizeOptionalString(input.agentId)
  );
}

async function resolveStudioPlan(studioId: string, supabase: SupabaseLike) {
  const { data, error } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', studioId)
    .maybeSingle();

  if (error) {
    logServerWarn('[canon/enforce] Studio plan lookup failed', error, { studioId });
  }

  return typeof data?.plan === 'string' && data.plan.trim() ? data.plan : 'free';
}

async function shouldRequireTeamReview(params: {
  studioId: string;
  requested: boolean;
  supabase: SupabaseLike;
}) {
  if (!params.requested) return false;
  const plan = await resolveStudioPlan(params.studioId, params.supabase);
  return hasFeature(plan, 'canonLockTeamReview');
}

async function createCanonLockReview(params: {
  supabase: SupabaseLike;
  studioId: string;
  lockId: string;
  proposedBy?: string | null;
}) {
  const { error } = await params.supabase
    .from('canon_lock_reviews')
    .insert({
      canon_lock_id: params.lockId,
      studio_id: params.studioId,
      proposed_by: params.proposedBy || 'system',
    });

  if (error) {
    logServerWarn('[canon/enforce] Team review row creation failed', error, {
      studioId: params.studioId,
      lockId: params.lockId,
    });
  }
}

export async function listCanonLocks(
  studioId: string,
  supabase: SupabaseLike = createServerClient()
): Promise<CanonLock[]> {
  const { data, error } = await supabase
    .from('canon_locks')
    .select('id, studio_id, npc_id, scope, statement, regex_fastpath, severity, active, requires_team_review, created_by, created_at, updated_at')
    .eq('studio_id', studioId)
    .order('active', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(`canon_locks_list_failed: ${error.message}`);
  return ((data || []) as Record<string, unknown>[]).map(normalizeLock);
}

export async function listCanonViolations(
  studioId: string,
  supabase: SupabaseLike = createServerClient(),
  options: { limit?: number } = {}
): Promise<CanonViolationRecord[]> {
  const { data, error } = await supabase
    .from('canon_violations')
    .select('id, studio_id, lock_id, memory_id, session_id, npc_id, attempted_content, verdict, severity, created_at, canon_locks(statement, scope, severity, requires_team_review)')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(options.limit || 50, 1), 200));

  if (error) throw new Error(`canon_violations_list_failed: ${error.message}`);
  return ((data || []) as Record<string, unknown>[]).map(normalizeViolation);
}

export async function createCanonLock(
  studioId: string,
  input: {
    npcId?: string | null;
    scope: CanonLockScope;
    statement: string;
    regexFastpath?: string | null;
    severity: CanonSeverity;
    active?: boolean;
    requiresTeamReview?: boolean;
    createdBy?: string | null;
  },
  supabase: SupabaseLike = createServerClient()
): Promise<CanonLock> {
  const requiresTeamReview = await shouldRequireTeamReview({
    studioId,
    requested: input.requiresTeamReview === true,
    supabase,
  });
  const { data, error } = await supabase
    .from('canon_locks')
    .insert({
      studio_id: studioId,
      npc_id: input.npcId || null,
      scope: input.scope,
      statement: input.statement,
      regex_fastpath: input.regexFastpath || null,
      severity: input.severity,
      active: input.active !== false,
      requires_team_review: requiresTeamReview,
      created_by: input.createdBy || null,
    })
    .select('id, studio_id, npc_id, scope, statement, regex_fastpath, severity, active, requires_team_review, created_by, created_at, updated_at')
    .single();

  if (error || !data) {
    throw new Error(`canon_lock_create_failed: ${error?.message || 'unknown'}`);
  }
  const lock = normalizeLock(data as Record<string, unknown>);
  if (lock.requiresTeamReview) {
    await createCanonLockReview({
      supabase,
      studioId,
      lockId: lock.id,
      proposedBy: input.createdBy || null,
    });
  }
  return lock;
}

export async function updateCanonLock(
  studioId: string,
  lockId: string,
  input: Partial<{
    npcId: string | null;
    scope: CanonLockScope;
    statement: string;
    regexFastpath: string | null;
    severity: CanonSeverity;
    active: boolean;
    requiresTeamReview: boolean;
    updatedBy: string | null;
  }>,
  supabase: SupabaseLike = createServerClient()
): Promise<CanonLock> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('npcId' in input) patch.npc_id = input.npcId || null;
  if (input.scope) patch.scope = input.scope;
  if (input.statement !== undefined) patch.statement = input.statement;
  if ('regexFastpath' in input) patch.regex_fastpath = input.regexFastpath || null;
  if (input.severity) patch.severity = input.severity;
  if (input.active !== undefined) patch.active = input.active;
  if (input.requiresTeamReview !== undefined) {
    patch.requires_team_review = await shouldRequireTeamReview({
      studioId,
      requested: input.requiresTeamReview,
      supabase,
    });
  }

  const { data, error } = await supabase
    .from('canon_locks')
    .update(patch)
    .eq('id', lockId)
    .eq('studio_id', studioId)
    .select('id, studio_id, npc_id, scope, statement, regex_fastpath, severity, active, requires_team_review, created_by, created_at, updated_at')
    .maybeSingle();

  if (error || !data) {
    throw new Error(`canon_lock_update_failed: ${error?.message || 'not_found'}`);
  }
  const lock = normalizeLock(data as Record<string, unknown>);
  if (input.requiresTeamReview === true && lock.requiresTeamReview) {
    await createCanonLockReview({
      supabase,
      studioId,
      lockId: lock.id,
      proposedBy: input.updatedBy || lock.createdBy,
    });
  }
  return lock;
}

export async function deactivateCanonLock(
  studioId: string,
  lockId: string,
  supabase: SupabaseLike = createServerClient()
): Promise<CanonLock> {
  return updateCanonLock(studioId, lockId, { active: false }, supabase);
}

async function loadApplicableLocks(
  supabase: SupabaseLike,
  studioId: string,
  npcId: string | null
): Promise<CanonLock[]> {
  const locks = await listCanonLocks(studioId, supabase);
  return locks.filter((lock) => lock.active && (!lock.npcId || (npcId && lock.npcId === npcId)));
}

async function recordCanonViolation(params: {
  supabase: SupabaseLike;
  studioId: string;
  lock: CanonLock;
  verdict: CanonViolationVerdict;
  content: string;
  memoryId?: string | null;
  sessionId?: string | null;
  npcId?: string | null;
}) {
  const { error } = await params.supabase.from('canon_violations').insert({
    studio_id: params.studioId,
    lock_id: params.lock.id,
    memory_id: params.memoryId || null,
    session_id: params.sessionId || getActiveReplayTraceId(),
    npc_id: params.npcId || params.lock.npcId || null,
    attempted_content: params.content,
    verdict: params.verdict,
    severity: params.lock.severity,
  });

  if (error) {
    logServerWarn('[canon/enforce] Violation log failed', error, {
      studioId: params.studioId,
      lockId: params.lock.id,
    });
  }
}

export async function enforceCanon(params: {
  supabase: SupabaseLike;
  studioId: string | null;
  content: string;
  npcId?: string | null;
  sessionId?: string | null;
  memoryId?: string | null;
}): Promise<CanonEnforcementResult> {
  if (!params.studioId || params.content.trim().length === 0) {
    return { ok: true };
  }

  try {
    const locks = await loadApplicableLocks(params.supabase, params.studioId, params.npcId || null);
    if (locks.length === 0) return { ok: true };

    const result = await validateCanonContent({
      content: params.content,
      locks,
    });
    if (result.ok) return { ok: true, verdict: result.verdict };

    await recordCanonViolation({
      supabase: params.supabase,
      studioId: params.studioId,
      lock: result.violation,
      verdict: result.verdict,
      content: params.content,
      memoryId: params.memoryId || null,
      sessionId: params.sessionId || null,
      npcId: params.npcId || null,
    });

    if (result.violation.severity === 'hard') {
      return result;
    }
    return { ok: true, violation: result.violation, verdict: result.verdict };
  } catch (error) {
    logServerWarn('[canon/enforce] Canon validation unavailable', error, {
      studioId: params.studioId,
      npcId: params.npcId,
    });
    return { ok: true };
  }
}
