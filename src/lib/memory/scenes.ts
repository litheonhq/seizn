import { createServerClient } from '@/lib/supabase';

type SupabaseLike = ReturnType<typeof createServerClient>;

export interface SceneRecord {
  id: string;
  user_id: string;
  organization_id: string | null;
  namespace: string;
  entity_ids: string[];
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  outcomes: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SceneContext {
  id: string;
  entityIds: string[];
  startedAt: string;
}

export interface StartSceneInput {
  userId: string;
  organizationId?: string | null;
  namespace?: string;
  entityIds: string[];
  summary?: string | null;
  metadata?: Record<string, unknown>;
}

export interface EndSceneInput {
  userId: string;
  sceneId: string;
  summary?: string | null;
  outcomes?: Record<string, unknown>;
}

export type SceneBoosted<T> = T & {
  scene_boost?: boolean;
  scene_id?: string;
  scene_score?: number;
};

const MAX_ENTITY_IDS = 100;
const DEFAULT_SCENE_BOOST = 1.25;

function normalizeEntityIds(entityIds: string[]): string[] {
  return [...new Set(entityIds.map((id) => id.trim()).filter(Boolean))].slice(0, MAX_ENTITY_IDS);
}

function normalizeScene(row: Record<string, unknown>): SceneRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    organization_id: typeof row.organization_id === 'string' ? row.organization_id : null,
    namespace: typeof row.namespace === 'string' ? row.namespace : 'default',
    entity_ids: Array.isArray(row.entity_ids) ? row.entity_ids.map(String) : [],
    started_at: String(row.started_at),
    ended_at: typeof row.ended_at === 'string' ? row.ended_at : null,
    summary: typeof row.summary === 'string' ? row.summary : null,
    outcomes: typeof row.outcomes === 'object' && row.outcomes !== null ? row.outcomes as Record<string, unknown> : {},
    metadata: typeof row.metadata === 'object' && row.metadata !== null ? row.metadata as Record<string, unknown> : {},
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function createSceneContext(scene: SceneRecord): SceneContext {
  return {
    id: scene.id,
    entityIds: scene.entity_ids,
    startedAt: scene.started_at,
  };
}

export async function startScene(
  supabase: SupabaseLike,
  input: StartSceneInput
): Promise<SceneRecord> {
  const entityIds = normalizeEntityIds(input.entityIds);
  if (entityIds.length === 0) {
    throw new Error('entity_ids must include at least one entity');
  }

  const { data, error } = await supabase
    .from('scenes')
    .insert({
      user_id: input.userId,
      organization_id: input.organizationId || null,
      namespace: input.namespace || 'default',
      entity_ids: entityIds,
      summary: input.summary || null,
      metadata: input.metadata || {},
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`scene_start_failed: ${error?.message || 'unknown'}`);
  }

  return normalizeScene(data as Record<string, unknown>);
}

export async function endScene(
  supabase: SupabaseLike,
  input: EndSceneInput
): Promise<SceneRecord> {
  const patch: Record<string, unknown> = {
    ended_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (input.summary !== undefined) patch.summary = input.summary;
  if (input.outcomes !== undefined) patch.outcomes = input.outcomes;

  const { data, error } = await supabase
    .from('scenes')
    .update(patch)
    .eq('id', input.sceneId)
    .eq('user_id', input.userId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`scene_end_failed: ${error?.message || 'unknown'}`);
  }

  return normalizeScene(data as Record<string, unknown>);
}

export async function listScenes(
  supabase: SupabaseLike,
  input: { userId: string; namespace?: string; activeOnly?: boolean; limit?: number }
): Promise<SceneRecord[]> {
  let query = supabase
    .from('scenes')
    .select('*')
    .eq('user_id', input.userId)
    .eq('namespace', input.namespace || 'default')
    .order('started_at', { ascending: false })
    .limit(input.limit || 20);

  if (input.activeOnly) {
    query = query.is('ended_at', null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`scene_list_failed: ${error.message}`);
  }

  return ((data || []) as Record<string, unknown>[]).map(normalizeScene);
}

export async function resolveSceneContext(
  supabase: SupabaseLike,
  input: { userId: string; namespace?: string; sceneId?: string | null; entityIds?: string[] }
): Promise<SceneContext | null> {
  const namespace = input.namespace || 'default';
  const entityIds = normalizeEntityIds(input.entityIds || []);

  let query = supabase
    .from('scenes')
    .select('*')
    .eq('user_id', input.userId)
    .eq('namespace', namespace)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1);

  if (input.sceneId) {
    query = query.eq('id', input.sceneId);
  } else if (entityIds.length > 0) {
    query = query.overlaps('entity_ids', entityIds);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return createSceneContext(normalizeScene(data as Record<string, unknown>));
}

function scoreOf(row: Record<string, unknown>): number {
  const value = row.similarity ?? row.rrf_score ?? row.combined_score ?? row.importance ?? 0;
  const score = Number(value);
  return Number.isFinite(score) ? score : 0;
}

function memoryEntityIds(row: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  for (const key of ['entity_id', 'agent_id', 'npc_id', 'character_id']) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) ids.add(value.trim());
  }
  const tags = Array.isArray(row.tags) ? row.tags : [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    if (tag.startsWith('entity:')) ids.add(tag.slice('entity:'.length));
    if (tag.startsWith('npc:')) ids.add(tag.slice('npc:'.length));
  }
  return [...ids];
}

export function applySceneBoost<T extends object>(
  results: T[],
  scene: SceneContext | null,
  options: { boost?: number } = {}
): Array<SceneBoosted<T>> {
  if (!scene || scene.entityIds.length === 0 || results.length === 0) return results;

  const sceneEntities = new Set(scene.entityIds);
  const boost = options.boost || DEFAULT_SCENE_BOOST;
  return results
    .map((row) => {
      const record = row as Record<string, unknown>;
      const inScene = memoryEntityIds(record).some((id) => sceneEntities.has(id));
      const baseScore = scoreOf(record);
      const sceneScore = inScene ? baseScore * boost : baseScore;
      return {
        ...row,
        scene_boost: inScene || undefined,
        scene_id: inScene ? scene.id : undefined,
        scene_score: sceneScore,
      };
    })
    .sort((a, b) => (b.scene_score || 0) - (a.scene_score || 0));
}
