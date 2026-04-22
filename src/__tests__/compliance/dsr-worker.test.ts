import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DsrObjectStore } from '@/lib/compliance/dsr-object-store';
import {
  enqueueDsrJob,
  processNextDsrJob,
  type DsrJobRow,
} from '@/lib/compliance/dsr-worker';

const { logAuditEventMock } = vi.hoisted(() => ({
  logAuditEventMock: vi.fn(async () => 'audit-id'),
}));

vi.mock('@/lib/audit/logger', () => ({
  logAuditEvent: logAuditEventMock,
}));

type TableName =
  | 'dsr_jobs'
  | 'memories'
  | 'audit_logs'
  | 'fall_retrieval_traces'
  | 'consent_records'
  | 'dsr_deletion_tombstones';

interface MockState {
  tables: Record<TableName, Array<Record<string, unknown>>>;
  statusHistory: string[];
  claimHeld: boolean;
  simulateClaimLock: boolean;
}

function createStore() {
  const writes: Array<{ key: string; value: unknown }> = [];
  const store: DsrObjectStore = {
    async putJson(key, value) {
      writes.push({ key, value });
    },
    async createSignedGetUrl(key) {
      return `https://r2.test/${key}?signed=1`;
    },
  };
  return { store, writes };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createSupabase(state: MockState) {
  class QueryBuilder {
    private operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
    private filters: Array<(row: Record<string, unknown>) => boolean> = [];
    private limitCount: number | null = null;
    private singleMode: 'single' | 'maybeSingle' | null = null;
    private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;

    constructor(private readonly table: TableName) {}

    select() {
      return this;
    }

    insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
      this.operation = 'insert';
      this.payload = payload;
      return this;
    }

    update(payload: Record<string, unknown>) {
      this.operation = 'update';
      this.payload = payload;
      return this;
    }

    delete() {
      this.operation = 'delete';
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }

    order() {
      return this;
    }

    limit(count: number) {
      this.limitCount = count;
      return this;
    }

    single() {
      this.singleMode = 'single';
      return this.execute();
    }

    maybeSingle() {
      this.singleMode = 'maybeSingle';
      return this.execute();
    }

    then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return this.execute().then(onfulfilled, onrejected);
    }

    private matchingRows() {
      return state.tables[this.table].filter((row) => this.filters.every((filter) => filter(row)));
    }

    private async execute(): Promise<{ data: unknown; error: null }> {
      if (this.operation === 'insert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload || {}];
        const inserted = rows.map((row) => ({
          id: row.id || `${this.table}-${state.tables[this.table].length + 1}`,
          created_at: row.created_at || '2026-04-22T00:00:00.000Z',
          ...row,
        }));
        state.tables[this.table].push(...inserted);
        if (this.table === 'dsr_jobs') {
          state.statusHistory.push(String(inserted[0].status));
        }
        return this.format(inserted);
      }

      if (this.operation === 'update') {
        const rows = this.matchingRows();
        for (const row of rows) {
          Object.assign(row, this.payload);
          if (this.table === 'dsr_jobs' && this.payload && 'status' in this.payload) {
            state.statusHistory.push(String((this.payload as Record<string, unknown>).status));
          }
        }
        return this.format(rows);
      }

      if (this.operation === 'delete') {
        const rows = this.matchingRows();
        state.tables[this.table] = state.tables[this.table].filter((row) => !rows.includes(row));
        return { data: clone(rows), error: null };
      }

      let rows = this.matchingRows();
      if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
      return this.format(rows);
    }

    private format(rows: Array<Record<string, unknown>>) {
      if (this.singleMode === 'single') {
        return { data: clone(rows[0]), error: null };
      }
      if (this.singleMode === 'maybeSingle') {
        return { data: rows[0] ? clone(rows[0]) : null, error: null };
      }
      return { data: clone(rows), error: null };
    }
  }

  return {
    rpc: vi.fn(async (name: string) => {
      if (name !== 'claim_next_dsr_job') {
        return { data: null, error: { code: '42883', message: 'unknown function' } };
      }
      if (state.simulateClaimLock && state.claimHeld) {
        return { data: [], error: null };
      }
      const job = state.tables.dsr_jobs.find((row) =>
        row.status === 'queued' || row.status === 'pending'
      );
      if (!job) return { data: [], error: null };
      if (state.simulateClaimLock) state.claimHeld = true;
      job.status = job.status === 'queued' ? 'processing' : 'running';
      state.statusHistory.push(String(job.status));
      return { data: [clone(job)], error: null };
    }),
    from: (table: TableName) => new QueryBuilder(table),
  } as never;
}

function createState(seed?: Partial<MockState>): MockState {
  return {
    tables: {
      dsr_jobs: [],
      memories: [],
      audit_logs: [],
      fall_retrieval_traces: [],
      consent_records: [],
      dsr_deletion_tombstones: [],
    },
    statusHistory: [],
    claimHeld: false,
    simulateClaimLock: false,
    ...seed,
  };
}

describe('DSR async worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-secret';
  });

  it('enqueues an export job, processes it, and exposes a signed download URL', async () => {
    const state = createState();
    state.tables.memories.push({
      id: 'memory-1',
      organization_id: 'org-1',
      subject_id: 'player-1',
      content: 'met the blacksmith',
    });
    const supabase = createSupabase(state);
    const { store, writes } = createStore();

    const queued = await enqueueDsrJob(supabase, {
      actor: { userId: 'user-1', organizationId: 'org-1' },
      jobType: 'export',
      subjectId: 'player-1',
    });
    const result = await processNextDsrJob(supabase, store);

    expect(queued.status).toBe('queued');
    expect(state.statusHistory).toEqual(['queued', 'processing', 'completed']);
    expect(result).toMatchObject({ processed: true, status: 'completed', downloadUrl: expect.stringContaining('https://r2.test/') });
    expect(writes[0].key).toBe(`dsr-exports/org-1/${queued.jobId}.json`);
    expect((state.tables.dsr_jobs[0] as DsrJobRow).artifact_url).toContain('signed=1');
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ action: 'dsr.queued' }));
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ action: 'dsr.processing' }));
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ action: 'dsr.completed' }));
  });

  it('processes delete jobs by deleting subject rows and writing a tombstone certificate hash', async () => {
    const state = createState();
    state.tables.dsr_jobs.push({
      id: 'job-delete',
      organization_id: 'org-1',
      requested_by: 'user-1',
      type: 'delete',
      subject_id: 'player-1',
      status: 'queued',
      reason: 'user request',
    });
    state.tables.memories.push({ id: 'memory-1', organization_id: 'org-1', subject_id: 'player-1', content: 'delete me' });
    state.tables.consent_records.push({ id: 'consent-1', organization_id: 'org-1', subject_id: 'player-1' });
    state.tables.audit_logs.push({
      id: 'audit-1',
      organization_id: 'org-1',
      resource_id: 'memory-1',
      details: { subject_id: 'player-1' },
    });
    state.tables.fall_retrieval_traces.push({ id: 'trace-1', organization_id: 'org-1', subject_id: 'player-1' });
    const supabase = createSupabase(state);
    const { store } = createStore();

    const result = await processNextDsrJob(supabase, store);

    expect(result).toMatchObject({ processed: true, jobType: 'delete', tombstoneId: expect.any(String) });
    expect(state.tables.memories).toHaveLength(0);
    expect(state.tables.consent_records).toHaveLength(0);
    expect(state.tables.audit_logs).toHaveLength(0);
    expect(state.tables.dsr_deletion_tombstones[0]).toMatchObject({
      job_id: 'job-delete',
      certificate_hash: expect.any(String),
      rows_deleted: expect.objectContaining({ memories: 1, consent_records: 1, audit_logs: 1 }),
    });
  });

  it('skips a locked queued job when two workers run concurrently', async () => {
    const state = createState({ simulateClaimLock: true });
    state.tables.dsr_jobs.push({
      id: 'job-export',
      organization_id: 'org-1',
      requested_by: 'user-1',
      type: 'export',
      subject_id: 'player-1',
      status: 'queued',
    });
    const supabase = createSupabase(state);
    const { store } = createStore();

    const [first, second] = await Promise.all([
      processNextDsrJob(supabase, store),
      processNextDsrJob(supabase, store),
    ]);

    expect([first.processed, second.processed].sort()).toEqual([false, true]);
  });

  it('rejects cron requests with the wrong CRON_SECRET', async () => {
    const { GET } = await import('@/app/api/cron/dsr-worker/route');
    const response = await GET(new NextRequest('https://seizn.test/api/cron/dsr-worker', {
      headers: { authorization: 'Bearer wrong-secret' },
    }));

    expect(response.status).toBe(401);
  });
});
