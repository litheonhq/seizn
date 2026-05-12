/* @vitest-environment node */

import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import type { KoreanPersona } from '@seizn/personas-kr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH as regionPreferencePATCH } from '@/app/api/personas/region-preference/route';
import { POST as seedPOST } from '@/app/api/personas/seed/route';
import { DataResidencyPreference } from '@/app/(dashboard)/dashboard/settings/settings-client';
import { getRequestUser } from '@/lib/api/request-user';
import { PERSONA_SEEDING, recordConsent } from '@/lib/compliance/consent';
import { resolveComplianceOrganizationId } from '@/lib/compliance/organization';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/lib/csrf';
import { getPreferredRegion, requireKoreanResidency } from '@/lib/personas/region-pref';
import { personasToGraphEntityRows } from '@/lib/personas/api';
import { clearPersonaCacheForTests, loadPersonas } from '@/lib/personas/source';
import { PLANS } from '@/lib/plan-limits';
import { createServerClient } from '@/lib/supabase';

const { logAuditEventMock } = vi.hoisted(() => ({
  logAuditEventMock: vi.fn(async () => 'audit-batch-c'),
}));

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  useSession: vi.fn(() => ({ status: 'authenticated' })),
}));

vi.mock('@/components/settings', () => ({
  DataExportModal: () => null,
  DeleteMemoriesModal: () => null,
  RTBFModal: () => null,
}));

vi.mock('@/components/ui/ThemeToggle', () => ({
  ThemeToggle: () => null,
}));

vi.mock('@/contexts/DashboardLocaleContext', () => ({
  useDashboardTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/api/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  getAuditContext: vi.fn(() => ({ requestId: 'req-batch-c-smoke' })),
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/compliance/organization', () => ({
  resolveComplianceOrganizationId: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  logServerError: vi.fn(),
  logServerWarn: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

const USER_ID = '00000000-0000-4000-8000-000000000101';
const ORG_ID = '00000000-0000-4000-8000-000000000102';
const CSRF_TOKEN = 'batch-c-csrf-token';

interface BatchCSmokeState {
  consent_records: Array<Record<string, unknown>>;
  graph_entities: Array<Record<string, unknown>>;
  organization_members: Array<Record<string, unknown>>;
  organizations: Array<Record<string, unknown>>;
  profiles: Array<Record<string, unknown>>;
}

type TableName = keyof BatchCSmokeState;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createState(plan = 'pro', role = 'owner'): BatchCSmokeState {
  return {
    consent_records: [],
    graph_entities: [],
    organization_members: [{ id: 'member-1', organization_id: ORG_ID, user_id: USER_ID, role }],
    organizations: [{ id: ORG_ID, name: 'Batch C Studio', preferred_region: 'auto' }],
    profiles: [{ id: USER_ID, plan, subscription_ends_at: null }],
  };
}

function createBatchCSupabase(state: BatchCSmokeState) {
  class QueryBuilder {
    private operation: 'select' | 'insert' | 'upsert' | 'update' = 'select';
    private filters: Array<(row: Record<string, unknown>) => boolean> = [];
    private payload: Record<string, unknown> | Array<Record<string, unknown>> | null = null;
    private singleMode: 'single' | 'maybeSingle' | null = null;
    private limitCount: number | null = null;

    constructor(private readonly table: TableName) {}

    select() {
      return this;
    }

    insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
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

    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    is(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    lte(column: string, value: string) {
      this.filters.push((row) => typeof row[column] === 'string' && String(row[column]) <= value);
      return this;
    }

    contains(column: string, values: unknown[]) {
      this.filters.push((row) =>
        Array.isArray(row[column]) && values.every((value) => (row[column] as unknown[]).includes(value)),
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

    maybeSingle() {
      this.singleMode = 'maybeSingle';
      return this.execute();
    }

    then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return this.execute().then(onfulfilled, onrejected);
    }

    private rows() {
      let rows = state[this.table].filter((row) => this.filters.every((filter) => filter(row)));
      if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
      return rows;
    }

    private async execute(): Promise<{ data: unknown; error: null }> {
      if (this.operation === 'insert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
        const inserted = rows.map((row, index) => ({
          id: row.id || `${this.table}-${state[this.table].length + index + 1}`,
          created_at: '2026-04-22T00:00:00.000Z',
          ...row,
        }));
        state[this.table].push(...inserted);
        return this.format(inserted);
      }

      if (this.operation === 'upsert') {
        const payload = this.payload as Record<string, unknown>;
        const existing = state.consent_records.find((row) =>
          row.organization_id === payload.organization_id &&
          row.subject_id === payload.subject_id &&
          row.bracket === payload.bracket,
        );
        const row = {
          id: existing?.id || `consent-${state.consent_records.length + 1}`,
          created_at: existing?.created_at || '2026-04-22T00:00:00.000Z',
          ...existing,
          ...payload,
        };
        if (existing) {
          Object.assign(existing, row);
        } else {
          state.consent_records.push(row);
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
      if (this.singleMode === 'single') return { data: clone(rows[0]), error: null };
      if (this.singleMode === 'maybeSingle') return { data: rows[0] ? clone(rows[0]) : null, error: null };
      return { data: clone(rows), error: null };
    }
  }

  return {
    from: (table: TableName) => new QueryBuilder(table),
  } as never;
}

function makePersona(index: number): KoreanPersona {
  return {
    uuid: `batch-c-persona-${String(index).padStart(3, '0')}`,
    professional_persona: 'professional',
    sports_persona: 'sports',
    arts_persona: 'arts',
    travel_persona: 'travel',
    culinary_persona: 'culinary',
    family_persona: 'family',
    persona: `batch-c-persona-${index} works in Seoul as a synthetic NPC candidate.`,
    cultural_background: 'Korean urban background',
    skills_and_expertise: 'systems design',
    skills_and_expertise_list: ['systems design'],
    hobbies_and_interests: 'indie games',
    hobbies_and_interests_list: ['indie games'],
    career_goals_and_ambitions: 'ship a memorable game',
    sex: '남자' as KoreanPersona['sex'],
    age: 32 + index,
    marital_status: 'single',
    military_status: 'completed',
    family_type: 'single household',
    housing_type: 'apartment',
    education_level: 'college',
    bachelors_field: 'computer science',
    occupation: 'developer',
    district: 'Seoul-Mapo',
    province: 'Seoul',
    country: 'South Korea',
  };
}

function makePostRequest(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(path, 'https://test.seizn.com'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(path, 'https://test.seizn.com'), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost:3000',
      cookie: `${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`,
      [CSRF_HEADER_NAME]: CSRF_TOKEN,
    },
    body: JSON.stringify(body),
  });
}

async function grantPersonaConsent(supabase: ReturnType<typeof createBatchCSupabase>) {
  await recordConsent(supabase, {
    organizationId: ORG_ID,
    subjectId: ORG_ID,
    ageBracket: 'adult',
    scopes: [PERSONA_SEEDING],
    version: '2026-04-22',
  });
}

describe('Batch C smoke', () => {
  const originalToken = process.env.HUGGINGFACE_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    clearPersonaCacheForTests();
    delete process.env.HUGGINGFACE_TOKEN;
    vi.mocked(getRequestUser).mockResolvedValue({
      id: USER_ID,
      email: 'batch-c@example.com',
      name: 'Batch C User',
      organizationId: null,
      organizationSelection: null,
      lastSignInAt: null,
    });
    vi.mocked(resolveComplianceOrganizationId).mockResolvedValue(ORG_ID);
  });

  afterEach(() => {
    clearPersonaCacheForTests();
    vi.unstubAllGlobals();
    if (originalToken === undefined) {
      delete process.env.HUGGINGFACE_TOKEN;
    } else {
      process.env.HUGGINGFACE_TOKEN = originalToken;
    }
  });

  it('loads five bundled sample personas, transforms them, and inserts synthetic graph people', async () => {
    const state = createState('free');
    const supabase = createBatchCSupabase(state);
    const personas = await loadPersonas({ plan: 'free', count: 5 });
    const rows = personasToGraphEntityRows(personas, { userId: USER_ID, organizationId: ORG_ID });

    await supabase.from('graph_entities').insert(rows).select('id');

    expect(personas).toHaveLength(5);
    expect(state.graph_entities).toHaveLength(5);
    expect(state.graph_entities.every((row) => row.type === 'person')).toBe(true);
    expect(state.graph_entities.every((row) => row.is_synthetic === true)).toBe(true);
    expect(state.graph_entities.every((row) => (row.provenance as Record<string, unknown>).source_attribution === 'NVIDIA Nemotron-Personas-Korea')).toBe(true);
  });

  it('hybrid mode previews ten personas and inserts only four accepted selections', async () => {
    const state = createState('indie');
    const supabase = createBatchCSupabase(state);
    vi.mocked(createServerClient).mockReturnValue(supabase);
    await grantPersonaConsent(supabase);

    const candidates = await loadPersonas({ plan: 'indie', count: 10 });
    const response = await seedPOST(
      makePostRequest('/api/personas/seed', {
        count: 10,
        criteria: {},
        mode: 'hybrid',
        selections: candidates.map((persona, index) => ({ personaId: persona.uuid, accept: index < 4 })),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.previews).toHaveLength(10);
    expect(body.inserted).toHaveLength(4);
    expect(body.skipped).toBe(6);
    expect(state.graph_entities).toHaveLength(4);
  });

  it('returns 403 when Free plan persona seeding exceeds bundled quota', async () => {
    const state = createState('free');
    vi.mocked(createServerClient).mockReturnValue(createBatchCSupabase(state));

    const response = await seedPOST(
      makePostRequest('/api/personas/seed', {
        count: 26,
        criteria: {},
        mode: 'auto',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('quota_exceeded');
    expect(body.error.limit).toBe(25);
    expect(state.graph_entities).toHaveLength(0);
  });

  it('uses the mocked HuggingFace live-source path for Pro with a token', async () => {
    process.env.HUGGINGFACE_TOKEN = 'token-test-batch-c-mock';
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => ({
      ok: true,
      json: async () => ({ rows: [{ row: makePersona(1) }, { row: makePersona(2) }] }),
      url: String(url),
      init,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const personas = await loadPersonas({ plan: 'pro', count: 2 });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));

    expect(personas).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedUrl.searchParams.get('dataset')).toBe('nvidia/Nemotron-Personas-Korea');
    expect(requestedUrl.searchParams.get('length')).toBe('100');
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer token-test-batch-c-mock');
  });

  it('keeps the persona seeding consent gate closed when consent is missing', async () => {
    const state = createState('indie');
    vi.mocked(createServerClient).mockReturnValue(createBatchCSupabase(state));

    const response = await seedPOST(
      makePostRequest('/api/personas/seed', {
        count: 1,
        criteria: {},
        mode: 'auto',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(412);
    expect(body.error.scope).toBe(PERSONA_SEEDING);
    expect(state.graph_entities).toHaveLength(0);
  });

  it('sets Seoul preference on Pro, rejects it on Free, and renders gated settings UI', async () => {
    expect(['free', 'indie', 'studio', 'pro', 'enterprise'].map((plan) => PLANS[plan].features.regionPin))
      .toEqual([false, false, false, true, true]);

    const proState = createState('pro');
    const proSupabase = createBatchCSupabase(proState);
    vi.mocked(createServerClient).mockReturnValue(proSupabase);

    const proResponse = await regionPreferencePATCH(
      makePatchRequest('/api/personas/region-preference', { preferredRegion: 'seoul' }),
    );
    const proBody = await proResponse.json();

    expect(proResponse.status).toBe(200);
    expect(proBody.preferredRegion).toBe('seoul');
    expect(await getPreferredRegion(ORG_ID, proSupabase)).toBe('seoul');
    expect(await requireKoreanResidency(ORG_ID, proSupabase)).toBe(true);

    const freeState = createState('free');
    vi.mocked(createServerClient).mockReturnValue(createBatchCSupabase(freeState));
    const freeResponse = await regionPreferencePATCH(
      makePatchRequest('/api/personas/region-preference', { preferredRegion: 'seoul' }),
    );
    const freeBody = await freeResponse.json();

    expect(freeResponse.status).toBe(403);
    expect(freeBody.error.code).toBe('plan_required');
    expect(freeState.organizations[0].preferred_region).toBe('auto');

    const disabledHtml = renderToStaticMarkup(
      <DataResidencyPreference value="auto" regionPinAvailable={false} onChange={() => undefined} />,
    );
    const enabledHtml = renderToStaticMarkup(
      <DataResidencyPreference value="seoul" regionPinAvailable={true} onChange={() => undefined} />,
    );

    expect(disabledHtml).toContain('Data residency preference');
    expect(disabledHtml).toContain('disabled=""');
    expect(disabledHtml).toContain('Seoul residency preference requires Pro or Enterprise.');
    expect(enabledHtml).toContain('value="seoul"');
    expect(enabledHtml).not.toContain('disabled=""');
  });
});
