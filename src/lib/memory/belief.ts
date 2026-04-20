import { createServerClient } from '@/lib/supabase';
import { logServerError, logServerWarn } from '@/lib/server/logger';

export type BeliefSourceType = 'direct' | 'told' | 'inferred' | 'rumor';
export type BeliefExclusionReason = 'no_belief' | 'revoked' | 'low_confidence';

export interface BeliefShard {
  id: string;
  organizationId: string;
  holderEntityId: string;
  aboutFactId: string;
  observedAt: string;
  witnessEventId: string | null;
  confidence: number;
  revokedAt: string | null;
  sourceType: BeliefSourceType;
}

export interface MemoryForBelief {
  id: string;
  [key: string]: unknown;
}

export interface BeliefFilteredResult<T extends MemoryForBelief> {
  memories: T[];
  excluded: Array<{ id: string; reason: BeliefExclusionReason }>;
}

type SupabaseLike = ReturnType<typeof createServerClient>;

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDateMs(value: string | Date | null | undefined): number {
  if (!value) return Date.now();
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function normalizeBelief(row: Record<string, unknown>): BeliefShard {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    holderEntityId: String(row.holder_entity_id),
    aboutFactId: String(row.about_fact_id),
    observedAt: typeof row.observed_at === 'string' ? row.observed_at : new Date().toISOString(),
    witnessEventId: typeof row.witness_event_id === 'string' ? row.witness_event_id : null,
    confidence: Math.max(0, Math.min(1, toNumber(row.confidence, 1))),
    revokedAt: typeof row.revoked_at === 'string' ? row.revoked_at : null,
    sourceType:
      row.source_type === 'told' ||
      row.source_type === 'inferred' ||
      row.source_type === 'rumor'
        ? row.source_type
        : 'direct',
  };
}

export function evaluateBeliefVisibility<T extends MemoryForBelief>(
  memories: T[],
  beliefs: BeliefShard[],
  opts: { perspectiveEntityId: string; asOf?: string | Date; minConfidence?: number }
): BeliefFilteredResult<T> {
  const asOfMs = toDateMs(opts.asOf);
  const minConfidence = opts.minConfidence ?? 0.3;
  const beliefByFact = new Map<string, BeliefShard[]>();

  for (const belief of beliefs) {
    if (belief.holderEntityId !== opts.perspectiveEntityId) continue;
    const list = beliefByFact.get(belief.aboutFactId) || [];
    list.push(belief);
    beliefByFact.set(belief.aboutFactId, list);
  }

  const included: T[] = [];
  const excluded: Array<{ id: string; reason: BeliefExclusionReason }> = [];

  for (const memory of memories) {
    const candidates = beliefByFact.get(memory.id) || [];
    const observed = candidates.filter((belief) => toDateMs(belief.observedAt) <= asOfMs);

    if (observed.length === 0) {
      excluded.push({ id: memory.id, reason: 'no_belief' });
      continue;
    }

    const active = observed.filter((belief) => !belief.revokedAt || toDateMs(belief.revokedAt) > asOfMs);
    if (active.length === 0) {
      excluded.push({ id: memory.id, reason: 'revoked' });
      continue;
    }

    const strongest = Math.max(...active.map((belief) => belief.confidence));
    if (strongest < minConfidence) {
      excluded.push({ id: memory.id, reason: 'low_confidence' });
      continue;
    }

    included.push(memory);
  }

  return { memories: included, excluded };
}

export async function resolveBeliefOrganizationId(
  supabase: SupabaseLike,
  ctx: { userId: string; keyId?: string | null }
): Promise<string | null> {
  if (ctx.keyId) {
    const { data: keyRow, error } = await supabase
      .from('api_keys')
      .select('organization_id')
      .eq('id', ctx.keyId)
      .maybeSingle();
    if (!error && keyRow?.organization_id) return String(keyRow.organization_id);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', ctx.userId)
    .maybeSingle();
  if (!profileError && profile?.organization_id) return String(profile.organization_id);

  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!memberError && member?.organization_id) return String(member.organization_id);

  return null;
}

export async function recordBelief(
  params: {
    organizationId: string;
    holderEntityId: string;
    aboutFactId: string;
    observedAt?: Date;
    sourceType: BeliefSourceType;
    witnessEventId?: string;
    confidence?: number;
  },
  supabase: SupabaseLike = createServerClient()
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('belief_shards')
    .insert({
      organization_id: params.organizationId,
      holder_entity_id: params.holderEntityId,
      about_fact_id: params.aboutFactId,
      observed_at: (params.observedAt || new Date()).toISOString(),
      witness_event_id: params.witnessEventId || null,
      confidence: Math.max(0, Math.min(1, params.confidence ?? 1)),
      source_type: params.sourceType,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(`belief_record_failed: ${error?.message || 'unknown'}`);
  }

  return { id: String(data.id) };
}

export async function revokeBelief(
  params: { organizationId: string; beliefId: string; revokedAt?: Date },
  supabase: SupabaseLike = createServerClient()
): Promise<void> {
  const { error } = await supabase
    .from('belief_shards')
    .update({ revoked_at: (params.revokedAt || new Date()).toISOString() })
    .eq('id', params.beliefId)
    .eq('organization_id', params.organizationId);

  if (error) {
    throw new Error(`belief_revoke_failed: ${error.message || 'unknown'}`);
  }
}

export async function filterResultsByPerspective<T extends MemoryForBelief>(
  supabase: SupabaseLike,
  params: {
    organizationId: string | null;
    perspectiveEntityId: string | null;
    asOf?: string | Date | null;
    memories: T[];
    minConfidence?: number;
  }
): Promise<BeliefFilteredResult<T>> {
  if (!params.organizationId || !params.perspectiveEntityId || params.memories.length === 0) {
    return { memories: params.memories, excluded: [] };
  }

  const memoryIds = params.memories.map((memory) => memory.id);
  const asOfIso = new Date(toDateMs(params.asOf || undefined)).toISOString();
  const { data, error } = await supabase
    .from('belief_shards')
    .select('id, organization_id, holder_entity_id, about_fact_id, observed_at, witness_event_id, confidence, revoked_at, source_type')
    .eq('organization_id', params.organizationId)
    .eq('holder_entity_id', params.perspectiveEntityId)
    .in('about_fact_id', memoryIds)
    .lte('observed_at', asOfIso);

  if (error) {
    logServerWarn('[memory/belief] Perspective filter unavailable', error, {
      organizationId: params.organizationId,
      perspectiveEntityId: params.perspectiveEntityId,
    });
    return { memories: params.memories, excluded: [] };
  }

  const beliefs = ((data || []) as Record<string, unknown>[]).map(normalizeBelief);
  return evaluateBeliefVisibility(params.memories, beliefs, {
    perspectiveEntityId: params.perspectiveEntityId,
    asOf: params.asOf || undefined,
    minConfidence: params.minConfidence,
  });
}

export async function recallWithPerspective(
  params: {
    organizationId: string;
    perspectiveEntityId: string;
    query: string;
    asOf?: Date;
    topK?: number;
    minConfidence?: number;
  },
  supabase: SupabaseLike = createServerClient()
): Promise<BeliefFilteredResult<MemoryForBelief>> {
  const limit = Math.min(100, Math.max(1, params.topK || 10));
  const { data, error } = await supabase
    .from('memories')
    .select('id, content, memory_type, tags, namespace, importance, created_at')
    .eq('organization_id', params.organizationId)
    .eq('is_deleted', false)
    .ilike('content', `%${params.query}%`)
    .order('importance', { ascending: false })
    .limit(limit * 3);

  if (error) {
    logServerError('[memory/belief] Perspective recall failed', error);
    throw new Error(`belief_recall_failed: ${error.message || 'unknown'}`);
  }

  const memories = ((data || []) as MemoryForBelief[]).slice(0, limit * 3);
  const filtered = await filterResultsByPerspective(supabase, {
    organizationId: params.organizationId,
    perspectiveEntityId: params.perspectiveEntityId,
    asOf: params.asOf,
    memories,
    minConfidence: params.minConfidence,
  });

  return {
    memories: filtered.memories.slice(0, limit),
    excluded: filtered.excluded,
  };
}

export async function listBeliefsForDashboard(
  organizationId: string,
  opts: { holderEntityId?: string; limit?: number } = {},
  supabase: SupabaseLike = createServerClient()
): Promise<BeliefShard[]> {
  let query = supabase
    .from('belief_shards')
    .select('id, organization_id, holder_entity_id, about_fact_id, observed_at, witness_event_id, confidence, revoked_at, source_type')
    .eq('organization_id', organizationId)
    .order('observed_at', { ascending: false })
    .limit(Math.min(100, Math.max(1, opts.limit || 50)));

  if (opts.holderEntityId) {
    query = query.eq('holder_entity_id', opts.holderEntityId);
  }

  const { data, error } = await query;
  if (error) {
    logServerWarn('[memory/belief] Dashboard belief list unavailable', error, { organizationId });
    return [];
  }

  return ((data || []) as Record<string, unknown>[]).map(normalizeBelief);
}
