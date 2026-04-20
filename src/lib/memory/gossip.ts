import { createServerClient } from '@/lib/supabase';

type SupabaseLike = ReturnType<typeof createServerClient>;

export type DistortionModel = 'none' | 'word_swap' | 'entity_swap' | 'word_and_entity_swap' | 'custom';

export interface DistortionConfig {
  seed?: string;
  wordSwapProbability?: number;
  entitySwapProbability?: number;
  replacements?: Record<string, string>;
  entityAliases?: Record<string, string>;
}

export interface DistortFactInput {
  fact: string;
  fromEntityId: string;
  toEntityId: string;
  model?: DistortionModel;
  config?: DistortionConfig;
  customDistorter?: (fact: string) => string;
}

export interface GossipEvent {
  id: string;
  user_id: string;
  organization_id: string | null;
  namespace: string;
  source_belief_id: string | null;
  fact_original: string;
  fact_transmitted: string;
  from_entity_id: string;
  to_entity_id: string;
  channel: string;
  distortion_model: DistortionModel;
  distortion_config: Record<string, unknown>;
  confidence: number;
  propagated_at: string;
  created_at: string;
}

export interface PropagateGossipInput {
  userId: string;
  organizationId?: string | null;
  namespace?: string;
  fact: string;
  fromEntityId: string;
  toEntityId: string;
  channel?: string;
  sourceBeliefId?: string | null;
  distortionModel?: DistortionModel;
  distortionConfig?: DistortionConfig;
  confidence?: number;
}

const DEFAULT_REPLACEMENTS: Record<string, string> = {
  killed: 'wounded',
  stole: 'borrowed',
  betrayed: 'disappointed',
  enemy: 'rival',
  ally: 'contact',
  treasure: 'supplies',
  secret: 'rumor',
};

function clampProbability(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function replaceWords(text: string, replacements: Record<string, string>, shouldSwap: () => boolean): string {
  return text.replace(/\b[\w'-]+\b/g, (word) => {
    const replacement = replacements[word.toLowerCase()];
    return replacement && shouldSwap() ? replacement : word;
  });
}

function replaceEntities(
  text: string,
  aliases: Record<string, string>,
  fallback: { fromEntityId: string; toEntityId: string },
  shouldSwap: () => boolean
): string {
  let output = text;
  for (const [entity, alias] of Object.entries(aliases)) {
    if (!entity || !alias || !shouldSwap()) continue;
    output = output.replaceAll(entity, alias);
  }
  if (output === text && shouldSwap()) {
    output = output.replaceAll(fallback.fromEntityId, fallback.toEntityId);
  }
  return output;
}

function normalizeModel(model: unknown): DistortionModel {
  if (
    model === 'none' ||
    model === 'word_swap' ||
    model === 'entity_swap' ||
    model === 'word_and_entity_swap' ||
    model === 'custom'
  ) {
    return model;
  }
  return 'word_swap';
}

export function distortFact(input: DistortFactInput): string {
  const model = normalizeModel(input.model);
  const config = input.config || {};
  const seed = config.seed || `${input.fact}:${input.fromEntityId}:${input.toEntityId}:${model}`;
  const random = seededRandom(seed);

  if (model === 'none') return input.fact;
  if (model === 'custom' && input.customDistorter) return input.customDistorter(input.fact);

  let output = input.fact;
  if (model === 'word_swap' || model === 'word_and_entity_swap') {
    const replacements = { ...DEFAULT_REPLACEMENTS, ...(config.replacements || {}) };
    const probability = clampProbability(config.wordSwapProbability, 0.35);
    output = replaceWords(output, replacements, () => random() <= probability);
  }
  if (model === 'entity_swap' || model === 'word_and_entity_swap') {
    const probability = clampProbability(config.entitySwapProbability, 0.35);
    output = replaceEntities(
      output,
      config.entityAliases || {},
      { fromEntityId: input.fromEntityId, toEntityId: input.toEntityId },
      () => random() <= probability
    );
  }

  return output;
}

function normalizeEvent(row: Record<string, unknown>): GossipEvent {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    organization_id: typeof row.organization_id === 'string' ? row.organization_id : null,
    namespace: typeof row.namespace === 'string' ? row.namespace : 'default',
    source_belief_id: typeof row.source_belief_id === 'string' ? row.source_belief_id : null,
    fact_original: String(row.fact_original),
    fact_transmitted: String(row.fact_transmitted),
    from_entity_id: String(row.from_entity_id),
    to_entity_id: String(row.to_entity_id),
    channel: String(row.channel || 'dialogue'),
    distortion_model: normalizeModel(row.distortion_model),
    distortion_config: typeof row.distortion_config === 'object' && row.distortion_config !== null
      ? row.distortion_config as Record<string, unknown>
      : {},
    confidence: Number(row.confidence) || 0,
    propagated_at: String(row.propagated_at),
    created_at: String(row.created_at),
  };
}

export async function propagateGossip(
  supabase: SupabaseLike,
  input: PropagateGossipInput
): Promise<GossipEvent> {
  if (!input.fact.trim()) throw new Error('fact is required');
  if (!input.fromEntityId.trim()) throw new Error('fromEntityId is required');
  if (!input.toEntityId.trim()) throw new Error('toEntityId is required');

  const model = normalizeModel(input.distortionModel);
  const transmitted = distortFact({
    fact: input.fact,
    fromEntityId: input.fromEntityId,
    toEntityId: input.toEntityId,
    model,
    config: input.distortionConfig,
  });
  const confidence = Math.min(1, Math.max(0, input.confidence ?? (transmitted === input.fact ? 0.9 : 0.7)));

  const { data, error } = await supabase
    .from('gossip_events')
    .insert({
      user_id: input.userId,
      organization_id: input.organizationId || null,
      namespace: input.namespace || 'default',
      source_belief_id: input.sourceBeliefId || null,
      fact_original: input.fact,
      fact_transmitted: transmitted,
      from_entity_id: input.fromEntityId,
      to_entity_id: input.toEntityId,
      channel: input.channel || 'dialogue',
      distortion_model: model,
      distortion_config: input.distortionConfig || {},
      confidence,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`gossip_propagation_failed: ${error?.message || 'unknown'}`);
  }

  return normalizeEvent(data as Record<string, unknown>);
}

export async function listGossipEvents(
  supabase: SupabaseLike,
  input: { userId: string; namespace?: string; entityId?: string | null; limit?: number }
): Promise<GossipEvent[]> {
  let query = supabase
    .from('gossip_events')
    .select('*')
    .eq('user_id', input.userId)
    .eq('namespace', input.namespace || 'default')
    .order('propagated_at', { ascending: false })
    .limit(input.limit || 50);

  if (input.entityId) {
    query = query.or(`from_entity_id.eq.${input.entityId},to_entity_id.eq.${input.entityId}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`gossip_list_failed: ${error.message}`);
  return ((data || []) as Record<string, unknown>[]).map(normalizeEvent);
}
