import type { JsonValue } from './canonical';
import { createAuthorMemorySnapshot } from './snapshot';
import type { AuthorSideEffectStore } from './replay';
import type {
  AuthorEvalResult,
  AuthorMemoryKind,
  AuthorMemoryRecord,
  AuthorMemorySnapshot,
  AuthorSideEffectRecord,
} from './types';

export interface AuthorMemoryRecordFilter {
  kind?: AuthorMemoryKind;
  status?: AuthorMemoryRecord['status'];
  entityId?: string;
}

export interface SaveAuthorMemoryRecordsInput {
  projectId: string;
  records: AuthorMemoryRecord[];
  mode?: 'replace' | 'upsert';
}

export interface SaveAuthorEvalResultInput {
  projectId: string;
  runId: string;
  result: AuthorEvalResult;
  createdAt?: string;
  metadata?: Record<string, JsonValue>;
}

export interface StoredAuthorEvalResult {
  id: string;
  projectId: string;
  runId: string;
  result: AuthorEvalResult;
  createdAt: string;
  metadata?: Record<string, JsonValue>;
}

export interface AuthorMemoryV3Store extends AuthorSideEffectStore {
  saveRecords(input: SaveAuthorMemoryRecordsInput): Promise<AuthorMemoryRecord[]>;
  listRecords(projectId: string, filter?: AuthorMemoryRecordFilter): Promise<AuthorMemoryRecord[]>;
  getRecord(projectId: string, recordId: string): Promise<AuthorMemoryRecord | null>;
  createSnapshot(input: {
    projectId: string;
    generatedAt?: string;
  }): Promise<AuthorMemorySnapshot>;
  saveSnapshot(snapshot: AuthorMemorySnapshot): Promise<AuthorMemorySnapshot>;
  getSnapshot(projectId: string, snapshotHash: string): Promise<AuthorMemorySnapshot | null>;
  saveEvalResult(input: SaveAuthorEvalResultInput): Promise<StoredAuthorEvalResult>;
  listEvalResults(projectId: string, runId?: string): Promise<StoredAuthorEvalResult[]>;
}

export class InMemoryAuthorMemoryV3Store implements AuthorMemoryV3Store {
  private readonly recordsByProject = new Map<string, Map<string, AuthorMemoryRecord>>();
  private readonly snapshotsByProject = new Map<string, Map<string, AuthorMemorySnapshot>>();
  private readonly sideEffects = new Map<string, AuthorSideEffectRecord>();
  private readonly evalResultsByProject = new Map<string, StoredAuthorEvalResult[]>();

  get<TOutput extends JsonValue>(key: string): AuthorSideEffectRecord<TOutput> | undefined {
    return this.sideEffects.get(key) as AuthorSideEffectRecord<TOutput> | undefined;
  }

  put<TOutput extends JsonValue>(record: AuthorSideEffectRecord<TOutput>): void {
    this.sideEffects.set(record.key, record);
  }

  allSideEffects(): AuthorSideEffectRecord[] {
    return [...this.sideEffects.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  async saveRecords(input: SaveAuthorMemoryRecordsInput): Promise<AuthorMemoryRecord[]> {
    assertUniqueRecordIds(input.records);
    const projectRecords =
      input.mode === 'replace'
        ? new Map<string, AuthorMemoryRecord>()
        : this.getProjectRecordMap(input.projectId);

    for (const record of input.records) {
      projectRecords.set(record.id, cloneRecord(record));
    }

    this.recordsByProject.set(input.projectId, projectRecords);
    return this.listRecords(input.projectId);
  }

  async listRecords(
    projectId: string,
    filter: AuthorMemoryRecordFilter = {}
  ): Promise<AuthorMemoryRecord[]> {
    return [...this.getProjectRecordMap(projectId).values()]
      .filter((record) => {
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
      })
      .map(cloneRecord)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getRecord(projectId: string, recordId: string): Promise<AuthorMemoryRecord | null> {
    const record = this.getProjectRecordMap(projectId).get(recordId);
    return record ? cloneRecord(record) : null;
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
    const projectId = snapshot.projectId;
    if (!projectId) {
      throw new Error('Cannot save Author Memory v3 snapshot without projectId');
    }

    const snapshots = this.getProjectSnapshotMap(projectId);
    snapshots.set(snapshot.snapshotHash, cloneSnapshot(snapshot));
    this.snapshotsByProject.set(projectId, snapshots);
    return cloneSnapshot(snapshot);
  }

  async getSnapshot(projectId: string, snapshotHash: string): Promise<AuthorMemorySnapshot | null> {
    const snapshot = this.getProjectSnapshotMap(projectId).get(snapshotHash);
    return snapshot ? cloneSnapshot(snapshot) : null;
  }

  async saveEvalResult(input: SaveAuthorEvalResultInput): Promise<StoredAuthorEvalResult> {
    const records = this.getProjectEvalResults(input.projectId);
    const stored: StoredAuthorEvalResult = {
      id: `${input.runId}:${input.result.caseId}`,
      projectId: input.projectId,
      runId: input.runId,
      result: cloneEvalResult(input.result),
      createdAt: input.createdAt ?? new Date().toISOString(),
      metadata: input.metadata ? { ...input.metadata } : undefined,
    };
    const existingIndex = records.findIndex((record) => record.id === stored.id);

    if (existingIndex >= 0) {
      records[existingIndex] = stored;
    } else {
      records.push(stored);
    }

    this.evalResultsByProject.set(input.projectId, records);
    return cloneStoredEvalResult(stored);
  }

  async listEvalResults(projectId: string, runId?: string): Promise<StoredAuthorEvalResult[]> {
    return this.getProjectEvalResults(projectId)
      .filter((record) => !runId || record.runId === runId)
      .map(cloneStoredEvalResult)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  private getProjectRecordMap(projectId: string): Map<string, AuthorMemoryRecord> {
    return this.recordsByProject.get(projectId) ?? new Map<string, AuthorMemoryRecord>();
  }

  private getProjectSnapshotMap(projectId: string): Map<string, AuthorMemorySnapshot> {
    return this.snapshotsByProject.get(projectId) ?? new Map<string, AuthorMemorySnapshot>();
  }

  private getProjectEvalResults(projectId: string): StoredAuthorEvalResult[] {
    return this.evalResultsByProject.get(projectId) ?? [];
  }
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

function cloneRecord(record: AuthorMemoryRecord): AuthorMemoryRecord {
  return {
    ...record,
    entityIds: record.entityIds ? [...record.entityIds] : undefined,
    metadata: record.metadata ? { ...record.metadata } : undefined,
    source: record.source ? { ...record.source } : undefined,
  };
}

function cloneSnapshot(snapshot: AuthorMemorySnapshot): AuthorMemorySnapshot {
  return {
    ...snapshot,
    recordHashes: { ...snapshot.recordHashes },
    records: snapshot.records.map(cloneRecord),
  };
}

function cloneEvalResult(result: AuthorEvalResult): AuthorEvalResult {
  return {
    ...result,
    sideEffectKeys: [...result.sideEffectKeys],
    failures: [...result.failures],
    metadata: result.metadata ? { ...result.metadata } : undefined,
  };
}

function cloneStoredEvalResult(result: StoredAuthorEvalResult): StoredAuthorEvalResult {
  return {
    ...result,
    result: cloneEvalResult(result.result),
    metadata: result.metadata ? { ...result.metadata } : undefined,
  };
}
