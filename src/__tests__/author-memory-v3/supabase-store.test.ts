import { describe, expect, it } from 'vitest';

import {
  SupabaseAuthorMemoryV3Store,
  createAuthorSideEffectKey,
  runAuthorSideEffect,
  type AuthorEvalResult,
  type AuthorMemoryRecord,
  type AuthorSideEffectRequest,
} from '@/lib/author/memory-v3';

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
});

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

type Row = Record<string, unknown>;

class FakeSupabaseClient {
  private readonly tables = new Map<string, Row[]>();

  from(table: string): FakeQuery {
    return new FakeQuery(this.tables, table);
  }

  asStoreClient(): ConstructorParameters<typeof SupabaseAuthorMemoryV3Store>[0]['client'] {
    return this as unknown as ConstructorParameters<
      typeof SupabaseAuthorMemoryV3Store
    >[0]['client'];
  }
}

class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  private orderKey: string | null = null;
  private orderAscending = true;
  private operation: 'select' | 'upsert' | 'delete' = 'select';
  private payload: Row[] = [];
  private onConflict: string[] = [];

  constructor(
    private readonly tables: Map<string, Row[]>,
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

  order(key: string, options?: { ascending?: boolean }): this {
    this.orderKey = key;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  async maybeSingle(): Promise<QueryResult> {
    const result = await this.execute();
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
    return this.filters.every(([key, value]) => row[key] === value);
  }

  private matchesConflict(existing: Row, row: Row): boolean {
    return this.onConflict.length > 0 &&
      this.onConflict.every((key) => existing[key] === row[key]);
  }

  private compare(left: unknown, right: unknown): number {
    return String(left ?? '').localeCompare(String(right ?? ''));
  }
}
