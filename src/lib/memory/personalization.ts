import type { SupabaseClient } from '@supabase/supabase-js';

export type MemoryFeedbackEventType = 'thumbs_up' | 'thumbs_down' | 'click' | 'open' | 'reuse';

type MemoryTypeKey = 'fact' | 'preference' | 'experience' | 'relationship' | 'instruction';

type NumericMap = Record<string, number>;

interface LearningProfileRow {
  id: string;
  user_id: string;
  namespace: string;
  personalization_enabled: boolean;
  memory_type_weights: unknown;
  tag_weights: unknown;
  recency_weight: number;
  importance_weight: number;
  similarity_weight: number;
  total_feedback_count: number;
  positive_feedback_count: number;
  negative_feedback_count: number;
  last_feedback_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserMemoryLearningProfile {
  id: string;
  userId: string;
  namespace: string;
  personalizationEnabled: boolean;
  memoryTypeWeights: NumericMap;
  tagWeights: NumericMap;
  recencyWeight: number;
  importanceWeight: number;
  similarityWeight: number;
  totalFeedbackCount: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  lastFeedbackAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchMemoryShape {
  id: string;
  memory_type?: string;
  tags?: string[];
  created_at?: string;
  importance?: number;
  similarity?: number;
  rrf_score?: number;
}

export type PersonalizedResult<T extends SearchMemoryShape> = T & {
  personalization_score: number;
};

interface FeedbackInput {
  userId: string;
  namespace: string;
  memoryId: string;
  eventType: MemoryFeedbackEventType;
  query?: string | null;
  memoryType?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
}

interface PersonalizationPatch {
  personalizationEnabled?: boolean;
  recencyWeight?: number;
  importanceWeight?: number;
  similarityWeight?: number;
}

const DEFAULT_MEMORY_TYPE_WEIGHTS: Record<MemoryTypeKey, number> = {
  fact: 1.0,
  preference: 1.0,
  experience: 1.0,
  relationship: 1.0,
  instruction: 1.0,
};

const DEFAULT_RECENCY_WEIGHT = 0.2;
const DEFAULT_IMPORTANCE_WEIGHT = 0.2;
const DEFAULT_SIMILARITY_WEIGHT = 0.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createFallbackProfile(userId: string, namespace: string): UserMemoryLearningProfile {
  const now = new Date().toISOString();
  return {
    id: `fallback:${userId}:${namespace}`,
    userId,
    namespace,
    personalizationEnabled: true,
    memoryTypeWeights: { ...DEFAULT_MEMORY_TYPE_WEIGHTS },
    tagWeights: {},
    recencyWeight: DEFAULT_RECENCY_WEIGHT,
    importanceWeight: DEFAULT_IMPORTANCE_WEIGHT,
    similarityWeight: DEFAULT_SIMILARITY_WEIGHT,
    totalFeedbackCount: 0,
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    lastFeedbackAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeNumberMap(value: unknown): NumericMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: NumericMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}

function normalizeProfileRow(row: LearningProfileRow): UserMemoryLearningProfile {
  return {
    id: row.id,
    userId: row.user_id,
    namespace: row.namespace,
    personalizationEnabled: Boolean(row.personalization_enabled),
    memoryTypeWeights: {
      ...DEFAULT_MEMORY_TYPE_WEIGHTS,
      ...normalizeNumberMap(row.memory_type_weights),
    },
    tagWeights: normalizeNumberMap(row.tag_weights),
    recencyWeight: clamp(Number(row.recency_weight ?? DEFAULT_RECENCY_WEIGHT), 0, 1),
    importanceWeight: clamp(Number(row.importance_weight ?? DEFAULT_IMPORTANCE_WEIGHT), 0, 1),
    similarityWeight: clamp(Number(row.similarity_weight ?? DEFAULT_SIMILARITY_WEIGHT), 0, 1),
    totalFeedbackCount: Number(row.total_feedback_count ?? 0),
    positiveFeedbackCount: Number(row.positive_feedback_count ?? 0),
    negativeFeedbackCount: Number(row.negative_feedback_count ?? 0),
    lastFeedbackAt: row.last_feedback_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingPersonalizationTableError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  const code = error.code || '';
  const message = (error.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    message.includes('user_memory_learning_profiles') ||
    message.includes('memory_feedback_events')
  );
}

function scoreFromEvent(eventType: MemoryFeedbackEventType): number {
  switch (eventType) {
    case 'thumbs_up':
      return 1.0;
    case 'thumbs_down':
      return -1.0;
    case 'reuse':
      return 0.6;
    case 'open':
      return 0.3;
    case 'click':
      return 0.2;
    default:
      return 0;
  }
}

function ensureWeightRecord(input: NumericMap): NumericMap {
  const output: NumericMap = {};
  for (const [k, v] of Object.entries(input)) {
    if (!Number.isFinite(v)) continue;
    output[k] = clamp(v, 0.4, 2.5);
  }
  return output;
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/gu)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function calculateTagAffinity(tags: string[], tagWeights: NumericMap, query: string): number {
  if (!tags.length) return 1.0;

  const tokens = tokenizeQuery(query);
  const hasQueryTokens = tokens.length > 0;

  const matched = tags.filter((tag) => {
    if (!hasQueryTokens) return true;
    const lowerTag = tag.toLowerCase();
    return tokens.some((token) => lowerTag.includes(token) || token.includes(lowerTag));
  });

  const candidate = matched.length > 0 ? matched : tags;
  const weightValues = candidate.map((tag) => {
    const w = tagWeights[tag] ?? tagWeights[tag.toLowerCase()] ?? 1.0;
    return clamp(w, 0.4, 2.5);
  });

  if (!weightValues.length) return 1.0;
  return weightValues.reduce((sum, v) => sum + v, 0) / weightValues.length;
}

export async function getOrCreateLearningProfile(
  supabase: SupabaseClient,
  userId: string,
  namespace: string = 'default'
): Promise<{ available: boolean; profile: UserMemoryLearningProfile; reason?: string }> {
  const fallback = createFallbackProfile(userId, namespace);

  const { data, error } = await supabase
    .from('user_memory_learning_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .maybeSingle();

  if (error) {
    if (isMissingPersonalizationTableError(error)) {
      return { available: false, profile: fallback, reason: 'schema_missing' };
    }
    throw error;
  }

  if (data) {
    return { available: true, profile: normalizeProfileRow(data as LearningProfileRow) };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('user_memory_learning_profiles')
    .insert({
      user_id: userId,
      namespace,
      personalization_enabled: true,
      memory_type_weights: DEFAULT_MEMORY_TYPE_WEIGHTS,
      tag_weights: {},
      recency_weight: DEFAULT_RECENCY_WEIGHT,
      importance_weight: DEFAULT_IMPORTANCE_WEIGHT,
      similarity_weight: DEFAULT_SIMILARITY_WEIGHT,
    })
    .select('*')
    .single();

  if (insertError) {
    if (isMissingPersonalizationTableError(insertError)) {
      return { available: false, profile: fallback, reason: 'schema_missing' };
    }
    throw insertError;
  }

  return { available: true, profile: normalizeProfileRow(inserted as LearningProfileRow) };
}

export function applyPersonalizedRanking<T extends SearchMemoryShape>(
  results: T[],
  profile: UserMemoryLearningProfile,
  query: string
): PersonalizedResult<T>[] {
  if (!profile.personalizationEnabled) {
    return results.map((item) => ({
      ...item,
      personalization_score: Number(item.similarity ?? item.rrf_score ?? 0),
    }));
  }

  const decorated: Array<PersonalizedResult<T> & { __index: number }> = results.map((item, index) => {
    const baseSimilarity = clamp(Number(item.similarity ?? item.rrf_score ?? 0), 0, 1);
    const importanceNorm = clamp(Number(item.importance ?? 5) / 10, 0, 1);
    const createdAt = item.created_at ? new Date(item.created_at).getTime() : Date.now();
    const ageDays = Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60 * 24));
    const freshness = Math.exp(-ageDays / 45); // gentle decay

    const memoryType = String(item.memory_type ?? 'fact');
    const typeWeight = clamp(profile.memoryTypeWeights[memoryType] ?? 1.0, 0.4, 2.5);
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const tagAffinity = calculateTagAffinity(tags, profile.tagWeights, query);

    const blended =
      baseSimilarity * profile.similarityWeight +
      importanceNorm * profile.importanceWeight +
      freshness * profile.recencyWeight;

    const personalizationScore = blended * typeWeight * (1 + (tagAffinity - 1) * 0.35);

    return {
      ...item,
      personalization_score: personalizationScore,
      __index: index,
    };
  });

  decorated.sort((a, b) => {
    if (b.personalization_score !== a.personalization_score) {
      return b.personalization_score - a.personalization_score;
    }
    return a.__index - b.__index;
  });

  return decorated.map((item) => {
    const { __index: _, ...rest } = item;
    return rest as PersonalizedResult<T>;
  });
}

export async function recordFeedbackAndLearn(
  supabase: SupabaseClient,
  input: FeedbackInput
): Promise<{ applied: boolean; profile?: UserMemoryLearningProfile; reason?: string }> {
  const { userId, namespace, memoryId, eventType, memoryType, tags, query, metadata } = input;
  const reward = scoreFromEvent(eventType);
  const profileState = await getOrCreateLearningProfile(supabase, userId, namespace);

  const { error: eventError } = await supabase
    .from('memory_feedback_events')
    .insert({
      user_id: userId,
      namespace,
      memory_id: memoryId,
      event_type: eventType,
      query_text: query || null,
      memory_type: memoryType || null,
      tags: tags || [],
      reward,
      metadata: metadata || {},
    });

  if (eventError && !isMissingPersonalizationTableError(eventError)) {
    throw eventError;
  }

  if (!profileState.available) {
    return { applied: false, reason: profileState.reason || 'schema_missing' };
  }

  const profile = profileState.profile;
  const nextTypeWeights: NumericMap = { ...profile.memoryTypeWeights };
  const nextTagWeights: NumericMap = { ...profile.tagWeights };
  const positive = eventType === 'thumbs_up' ? 1 : 0;
  const negative = eventType === 'thumbs_down' ? 1 : 0;

  if (profile.personalizationEnabled) {
    const delta = reward * 0.08;
    if (memoryType) {
      const current = nextTypeWeights[memoryType] ?? 1.0;
      nextTypeWeights[memoryType] = clamp(current + delta, 0.4, 2.5);
    }

    const normalizedTags = (tags || []).slice(0, 8);
    for (const tag of normalizedTags) {
      const key = tag.toLowerCase();
      const current = nextTagWeights[key] ?? 1.0;
      nextTagWeights[key] = clamp(current + delta * 0.65, 0.4, 2.5);
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('user_memory_learning_profiles')
    .update({
      memory_type_weights: ensureWeightRecord(nextTypeWeights),
      tag_weights: ensureWeightRecord(nextTagWeights),
      total_feedback_count: profile.totalFeedbackCount + 1,
      positive_feedback_count: profile.positiveFeedbackCount + positive,
      negative_feedback_count: profile.negativeFeedbackCount + negative,
      last_feedback_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .select('*')
    .single();

  if (updateError) {
    if (isMissingPersonalizationTableError(updateError)) {
      return { applied: false, reason: 'schema_missing' };
    }
    throw updateError;
  }

  return {
    applied: true,
    profile: normalizeProfileRow(updated as LearningProfileRow),
  };
}

export async function updateLearningPreferences(
  supabase: SupabaseClient,
  userId: string,
  namespace: string,
  patch: PersonalizationPatch
): Promise<{ available: boolean; profile: UserMemoryLearningProfile; reason?: string }> {
  const state = await getOrCreateLearningProfile(supabase, userId, namespace);
  if (!state.available) return state;

  const payload: Record<string, unknown> = {};
  if (typeof patch.personalizationEnabled === 'boolean') {
    payload.personalization_enabled = patch.personalizationEnabled;
  }
  if (typeof patch.recencyWeight === 'number') {
    payload.recency_weight = clamp(patch.recencyWeight, 0, 1);
  }
  if (typeof patch.importanceWeight === 'number') {
    payload.importance_weight = clamp(patch.importanceWeight, 0, 1);
  }
  if (typeof patch.similarityWeight === 'number') {
    payload.similarity_weight = clamp(patch.similarityWeight, 0, 1);
  }

  if (Object.keys(payload).length === 0) {
    return state;
  }

  const { data, error } = await supabase
    .from('user_memory_learning_profiles')
    .update(payload)
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .select('*')
    .single();

  if (error) {
    if (isMissingPersonalizationTableError(error)) {
      return { available: false, profile: state.profile, reason: 'schema_missing' };
    }
    throw error;
  }

  return { available: true, profile: normalizeProfileRow(data as LearningProfileRow) };
}

export async function resetLearningProfile(
  supabase: SupabaseClient,
  userId: string,
  namespace: string,
  deleteFeedbackHistory: boolean
): Promise<{ available: boolean; profile: UserMemoryLearningProfile; reason?: string }> {
  const state = await getOrCreateLearningProfile(supabase, userId, namespace);
  if (!state.available) return state;

  const { data, error } = await supabase
    .from('user_memory_learning_profiles')
    .update({
      personalization_enabled: true,
      memory_type_weights: DEFAULT_MEMORY_TYPE_WEIGHTS,
      tag_weights: {},
      recency_weight: DEFAULT_RECENCY_WEIGHT,
      importance_weight: DEFAULT_IMPORTANCE_WEIGHT,
      similarity_weight: DEFAULT_SIMILARITY_WEIGHT,
      total_feedback_count: 0,
      positive_feedback_count: 0,
      negative_feedback_count: 0,
      last_feedback_at: null,
    })
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .select('*')
    .single();

  if (error) {
    if (isMissingPersonalizationTableError(error)) {
      return { available: false, profile: state.profile, reason: 'schema_missing' };
    }
    throw error;
  }

  if (deleteFeedbackHistory) {
    const { error: deleteError } = await supabase
      .from('memory_feedback_events')
      .delete()
      .eq('user_id', userId)
      .eq('namespace', namespace);

    if (deleteError && !isMissingPersonalizationTableError(deleteError)) {
      throw deleteError;
    }
  }

  return { available: true, profile: normalizeProfileRow(data as LearningProfileRow) };
}

export async function getLearningDiagnostics(
  supabase: SupabaseClient,
  userId: string,
  namespace: string
): Promise<{
  available: boolean;
  profile: UserMemoryLearningProfile;
  recentEvents: Array<Record<string, unknown>>;
  topTags: Array<{ tag: string; weight: number }>;
  reason?: string;
}> {
  const state = await getOrCreateLearningProfile(supabase, userId, namespace);
  const profile = state.profile;

  if (!state.available) {
    return {
      available: false,
      profile,
      recentEvents: [],
      topTags: [],
      reason: state.reason || 'schema_missing',
    };
  }

  const { data: events, error } = await supabase
    .from('memory_feedback_events')
    .select('id, memory_id, event_type, query_text, reward, created_at')
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error && !isMissingPersonalizationTableError(error)) {
    throw error;
  }

  const topTags = Object.entries(profile.tagWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, weight]) => ({ tag, weight }));

  return {
    available: true,
    profile,
    recentEvents: events || [],
    topTags,
  };
}

