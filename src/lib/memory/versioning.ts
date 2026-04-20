import { createServerClient } from '@/lib/supabase';

type SupabaseLike = ReturnType<typeof createServerClient>;

export type BranchOperation = 'added' | 'updated' | 'deleted';
export type MergeDiffKind = 'added' | 'changed' | 'removed';

export interface MemoryBranch {
  id: string;
  user_id: string;
  organization_id: string | null;
  namespace: string;
  name: string;
  parent_branch_id: string | null;
  base_snapshot_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemoryBranchEntry {
  id: string;
  branch_id: string;
  memory_id: string;
  operation: BranchOperation;
  content: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MergeDiffItem {
  kind: MergeDiffKind;
  memoryId: string;
  source?: MemoryBranchEntry;
  target?: MemoryBranchEntry;
}

function normalizeBranch(row: Record<string, unknown>): MemoryBranch {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    organization_id: typeof row.organization_id === 'string' ? row.organization_id : null,
    namespace: typeof row.namespace === 'string' ? row.namespace : 'default',
    name: String(row.name),
    parent_branch_id: typeof row.parent_branch_id === 'string' ? row.parent_branch_id : null,
    base_snapshot_id: typeof row.base_snapshot_id === 'string' ? row.base_snapshot_id : null,
    is_active: row.is_active === true,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeEntry(row: Record<string, unknown>): MemoryBranchEntry {
  const operation =
    row.operation === 'added' || row.operation === 'updated' || row.operation === 'deleted'
      ? row.operation
      : 'updated';
  return {
    id: String(row.id),
    branch_id: String(row.branch_id),
    memory_id: String(row.memory_id),
    operation,
    content: typeof row.content === 'string' ? row.content : null,
    metadata: typeof row.metadata === 'object' && row.metadata !== null ? row.metadata as Record<string, unknown> : {},
    created_at: String(row.created_at),
  };
}

function latestByMemory(entries: MemoryBranchEntry[]): Map<string, MemoryBranchEntry> {
  const sorted = [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latest = new Map<string, MemoryBranchEntry>();
  for (const entry of sorted) latest.set(entry.memory_id, entry);
  return latest;
}

function stableJson(value: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(value).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = value[key];
    return acc;
  }, {}));
}

function entriesEquivalent(source: MemoryBranchEntry, target: MemoryBranchEntry): boolean {
  return source.operation === target.operation &&
    source.content === target.content &&
    stableJson(source.metadata) === stableJson(target.metadata);
}

export function diffBranchEntries(
  sourceEntries: MemoryBranchEntry[],
  targetEntries: MemoryBranchEntry[]
): MergeDiffItem[] {
  const source = latestByMemory(sourceEntries);
  const target = latestByMemory(targetEntries);
  const diff: MergeDiffItem[] = [];

  for (const [memoryId, sourceEntry] of source) {
    const targetEntry = target.get(memoryId);
    if (!targetEntry) {
      diff.push({ kind: sourceEntry.operation === 'deleted' ? 'removed' : 'added', memoryId, source: sourceEntry });
    } else if (!entriesEquivalent(sourceEntry, targetEntry)) {
      diff.push({ kind: sourceEntry.operation === 'deleted' ? 'removed' : 'changed', memoryId, source: sourceEntry, target: targetEntry });
    }
  }

  for (const [memoryId, targetEntry] of target) {
    if (!source.has(memoryId)) {
      diff.push({ kind: 'removed', memoryId, target: targetEntry });
    }
  }

  return diff.sort((a, b) => a.memoryId.localeCompare(b.memoryId));
}

export async function createMemoryBranch(
  supabase: SupabaseLike,
  input: {
    userId: string;
    organizationId?: string | null;
    namespace?: string;
    name: string;
    parentBranchId?: string | null;
    baseSnapshotId?: string | null;
    activate?: boolean;
  }
): Promise<MemoryBranch> {
  if (!input.name.trim()) throw new Error('branch name is required');
  const namespace = input.namespace || 'default';

  if (input.activate) {
    await supabase
      .from('memory_branches')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', input.userId)
      .eq('namespace', namespace);
  }

  const { data, error } = await supabase
    .from('memory_branches')
    .insert({
      user_id: input.userId,
      organization_id: input.organizationId || null,
      namespace,
      name: input.name,
      parent_branch_id: input.parentBranchId || null,
      base_snapshot_id: input.baseSnapshotId || null,
      is_active: input.activate === true,
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(`memory_branch_create_failed: ${error?.message || 'unknown'}`);
  return normalizeBranch(data as Record<string, unknown>);
}

export async function listMemoryBranches(
  supabase: SupabaseLike,
  input: { userId: string; namespace?: string }
): Promise<MemoryBranch[]> {
  const { data, error } = await supabase
    .from('memory_branches')
    .select('*')
    .eq('user_id', input.userId)
    .eq('namespace', input.namespace || 'default')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`memory_branch_list_failed: ${error.message}`);
  return ((data || []) as Record<string, unknown>[]).map(normalizeBranch);
}

export async function checkoutMemoryBranch(
  supabase: SupabaseLike,
  input: { userId: string; branchId: string }
): Promise<MemoryBranch> {
  const { data: branch, error: branchError } = await supabase
    .from('memory_branches')
    .select('*')
    .eq('id', input.branchId)
    .eq('user_id', input.userId)
    .single();
  if (branchError || !branch) throw new Error(`memory_branch_checkout_failed: ${branchError?.message || 'not found'}`);
  const normalized = normalizeBranch(branch as Record<string, unknown>);

  await supabase
    .from('memory_branches')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', input.userId)
    .eq('namespace', normalized.namespace);

  const { data, error } = await supabase
    .from('memory_branches')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', input.branchId)
    .eq('user_id', input.userId)
    .select('*')
    .single();
  if (error || !data) throw new Error(`memory_branch_checkout_failed: ${error?.message || 'unknown'}`);
  return normalizeBranch(data as Record<string, unknown>);
}

export async function recordBranchEntry(
  supabase: SupabaseLike,
  input: {
    userId: string;
    branchId: string;
    memoryId: string;
    operation: BranchOperation;
    content?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<MemoryBranchEntry> {
  if (!input.memoryId.trim()) throw new Error('memoryId is required');

  const { data: branch, error: branchError } = await supabase
    .from('memory_branches')
    .select('id')
    .eq('id', input.branchId)
    .eq('user_id', input.userId)
    .single();
  if (branchError || !branch) throw new Error(`memory_branch_entry_failed: ${branchError?.message || 'branch not found'}`);

  const { data, error } = await supabase
    .from('memory_branch_entries')
    .insert({
      branch_id: input.branchId,
      memory_id: input.memoryId,
      operation: input.operation,
      content: input.content || null,
      metadata: input.metadata || {},
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(`memory_branch_entry_failed: ${error?.message || 'unknown'}`);
  return normalizeEntry(data as Record<string, unknown>);
}

export async function listBranchEntries(
  supabase: SupabaseLike,
  branchId: string
): Promise<MemoryBranchEntry[]> {
  const { data, error } = await supabase
    .from('memory_branch_entries')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`memory_branch_entries_failed: ${error.message}`);
  return ((data || []) as Record<string, unknown>[]).map(normalizeEntry);
}

export async function listBranchEntriesForUser(
  supabase: SupabaseLike,
  input: { userId: string; branchId: string }
): Promise<MemoryBranchEntry[]> {
  const { data: branch, error } = await supabase
    .from('memory_branches')
    .select('id')
    .eq('id', input.branchId)
    .eq('user_id', input.userId)
    .single();
  if (error || !branch) {
    throw new Error(`memory_branch_entries_failed: ${error?.message || 'branch not found'}`);
  }
  return listBranchEntries(supabase, input.branchId);
}

export async function mergeBranchDiff(
  supabase: SupabaseLike,
  input: { userId: string; sourceBranchId: string; targetBranchId: string }
): Promise<MergeDiffItem[]> {
  const { data: branches, error } = await supabase
    .from('memory_branches')
    .select('id')
    .eq('user_id', input.userId)
    .in('id', [input.sourceBranchId, input.targetBranchId]);
  if (error || !branches || branches.length !== 2) {
    throw new Error(`memory_branch_merge_failed: ${error?.message || 'branch not found'}`);
  }

  const [sourceEntries, targetEntries] = await Promise.all([
    listBranchEntries(supabase, input.sourceBranchId),
    listBranchEntries(supabase, input.targetBranchId),
  ]);

  return diffBranchEntries(sourceEntries, targetEntries);
}
