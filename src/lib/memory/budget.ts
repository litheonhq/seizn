import { createServerClient } from '@/lib/supabase';
import { logServerError, logServerWarn } from '@/lib/server/logger';
import { hasFeature } from '@/lib/plan-limits';

export type MemoryTier = 'hot' | 'warm' | 'cold';
export type DemotionPolicy = 'lru' | 'lfu' | 'lru-then-lfu';

export interface BudgetConfig {
  hotBudgetBytes: number;
  warmBudgetBytes: number;
  coldBudgetBytes: number | null;
  demotionPolicy: DemotionPolicy;
}

export interface BudgetMemoryRow {
  id: string;
  tier: MemoryTier;
  pinned: boolean;
  sizeBytes: number;
  recallCount: number;
  lastRecalledAt: string | null;
  createdAt: string | null;
}

export interface BudgetReservationResult {
  ok: boolean;
  reason?: 'budget_exceeded' | 'budget_unavailable';
  demotedIds: string[];
  hotUsedBytes?: number;
  hotBudgetBytes?: number;
}

type SupabaseLike = ReturnType<typeof createServerClient>;

export const PROMOTE_ON_RECALL = true;
const TIER_DEMOTION_BATCH_SIZE = 1000;
const TIER_DEMOTION_MAX_RUNTIME_MS = 50_000;
const HOT_STALE_DAYS = 30;
const WARM_STALE_DAYS = 90;

const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  hotBudgetBytes: 64 * 1024,
  warmBudgetBytes: 512 * 1024,
  coldBudgetBytes: null,
  demotionPolicy: 'lru-then-lfu',
};

interface StaleMemoryRow {
  id: string;
  organizationId: string;
  entityId: string;
  tier: 'hot' | 'warm';
  sizeBytes: number;
  lastRecalledAt: string | null;
}

export interface TierDemotionRunResult {
  processed: number;
  demoted: number;
  hotToWarm: number;
  warmToCold: number;
  skippedPlanGate: number;
  stoppedReason: 'completed' | 'runtime_limit';
  demotedIds: string[];
}

export interface TierStats {
  hot: number;
  warm: number;
  cold: number;
  pinned: number;
  lastDemotionAt: string | null;
  lastDemotionCount: number;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTier(value: unknown): MemoryTier {
  return value === 'warm' || value === 'cold' ? value : 'hot';
}

function normalizeMemoryRow(row: Record<string, unknown>): BudgetMemoryRow {
  return {
    id: String(row.id),
    tier: normalizeTier(row.tier),
    pinned: row.pinned === true,
    sizeBytes: Math.max(0, toNumber(row.size_bytes ?? row.sizeBytes)),
    recallCount: Math.max(0, toNumber(row.recall_count ?? row.recallCount)),
    lastRecalledAt:
      typeof row.last_recalled_at === 'string'
        ? row.last_recalled_at
        : typeof row.lastRecalledAt === 'string'
          ? row.lastRecalledAt
          : null,
    createdAt:
      typeof row.created_at === 'string'
        ? row.created_at
        : typeof row.createdAt === 'string'
          ? row.createdAt
          : null,
  };
}

function normalizePlanCandidate(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

function normalizeStaleMemoryRow(row: Record<string, unknown>): StaleMemoryRow | null {
  const organizationId = typeof row.organization_id === 'string' ? row.organization_id : null;
  const entityId = typeof row.entity_id === 'string' ? row.entity_id : null;
  const tier = row.tier === 'warm' ? 'warm' : row.tier === 'hot' ? 'hot' : null;
  if (!row.id || !organizationId || !entityId || !tier) return null;

  return {
    id: String(row.id),
    organizationId,
    entityId,
    tier,
    sizeBytes: Math.max(0, toNumber(row.size_bytes)),
    lastRecalledAt: typeof row.last_recalled_at === 'string' ? row.last_recalled_at : null,
  };
}

function nextTier(tier: MemoryTier): MemoryTier {
  if (tier === 'hot') return 'warm';
  if (tier === 'warm') return 'cold';
  return 'cold';
}

function sortDemotionCandidates(
  memories: BudgetMemoryRow[],
  policy: DemotionPolicy
): BudgetMemoryRow[] {
  const candidates = memories.filter((memory) => !memory.pinned);

  const byLru = (a: BudgetMemoryRow, b: BudgetMemoryRow) => {
    const aTime = Date.parse(a.lastRecalledAt || a.createdAt || '1970-01-01T00:00:00.000Z');
    const bTime = Date.parse(b.lastRecalledAt || b.createdAt || '1970-01-01T00:00:00.000Z');
    return aTime - bTime;
  };

  const byLfu = (a: BudgetMemoryRow, b: BudgetMemoryRow) => {
    if (a.recallCount !== b.recallCount) return a.recallCount - b.recallCount;
    return byLru(a, b);
  };

  if (policy === 'lru') return candidates.sort(byLru);
  if (policy === 'lfu') return candidates.sort(byLfu);

  return candidates.sort((a, b) => {
    const recallDelta = a.recallCount - b.recallCount;
    if (recallDelta !== 0) return recallDelta;
    return byLru(a, b);
  });
}

export function estimateMemorySizeBytes(input: unknown): number {
  if (input == null) return 0;
  if (typeof input === 'string') return Buffer.byteLength(input, 'utf8');
  return Buffer.byteLength(JSON.stringify(input), 'utf8');
}

export function resolveBudgetEntityId(input: {
  entityId?: unknown;
  agentId?: unknown;
  sessionId?: unknown;
  userId: string;
}): string {
  for (const candidate of [input.entityId, input.agentId, input.sessionId, input.userId]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return input.userId;
}

export function selectDemotionCandidates(
  memories: BudgetMemoryRow[],
  bytesToFree: number,
  fromTier: MemoryTier = 'hot',
  policy: DemotionPolicy = 'lru-then-lfu'
): { candidates: BudgetMemoryRow[]; freedBytes: number } {
  if (bytesToFree <= 0) return { candidates: [], freedBytes: 0 };

  const candidates: BudgetMemoryRow[] = [];
  let freedBytes = 0;

  for (const memory of sortDemotionCandidates(
    memories.filter((row) => row.tier === fromTier),
    policy
  )) {
    candidates.push(memory);
    freedBytes += memory.sizeBytes;
    if (freedBytes >= bytesToFree) break;
  }

  return { candidates, freedBytes };
}

export async function resolveMemoryBudgetOrganizationId(
  supabase: SupabaseLike,
  ctx: { userId: string; keyId?: string | null }
): Promise<string | null> {
  if (ctx.keyId) {
    try {
      const { data: keyRowRaw, error: keyError } = await supabase
        .from('api_keys')
        .select('organization_id')
        .eq('id', ctx.keyId)
        .maybeSingle();
      const keyRow = keyRowRaw as { organization_id?: unknown } | null;

      if (!keyError && keyRow?.organization_id) {
        return String(keyRow.organization_id);
      }
    } catch (error) {
      logServerWarn('[memory/budget] API key organization lookup skipped', error, {
        keyId: ctx.keyId,
      });
    }
  }

  try {
    const { data: profileRaw, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', ctx.userId)
      .maybeSingle();
    const profile = profileRaw as { organization_id?: unknown } | null;

    if (!profileError && profile?.organization_id) {
      return String(profile.organization_id);
    }
  } catch (error) {
    logServerWarn('[memory/budget] Profile organization lookup skipped', error, {
      userId: ctx.userId,
    });
  }

  try {
    const { data: memberRaw, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const member = memberRaw as { organization_id?: unknown } | null;

    if (!memberError && member?.organization_id) {
      return String(member.organization_id);
    }
  } catch (error) {
    logServerWarn('[memory/budget] Membership organization lookup skipped', error, {
      userId: ctx.userId,
    });
  }

  return null;
}

async function resolveOrganizationPlan(
  supabase: SupabaseLike,
  organizationId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('organizations')
    .select('plan, subscription_tier')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    logServerWarn('[memory/budget] Organization plan unavailable, using free plan', error, {
      organizationId,
    });
    return 'free';
  }

  const row = data as { plan?: unknown; subscription_tier?: unknown } | null;
  return normalizePlanCandidate(row?.subscription_tier) || normalizePlanCandidate(row?.plan) || 'free';
}

export async function isMemoryTieringEnabledForOrganization(
  supabase: SupabaseLike,
  organizationId: string
): Promise<boolean> {
  const plan = await resolveOrganizationPlan(supabase, organizationId);
  return hasFeature(plan, 'memoryTiering');
}

async function getBudgetConfig(
  supabase: SupabaseLike,
  organizationId: string,
  entityId: string
): Promise<BudgetConfig> {
  const { data: rawData, error } = await supabase
    .from('entity_budget')
    .select('hot_budget_bytes, warm_budget_bytes, cold_budget_bytes')
    .eq('organization_id', organizationId)
    .eq('entity_id', entityId)
    .maybeSingle();
  const data = rawData as {
    hot_budget_bytes?: unknown;
    warm_budget_bytes?: unknown;
    cold_budget_bytes?: unknown;
  } | null;

  if (error) {
    logServerWarn('[memory/budget] Entity budget row unavailable, using defaults', error, {
      organizationId,
      entityId,
    });
    return DEFAULT_BUDGET_CONFIG;
  }

  if (!data) {
    return DEFAULT_BUDGET_CONFIG;
  }

  return {
    hotBudgetBytes: Math.max(0, toNumber(data.hot_budget_bytes, DEFAULT_BUDGET_CONFIG.hotBudgetBytes)),
    warmBudgetBytes: Math.max(0, toNumber(data.warm_budget_bytes, DEFAULT_BUDGET_CONFIG.warmBudgetBytes)),
    coldBudgetBytes:
      data.cold_budget_bytes == null
        ? null
        : Math.max(0, toNumber(data.cold_budget_bytes, DEFAULT_BUDGET_CONFIG.warmBudgetBytes)),
    demotionPolicy: DEFAULT_BUDGET_CONFIG.demotionPolicy,
  };
}

async function listEntityMemories(
  supabase: SupabaseLike,
  organizationId: string,
  entityId: string
): Promise<BudgetMemoryRow[]> {
  const { data, error } = await supabase
    .from('memories')
    .select('id, tier, pinned, size_bytes, recall_count, last_recalled_at, created_at')
    .eq('organization_id', organizationId)
    .eq('entity_id', entityId)
    .eq('is_deleted', false);

  if (error) {
    throw new Error(`memory_budget_fetch_failed: ${error.message || 'unknown'}`);
  }

  return ((data || []) as Record<string, unknown>[]).map(normalizeMemoryRow);
}

export async function refreshEntityBudgetUsage(
  ctx: { organizationId: string; entityId: string },
  supabase: SupabaseLike = createServerClient()
): Promise<void> {
  const memories = await listEntityMemories(supabase, ctx.organizationId, ctx.entityId);
  const hotUsedBytes = memories
    .filter((memory) => memory.tier === 'hot')
    .reduce((sum, memory) => sum + memory.sizeBytes, 0);
  const warmUsedBytes = memories
    .filter((memory) => memory.tier === 'warm')
    .reduce((sum, memory) => sum + memory.sizeBytes, 0);
  const coldUsedBytes = memories
    .filter((memory) => memory.tier === 'cold')
    .reduce((sum, memory) => sum + memory.sizeBytes, 0);

  const { error } = await supabase
    .from('entity_budget')
    .upsert(
      {
        organization_id: ctx.organizationId,
        entity_id: ctx.entityId,
        hot_used_bytes: hotUsedBytes,
        warm_used_bytes: warmUsedBytes,
        cold_used_bytes: coldUsedBytes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,entity_id' }
    );

  if (error) {
    logServerWarn('[memory/budget] Failed to refresh entity usage', error, ctx);
  }
}

async function insertBudgetEvent(
  supabase: SupabaseLike,
  event: {
    organizationId: string;
    entityId: string;
    memoryId?: string | null;
    eventType: 'write' | 'recall' | 'demote' | 'promote';
    fromTier?: MemoryTier | null;
    toTier?: MemoryTier | null;
    sizeBytes?: number;
    reason?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from('memory_budget_events').insert({
    organization_id: event.organizationId,
    entity_id: event.entityId,
    memory_id: event.memoryId || null,
    event_type: event.eventType,
    from_tier: event.fromTier || null,
    to_tier: event.toTier || null,
    size_bytes: event.sizeBytes || 0,
    reason: event.reason || null,
  });

  if (error) {
    logServerWarn('[memory/budget] Failed to insert budget event', error, {
      eventType: event.eventType,
      organizationId: event.organizationId,
      entityId: event.entityId,
    });
  }
}

async function recordTierTransitionUsage(
  supabase: SupabaseLike,
  input: {
    organizationId: string;
    entityId: string;
    memoryId: string;
    fromTier: MemoryTier;
    toTier: MemoryTier;
    plan: string;
    occurredAt: string;
  }
): Promise<void> {
  const { error } = await supabase.rpc('record_usage_event', {
    p_studio_id: input.organizationId,
    p_dimension: 'ops',
    p_quantity: 1,
    p_idempotency_key: `tier_transition:${input.memoryId}:${input.toTier}:${input.occurredAt}`,
    p_user_id: null,
    p_organization_id: input.organizationId,
    p_plan: input.plan,
    p_source: 'tier-demotion',
    p_metadata: {
      usage_dimension: 'tier_transition',
      entity_id: input.entityId,
      memory_id: input.memoryId,
      from_tier: input.fromTier,
      to_tier: input.toTier,
    },
  });

  if (error) {
    logServerWarn('[memory/budget] Tier transition usage event skipped', error, {
      organizationId: input.organizationId,
      memoryId: input.memoryId,
    });
  }
}

export async function demoteLeastUsed(
  ctx: { organizationId: string; entityId: string; bytesToFree: number; fromTier: 'hot' | 'warm' },
  supabase: SupabaseLike = createServerClient()
): Promise<{ demotedIds: string[]; freedBytes: number }> {
  if (ctx.bytesToFree <= 0) {
    return { demotedIds: [], freedBytes: 0 };
  }

  const plan = await resolveOrganizationPlan(supabase, ctx.organizationId);
  if (!hasFeature(plan, 'memoryTiering')) {
    return { demotedIds: [], freedBytes: 0 };
  }

  const config = await getBudgetConfig(supabase, ctx.organizationId, ctx.entityId);
  const memories = await listEntityMemories(supabase, ctx.organizationId, ctx.entityId);
  const { candidates, freedBytes } = selectDemotionCandidates(
    memories,
    ctx.bytesToFree,
    ctx.fromTier,
    config.demotionPolicy
  );

  if (candidates.length === 0) {
    return { demotedIds: [], freedBytes: 0 };
  }

  const toTier = nextTier(ctx.fromTier);
  const demotedIds = candidates.map((candidate) => candidate.id);
  const { error } = await supabase
    .from('memories')
    .update({ tier: toTier, updated_at: new Date().toISOString() })
    .in('id', demotedIds)
    .eq('organization_id', ctx.organizationId)
    .eq('entity_id', ctx.entityId)
    .eq('pinned', false);

  if (error) {
    throw new Error(`memory_budget_demote_failed: ${error.message || 'unknown'}`);
  }

  await Promise.all(
    candidates.map((candidate) =>
      insertBudgetEvent(supabase, {
        organizationId: ctx.organizationId,
        entityId: ctx.entityId,
        memoryId: candidate.id,
        eventType: 'demote',
        fromTier: ctx.fromTier,
        toTier,
        sizeBytes: candidate.sizeBytes,
        reason: 'budget_pressure',
      })
    )
  );

  await refreshEntityBudgetUsage(ctx, supabase);
  return { demotedIds, freedBytes };
}

export async function reserveHotSpace(
  ctx: { organizationId: string | null; entityId: string; sizeBytes: number },
  supabase: SupabaseLike = createServerClient()
): Promise<BudgetReservationResult> {
  if (!ctx.organizationId || !ctx.entityId || ctx.sizeBytes <= 0) {
    return { ok: true, demotedIds: [] };
  }

  try {
    if (!(await isMemoryTieringEnabledForOrganization(supabase, ctx.organizationId))) {
      return { ok: true, demotedIds: [] };
    }

    const config = await getBudgetConfig(supabase, ctx.organizationId, ctx.entityId);
    const memories = await listEntityMemories(supabase, ctx.organizationId, ctx.entityId);
    const hotUsedBytes = memories
      .filter((memory) => memory.tier === 'hot')
      .reduce((sum, memory) => sum + memory.sizeBytes, 0);
    const bytesToFree = hotUsedBytes + ctx.sizeBytes - config.hotBudgetBytes;

    if (bytesToFree <= 0) {
      return {
        ok: true,
        demotedIds: [],
        hotUsedBytes,
        hotBudgetBytes: config.hotBudgetBytes,
      };
    }

    const demotion = await demoteLeastUsed(
      {
        organizationId: ctx.organizationId,
        entityId: ctx.entityId,
        bytesToFree,
        fromTier: 'hot',
      },
      supabase
    );

    const projectedHotBytes = hotUsedBytes - demotion.freedBytes + ctx.sizeBytes;
    if (projectedHotBytes > config.hotBudgetBytes) {
      return {
        ok: false,
        reason: 'budget_exceeded',
        demotedIds: demotion.demotedIds,
        hotUsedBytes: Math.max(0, projectedHotBytes),
        hotBudgetBytes: config.hotBudgetBytes,
      };
    }

    return {
      ok: true,
      demotedIds: demotion.demotedIds,
      hotUsedBytes: Math.max(0, projectedHotBytes),
      hotBudgetBytes: config.hotBudgetBytes,
    };
  } catch (error) {
    logServerError('[memory/budget] Reserve hot space failed', error, {
      organizationId: ctx.organizationId,
      entityId: ctx.entityId,
    });
    return { ok: true, reason: 'budget_unavailable', demotedIds: [] };
  }
}

export async function recordBudgetWrite(
  ctx: { organizationId: string | null; entityId: string; memoryId: string; sizeBytes: number },
  supabase: SupabaseLike = createServerClient()
): Promise<void> {
  if (!ctx.organizationId || !ctx.entityId) return;

  await insertBudgetEvent(supabase, {
    organizationId: ctx.organizationId,
    entityId: ctx.entityId,
    memoryId: ctx.memoryId,
    eventType: 'write',
    toTier: 'hot',
    sizeBytes: ctx.sizeBytes,
  });
  await refreshEntityBudgetUsage(
    { organizationId: ctx.organizationId, entityId: ctx.entityId },
    supabase
  );
}

export async function recordRecall(
  memoryId: string,
  supabase: SupabaseLike = createServerClient()
): Promise<void> {
  const { data: memoryRaw, error: fetchError } = await supabase
    .from('memories')
    .select('id, organization_id, entity_id, tier, size_bytes, recall_count')
    .eq('id', memoryId)
    .maybeSingle();
  const memory = memoryRaw as {
    id?: unknown;
    organization_id?: unknown;
    entity_id?: unknown;
    tier?: unknown;
    size_bytes?: unknown;
    recall_count?: unknown;
  } | null;

  if (fetchError || !memory) {
    if (fetchError) {
      logServerWarn('[memory/budget] Recall record skipped; memory unavailable', fetchError, {
        memoryId,
      });
    }
    return;
  }

  const organizationId = typeof memory.organization_id === 'string' ? memory.organization_id : null;
  const entityId = typeof memory.entity_id === 'string' ? memory.entity_id : null;
  const recallCount = Math.max(0, toNumber(memory.recall_count));
  const currentTier = normalizeTier(memory.tier);
  const nextRecallTier = PROMOTE_ON_RECALL && currentTier !== 'hot' ? 'hot' : currentTier;
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('memories')
    .update({
      recall_count: recallCount + 1,
      last_recalled_at: now,
      last_accessed_at: now,
      tier: nextRecallTier,
    })
    .eq('id', memoryId);

  if (updateError) {
    logServerWarn('[memory/budget] Failed to update recall counters', updateError, { memoryId });
    return;
  }

  if (organizationId && entityId) {
    await insertBudgetEvent(supabase, {
      organizationId,
      entityId,
      memoryId,
      eventType: 'recall',
      toTier: nextRecallTier,
      sizeBytes: toNumber(memory.size_bytes),
    });
    if (currentTier !== nextRecallTier) {
      await insertBudgetEvent(supabase, {
        organizationId,
        entityId,
        memoryId,
        eventType: 'promote',
        fromTier: currentTier,
        toTier: nextRecallTier,
        sizeBytes: toNumber(memory.size_bytes),
        reason: 'recall_refresh',
      });
      await refreshEntityBudgetUsage({ organizationId, entityId }, supabase);
    }
  }
}

async function listStaleMemories(
  supabase: SupabaseLike,
  params: { tier: 'hot' | 'warm'; cutoffIso: string; limit: number }
): Promise<StaleMemoryRow[]> {
  if (params.limit <= 0) return [];

  const { data, error } = await supabase
    .from('memories')
    .select('id, organization_id, entity_id, tier, size_bytes, last_recalled_at')
    .eq('tier', params.tier)
    .eq('pinned', false)
    .eq('is_deleted', false)
    .lt('last_recalled_at', params.cutoffIso)
    .order('last_recalled_at', { ascending: true })
    .limit(params.limit);

  if (error) {
    throw new Error(`tier_demotion_fetch_failed: ${error.message || 'unknown'}`);
  }

  return ((data || []) as Record<string, unknown>[])
    .map(normalizeStaleMemoryRow)
    .filter((row): row is StaleMemoryRow => row !== null);
}

async function demoteScheduledMemory(
  supabase: SupabaseLike,
  row: StaleMemoryRow,
  toTier: MemoryTier,
  nowIso: string,
  plan: string
): Promise<boolean> {
  const { error } = await supabase
    .from('memories')
    .update({ tier: toTier, updated_at: nowIso })
    .eq('id', row.id)
    .eq('organization_id', row.organizationId)
    .eq('entity_id', row.entityId)
    .eq('tier', row.tier)
    .eq('pinned', false);

  if (error) {
    throw new Error(`tier_demotion_update_failed: ${error.message || 'unknown'}`);
  }

  await insertBudgetEvent(supabase, {
    organizationId: row.organizationId,
    entityId: row.entityId,
    memoryId: row.id,
    eventType: 'demote',
    fromTier: row.tier,
    toTier,
    sizeBytes: row.sizeBytes,
    reason: row.tier === 'hot' ? 'scheduled_stale_hot_30d' : 'scheduled_stale_warm_90d',
  });
  await recordTierTransitionUsage(supabase, {
    organizationId: row.organizationId,
    entityId: row.entityId,
    memoryId: row.id,
    fromTier: row.tier,
    toTier,
    plan,
    occurredAt: nowIso,
  });
  await refreshEntityBudgetUsage(
    { organizationId: row.organizationId, entityId: row.entityId },
    supabase
  );
  return true;
}

export async function runTierDemotionBatch(
  params: { batchSize?: number; maxRuntimeMs?: number; now?: Date } = {},
  supabase: SupabaseLike = createServerClient()
): Promise<TierDemotionRunResult> {
  const batchSize = Math.min(
    TIER_DEMOTION_BATCH_SIZE,
    Math.max(1, Math.floor(params.batchSize || TIER_DEMOTION_BATCH_SIZE))
  );
  const maxRuntimeMs = Math.min(
    TIER_DEMOTION_MAX_RUNTIME_MS,
    Math.max(1_000, Math.floor(params.maxRuntimeMs || TIER_DEMOTION_MAX_RUNTIME_MS))
  );
  const startedAt = Date.now();
  const now = params.now || new Date();
  const nowIso = now.toISOString();
  const rules: Array<{ fromTier: 'hot' | 'warm'; toTier: MemoryTier; cutoffIso: string }> = [
    {
      fromTier: 'hot',
      toTier: 'warm',
      cutoffIso: new Date(now.getTime() - HOT_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      fromTier: 'warm',
      toTier: 'cold',
      cutoffIso: new Date(now.getTime() - WARM_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const result: TierDemotionRunResult = {
    processed: 0,
    demoted: 0,
    hotToWarm: 0,
    warmToCold: 0,
    skippedPlanGate: 0,
    stoppedReason: 'completed',
    demotedIds: [],
  };
  const planCache = new Map<string, string>();

  for (const rule of rules) {
    const remaining = batchSize - result.processed;
    if (remaining <= 0) break;

    const candidates = await listStaleMemories(supabase, {
      tier: rule.fromTier,
      cutoffIso: rule.cutoffIso,
      limit: remaining,
    });

    for (const candidate of candidates) {
      if (Date.now() - startedAt > maxRuntimeMs) {
        result.stoppedReason = 'runtime_limit';
        return result;
      }

      result.processed += 1;
      let plan = planCache.get(candidate.organizationId);
      if (!plan) {
        plan = await resolveOrganizationPlan(supabase, candidate.organizationId);
        planCache.set(candidate.organizationId, plan);
      }

      if (!hasFeature(plan, 'memoryTiering')) {
        result.skippedPlanGate += 1;
        continue;
      }

      await demoteScheduledMemory(supabase, candidate, rule.toTier, nowIso, plan);
      result.demoted += 1;
      result.demotedIds.push(candidate.id);
      if (rule.fromTier === 'hot') {
        result.hotToWarm += 1;
      } else {
        result.warmToCold += 1;
      }
    }
  }

  return result;
}

export async function getTierStats(
  organizationId: string,
  supabase: SupabaseLike = createServerClient()
): Promise<TierStats> {
  const { data, error } = await supabase
    .from('memories')
    .select('tier, pinned')
    .eq('organization_id', organizationId)
    .eq('is_deleted', false);

  if (error) {
    throw new Error(`tier_stats_fetch_failed: ${error.message || 'unknown'}`);
  }

  const stats: TierStats = {
    hot: 0,
    warm: 0,
    cold: 0,
    pinned: 0,
    lastDemotionAt: null,
    lastDemotionCount: 0,
  };

  for (const row of (data || []) as Array<{ tier?: unknown; pinned?: unknown }>) {
    const tier = normalizeTier(row.tier);
    stats[tier] += 1;
    if (row.pinned === true) stats.pinned += 1;
  }

  const { data: demotions, error: demotionError } = await supabase
    .from('memory_budget_events')
    .select('created_at')
    .eq('organization_id', organizationId)
    .eq('event_type', 'demote')
    .order('created_at', { ascending: false })
    .limit(TIER_DEMOTION_BATCH_SIZE);

  if (demotionError) {
    logServerWarn('[memory/budget] Tier demotion stats degraded', demotionError, {
      organizationId,
    });
    return stats;
  }

  const demotionRows = (demotions || []) as Array<{ created_at?: string }>;
  stats.lastDemotionAt = demotionRows[0]?.created_at || null;
  if (stats.lastDemotionAt) {
    const lastDemotionDate = stats.lastDemotionAt.slice(0, 10);
    stats.lastDemotionCount = demotionRows.filter((row) =>
      typeof row.created_at === 'string' && row.created_at.startsWith(lastDemotionDate)
    ).length;
  }

  return stats;
}

export interface SimulatedBudgetMemory extends BudgetMemoryRow {
  content: string;
}

export function createInMemoryBudgetSimulator(config: Partial<BudgetConfig> = {}) {
  const finalConfig = { ...DEFAULT_BUDGET_CONFIG, ...config };
  const memories: SimulatedBudgetMemory[] = [];
  let queue: Promise<void> = Promise.resolve();
  let sequence = 0;

  const rebalance = () => {
    const hotUsedBytes = memories
      .filter((memory) => memory.tier === 'hot')
      .reduce((sum, memory) => sum + memory.sizeBytes, 0);
    const bytesToFree = hotUsedBytes - finalConfig.hotBudgetBytes;
    const { candidates } = selectDemotionCandidates(
      memories,
      bytesToFree,
      'hot',
      finalConfig.demotionPolicy
    );
    for (const candidate of candidates) {
      candidate.tier = 'warm';
    }
  };

  return {
    async write(input: { id?: string; content: string; sizeBytes?: number; pinned?: boolean }) {
      const id = input.id || `sim_${sequence + 1}`;
      const sizeBytes = input.sizeBytes ?? estimateMemorySizeBytes(input.content);

      queue = queue.then(async () => {
        sequence += 1;
        memories.push({
          id,
          content: input.content,
          tier: 'hot',
          pinned: input.pinned === true,
          sizeBytes,
          recallCount: 0,
          lastRecalledAt: null,
          createdAt: new Date(1700000000000 + sequence).toISOString(),
        });
        rebalance();
      });

      await queue;
      return id;
    },
    snapshot() {
      return memories.map((memory) => ({ ...memory }));
    },
    hotUsedBytes() {
      return memories
        .filter((memory) => memory.tier === 'hot')
        .reduce((sum, memory) => sum + memory.sizeBytes, 0);
    },
  };
}
