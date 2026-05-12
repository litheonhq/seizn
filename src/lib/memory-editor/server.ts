import { createHash } from 'node:crypto';
import { createEmbedding } from '@/lib/ai';
import { listCanonLocks, enforceCanon } from '@/lib/canon/enforce';
import { validateCanonContent } from '@/lib/canon/validator';
import { logServerWarn } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';
import {
  deriveNpcId,
  diffMemoryEditorRows,
  normalizeMemoryEditorRow,
  parseMemoryEditorCsv,
  parseMemoryEditorJson,
  type MemoryEditorDiffItem,
  type MemoryEditorDiffResult,
  type MemoryEditorImportRow,
  type MemoryEditorRow,
} from './diff';

type SupabaseLike = ReturnType<typeof createServerClient>;

interface MemoryEditorContext {
  supabase: SupabaseLike;
  userId: string;
  organizationId: string | null;
}

interface LoadMemoryEditorRowsOptions {
  npcId?: string | null;
  limit?: number;
}

interface LoadedMemoryRow extends MemoryEditorRow {
  userId: string;
  organizationId: string | null;
  companionMeta: Record<string, unknown> | null;
}

interface PreviewImportOptions {
  format: 'csv' | 'json';
  content: string;
  npcId?: string | null;
}

interface CommitImportResult {
  diff: MemoryEditorDiffResult;
  committed: number;
  memories: MemoryEditorRow[];
}

const MEMORY_EDITOR_SELECT =
  'id, user_id, organization_id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, importance, companion_meta, source, agent_id, created_at, updated_at';

function normalizeLoadedMemoryRow(row: Record<string, unknown>): LoadedMemoryRow {
  const normalized = normalizeMemoryEditorRow(row);
  return {
    ...normalized,
    userId: String(row.user_id),
    organizationId: typeof row.organization_id === 'string' ? row.organization_id : null,
    companionMeta:
      row.companion_meta && typeof row.companion_meta === 'object' && !Array.isArray(row.companion_meta)
        ? (row.companion_meta as Record<string, unknown>)
        : null,
  };
}

function toPublicRows(rows: LoadedMemoryRow[]): MemoryEditorRow[] {
  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    memoryType: row.memoryType,
    tags: row.tags,
    namespace: row.namespace,
    importance: row.importance,
    npcId: row.npcId,
    agentId: row.agentId,
    source: row.source,
    isEncrypted: row.isEncrypted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

function filterByNpc(rows: LoadedMemoryRow[], npcId?: string | null): LoadedMemoryRow[] {
  if (!npcId) return rows;
  return rows.filter((row) => row.npcId === npcId || row.agentId === npcId);
}

export async function loadMemoryEditorRows(
  ctx: MemoryEditorContext,
  options: LoadMemoryEditorRowsOptions = {}
): Promise<MemoryEditorRow[]> {
  const rows = await loadMemoryEditorRowsForMutation(ctx, options);
  return toPublicRows(rows);
}

async function loadMemoryEditorRowsForMutation(
  ctx: MemoryEditorContext,
  options: LoadMemoryEditorRowsOptions = {}
): Promise<LoadedMemoryRow[]> {
  const limit = Math.min(Math.max(options.limit || 1000, 1), 5000);
  const baseQuery = () => ctx.supabase
    .from('memories')
    .select(MEMORY_EDITOR_SELECT)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (ctx.organizationId) {
    const [organizationRows, personalRows] = await Promise.all([
      baseQuery().eq('organization_id', ctx.organizationId),
      baseQuery().eq('user_id', ctx.userId).is('organization_id', null),
    ]);

    if (organizationRows.error) throw new Error(`memory_editor_load_failed: ${organizationRows.error.message}`);
    if (personalRows.error) throw new Error(`memory_editor_load_failed: ${personalRows.error.message}`);

    const merged = new Map<string, LoadedMemoryRow>();
    for (const row of [
      ...((organizationRows.data || []) as Record<string, unknown>[]),
      ...((personalRows.data || []) as Record<string, unknown>[]),
    ]) {
      const normalized = normalizeLoadedMemoryRow(row);
      merged.set(normalized.id, normalized);
    }

    return filterByNpc(
      [...merged.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))),
      options.npcId || null
    );
  }

  const query = baseQuery().eq('user_id', ctx.userId);
  const { data, error } = await query;
  if (error) throw new Error(`memory_editor_load_failed: ${error.message}`);
  return filterByNpc(((data || []) as Record<string, unknown>[]).map(normalizeLoadedMemoryRow), options.npcId || null);
}

export function parseMemoryEditorImport(options: PreviewImportOptions): MemoryEditorImportRow[] {
  const rows = options.format === 'json'
    ? parseMemoryEditorJson(options.content)
    : parseMemoryEditorCsv(options.content);

  if (!options.npcId) return rows;
  return rows.map((row) => ({
    ...row,
    npcId: row.npcId || options.npcId || null,
    agentId: row.agentId || options.npcId || null,
  }));
}

async function addCanonValidation(
  ctx: MemoryEditorContext,
  diff: MemoryEditorDiffResult
): Promise<MemoryEditorDiffResult> {
  if (!ctx.organizationId) return diff;
  const locks = await listCanonLocks(ctx.organizationId, ctx.supabase);

  const items: MemoryEditorDiffItem[] = [];
  for (const item of diff.items) {
    const nextItem = { ...item, errors: [...item.errors], warnings: [...item.warnings] };
    if (item.action === 'unchanged' || nextItem.errors.length > 0) {
      items.push(nextItem);
      continue;
    }

    const npcId = item.after.npcId || item.after.agentId || null;
    const applicableLocks = locks.filter((lock) => lock.active && (!lock.npcId || lock.npcId === npcId));
    if (applicableLocks.length === 0) {
      items.push(nextItem);
      continue;
    }

    const result = await validateCanonContent({
      content: item.after.content,
      locks: applicableLocks,
    });

    if (!result.ok) {
      const message = `canon ${result.violation.severity} violation: ${result.violation.statement}`;
      if (result.violation.severity === 'hard') {
        nextItem.errors.push(message);
      } else {
        nextItem.warnings.push(message);
      }
    }
    items.push(nextItem);
  }

  const summary = items.reduce((acc, item) => {
    acc.total += 1;
    acc[item.action] += 1;
    if (item.errors.length > 0) acc.blocked += 1;
    return acc;
  }, { total: 0, create: 0, update: 0, unchanged: 0, blocked: 0 });

  return { items, summary };
}

export async function previewMemoryEditorImport(
  ctx: MemoryEditorContext,
  options: PreviewImportOptions
): Promise<MemoryEditorDiffResult> {
  const current = await loadMemoryEditorRowsForMutation(ctx, { limit: 5000 });
  const imported = parseMemoryEditorImport(options);
  const diff = diffMemoryEditorRows(toPublicRows(current), imported);
  return addCanonValidation(ctx, diff);
}

async function embeddingForContent(content: string): Promise<number[] | null> {
  try {
    return await createEmbedding(content);
  } catch (error) {
    logServerWarn('[memory-editor] embedding unavailable; preserving search vector fallback', error);
    return null;
  }
}

function companionMetaForNpc(existing: Record<string, unknown> | null, npcId: string | null) {
  const meta = { ...(existing || {}) };
  if (npcId) meta.npc_id = npcId;
  else delete meta.npc_id;
  return Object.keys(meta).length > 0 ? meta : null;
}

async function assertCanonForCommit(
  ctx: MemoryEditorContext,
  item: MemoryEditorDiffItem
) {
  if (!ctx.organizationId || item.action === 'unchanged') return;
  const result = await enforceCanon({
    supabase: ctx.supabase,
    studioId: ctx.organizationId,
    content: item.after.content,
    npcId: item.after.npcId || item.after.agentId || null,
    memoryId: item.id,
  });
  if (!result.ok) {
    throw new Error(`canon hard violation: ${result.violation.statement}`);
  }
}

async function applyUpdate(
  ctx: MemoryEditorContext,
  existing: LoadedMemoryRow,
  item: MemoryEditorDiffItem
) {
  const patch: Record<string, unknown> = {
    content: item.after.content,
    memory_type: item.after.memoryType,
    tags: item.after.tags,
    namespace: item.after.namespace,
    importance: item.after.importance,
    agent_id: item.after.agentId,
    source: item.after.source || existing.source || 'memory-editor',
    companion_meta: companionMetaForNpc(existing.companionMeta, item.after.npcId),
    updated_at: new Date().toISOString(),
  };

  if (existing.content !== item.after.content) {
    const embedding = await embeddingForContent(item.after.content);
    if (embedding) patch.embedding = embedding;
    patch.content_hash = createHash('sha256').update(item.after.content).digest('hex');
  }

  const { data, error } = await ctx.supabase
    .from('memories')
    .update(patch)
    .eq('id', existing.id)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`memory_editor_update_failed: ${error.message}`);
  if (!data) throw new Error(`memory_editor_update_missing:${existing.id}`);
}

async function applyCreate(ctx: MemoryEditorContext, item: MemoryEditorDiffItem) {
  const embedding = await embeddingForContent(item.after.content);
  const { error } = await ctx.supabase.from('memories').insert({
    user_id: ctx.userId,
    organization_id: ctx.organizationId,
    content: item.after.content,
    embedding,
    memory_type: item.after.memoryType,
    tags: item.after.tags,
    namespace: item.after.namespace,
    importance: item.after.importance,
    scope: 'user',
    source: item.after.source || 'memory-editor',
    agent_id: item.after.agentId,
    companion_meta: companionMetaForNpc(null, item.after.npcId || deriveNpcId({ agentId: item.after.agentId })),
    content_hash: createHash('sha256').update(item.after.content).digest('hex'),
    is_encrypted: false,
    is_deleted: false,
    deleted_at: null,
  });

  if (error) throw new Error(`memory_editor_create_failed: ${error.message}`);
}

export async function commitMemoryEditorImport(
  ctx: MemoryEditorContext,
  options: PreviewImportOptions
): Promise<CommitImportResult> {
  const current = await loadMemoryEditorRowsForMutation(ctx, { limit: 5000 });
  const currentById = new Map(current.map((row) => [row.id, row]));
  const diff = await previewMemoryEditorImport(ctx, options);
  if (diff.summary.blocked > 0) {
    return {
      diff,
      committed: 0,
      memories: toPublicRows(current),
    };
  }

  let committed = 0;
  for (const item of diff.items) {
    if (item.action === 'unchanged') continue;
    await assertCanonForCommit(ctx, item);
    if (item.action === 'update') {
      const existing = item.id ? currentById.get(item.id) : null;
      if (!existing) throw new Error(`memory_editor_missing_memory:${item.id}`);
      await applyUpdate(ctx, existing, item);
    } else {
      await applyCreate(ctx, item);
    }
    committed += 1;
  }

  const memories = await loadMemoryEditorRows(ctx, { limit: 1000, npcId: options.npcId || null });
  return { diff, committed, memories };
}
