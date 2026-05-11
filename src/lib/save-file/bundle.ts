import { createHash, randomUUID } from 'node:crypto';
import { createServerClient } from '@/lib/supabase';
import { encodeSaveFile, decodeSaveFile, type SaveFilePayload } from './format';
import { getOrCreateSaveFileSigner } from './sign';

type SupabaseLike = ReturnType<typeof createServerClient>;

interface SaveFileContext {
  userId: string;
  organizationId: string;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object' && !Array.isArray(item)
      )
    : [];
}

function uniqueRowsById(items: Record<string, unknown>[]) {
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const id = asString(item.id);
    if (id) byId.set(id, item);
  }
  return [...byId.values()];
}

function uniqueMemoriesById(items: SaveFilePayload['memories']) {
  const byId = new Map<string, SaveFilePayload['memories'][number]>();
  for (const item of items) {
    if (item.id) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function mapMemoryRows(rows: Record<string, unknown>[]): SaveFilePayload['memories'] {
  return rows.map((row) => ({
    id: asString(row.id),
    content: asString(row.content),
    memoryType: asString(row.memory_type, 'fact'),
    tags: asArray(row.tags),
    namespace: asString(row.namespace, 'default'),
    companionMeta: asObject(row.companion_meta),
    scope: asString(row.scope, 'user'),
    source: typeof row.source === 'string' ? row.source : null,
    confidence: asNumber(row.confidence, 1),
    importance: asNumber(row.importance, 5),
    agentId: typeof row.agent_id === 'string' ? row.agent_id : null,
    entityId: typeof row.entity_id === 'string' ? row.entity_id : null,
    tier: typeof row.tier === 'string' ? row.tier : null,
    pinned: row.pinned === true,
    createdAt: asString(row.created_at, new Date().toISOString()),
    updatedAt: asString(row.updated_at, new Date().toISOString()),
  }));
}

async function listNpcMemories(
  supabase: SupabaseLike,
  ctx: SaveFileContext,
  npcId: string
) {
  const select = [
    'id',
    'content',
    'memory_type',
    'tags',
    'namespace',
    'companion_meta',
    'scope',
    'source',
    'confidence',
    'importance',
    'agent_id',
    'entity_id',
    'tier',
    'pinned',
    'created_at',
    'updated_at',
  ].join(', ');

  const base = () =>
    supabase
      .from('memories')
      .select(select)
      .eq('user_id', ctx.userId)
      .eq('organization_id', ctx.organizationId)
      .eq('is_deleted', false);

  const [byEntity, byAgent] = await Promise.all([
    base().eq('entity_id', npcId),
    base().eq('agent_id', npcId),
  ]);

  if (byEntity.error) throw new Error(`save_file_memories_export_failed: ${byEntity.error.message}`);
  if (byAgent.error) throw new Error(`save_file_memories_export_failed: ${byAgent.error.message}`);

  return mapMemoryRows(uniqueRowsById([
    ...asRows(byEntity.data),
    ...asRows(byAgent.data),
  ]));
}

async function listMemoriesByIds(
  supabase: SupabaseLike,
  ctx: SaveFileContext,
  memoryIds: string[]
) {
  const ids = [...new Set(memoryIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const select = [
    'id',
    'content',
    'memory_type',
    'tags',
    'namespace',
    'companion_meta',
    'scope',
    'source',
    'confidence',
    'importance',
    'agent_id',
    'entity_id',
    'tier',
    'pinned',
    'created_at',
    'updated_at',
  ].join(', ');

  const { data, error } = await supabase
    .from('memories')
    .select(select)
    .eq('user_id', ctx.userId)
    .eq('organization_id', ctx.organizationId)
    .eq('is_deleted', false)
    .in('id', ids);

  if (error) throw new Error(`save_file_referenced_memories_export_failed: ${error.message}`);
  return mapMemoryRows(asRows(data));
}

async function listNpcBeliefs(
  supabase: SupabaseLike,
  organizationId: string,
  npcId: string,
  memoryIds: string[]
) {
  const select = 'id, holder_entity_id, about_fact_id, observed_at, witness_event_id, confidence, revoked_at, source_type';
  const queries = [
    supabase.from('belief_shards').select(select).eq('organization_id', organizationId).eq('holder_entity_id', npcId),
  ];
  if (memoryIds.length > 0) {
    queries.push(
      supabase.from('belief_shards').select(select).eq('organization_id', organizationId).in('about_fact_id', memoryIds)
    );
  }

  const results = await Promise.all(queries);
  for (const result of results) {
    if (result.error) throw new Error(`save_file_beliefs_export_failed: ${result.error.message}`);
  }

  return uniqueRowsById(
    results.flatMap((result) => asRows(result.data))
  ).map((row) => ({
    id: asString(row.id),
    holderEntityId: asString(row.holder_entity_id),
    aboutFactId: asString(row.about_fact_id),
    observedAt: asString(row.observed_at, new Date().toISOString()),
    witnessEventId: typeof row.witness_event_id === 'string' ? row.witness_event_id : null,
    confidence: asNumber(row.confidence, 1),
    revokedAt: typeof row.revoked_at === 'string' ? row.revoked_at : null,
    sourceType: asString(row.source_type, 'direct'),
  }));
}

async function listNpcCanonLocks(supabase: SupabaseLike, organizationId: string, npcId: string) {
  const select = 'id, npc_id, scope, statement, regex_fastpath, severity, active, created_at, updated_at';
  const [npcLocks, worldLocks] = await Promise.all([
    supabase.from('canon_locks').select(select).eq('studio_id', organizationId).eq('npc_id', npcId),
    supabase.from('canon_locks').select(select).eq('studio_id', organizationId).is('npc_id', null),
  ]);

  if (npcLocks.error) throw new Error(`save_file_canon_export_failed: ${npcLocks.error.message}`);
  if (worldLocks.error) throw new Error(`save_file_canon_export_failed: ${worldLocks.error.message}`);

  return uniqueRowsById([
    ...asRows(npcLocks.data),
    ...asRows(worldLocks.data),
  ]).map((row) => ({
    id: asString(row.id),
    npcId: typeof row.npc_id === 'string' ? row.npc_id : null,
    scope: asString(row.scope, 'never_say'),
    statement: asString(row.statement),
    regexFastpath: typeof row.regex_fastpath === 'string' ? row.regex_fastpath : null,
    severity: asString(row.severity, 'hard'),
    active: row.active !== false,
    createdAt: asString(row.created_at, new Date().toISOString()),
    updatedAt: asString(row.updated_at, new Date().toISOString()),
  }));
}

export async function exportNpcSaveFile(
  ctx: SaveFileContext & { npcId: string },
  supabase: SupabaseLike = createServerClient()
) {
  let memories = await listNpcMemories(supabase, ctx, ctx.npcId);
  const beliefs = await listNpcBeliefs(supabase, ctx.organizationId, ctx.npcId, memories.map((memory) => memory.id));
  const memoryIds = new Set(memories.map((memory) => memory.id));
  const missingBeliefFactIds = beliefs
    .map((belief) => belief.aboutFactId)
    .filter((id) => id && !memoryIds.has(id));
  if (missingBeliefFactIds.length > 0) {
    memories = uniqueMemoriesById([
      ...memories,
      ...(await listMemoriesByIds(supabase, ctx, missingBeliefFactIds)),
    ]);
  }
  const canonLocks = await listNpcCanonLocks(supabase, ctx.organizationId, ctx.npcId);
  const payload: SaveFilePayload = {
    version: 'SZN1',
    exportedAt: new Date().toISOString(),
    studioId: ctx.organizationId,
    npcId: ctx.npcId,
    schemaVersion: 1,
    memories,
    beliefs,
    canonLocks,
    meta: {
      memoryCount: memories.length,
      beliefCount: beliefs.length,
      canonLockCount: canonLocks.length,
    },
  };

  const signer = await getOrCreateSaveFileSigner(ctx.organizationId, ctx.userId, supabase);
  const file = encodeSaveFile(payload, signer);
  return {
    file,
    payload,
    sha256: createHash('sha256').update(file).digest('hex'),
  };
}

function contentHash(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

async function mapMemoryImportIds(
  supabase: SupabaseLike,
  ctx: SaveFileContext,
  ids: string[]
) {
  const idMap = new Map(ids.map((id) => [id, id]));
  if (ids.length === 0) return idMap;

  const { data, error } = await supabase
    .from('memories')
    .select('id, user_id, organization_id')
    .in('id', ids);

  if (error) throw new Error(`save_file_memory_id_check_failed: ${error.message}`);
  for (const row of asRows(data)) {
    const id = asString(row.id);
    if (!id) continue;
    const belongsToCurrentTenant =
      asString(row.user_id) === ctx.userId &&
      asString(row.organization_id) === ctx.organizationId;
    if (!belongsToCurrentTenant) idMap.set(id, randomUUID());
  }
  return idMap;
}

async function mapBeliefImportIds(
  supabase: SupabaseLike,
  organizationId: string,
  ids: string[]
) {
  const idMap = new Map(ids.map((id) => [id, id]));
  if (ids.length === 0) return idMap;

  const { data, error } = await supabase
    .from('belief_shards')
    .select('id, organization_id')
    .in('id', ids);

  if (error) throw new Error(`save_file_belief_id_check_failed: ${error.message}`);
  for (const row of asRows(data)) {
    const id = asString(row.id);
    if (!id) continue;
    if (asString(row.organization_id) !== organizationId) idMap.set(id, randomUUID());
  }
  return idMap;
}

async function mapCanonImportIds(
  supabase: SupabaseLike,
  organizationId: string,
  ids: string[]
) {
  const idMap = new Map(ids.map((id) => [id, id]));
  if (ids.length === 0) return idMap;

  const { data, error } = await supabase
    .from('canon_locks')
    .select('id, studio_id')
    .in('id', ids);

  if (error) throw new Error(`save_file_canon_id_check_failed: ${error.message}`);
  for (const row of asRows(data)) {
    const id = asString(row.id);
    if (!id) continue;
    if (asString(row.studio_id) !== organizationId) idMap.set(id, randomUUID());
  }
  return idMap;
}

export async function importNpcSaveFile(
  ctx: SaveFileContext,
  file: Buffer,
  supabase: SupabaseLike = createServerClient()
) {
  const { payload } = decodeSaveFile(file);
  const now = new Date().toISOString();
  const memoryIdMap = await mapMemoryImportIds(
    supabase,
    ctx,
    payload.memories.map((memory) => memory.id)
  );
  const canonIdMap = await mapCanonImportIds(
    supabase,
    ctx.organizationId,
    payload.canonLocks.map((lock) => lock.id)
  );
  const beliefIdMap = await mapBeliefImportIds(
    supabase,
    ctx.organizationId,
    payload.beliefs.map((belief) => belief.id)
  );

  const memoryRows = payload.memories.map((memory) => ({
    id: memoryIdMap.get(memory.id) || memory.id,
    user_id: ctx.userId,
    organization_id: ctx.organizationId,
    content: memory.content,
    memory_type: memory.memoryType || 'fact',
    tags: memory.tags || [],
    namespace: memory.namespace || 'default',
    companion_meta: memory.companionMeta || {},
    scope: memory.scope || 'agent',
    source: memory.source || 'save-file-import',
    confidence: memory.confidence ?? 1,
    importance: memory.importance ?? 5,
    agent_id: memory.agentId || payload.npcId,
    entity_id: memory.entityId || payload.npcId,
    tier: memory.tier || 'hot',
    pinned: memory.pinned === true,
    size_bytes: Buffer.byteLength(memory.content || '', 'utf8'),
    content_hash: contentHash(`${payload.npcId}:${memoryIdMap.get(memory.id) || memory.id}:${memory.content}`),
    created_at: memory.createdAt || now,
    updated_at: memory.updatedAt || now,
    is_encrypted: false,
    is_deleted: false,
    deleted_at: null,
  }));

  if (memoryRows.length > 0) {
    const { error } = await supabase.from('memories').upsert(memoryRows, { onConflict: 'id' });
    if (error) throw new Error(`save_file_memory_import_failed: ${error.message}`);
  }

  const canonRows = payload.canonLocks.map((lock) => ({
    id: canonIdMap.get(lock.id) || lock.id,
    studio_id: ctx.organizationId,
    npc_id: lock.npcId,
    scope: lock.scope,
    statement: lock.statement,
    regex_fastpath: lock.regexFastpath,
    severity: lock.severity,
    active: lock.active !== false,
    created_by: ctx.userId,
    created_at: lock.createdAt || now,
    updated_at: lock.updatedAt || now,
  }));

  if (canonRows.length > 0) {
    const { error } = await supabase.from('canon_locks').upsert(canonRows, { onConflict: 'id' });
    if (error) throw new Error(`save_file_canon_import_failed: ${error.message}`);
  }

  const beliefRows = payload.beliefs.map((belief) => ({
    id: beliefIdMap.get(belief.id) || belief.id,
    organization_id: ctx.organizationId,
    holder_entity_id: belief.holderEntityId,
    about_fact_id: memoryIdMap.get(belief.aboutFactId) || belief.aboutFactId,
    observed_at: belief.observedAt || now,
    witness_event_id: belief.witnessEventId,
    confidence: belief.confidence ?? 1,
    revoked_at: belief.revokedAt,
    source_type: belief.sourceType || 'direct',
  }));

  if (beliefRows.length > 0) {
    const { error } = await supabase.from('belief_shards').upsert(beliefRows, { onConflict: 'id' });
    if (error) throw new Error(`save_file_belief_import_failed: ${error.message}`);
  }

  return {
    npcId: payload.npcId,
    imported: {
      memories: memoryRows.length,
      beliefs: beliefRows.length,
      canonLocks: canonRows.length,
    },
  };
}
