import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diffReplays, type ReplayResult } from '@/lib/replay/runner';
import { recordConsent } from '@/lib/compliance/consent';
import { enqueueDsrJob, processNextDsrJob } from '@/lib/compliance/dsr-worker';
import type { DsrObjectStore } from '@/lib/compliance/dsr-object-store';
import { runTierDemotionBatch } from '@/lib/memory/budget';
import { POST as rerunPOST } from '@/app/api/replay/[snapshotId]/rerun/route';

const { authMock, createServerClientMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  createServerClientMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

vi.mock('@/lib/audit/logger', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  logServerError: vi.fn(),
  logServerWarn: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: createServerClientMock,
}));

interface SmokeState {
  api_keys: Array<Record<string, unknown>>;
  audit_logs: Array<Record<string, unknown>>;
  consent_records: Array<Record<string, unknown>>;
  dsr_deletion_tombstones: Array<Record<string, unknown>>;
  dsr_jobs: Array<Record<string, unknown>>;
  entity_budget: Array<Record<string, unknown>>;
  fall_retrieval_traces: Array<Record<string, unknown>>;
  memories: Array<Record<string, unknown>>;
  memory_budget_events: Array<Record<string, unknown>>;
  organizations: Array<Record<string, unknown>>;
  organization_members: Array<Record<string, unknown>>;
  profiles: Array<Record<string, unknown>>;
  replay_snapshots: Array<Record<string, unknown>>;
  replay_diffs: Array<Record<string, unknown>>;
  rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }>;
}

type TableName = Exclude<keyof SmokeState, 'rpcCalls'>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createSmokeSupabase(state: SmokeState) {
  class QueryBuilder {
    private operation: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
    private filters: Array<(row: Record<string, unknown>) => boolean> = [];
    private payload: Record<string, unknown> | null = null;
    private limitCount: number | null = null;
    private orderBy: { column: string; ascending: boolean } | null = null;
    private singleMode: 'single' | 'maybeSingle' | null = null;

    constructor(private readonly table: TableName) {}

    select() {
      return this;
    }

    insert(payload: Record<string, unknown>) {
      this.operation = 'insert';
      this.payload = payload;
      return this;
    }

    upsert(payload: Record<string, unknown>) {
      this.operation = 'upsert';
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

    is(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }

    contains(column: string, values: unknown[]) {
      this.filters.push((row) =>
        Array.isArray(row[column]) && values.every((value) => (row[column] as unknown[]).includes(value))
      );
      return this;
    }

    lte(column: string, value: string) {
      this.filters.push((row) => typeof row[column] === 'string' && String(row[column]) <= value);
      return this;
    }

    lt(column: string, value: string) {
      this.filters.push((row) => typeof row[column] === 'string' && String(row[column]) < value);
      return this;
    }

    order(column: string, options: { ascending?: boolean } = {}) {
      this.orderBy = { column, ascending: options.ascending !== false };
      return this;
    }

    limit(count: number) {
      this.limitCount = count;
      return this;
    }

    maybeSingle() {
      this.singleMode = 'maybeSingle';
      return this.execute();
    }

    single() {
      this.singleMode = 'single';
      return this.execute();
    }

    then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return this.execute().then(onfulfilled, onrejected);
    }

    private rows() {
      let rows = state[this.table].filter((row) => this.filters.every((filter) => filter(row)));
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        rows = rows.slice().sort((a, b) => {
          const aValue = String(a[column] || '');
          const bValue = String(b[column] || '');
          return ascending ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        });
      }
      if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
      return rows;
    }

    private async execute(): Promise<{ data: unknown; error: null }> {
      if (this.operation === 'insert') {
        const payload = this.payload || {};
        const row = {
          id: payload.id || `${this.table}-${state[this.table].length + 1}`,
          created_at: payload.created_at || '2026-04-22T00:00:00.000Z',
          ...payload,
        };
        state[this.table].push(row);
        return this.format([row]);
      }

      if (this.operation === 'upsert') {
        const payload = this.payload || {};
        const rows = state[this.table];
        let existing: Record<string, unknown> | undefined;
        if (this.table === 'consent_records') {
          existing = rows.find((row) =>
            row.organization_id === payload.organization_id &&
            row.subject_id === payload.subject_id &&
            row.bracket === payload.bracket
          );
        } else if (this.table === 'entity_budget') {
          existing = rows.find((row) =>
            row.organization_id === payload.organization_id &&
            row.entity_id === payload.entity_id
          );
        }
        const row = {
          id: existing?.id || `${this.table}-${rows.length + 1}`,
          created_at: existing?.created_at || '2026-04-22T00:00:00.000Z',
          ...existing,
          ...payload,
        };
        if (existing) {
          Object.assign(existing, row);
        } else {
          rows.push(row);
        }
        return this.format([row]);
      }

      if (this.operation === 'update') {
        const rows = this.rows();
        for (const row of rows) Object.assign(row, this.payload);
        return this.format(rows);
      }

      if (this.operation === 'delete') {
        const rows = this.rows();
        const deleteSet = new Set(rows);
        state[this.table] = state[this.table].filter((row) => !deleteSet.has(row)) as never;
        return this.format(rows);
      }

      return this.format(this.rows());
    }

    private format(rows: Array<Record<string, unknown>>) {
      if (this.singleMode === 'single') return { data: clone(rows[0]), error: null };
      if (this.singleMode === 'maybeSingle') return { data: rows[0] ? clone(rows[0]) : null, error: null };
      return { data: clone(rows), error: null };
    }
  }

  return {
    from: (table: TableName) => new QueryBuilder(table),
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      if (fn === 'claim_next_dsr_job') {
        const job = state.dsr_jobs.find((row) => row.status === 'queued' || row.status === 'pending');
        if (!job) return { data: [], error: null };
        job.status = 'processing';
        return { data: [clone(job)], error: null };
      }
      return { data: null, error: null };
    },
  } as never;
}

function createState(): SmokeState {
  return {
    api_keys: [],
    audit_logs: [],
    consent_records: [],
    dsr_deletion_tombstones: [],
    dsr_jobs: [],
    entity_budget: [],
    fall_retrieval_traces: [],
    memories: [],
    memory_budget_events: [],
    organizations: [{ id: 'org-1', plan: 'pro', subscription_tier: 'pro' }],
    organization_members: [],
    profiles: [{ id: 'user-1', organization_id: 'org-1', plan: 'pro' }],
    replay_snapshots: [],
    replay_diffs: [],
    rpcCalls: [],
  };
}

function memory(input: Partial<Record<string, unknown>> = {}) {
  return {
    id: input.id || `memory-${Math.random().toString(16).slice(2)}`,
    user_id: 'user-1',
    organization_id: 'org-1',
    entity_id: 'npc-1',
    subject_id: 'player-1',
    content: 'Player spared the archivist.',
    is_encrypted: false,
    memory_type: 'event',
    tags: [],
    namespace: 'default',
    scope: 'user',
    tier: 'hot',
    pinned: false,
    is_deleted: false,
    size_bytes: 128,
    recall_count: 0,
    last_recalled_at: '2026-02-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...input,
  };
}

function replayResult(overrides: Partial<ReplayResult> = {}): ReplayResult {
  return {
    snapshotId: 'snap-1',
    traceId: 'trace-1',
    organizationId: 'org-1',
    apiKeyId: null,
    endpoint: '/api/v1/memories',
    requestBody: { content: 'Player spared the archivist.' },
    responseBody: { memoryId: 'memory-1' },
    memoryReads: [{ table: 'memories', key: 'memory-1', resultHash: 'read-hash' }],
    memoryWrites: [{ table: 'memories', key: 'memory-1', beforeHash: null, afterHash: 'write-hash' }],
    toolCalls: [{ name: 'llm.test.model', input: { prompt: 'remember' }, output: { text: 'ok' }, latencyMs: 10, stubHash: 'stub-hash' }],
    llmSeed: 42,
    llmModel: 'model',
    llmProvider: 'test',
    contentHash: 'content-hash',
    outputContentHash: 'output-hash',
    durationMs: 12,
    replayedAt: '2026-04-22T00:00:00.000Z',
    missingToolStubs: [],
    ...overrides,
  };
}

function objectStore(state: { urls: string[] }): DsrObjectStore {
  return {
    putJson: async () => undefined,
    createSignedGetUrl: async (key) => {
      const url = `mock-r2://${key}`;
      state.urls.push(url);
      return url;
    },
  };
}

describe('Batch B smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-1', organizationId: 'org-1' } });
  });

  it('creates a memory-shaped replay result and diffs cleanly against a rerun', () => {
    const original = replayResult();
    const replayed = replayResult({ replayedAt: '2026-04-22T00:01:00.000Z' });

    const diff = diffReplays(original, replayed);

    expect(diff.matches).toBe(true);
    expect(diff.memoryWritesChanged).toHaveLength(0);
    expect(diff.toolCallMismatches).toHaveLength(0);
  });

  it('records consent, exports subject data, and returns a DSR download URL', async () => {
    const state = createState();
    const supabase = createSmokeSupabase(state);
    createServerClientMock.mockReturnValue(supabase);
    state.memories.push(memory({ id: 'memory-export' }));
    const storeState = { urls: [] as string[] };

    await recordConsent(supabase, {
      organizationId: 'org-1',
      subjectId: 'player-1',
      ageBracket: 'minor_under_13',
      scopes: ['memory_storage'],
      version: '2026-04-22',
    });
    const queued = await enqueueDsrJob(supabase, {
      actor: { userId: 'user-1', organizationId: 'org-1' },
      jobType: 'export',
      subjectId: 'player-1',
    });
    const result = await processNextDsrJob(supabase, objectStore(storeState));

    expect(queued.status).toBe('queued');
    expect(result.status).toBe('completed');
    expect(result.downloadUrl).toContain('mock-r2://dsr-exports/org-1/');
    expect(storeState.urls).toHaveLength(1);
  });

  it('deletes subject data through DSR and leaves a tombstone', async () => {
    const state = createState();
    const supabase = createSmokeSupabase(state);
    createServerClientMock.mockReturnValue(supabase);
    state.memories.push(memory({ id: 'memory-delete' }));
    state.consent_records.push({ id: 'consent-1', organization_id: 'org-1', subject_id: 'player-1' });

    await enqueueDsrJob(supabase, {
      actor: { userId: 'user-1', organizationId: 'org-1' },
      jobType: 'delete',
      subjectId: 'player-1',
    });
    const result = await processNextDsrJob(supabase, objectStore({ urls: [] }));

    expect(result.status).toBe('completed');
    expect(state.dsr_deletion_tombstones).toHaveLength(1);
    expect(state.memories.filter((row) => row.subject_id === 'player-1')).toHaveLength(0);
  });

  it('demotes a 31-day stale hot memory to warm', async () => {
    const state = createState();
    const supabase = createSmokeSupabase(state);
    state.memories.push(memory({ id: 'memory-tier', last_recalled_at: '2026-03-01T00:00:00.000Z' }));

    const result = await runTierDemotionBatch(
      { now: new Date('2026-04-22T03:00:00.000Z') },
      supabase
    );

    expect(result.hotToWarm).toBe(1);
    expect(state.memories[0].tier).toBe('warm');
    expect(state.memory_budget_events[0].event_type).toBe('demote');
  });

  it('rejects replay rerun for a non-Pro plan', async () => {
    const state = createState();
    state.profiles[0].plan = 'indie';
    state.replay_snapshots.push({
      trace_id: 'snap-1',
      organization_id: 'org-1',
      endpoint: '/api/v1/memories',
      request_body: {},
      response_body: {},
      memory_reads: [],
      memory_writes: [],
      tool_calls: [],
      llm_seed: null,
      llm_model: null,
      llm_provider: null,
      content_hash: 'hash',
      duration_ms: 1,
      created_at: '2026-04-22T00:00:00.000Z',
    });
    createServerClientMock.mockReturnValue(createSmokeSupabase(state));

    const response = await rerunPOST(
      new NextRequest('https://seizn.test/api/replay/snap-1/rerun', { method: 'POST' }),
      { params: Promise.resolve({ snapshotId: 'snap-1' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('plan_required');
  });
});
