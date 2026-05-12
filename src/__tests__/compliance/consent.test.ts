import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerClient } from '@/lib/supabase';
import {
  assertConsent,
  recordConsent,
  revokeConsentScope,
} from '@/lib/compliance/consent';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/lib/csrf';

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

interface ConsentState {
  consent_records: Array<Record<string, unknown>>;
  dsr_jobs: Array<Record<string, unknown>>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createConsentSupabase(state: ConsentState) {
  class QueryBuilder {
    private operation: 'select' | 'upsert' | 'update' | 'insert' = 'select';
    private filters: Array<(row: Record<string, unknown>) => boolean> = [];
    private payload: Record<string, unknown> | null = null;
    private singleMode: 'single' | null = null;
    private limitCount: number | null = null;

    constructor(private readonly table: keyof ConsentState) {}

    select() {
      return this;
    }

    upsert(payload: Record<string, unknown>) {
      this.operation = 'upsert';
      this.payload = payload;
      return this;
    }

    insert(payload: Record<string, unknown>) {
      this.operation = 'insert';
      this.payload = payload;
      return this;
    }

    update(payload: Record<string, unknown>) {
      this.operation = 'update';
      this.payload = payload;
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

    lte(column: string, value: string) {
      this.filters.push((row) => String(row[column]) <= value);
      return this;
    }

    contains(column: string, values: unknown[]) {
      this.filters.push((row) =>
        Array.isArray(row[column]) && values.every((value) => (row[column] as unknown[]).includes(value))
      );
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

    then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return this.execute().then(onfulfilled, onrejected);
    }

    private matchingRows() {
      return state[this.table].filter((row) => this.filters.every((filter) => filter(row)));
    }

    private async execute(): Promise<{ data: unknown; error: null }> {
      if (this.operation === 'insert') {
        const inserted = {
          id: this.payload?.id || `${this.table}-${state[this.table].length + 1}`,
          created_at: '2026-04-22T00:00:00.000Z',
          ...this.payload,
        };
        state[this.table].push(inserted);
        return this.format([inserted]);
      }

      if (this.operation === 'upsert') {
        const existing = state.consent_records.find((row) =>
          row.organization_id === this.payload?.organization_id &&
          row.subject_id === this.payload?.subject_id &&
          row.bracket === this.payload?.bracket
        );
        const row = {
          id: existing?.id || `consent-${state.consent_records.length + 1}`,
          created_at: existing?.created_at || '2026-04-22T00:00:00.000Z',
          ...existing,
          ...this.payload,
        };
        if (existing) {
          Object.assign(existing, row);
        } else {
          state.consent_records.push(row);
        }
        return this.format([row]);
      }

      if (this.operation === 'update') {
        const rows = this.matchingRows();
        for (const row of rows) Object.assign(row, this.payload);
        return this.format(rows);
      }

      let rows = this.matchingRows();
      if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
      return this.format(rows);
    }

    private format(rows: Array<Record<string, unknown>>) {
      if (this.singleMode === 'single') {
        return { data: clone(rows[0]), error: null };
      }
      return { data: clone(rows), error: null };
    }
  }

  return {
    from: (table: keyof ConsentState) => new QueryBuilder(table),
  } as never;
}

function createState(): ConsentState {
  return { consent_records: [], dsr_jobs: [] };
}

describe('consent scopes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: 'user-1', organizationId: 'org-1' },
    });
  });

  it('records consent with scopes and policy version', async () => {
    const state = createState();
    const supabase = createConsentSupabase(state);

    const consent = await recordConsent(supabase, {
      organizationId: 'org-1',
      subjectId: 'player-1',
      ageBracket: 'minor_under_13',
      scopes: ['memory_storage', 'ai_training'],
      version: '2026-04-22',
    });

    expect(consent.subject_id).toBe('player-1');
    expect(consent.scopes).toEqual(['ai_training', 'memory_storage']);
    expect(consent.policy_version).toBe('2026-04-22');
  });

  it('throws when a minor under 13 has no required memory storage consent', async () => {
    const state = createState();
    const supabase = createConsentSupabase(state);

    await expect(assertConsent(supabase, {
      organizationId: 'org-1',
      subjectId: 'player-1',
      scope: 'memory_storage',
      ageBracket: 'minor_under_13',
    })).rejects.toMatchObject({ code: 'compliance/consent_required' });
  });

  it('revokes a scope by setting revoked_at and blocks the next scoped write', async () => {
    const state = createState();
    const supabase = createConsentSupabase(state);
    await recordConsent(supabase, {
      organizationId: 'org-1',
      subjectId: 'player-1',
      ageBracket: 'minor_under_13',
      scopes: ['memory_storage'],
      version: '2026-04-22',
    });

    await expect(assertConsent(supabase, {
      organizationId: 'org-1',
      subjectId: 'player-1',
      scope: 'memory_storage',
      ageBracket: 'minor_under_13',
    })).resolves.toBeUndefined();

    const revoked = await revokeConsentScope(supabase, {
      organizationId: 'org-1',
      subjectId: 'player-1',
      scope: 'memory_storage',
    });

    expect(revoked.revoked).toBe(true);
    expect(state.consent_records[0].revoked_at).toEqual(expect.any(String));
    await expect(assertConsent(supabase, {
      organizationId: 'org-1',
      subjectId: 'player-1',
      scope: 'memory_storage',
      ageBracket: 'minor_under_13',
    })).rejects.toMatchObject({ code: 'compliance/consent_required' });
  });

  it('round-trips consent through POST and GET API routes', async () => {
    const state = createState();
    const supabase = createConsentSupabase(state);
    vi.mocked(createServerClient).mockReturnValue(supabase);
    const createRoute = await import('@/app/api/consent/route');
    const getRoute = await import('@/app/api/consent/[subjectId]/route');

    const postResponse = await createRoute.POST(new NextRequest('https://seizn.test/api/consent', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({
        subjectId: 'player-1',
        ageBracket: 'minor_under_13',
        scopes: ['memory_storage'],
        version: '2026-04-22',
      }),
    }));
    const postJson = await postResponse.json();

    const getResponse = await getRoute.GET(
      new NextRequest('https://seizn.test/api/consent/player-1'),
      { params: Promise.resolve({ subjectId: 'player-1' }) }
    );
    const getJson = await getResponse.json();

    expect(postResponse.status).toBe(201);
    expect(postJson.data.consent.subject_id).toBe('player-1');
    expect(getResponse.status).toBe(200);
    expect(getJson.data.consent.scopes).toEqual(['memory_storage']);
  });
});

function csrfHeaders(): Record<string, string> {
  const token = 'consent-csrf-token';
  return {
    origin: 'http://localhost:3000',
    cookie: `${CSRF_COOKIE_NAME}=${token}`,
    [CSRF_HEADER_NAME]: token,
  };
}
