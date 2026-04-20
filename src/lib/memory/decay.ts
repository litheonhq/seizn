import { createServerClient } from '@/lib/supabase';
import { logServerWarn } from '@/lib/server/logger';

export interface MemoryWithDecay {
  id: string;
  memory_class?: string | null;
  half_life_hours?: number | null;
  base_strength?: number | null;
  last_reinforced_at?: string | null;
  created_at?: string | null;
  similarity?: number;
  rrf_score?: number;
  personalization_score?: number;
  [key: string]: unknown;
}

export interface DecayPolicy {
  organizationId: string;
  memoryClass: string;
  halfLifeHours: number | null;
  minStrength: number;
  reinforceBoost: number;
  rerankWeight: number;
  updatedAt?: string;
}

type SupabaseLike = ReturnType<typeof createServerClient>;

const DEFAULT_DECAY_POLICY: Omit<DecayPolicy, 'organizationId' | 'memoryClass'> = {
  halfLifeHours: 72,
  minStrength: 0.05,
  reinforceBoost: 0.2,
  rerankWeight: 0.15,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDateMs(value: string | null | undefined): number {
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function normalizePolicy(row: Record<string, unknown>): DecayPolicy {
  return {
    organizationId: String(row.organization_id),
    memoryClass: String(row.memory_class),
    halfLifeHours: row.half_life_hours == null ? null : toNumber(row.half_life_hours, 72),
    minStrength: clamp(toNumber(row.min_strength, DEFAULT_DECAY_POLICY.minStrength), 0, 1),
    reinforceBoost: clamp(toNumber(row.reinforce_boost, DEFAULT_DECAY_POLICY.reinforceBoost), 0, 1),
    rerankWeight: clamp(toNumber(row.rerank_weight, DEFAULT_DECAY_POLICY.rerankWeight), 0, 1),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  };
}

export function currentStrength(
  memory: MemoryWithDecay,
  asOf: Date = new Date(),
  policy?: Partial<DecayPolicy>
): number {
  const baseStrength = clamp(toNumber(memory.base_strength, 1), 0, 1);
  let halfLifeHours: number | null;
  if (memory.half_life_hours === null) {
    halfLifeHours = null;
  } else if (memory.half_life_hours === undefined) {
    halfLifeHours =
      policy && 'halfLifeHours' in policy
        ? policy.halfLifeHours ?? null
        : DEFAULT_DECAY_POLICY.halfLifeHours;
  } else {
    halfLifeHours = toNumber(memory.half_life_hours, 72);
  }

  if (halfLifeHours == null) {
    return baseStrength;
  }

  const reinforcedAt = memory.last_reinforced_at || memory.created_at;
  const elapsedHours = Math.max(0, (asOf.getTime() - toDateMs(reinforcedAt)) / 3_600_000);
  const decayed = baseStrength * Math.pow(0.5, elapsedHours / halfLifeHours);
  return clamp(Math.max(policy?.minStrength ?? DEFAULT_DECAY_POLICY.minStrength, decayed), 0, 1);
}

export function applyDecayRerank<T extends MemoryWithDecay>(
  memories: T[],
  opts: { asOf?: Date; policy?: Partial<DecayPolicy>; weight?: number } = {}
): Array<T & { decay_strength: number; decay_score: number }> {
  const weight = clamp(opts.weight ?? opts.policy?.rerankWeight ?? DEFAULT_DECAY_POLICY.rerankWeight, 0, 1);
  return memories
    .map((memory) => {
      const strength = currentStrength(memory, opts.asOf || new Date(), opts.policy);
      const baseScore = toNumber(
        memory.personalization_score ?? memory.similarity ?? memory.rrf_score,
        0
      );
      return {
        ...memory,
        decay_strength: strength,
        decay_score: baseScore * (1 - weight) + strength * weight,
      };
    })
    .sort((a, b) => b.decay_score - a.decay_score);
}

export async function resolveDecayOrganizationId(
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

export async function listDecayPolicies(
  organizationId: string,
  supabase: SupabaseLike = createServerClient()
): Promise<DecayPolicy[]> {
  const { data, error } = await supabase
    .from('decay_policies')
    .select('organization_id, memory_class, half_life_hours, min_strength, reinforce_boost, rerank_weight, updated_at')
    .eq('organization_id', organizationId)
    .order('memory_class', { ascending: true });

  if (error) {
    logServerWarn('[memory/decay] Policy list unavailable', error, { organizationId });
    return [];
  }

  return ((data || []) as Record<string, unknown>[]).map(normalizePolicy);
}

export async function upsertPolicy(
  organizationId: string,
  memoryClass: string,
  policy: Partial<DecayPolicy>,
  supabase: SupabaseLike = createServerClient()
): Promise<DecayPolicy> {
  const payload = {
    organization_id: organizationId,
    memory_class: memoryClass,
    half_life_hours: policy.halfLifeHours ?? null,
    min_strength: policy.minStrength ?? DEFAULT_DECAY_POLICY.minStrength,
    reinforce_boost: policy.reinforceBoost ?? DEFAULT_DECAY_POLICY.reinforceBoost,
    rerank_weight: policy.rerankWeight ?? DEFAULT_DECAY_POLICY.rerankWeight,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('decay_policies')
    .upsert(payload, { onConflict: 'organization_id,memory_class' })
    .select('organization_id, memory_class, half_life_hours, min_strength, reinforce_boost, rerank_weight, updated_at')
    .single();

  if (error || !data) {
    throw new Error(`decay_policy_upsert_failed: ${error?.message || 'unknown'}`);
  }

  return normalizePolicy(data as Record<string, unknown>);
}

export async function reinforceOnRecall(
  memoryId: string,
  supabase: SupabaseLike = createServerClient()
): Promise<void> {
  const { data: memory, error: fetchError } = await supabase
    .from('memories')
    .select('id, base_strength')
    .eq('id', memoryId)
    .maybeSingle();

  if (fetchError || !memory) {
    if (fetchError) {
      logServerWarn('[memory/decay] Reinforce skipped; memory unavailable', fetchError, { memoryId });
    }
    return;
  }

  const nextStrength = clamp(toNumber(memory.base_strength, 1) + DEFAULT_DECAY_POLICY.reinforceBoost, 0, 1);
  const { error } = await supabase
    .from('memories')
    .update({
      base_strength: nextStrength,
      last_reinforced_at: new Date().toISOString(),
    })
    .eq('id', memoryId);

  if (error) {
    logServerWarn('[memory/decay] Reinforce failed', error, { memoryId });
  }
}
