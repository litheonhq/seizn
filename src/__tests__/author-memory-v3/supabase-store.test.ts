import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SupabaseAuthorMemoryV3Store,
  createAuthorMemoryV3StoreForUser,
  createAuthorSideEffectKey,
  runAuthorSideEffect,
  type AuthorEvalResult,
  type AuthorMemoryRecord,
  type AuthorSideEffectRequest,
} from '@/lib/author/memory-v3';
import { hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';

const records: AuthorMemoryRecord[] = [
  {
    id: 'person-sori',
    kind: 'person',
    status: 'canon',
    content: 'Sori is the current protagonist.',
    entityIds: ['sori'],
  },
  {
    id: 'rule-old-role',
    kind: 'world_rule',
    status: 'invalidated',
    content: 'Sori is a field agent.',
    entityIds: ['sori'],
  },
];

const request: AuthorSideEffectRequest = {
  kind: 'llm',
  provider: 'anthropic',
  model: 'claude-opus-4.7',
  operation: 'answer-author-eval-case',
  input: { prompt: 'Who is Sori?' },
};

const result: AuthorEvalResult = {
  schemaVersion: 'seizn.knot_author_eval.v1',
  caseId: 'case-sori',
  passed: true,
  score: 1,
  memorySnapshotHash: 'snapshot-hash',
  sideEffectKeys: ['side-effect-key'],
  output: 'Sori is the current protagonist.',
  failures: [],
};

describe('SupabaseAuthorMemoryV3Store', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('persists records, snapshots, side effects, and eval results', async () => {
    const client = new FakeSupabaseClient();
    const store = new SupabaseAuthorMemoryV3Store({
      userId: 'user-1',
      client: client.asStoreClient(),
    });

    await store.saveRecords({ projectId: 'knot', records, mode: 'replace' });

    expect(await store.listRecords('knot', { status: 'canon' })).toEqual([records[0]]);
    expect(await store.getRecord('knot', 'person-sori')).toEqual(records[0]);

    const snapshot = await store.createSnapshot({
      projectId: 'knot',
      generatedAt: '2026-05-02T00:00:00.000Z',
    });

    await expect(store.getSnapshot('knot', snapshot.snapshotHash)).resolves.toEqual(snapshot);

    const sideEffect = await runAuthorSideEffect({
      request,
      mode: 'record',
      store,
      capturedAt: '2026-05-02T00:00:00.000Z',
      live: () => ({ text: 'Sori is the current protagonist.' }),
    });
    const key = createAuthorSideEffectKey(request);

    expect(sideEffect.key).toBe(key);
    await expect(runAuthorSideEffect({
      request,
      mode: 'replay',
      store,
      live: () => {
        throw new Error('replay must not call live');
      },
    })).resolves.toMatchObject({
      key,
      output: { text: 'Sori is the current protagonist.' },
    });
    await expect(store.listSideEffects('knot')).resolves.toHaveLength(1);

    await store.saveEvalResult({
      projectId: 'knot',
      runId: 'run-1',
      result,
      createdAt: '2026-05-02T00:00:00.000Z',
    });

    await expect(store.listEvalResults('knot', 'run-1')).resolves.toMatchObject([
      {
        id: 'run-1:case-sori',
        projectId: 'knot',
        runId: 'run-1',
        result,
      },
    ]);
  });

  it('scopes replay side effects by project', async () => {
    const client = new FakeSupabaseClient();
    const store = new SupabaseAuthorMemoryV3Store({
      userId: 'user-1',
      client: client.asStoreClient(),
    });
    const key = createAuthorSideEffectKey(request);

    await store.saveRecords({ projectId: 'knot', records, mode: 'replace' });
    await runAuthorSideEffect({
      request,
      mode: 'record',
      store,
      capturedAt: '2026-05-02T00:00:00.000Z',
      live: () => ({ text: 'KNOT output' }),
    });

    await store.saveRecords({ projectId: 'other-world', records, mode: 'replace' });
    await runAuthorSideEffect({
      request,
      mode: 'record',
      store,
      capturedAt: '2026-05-02T00:00:00.000Z',
      live: () => ({ text: 'Other output' }),
    });

    await expect(runAuthorSideEffect({
      request,
      mode: 'replay',
      store,
      live: () => {
        throw new Error('replay must not call live');
      },
    })).resolves.toMatchObject({
      key,
      output: { text: 'Other output' },
    });

    await store.saveRecords({ projectId: 'knot', records, mode: 'upsert' });

    await expect(runAuthorSideEffect({
      request,
      mode: 'replay',
      store,
      live: () => {
        throw new Error('replay must not call live');
      },
    })).resolves.toMatchObject({
      key,
      output: { text: 'KNOT output' },
    });
    await expect(store.listSideEffects('knot')).resolves.toHaveLength(1);
    await expect(store.listSideEffects('other-world')).resolves.toHaveLength(1);
  });

  it('does not clear existing records when replace upsert fails', async () => {
    const client = new FakeSupabaseClient();
    const store = new SupabaseAuthorMemoryV3Store({
      userId: 'user-1',
      client: client.asStoreClient(),
    });

    await store.saveRecords({ projectId: 'knot', records, mode: 'replace' });
    client.failNext('author_memory_v3_records', 'upsert', 'simulated upsert failure');

    await expect(store.saveRecords({
      projectId: 'knot',
      records: [{
        id: 'replacement-record',
        kind: 'world_rule',
        status: 'canon',
        content: 'Replacement canon.',
      }],
      mode: 'replace',
    })).rejects.toThrow('simulated upsert failure');

    await expect(store.getRecord('knot', 'person-sori')).resolves.toEqual(records[0]);
    await expect(store.getRecord('knot', 'replacement-record')).resolves.toBeNull();
  });

  it('fails closed when Supabase persistence is requested without config', () => {
    vi.stubEnv('AUTHOR_MEMORY_V3_STORE', 'supabase');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.mocked(hasServerSupabaseServiceRoleConfig).mockReturnValue(false);

    expect(() => createAuthorMemoryV3StoreForUser({ userId: 'user-1' }))
      .toThrow('AUTHOR_MEMORY_V3_STORE=supabase requires Supabase service-role configuration');
  });
});

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

type Row = Record<string, unknown>;

class FakeSupabaseClient {
  private readonly tables = new Map<string, Row[]>();
  private readonly failures = new Map<string, string>();

  from(table: string): FakeQuery {
    return new FakeQuery(this.tables, this.failures, table);
  }

  asStoreClient(): ConstructorParameters<typeof SupabaseAuthorMemoryV3Store>[0]['client'] {
    return this as unknown as ConstructorParameters<
      typeof SupabaseAuthorMemoryV3Store
    >[0]['client'];
  }

  failNext(table: string, operation: string, message: string): void {
    this.failures.set(`${table}:${operation}`, message);
  }
}

class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  private inFilters: Array<[string, unknown[]]> = [];
  private orderKey: string | null = null;
  private orderAscending = true;
  private operation: 'select' | 'upsert' | 'delete' = 'select';
  private payload: Row[] = [];
  private onConflict: string[] = [];

  constructor(
    private readonly tables: Map<string, Row[]>,
    private readonly failures: Map<string, string>,
    private readonly table: string
  ) {}

  select(): this {
    this.operation = 'select';
    return this;
  }

  upsert(payload: Row | Row[], options?: { onConflict?: string }): this {
    this.operation = 'upsert';
    this.payload = Array.isArray(payload) ? payload : [payload];
    this.onConflict = options?.onConflict?.split(',').map((item) => item.trim()) ?? [];
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  eq(key: string, value: unknown): this {
    this.filters.push([key, value]);
    return this;
  }

  in(key: string, values: unknown[]): this {
    this.inFilters.push([key, values]);
    return this;
  }

  order(key: string, options?: { ascending?: boolean }): this {
    this.orderKey = key;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  async maybeSingle(): Promise<QueryResult> {
    const result = await this.execute();
    if (result.error) {
      return result;
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult> {
    const failure = this.consumeFailure();
    if (failure) {
      return {
        data: null,
        error: { message: failure },
      };
    }

    const rows = this.tables.get(this.table) ?? [];

    if (this.operation === 'delete') {
      this.tables.set(this.table, rows.filter((row) => !this.matches(row)));
      return { data: null, error: null };
    }

    if (this.operation === 'upsert') {
      const nextRows = [...rows];
      for (const row of this.payload) {
        const index = nextRows.findIndex((existing) => this.matchesConflict(existing, row));
        if (index >= 0) {
          nextRows[index] = { ...nextRows[index], ...row };
        } else {
          nextRows.push({ ...row });
        }
      }
      this.tables.set(this.table, nextRows);
      return { data: null, error: null };
    }

    let selected = rows.filter((row) => this.matches(row));
    if (this.orderKey) {
      selected = selected.sort((a, b) => this.compare(a[this.orderKey!], b[this.orderKey!]));
    }

    return {
      data: this.orderAscending ? selected : selected.reverse(),
      error: null,
    };
  }

  private matches(row: Row): boolean {
    return this.filters.every(([key, value]) => row[key] === value) &&
      this.inFilters.every(([key, values]) => values.includes(row[key]));
  }

  private matchesConflict(existing: Row, row: Row): boolean {
    return this.onConflict.length > 0 &&
      this.onConflict.every((key) => existing[key] === row[key]);
  }

  private compare(left: unknown, right: unknown): number {
    return String(left ?? '').localeCompare(String(right ?? ''));
  }

  private consumeFailure(): string | null {
    const key = `${this.table}:${this.operation}`;
    const message = this.failures.get(key) ?? null;
    this.failures.delete(key);
    return message;
  }
}
