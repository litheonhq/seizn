import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTierStats,
  recordRecall,
  reserveHotSpace,
  runTierDemotionBatch,
} from '@/lib/memory/budget';
import { GET as cronGET } from '@/app/api/cron/tier-demotion/route';
import { GET as tierStatsGET } from '@/app/api/budget/tier-stats/route';

const { authMock, createServerClientMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  createServerClientMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

vi.mock('@/lib/server/logger', () => ({
  logServerError: vi.fn(),
  logServerWarn: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: createServerClientMock,
}));

interface TierState {
  memories: Array<Record<string, unknown>>;
  organizations: Array<Record<string, unknown>>;
  memory_budget_events: Array<Record<string, unknown>>;
  entity_budget: Array<Record<string, unknown>>;
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createTierSupabase(state: TierState) {
  class QueryBuilder {
    private operation: 'select' | 'update' | 'insert' | 'upsert' = 'select';
    private filters: Array<(row: Record<string, unknown>) => boolean> = [];
    private payload: Record<string, unknown> | null = null;
    private limitCount: number | null = null;
    private orderBy: { column: string; ascending: boolean } | null = null;
    private singleMode: 'single' | 'maybeSingle' | null = null;

    constructor(private readonly table: keyof Omit<TierState, 'rpcCalls'>) {}

    select() {
      return this;
    }

    update(payload: Record<string, unknown>) {
      this.operation = 'update';
      this.payload = payload;
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
      return this.execute();
    }

    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
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
        const row = {
          id: `${this.table}-${state[this.table].length + 1}`,
          created_at: '2026-04-22T03:00:00.000Z',
          ...this.payload,
        };
        state[this.table].push(row);
        return this.format([row]);
      }

      if (this.operation === 'upsert') {
        const existing = state.entity_budget.find((row) =>
          row.organization_id === this.payload?.organization_id &&
          row.entity_id === this.payload?.entity_id
        );
        const row = {
          id: existing?.id || `entity-budget-${state.entity_budget.length + 1}`,
          ...existing,
          ...this.payload,
        };
        if (existing) {
          Object.assign(existing, row);
        } else {
          state.entity_budget.push(row);
        }
        return this.format([row]);
      }

      if (this.operation === 'update') {
        const rows = this.rows();
        for (const row of rows) Object.assign(row, this.payload);
        return this.format(rows);
      }

      return this.format(this.rows());
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
    from: (table: keyof Omit<TierState, 'rpcCalls'>) => new QueryBuilder(table),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return { data: null, error: null };
    },
  } as never;
}

function createState(plan = 'pro'): TierState {
  return {
    memories: [],
    organizations: [{ id: 'org-1', plan, subscription_tier: plan }],
    memory_budget_events: [],
    entity_budget: [],
    rpcCalls: [],
  };
}

function memory(input: Partial<Record<string, unknown>> & { id: string }): Record<string, unknown> {
  return {
    organization_id: 'org-1',
    entity_id: 'npc-1',
    tier: 'hot',
    pinned: false,
    is_deleted: false,
    size_bytes: 128,
    recall_count: 0,
    last_recalled_at: '2026-02-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    ...input,
  };
}

function authorizedCronRequest(secret = 'cron-secret') {
  return new NextRequest('https://seizn.test/api/cron/tier-demotion', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe('tier demotion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-secret';
    authMock.mockResolvedValue({ user: { id: 'user-1', organizationId: 'org-1' } });
  });

  it('cron endpoint demotes a stale hot memory with the correct secret', async () => {
    const state = createState('pro');
    state.memories.push(memory({ id: 'hot-stale' }));
    createServerClientMock.mockReturnValue(createTierSupabase(state));

    const response = await cronGET(authorizedCronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.demoted).toBe(1);
    expect(state.memories[0].tier).toBe('warm');
    expect(state.memory_budget_events[0]).toMatchObject({
      memory_id: 'hot-stale',
      event_type: 'demote',
      from_tier: 'hot',
      to_tier: 'warm',
    });
    expect(state.rpcCalls[0].args).toMatchObject({
      p_dimension: 'ops',
      p_source: 'tier-demotion',
    });
  });

  it('does not demote pinned stale memories', async () => {
    const state = createState('pro');
    state.memories.push(memory({ id: 'pinned-hot', pinned: true }));
    const supabase = createTierSupabase(state);

    const result = await runTierDemotionBatch(
      { now: new Date('2026-04-22T03:00:00.000Z') },
      supabase
    );

    expect(result.demoted).toBe(0);
    expect(state.memories[0].tier).toBe('hot');
    expect(state.memory_budget_events).toHaveLength(0);
  });

  it('skips Indie plan organizations', async () => {
    const state = createState('indie');
    state.memories.push(memory({ id: 'indie-hot' }));
    const supabase = createTierSupabase(state);

    const result = await runTierDemotionBatch(
      { now: new Date('2026-04-22T03:00:00.000Z') },
      supabase
    );

    expect(result.skippedPlanGate).toBe(1);
    expect(result.demoted).toBe(0);
    expect(state.memories[0].tier).toBe('hot');
  });

  it('does not run write-time demotion for Indie plans', async () => {
    const state = createState('indie');
    state.memories.push(memory({ id: 'indie-write-hot' }));
    const supabase = createTierSupabase(state);

    const result = await reserveHotSpace(
      { organizationId: 'org-1', entityId: 'npc-1', sizeBytes: 1_000_000 },
      supabase
    );

    expect(result.ok).toBe(true);
    expect(result.demotedIds).toEqual([]);
    expect(state.memories[0].tier).toBe('hot');
  });

  it('promotes recalled warm memory to hot', async () => {
    const state = createState('studio');
    state.memories.push(memory({ id: 'warm-recalled', tier: 'warm' }));
    const supabase = createTierSupabase(state);

    await recordRecall('warm-recalled', supabase);

    expect(state.memories[0].tier).toBe('hot');
    expect(state.memories[0].recall_count).toBe(1);
    expect(state.memory_budget_events.map((event) => event.event_type)).toEqual(['recall', 'promote']);
  });

  it('rejects cron requests with the wrong secret', async () => {
    const state = createState('pro');
    createServerClientMock.mockReturnValue(createTierSupabase(state));

    const response = await cronGET(authorizedCronRequest('wrong-secret'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns tier stats for the caller organization', async () => {
    const state = createState('pro');
    state.memories.push(
      memory({ id: 'hot-1', tier: 'hot' }),
      memory({ id: 'warm-1', tier: 'warm', pinned: true }),
      memory({ id: 'cold-1', tier: 'cold' })
    );
    state.memory_budget_events.push(
      { id: 'event-1', organization_id: 'org-1', event_type: 'demote', created_at: '2026-04-22T03:00:00.000Z' },
      { id: 'event-2', organization_id: 'org-1', event_type: 'demote', created_at: '2026-04-22T03:00:01.000Z' }
    );
    createServerClientMock.mockReturnValue(createTierSupabase(state));

    const directStats = await getTierStats('org-1', createTierSupabase(state));
    const response = await tierStatsGET();
    const body = await response.json();

    expect(directStats).toMatchObject({ hot: 1, warm: 1, cold: 1, pinned: 1 });
    expect(response.status).toBe(200);
    expect(body.data.lastDemotionCount).toBe(2);
  });
});
