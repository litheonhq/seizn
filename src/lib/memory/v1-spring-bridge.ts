import type { SupabaseClient } from '@supabase/supabase-js';
import { createSearchServiceV3 } from '@/lib/spring/memory-v4/search-service';
import type { SearchResultRow } from '@/lib/memory/search-types';
import type { SearchExecutionMode } from '@/lib/memory/search-executor';

const V1_TO_V4_MEMORY_TYPE: Record<string, string> = {
  fact: 'fact',
  preference: 'preference',
  instruction: 'instruction',
  relationship: 'relationship',
  experience: 'episode',
};

const V4_TO_V1_MEMORY_TYPE: Record<string, string> = {
  fact: 'fact',
  preference: 'preference',
  instruction: 'instruction',
  relationship: 'relationship',
  episode: 'experience',
  procedure: 'instruction',
};

const V1_ALLOWED_SCOPE = new Set(['user', 'workspace', 'org', 'session', 'agent']);

export interface MirrorLegacyMemoryInput {
  userId: string;
  memoryId: string;
  content: string;
  embedding: number[] | null;
  memoryType: string;
  tags: string[];
  namespace: string;
  scope: string | null;
  sessionId: string | null;
  agentId: string | null;
  source: string | null;
  importance: number;
  confidence?: number;
  createdAt?: string | null;
}

export interface MirrorLegacyMemoryResult {
  mirrored: boolean;
  springNoteId: string | null;
  skippedReason: string | null;
}

export interface SpringSearchBridgeOptions {
  userId: string;
  query: string;
  limit: number;
  mode: SearchExecutionMode;
  namespace: string;
  memoryType?: string | null;
  tags?: string[] | null;
  scope?: string | null;
  agentId?: string | null;
  after?: string | null;
  before?: string | null;
}

function normalizeScope(scope: string | null | undefined): string {
  if (scope && V1_ALLOWED_SCOPE.has(scope)) return scope;
  return 'user';
}

function mapV1TypeToV4(type: string | null | undefined): string {
  if (!type) return 'fact';
  return V1_TO_V4_MEMORY_TYPE[type] || 'fact';
}

function mapV4TypeToV1(type: string | null | undefined): string {
  if (!type) return 'fact';
  return V4_TO_V1_MEMORY_TYPE[type] || type;
}

function mapMode(mode: SearchExecutionMode): 'keyword' | 'hybrid' | 'semantic' {
  if (mode === 'keyword') return 'keyword';
  if (mode === 'hybrid') return 'hybrid';
  return 'semantic';
}

function isValidIsoDateString(input: string | null | undefined): boolean {
  if (!input) return false;
  const date = new Date(input);
  return Number.isFinite(date.getTime());
}

function clampScore(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const score = value as number;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | null {
  if (!metadata) return null;
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function metadataNumber(metadata: Record<string, unknown> | undefined, key: string): number | null {
  if (!metadata) return null;
  const value = metadata[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export async function mirrorLegacyMemoryToSpringV4(
  supabase: SupabaseClient,
  input: MirrorLegacyMemoryInput
): Promise<MirrorLegacyMemoryResult> {
  if (!input.embedding || input.embedding.length === 0) {
    return { mirrored: false, springNoteId: null, skippedReason: 'missing_embedding' };
  }

  const payloadJson: Record<string, unknown> = {
    legacy_memory_id: input.memoryId,
    legacy_namespace: input.namespace,
    legacy_scope: input.scope || 'user',
    legacy_agent_id: input.agentId,
    legacy_importance: input.importance,
    legacy_source: input.source || 'api',
  };

  const provenance: Record<string, unknown> = {
    source: input.source || 'api',
    bridge: 'v1_memories',
    bridged_at: new Date().toISOString(),
    legacy_memory_id: input.memoryId,
  };

  const { data, error } = await supabase
    .from('spring_memory_notes')
    .insert({
      user_id: input.userId,
      content: input.content,
      note_type: mapV1TypeToV4(input.memoryType),
      status: 'active',
      scope: normalizeScope(input.scope),
      namespace: input.namespace,
      embedding: input.embedding,
      confidence: input.confidence ?? 1,
      importance: input.importance,
      tags: input.tags || [],
      session_id: input.sessionId,
      agent_id: input.agentId,
      payload_json: payloadJson,
      provenance,
      created_at: input.createdAt || undefined,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`spring_v4_mirror_insert_failed:${error.message}`);
  }

  return {
    mirrored: true,
    springNoteId: (data as { id?: string } | null)?.id || null,
    skippedReason: null,
  };
}

export async function softDeleteSpringMirrorsByLegacyIds(
  supabase: SupabaseClient,
  userId: string,
  memoryIds: string[]
): Promise<{ deletedCount: number; failedIds: string[] }> {
  const failedIds: string[] = [];
  let deletedCount = 0;

  if (!Array.isArray(memoryIds) || memoryIds.length === 0) {
    return { deletedCount, failedIds };
  }

  const now = new Date().toISOString();
  for (const memoryId of memoryIds) {
    const { data, error } = await supabase
      .from('spring_memory_notes')
      .update({ status: 'deleted', updated_at: now })
      .eq('user_id', userId)
      .contains('payload_json', { legacy_memory_id: memoryId })
      .select('id');

    if (error) {
      failedIds.push(memoryId);
    } else {
      deletedCount += data?.length || 0;
    }
  }

  return { deletedCount, failedIds };
}

export async function searchViaSpringV4Bridge(
  supabase: SupabaseClient,
  options: SpringSearchBridgeOptions
): Promise<SearchResultRow[]> {
  const service = createSearchServiceV3(supabase);
  const oversampledLimit = Math.min(Math.max(options.limit * 4, options.limit), 100);
  const requestedTags = (options.tags || []).filter(Boolean);
  const afterDate = isValidIsoDateString(options.after) ? new Date(options.after as string) : null;
  const beforeDate = isValidIsoDateString(options.before) ? new Date(options.before as string) : null;
  const expectedScope = options.scope || null;
  const expectedNamespace = options.namespace || 'default';
  const expectedType = options.memoryType || null;
  const expectedAgentId = options.agentId || null;

  const result = await service.search(options.userId, {
    query: options.query,
    topK: oversampledLimit,
    mode: mapMode(options.mode),
    rerank: options.mode !== 'keyword',
    filters: {
      tags: requestedTags.length > 0 ? requestedTags : undefined,
      types: expectedType ? [mapV1TypeToV4(expectedType)] : undefined,
      agentId: expectedAgentId || undefined,
    },
  });

  const bridgedRows: SearchResultRow[] = [];
  for (const row of result.results) {
    const metadata = (row.metadata || {}) as Record<string, unknown>;
    const legacyMemoryId = metadataString(metadata, 'legacy_memory_id');
    if (!legacyMemoryId) continue;

    const legacyNamespace = metadataString(metadata, 'legacy_namespace') || 'default';
    if (expectedNamespace !== 'default' && legacyNamespace !== expectedNamespace) continue;
    if (expectedNamespace === 'default' && legacyNamespace && legacyNamespace !== 'default') continue;

    const legacyScope = metadataString(metadata, 'legacy_scope') || 'user';
    if (expectedScope && expectedScope !== legacyScope) continue;

    const legacyAgentId = metadataString(metadata, 'legacy_agent_id');
    if (expectedAgentId && legacyAgentId !== expectedAgentId) continue;

    const legacyType = mapV4TypeToV1(row.type);
    if (expectedType && legacyType !== expectedType) continue;

    if (afterDate && row.createdAt <= afterDate) continue;
    if (beforeDate && row.createdAt >= beforeDate) continue;

    if (requestedTags.length > 0) {
      const rowTags = Array.isArray(row.tags) ? row.tags : [];
      if (!requestedTags.some((tag) => rowTags.includes(tag))) continue;
    }

    const importance = metadataNumber(metadata, 'legacy_importance');
    bridgedRows.push({
      id: legacyMemoryId,
      content: row.content,
      memory_type: legacyType,
      importance: importance ?? 5,
      similarity: clampScore(row.combinedScore),
      created_at: row.createdAt.toISOString(),
      tags: row.tags || [],
      companion_meta: {
        ...metadata,
        spring_note_id: row.id,
        spring_mode: row.searchMode || null,
      },
      agent_id: legacyAgentId || undefined,
      scope: legacyScope,
    });
  }

  bridgedRows.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  return bridgedRows.slice(0, options.limit);
}
