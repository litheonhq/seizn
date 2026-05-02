import {
  createServerClient,
  hasServerSupabaseServiceRoleConfig,
} from '@/lib/supabase';
import type { JsonValue } from './canonical';
import { createAuthorMemorySnapshot } from './snapshot';
import {
  InMemoryAuthorMemoryV3Store,
  type AuthorMemoryRecordFilter,
  type AuthorMemoryV3Store,
  type SaveAuthorEvalResultInput,
  type SaveAuthorMemoryRecordsInput,
  type StoredAuthorEvalResult,
} from './store';
import type {
  AuthorEvalResult,
  AuthorMemoryRecord,
  AuthorMemorySnapshot,
  AuthorSideEffectRecord,
} from './types';

type SupabaseClientLike = Pick<ReturnType<typeof createServerClient>, 'from'>;

interface SupabaseStoreOptions {
  userId: string;
  client?: SupabaseClientLike;
}

interface CreateAuthorMemoryV3StoreOptions {
  userId: string;
  client?: SupabaseClientLike;
}

interface AuthorMemoryRecordRow {
  record_id?: string;
  record_payload: AuthorMemoryRecord;
}

interface AuthorMemorySnapshotRow {
  snapshot_payload: AuthorMemorySnapshot;
}

interface AuthorSideEffectRow {
  side_effect_payload: AuthorSideEffectRecord;
}

interface AuthorEvalResultRow {
  id: string;
  project_id: string;
  run_id: string;
  result_payload: AuthorEvalResult;
  created_at: string;
  metadata: Record<string, JsonValue> | null;
}

export class SupabaseAuthorMemoryV3Store implements AuthorMemoryV3Store {
  private readonly userId: string;
  private readonly client: SupabaseClientLike;
  private activeProjectId: string | null = null;

  constructor(options: SupabaseStoreOptions) {
    this.userId = options.userId;
    this.client = options.client ?? createServerClient();
  }

  async get<TOutput extends JsonValue>(
    key: string
  ): Promise<AuthorSideEffectRecord<TOutput> | undefined> {
    const projectId = this.requireActiveProjectId('load replay side effect');
    const { data, error } = await this.client
      .from('author_memory_v3_side_effects')
      .select('side_effect_payload')
      .eq('user_id', this.userId)
      .eq('project_id', projectId)
      .eq('key', key)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load Author Memory v3 side effect: ${error.message}`);
    }

    const row = data as AuthorSideEffectRow | null;
    return row?.side_effect_payload as AuthorSideEffectRecord<TOutput> | undefined;
  }

  async put<TOutput extends JsonValue>(record: AuthorSideEffectRecord<TOutput>): Promise<void> {
    const projectId = this.requireActiveProjectId('save replay side effect');
    const { error } = await this.client
      .from('author_memory_v3_side_effects')
      .upsert({
        user_id: this.userId,
        project_id: projectId,
        key: record.key,
        side_effect_payload: record,
        captured_at: record.capturedAt,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,project_id,key',
      });

    if (error) {
      throw new Error(`Failed to save Author Memory v3 side effect: ${error.message}`);
    }
  }

  async listSideEffects(projectId?: string): Promise<AuthorSideEffectRecord[]> {
    let query = this.client
      .from('author_memory_v3_side_effects')
      .select('side_effect_payload')
      .eq('user_id', this.userId);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query.order('key', { ascending: true });

    if (error) {
      throw new Error(`Failed to list Author Memory v3 side effects: ${error.message}`);
    }

    return ((data ?? []) as AuthorSideEffectRow[])
      .map((row) => row.side_effect_payload)
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async saveRecords(input: SaveAuthorMemoryRecordsInput): Promise<AuthorMemoryRecord[]> {
    assertUniqueRecordIds(input.records);
    this.activeProjectId = input.projectId;
    const existingRecordIds = input.mode === 'replace'
      ? await this.listRecordIds(input.projectId)
      : [];

    if (input.records.length > 0) {
      const now = new Date().toISOString();
      const { error } = await this.client
        .from('author_memory_v3_records')
        .upsert(input.records.map((record) => ({
          user_id: this.userId,
          project_id: input.projectId,
          record_id: record.id,
          kind: record.kind,
          status: record.status,
          entity_ids: record.entityIds ?? [],
          valid_at: record.validAt ?? null,
          invalid_at: record.invalidAt ?? null,
          content: record.content,
          record_payload: record,
          updated_at: now,
        })), {
          onConflict: 'user_id,project_id,record_id',
        });

      if (error) {
        throw new Error(`Failed to save Author Memory v3 records: ${error.message}`);
      }
    }

    if (input.mode === 'replace') {
      const nextRecordIds = new Set(input.records.map((record) => record.id));
      const staleRecordIds = existingRecordIds.filter((recordId) => !nextRecordIds.has(recordId));

      if (staleRecordIds.length > 0) {
        const { error } = await this.client
          .from('author_memory_v3_records')
          .delete()
          .eq('user_id', this.userId)
          .eq('project_id', input.projectId)
          .in('record_id', staleRecordIds);

        if (error) {
          throw new Error(`Failed to delete stale Author Memory v3 records: ${error.message}`);
        }
      }
    }

    return this.listRecords(input.projectId);
  }

  async listRecords(
    projectId: string,
    filter: AuthorMemoryRecordFilter = {}
  ): Promise<AuthorMemoryRecord[]> {
    const { data, error } = await this.client
      .from('author_memory_v3_records')
      .select('record_payload')
      .eq('user_id', this.userId)
      .eq('project_id', projectId)
      .order('record_id', { ascending: true });

    if (error) {
      throw new Error(`Failed to list Author Memory v3 records: ${error.message}`);
    }

    return ((data ?? []) as AuthorMemoryRecordRow[])
      .map((row) => row.record_payload)
      .filter((record) => matchesRecordFilter(record, filter))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getRecord(projectId: string, recordId: string): Promise<AuthorMemoryRecord | null> {
    const { data, error } = await this.client
      .from('author_memory_v3_records')
      .select('record_payload')
      .eq('user_id', this.userId)
      .eq('project_id', projectId)
      .eq('record_id', recordId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load Author Memory v3 record: ${error.message}`);
    }

    const row = data as AuthorMemoryRecordRow | null;
    return row?.record_payload ?? null;
  }

  async createSnapshot(input: {
    projectId: string;
    generatedAt?: string;
  }): Promise<AuthorMemorySnapshot> {
    const snapshot = createAuthorMemorySnapshot({
      projectId: input.projectId,
      records: await this.listRecords(input.projectId),
      generatedAt: input.generatedAt,
    });
    await this.saveSnapshot(snapshot);
    return snapshot;
  }

  async saveSnapshot(snapshot: AuthorMemorySnapshot): Promise<AuthorMemorySnapshot> {
    if (!snapshot.projectId) {
      throw new Error('Cannot save Author Memory v3 snapshot without projectId');
    }

    const { error } = await this.client
      .from('author_memory_v3_snapshots')
      .upsert({
        user_id: this.userId,
        project_id: snapshot.projectId,
        snapshot_hash: snapshot.snapshotHash,
        item_count: snapshot.itemCount,
        snapshot_payload: snapshot,
        generated_at: snapshot.generatedAt ?? null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,project_id,snapshot_hash',
      });

    if (error) {
      throw new Error(`Failed to save Author Memory v3 snapshot: ${error.message}`);
    }

    return snapshot;
  }

  async getSnapshot(projectId: string, snapshotHash: string): Promise<AuthorMemorySnapshot | null> {
    const { data, error } = await this.client
      .from('author_memory_v3_snapshots')
      .select('snapshot_payload')
      .eq('user_id', this.userId)
      .eq('project_id', projectId)
      .eq('snapshot_hash', snapshotHash)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load Author Memory v3 snapshot: ${error.message}`);
    }

    const row = data as AuthorMemorySnapshotRow | null;
    return row?.snapshot_payload ?? null;
  }

  async saveEvalResult(input: SaveAuthorEvalResultInput): Promise<StoredAuthorEvalResult> {
    const id = `${input.runId}:${input.result.caseId}`;
    const createdAt = input.createdAt ?? new Date().toISOString();
    const stored: StoredAuthorEvalResult = {
      id,
      projectId: input.projectId,
      runId: input.runId,
      result: input.result,
      createdAt,
      metadata: input.metadata,
    };

    const { error } = await this.client
      .from('author_memory_v3_eval_results')
      .upsert({
        user_id: this.userId,
        project_id: input.projectId,
        id,
        run_id: input.runId,
        case_id: input.result.caseId,
        result_payload: input.result,
        metadata: input.metadata ?? {},
        created_at: createdAt,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,project_id,id',
      });

    if (error) {
      throw new Error(`Failed to save Author Memory v3 eval result: ${error.message}`);
    }

    return stored;
  }

  async listEvalResults(projectId: string, runId?: string): Promise<StoredAuthorEvalResult[]> {
    let query = this.client
      .from('author_memory_v3_eval_results')
      .select('id, project_id, run_id, result_payload, created_at, metadata')
      .eq('user_id', this.userId)
      .eq('project_id', projectId);

    if (runId) {
      query = query.eq('run_id', runId);
    }

    const { data, error } = await query.order('id', { ascending: true });

    if (error) {
      throw new Error(`Failed to list Author Memory v3 eval results: ${error.message}`);
    }

    return ((data ?? []) as AuthorEvalResultRow[]).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      runId: row.run_id,
      result: row.result_payload,
      createdAt: row.created_at,
      metadata: row.metadata ?? undefined,
    }));
  }

  private async listRecordIds(projectId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('author_memory_v3_records')
      .select('record_id')
      .eq('user_id', this.userId)
      .eq('project_id', projectId);

    if (error) {
      throw new Error(`Failed to list Author Memory v3 record ids: ${error.message}`);
    }

    return ((data ?? []) as Pick<AuthorMemoryRecordRow, 'record_id'>[])
      .map((row) => row.record_id)
      .filter((recordId): recordId is string => typeof recordId === 'string');
  }

  private requireActiveProjectId(operation: string): string {
    if (!this.activeProjectId) {
      throw new Error(`Cannot ${operation} without an active Author Memory v3 project`);
    }

    return this.activeProjectId;
  }
}

export class AuthorMemoryV3StoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorMemoryV3StoreConfigError';
  }
}

export function createAuthorMemoryV3StoreForUser(
  options: CreateAuthorMemoryV3StoreOptions
): AuthorMemoryV3Store {
  if (process.env.AUTHOR_MEMORY_V3_STORE === 'supabase') {
    if (!options.client && !hasServerSupabaseServiceRoleConfig()) {
      throw new AuthorMemoryV3StoreConfigError(
        'AUTHOR_MEMORY_V3_STORE=supabase requires Supabase service-role configuration'
      );
    }

    return new SupabaseAuthorMemoryV3Store(options);
  }

  return new InMemoryAuthorMemoryV3Store();
}

function matchesRecordFilter(
  record: AuthorMemoryRecord,
  filter: AuthorMemoryRecordFilter
): boolean {
  if (filter.kind && record.kind !== filter.kind) {
    return false;
  }

  if (filter.status && record.status !== filter.status) {
    return false;
  }

  if (filter.entityId && !record.entityIds?.includes(filter.entityId)) {
    return false;
  }

  return true;
}

function assertUniqueRecordIds(records: AuthorMemoryRecord[]): void {
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.id)) {
      throw new Error(`Duplicate Author Memory v3 record id: ${record.id}`);
    }

    seen.add(record.id);
  }
}
