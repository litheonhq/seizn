import { createServerClient } from '@/lib/supabase';
import { logServerWarn } from '@/lib/server/logger';

type SupabaseLike = ReturnType<typeof createServerClient>;

export interface BudgetSnapshot {
  organizationId: string;
  entityId: string;
  hotUsedBytes: number;
  hotBudgetBytes: number;
  warmUsedBytes: number;
  warmBudgetBytes: number;
  coldUsedBytes: number;
  coldBudgetBytes: number | null;
  totalRecallsLast24h: number;
  demotionsLast24h: number;
  demotionsLast7d: number[];
  topDemotionTargets: Array<{
    memoryId: string;
    sizeBytes: number;
    recallCount: number;
    lastRecalledAt: string | null;
  }>;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function collectBudgetEvents(
  supabase: SupabaseLike,
  organizationId: string,
  entityId: string
): Promise<{ recalls24h: number; demotions24h: number; demotions7d: number[] }> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [recalls, demotions24h, demotions7d] = await Promise.all([
    supabase
      .from('memory_budget_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('entity_id', entityId)
      .eq('event_type', 'recall')
      .gte('created_at', since24h),
    supabase
      .from('memory_budget_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('entity_id', entityId)
      .eq('event_type', 'demote')
      .gte('created_at', since24h),
    supabase
      .from('memory_budget_events')
      .select('created_at')
      .eq('organization_id', organizationId)
      .eq('entity_id', entityId)
      .eq('event_type', 'demote')
      .gte('created_at', since7d),
  ]);

  if (recalls.error || demotions24h.error || demotions7d.error) {
    logServerWarn('[memory/budget-telemetry] Event aggregation degraded', {
      recallsError: recalls.error,
      demotions24hError: demotions24h.error,
      demotions7dError: demotions7d.error,
    });
  }

  const buckets = new Map<string, number>();
  for (let i = 6; i >= 0; i -= 1) {
    buckets.set(dayKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)), 0);
  }
  for (const event of (demotions7d.data || []) as Array<{ created_at?: string }>) {
    if (!event.created_at) continue;
    const key = dayKey(new Date(event.created_at));
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
  }

  return {
    recalls24h: recalls.count || 0,
    demotions24h: demotions24h.count || 0,
    demotions7d: [...buckets.values()],
  };
}

async function collectTopDemotionTargets(
  supabase: SupabaseLike,
  organizationId: string,
  entityId: string
): Promise<BudgetSnapshot['topDemotionTargets']> {
  const { data, error } = await supabase
    .from('memories')
    .select('id, size_bytes, recall_count, last_recalled_at')
    .eq('organization_id', organizationId)
    .eq('entity_id', entityId)
    .eq('tier', 'hot')
    .eq('pinned', false)
    .eq('is_deleted', false)
    .order('recall_count', { ascending: true })
    .order('last_recalled_at', { ascending: true, nullsFirst: true })
    .limit(5);

  if (error) {
    logServerWarn('[memory/budget-telemetry] Demotion targets unavailable', error, {
      organizationId,
      entityId,
    });
    return [];
  }

  return ((data || []) as Record<string, unknown>[]).map((row) => ({
    memoryId: String(row.id),
    sizeBytes: toNumber(row.size_bytes),
    recallCount: toNumber(row.recall_count),
    lastRecalledAt: typeof row.last_recalled_at === 'string' ? row.last_recalled_at : null,
  }));
}

function emptySnapshot(organizationId: string, entityId: string): BudgetSnapshot {
  return {
    organizationId,
    entityId,
    hotUsedBytes: 0,
    hotBudgetBytes: 64 * 1024,
    warmUsedBytes: 0,
    warmBudgetBytes: 512 * 1024,
    coldUsedBytes: 0,
    coldBudgetBytes: null,
    totalRecallsLast24h: 0,
    demotionsLast24h: 0,
    demotionsLast7d: [0, 0, 0, 0, 0, 0, 0],
    topDemotionTargets: [],
  };
}

export async function getBudgetSnapshot(
  orgId: string,
  entityId: string,
  supabase: SupabaseLike = createServerClient()
): Promise<BudgetSnapshot> {
  const { data: rawData, error } = await supabase
    .from('entity_budget')
    .select(
      'organization_id, entity_id, hot_used_bytes, hot_budget_bytes, warm_used_bytes, warm_budget_bytes, cold_used_bytes, cold_budget_bytes'
    )
    .eq('organization_id', orgId)
    .eq('entity_id', entityId)
    .maybeSingle();
  const data = rawData as {
    organization_id?: unknown;
    entity_id?: unknown;
    hot_used_bytes?: unknown;
    hot_budget_bytes?: unknown;
    warm_used_bytes?: unknown;
    warm_budget_bytes?: unknown;
    cold_used_bytes?: unknown;
    cold_budget_bytes?: unknown;
  } | null;

  if (error || !data) {
    if (error) {
      logServerWarn('[memory/budget-telemetry] Budget snapshot unavailable', error, {
        orgId,
        entityId,
      });
    }
    return emptySnapshot(orgId, entityId);
  }

  const [events, topDemotionTargets] = await Promise.all([
    collectBudgetEvents(supabase, orgId, entityId),
    collectTopDemotionTargets(supabase, orgId, entityId),
  ]);

  return {
    organizationId: String(data.organization_id),
    entityId: String(data.entity_id),
    hotUsedBytes: toNumber(data.hot_used_bytes),
    hotBudgetBytes: toNumber(data.hot_budget_bytes, 64 * 1024),
    warmUsedBytes: toNumber(data.warm_used_bytes),
    warmBudgetBytes: toNumber(data.warm_budget_bytes, 512 * 1024),
    coldUsedBytes: toNumber(data.cold_used_bytes),
    coldBudgetBytes: data.cold_budget_bytes == null ? null : toNumber(data.cold_budget_bytes),
    totalRecallsLast24h: events.recalls24h,
    demotionsLast24h: events.demotions24h,
    demotionsLast7d: events.demotions7d,
    topDemotionTargets,
  };
}

export async function listBudgetSnapshots(
  orgId: string,
  opts: { limit?: number } = {},
  supabase: SupabaseLike = createServerClient()
): Promise<BudgetSnapshot[]> {
  const limit = Math.min(100, Math.max(1, opts.limit || 20));
  const { data, error } = await supabase
    .from('entity_budget')
    .select('entity_id')
    .eq('organization_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    logServerWarn('[memory/budget-telemetry] Budget snapshot list unavailable', error, { orgId });
    return [];
  }

  return Promise.all(
    ((data || []) as Array<{ entity_id?: string }>).map((row) =>
      getBudgetSnapshot(orgId, String(row.entity_id), supabase)
    )
  );
}
