/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import type { KoreanPersona } from '@seizn/personas-kr';
import type { Locale } from '@/i18n/config';
import ConsentPage from '@/app/[locale]/consent/page';
import { POST as seedPOST } from '@/app/api/personas/seed/route';
import { getRequestUser } from '@/lib/api/request-user';
import { resolveComplianceOrganizationId } from '@/lib/compliance/organization';
import {
  PERSONA_SEEDING,
  recordConsent,
  requiresConsent,
  revokeConsentScope,
} from '@/lib/compliance/consent';
import { loadPersonas } from '@/lib/personas/source';
import { createServerClient } from '@/lib/supabase';

const { loadPersonasMock } = vi.hoisted(() => ({
  loadPersonasMock: vi.fn(),
}));

vi.mock('@/lib/api/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  getAuditContext: vi.fn(() => ({ requestId: 'req-persona-consent' })),
  logAuditEvent: vi.fn(async () => 'audit-persona-consent'),
}));

vi.mock('@/lib/compliance/organization', () => ({
  resolveComplianceOrganizationId: vi.fn(),
}));

vi.mock('@/lib/personas/source', () => ({
  getPersonaSource: vi.fn((plan: string) =>
    plan === 'studio' || plan === 'plus' || plan === 'pro' || plan === 'enterprise' ? 'live' : 'bundled',
  ),
  loadPersonas: loadPersonasMock,
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ORG_ID = '00000000-0000-4000-8000-000000000002';

interface PersonaConsentState {
  profiles: Array<Record<string, unknown>>;
  consent_records: Array<Record<string, unknown>>;
  graph_entities: Array<Record<string, unknown>>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createState(plan = 'pro'): PersonaConsentState {
  return {
    profiles: [{ id: USER_ID, plan, subscription_ends_at: null }],
    consent_records: [],
    graph_entities: [],
  };
}

function createPersonaConsentSupabase(state: PersonaConsentState) {
  class QueryBuilder {
    private operation: 'select' | 'upsert' | 'update' | 'insert' = 'select';
    private filters: Array<(row: Record<string, unknown>) => boolean> = [];
    private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
    private singleMode: 'single' | 'maybeSingle' | null = null;
    private limitCount: number | null = null;

    constructor(private readonly table: keyof PersonaConsentState) {}

    select() {
      return this;
    }

    upsert(payload: Record<string, unknown>) {
      this.operation = 'upsert';
      this.payload = payload;
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

    private matchingRows() {
      return state[this.table].filter((row) => this.filters.every((filter) => filter(row)));
    }

    private async execute(): Promise<{ data: unknown; error: null }> {
      if (this.operation === 'insert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
        const inserted = rows.map((row) => ({
          id: row.id || `${this.table}-${state[this.table].length + 1}`,
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
        const rows = this.matchingRows();
        for (const row of rows) Object.assign(row, this.payload);
        return this.format(rows);
      }

      let rows = this.matchingRows();
      if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
      return this.format(rows);
    }

    private format(rows: Array<Record<string, unknown>>) {
      if (this.singleMode === 'single') return { data: clone(rows[0]), error: null };
      if (this.singleMode === 'maybeSingle') return { data: rows[0] ? clone(rows[0]) : null, error: null };
      return { data: clone(rows), error: null };
    }
  }

  return {
    from: (table: keyof PersonaConsentState) => new QueryBuilder(table),
  } as never;
}

function makePersona(index: number): KoreanPersona {
  return {
    uuid: `persona-consent-${index}`,
    professional_persona: 'professional',
    sports_persona: 'sports',
    arts_persona: 'arts',
    travel_persona: 'travel',
    culinary_persona: 'culinary',
    family_persona: 'family',
    persona: `persona-consent-${index} 씨는 서울에서 일하는 NPC입니다.`,
    cultural_background: 'background',
    skills_and_expertise: 'skills',
    skills_and_expertise_list: ['skill'],
    hobbies_and_interests: 'hobbies',
    hobbies_and_interests_list: ['hobby'],
    career_goals_and_ambitions: 'goals',
    sex: '남자' as KoreanPersona['sex'],
    age: 36,
    marital_status: 'single',
    military_status: 'completed',
    family_type: 'single household',
    housing_type: 'apartment',
    education_level: 'college',
    bachelors_field: 'design',
    occupation: '작가',
    district: '서울-마포구',
    province: '서울',
    country: '대한민국',
  } as KoreanPersona;
}

function makeSeedRequest(): NextRequest {
  return new NextRequest(new URL('/api/personas/seed', 'https://test.seizn.com'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      count: 1,
      criteria: { region: '서울' },
      mode: 'auto',
    }),
  });
}

describe('persona seeding consent', () => {
  let state: PersonaConsentState;
  let supabase: ReturnType<typeof createPersonaConsentSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HUGGINGFACE_TOKEN;
    state = createState();
    supabase = createPersonaConsentSupabase(state);
    vi.mocked(createServerClient).mockReturnValue(supabase);
    vi.mocked(getRequestUser).mockResolvedValue({
      id: USER_ID,
      email: 'studio@example.com',
      name: 'Studio User',
      organizationId: null,
      organizationSelection: null,
      lastSignInAt: null,
    });
    vi.mocked(resolveComplianceOrganizationId).mockResolvedValue(ORG_ID);
    loadPersonasMock.mockResolvedValue([makePersona(1)]);
  });

  it('requires explicit opt-in for persona seeding even for adult subjects', () => {
    expect(requiresConsent(PERSONA_SEEDING, 'adult')).toBe(true);
    expect(requiresConsent(PERSONA_SEEDING, 'minor_13_17')).toBe(true);
  });

  it('blocks the seed API with 412 when persona seeding consent is missing', async () => {
    const response = await seedPOST(makeSeedRequest());
    const body = await response.json();

    expect(response.status).toBe(412);
    expect(body.error.scope).toBe(PERSONA_SEEDING);
    expect(state.graph_entities).toHaveLength(0);
    expect(loadPersonas).not.toHaveBeenCalled();
  });

  it('allows seed API calls after persona seeding consent is recorded', async () => {
    await recordConsent(supabase, {
      organizationId: ORG_ID,
      subjectId: ORG_ID,
      ageBracket: 'adult',
      scopes: [PERSONA_SEEDING],
      version: '2026-04-22',
    });

    const response = await seedPOST(makeSeedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.inserted).toHaveLength(1);
    expect(state.graph_entities).toHaveLength(1);
    expect(state.graph_entities[0].type).toBe('person');
    expect((state.graph_entities[0].provenance as Record<string, unknown>).source).toBe('nemotron-personas-kr');
  });

  it('revocation prevents subsequent persona seed calls', async () => {
    await recordConsent(supabase, {
      organizationId: ORG_ID,
      subjectId: ORG_ID,
      ageBracket: 'adult',
      scopes: [PERSONA_SEEDING],
      version: '2026-04-22',
    });

    const first = await seedPOST(makeSeedRequest());
    await revokeConsentScope(supabase, {
      organizationId: ORG_ID,
      subjectId: ORG_ID,
      scope: PERSONA_SEEDING,
    });
    const second = await seedPOST(makeSeedRequest());

    expect(first.status).toBe(200);
    expect(second.status).toBe(412);
    expect(state.graph_entities).toHaveLength(1);
    expect(state.consent_records[0].revoked_at).toEqual(expect.any(String));
  });

  it('renders the PIPA delegation disclosure only for Korean consent copy', async () => {
    const koHtml = renderToStaticMarkup(
      await ConsentPage({ params: Promise.resolve({ locale: 'ko' as Locale }) }),
    );
    const enHtml = renderToStaticMarkup(
      await ConsentPage({ params: Promise.resolve({ locale: 'en' as Locale }) }),
    );

    expect(koHtml).toContain('data-persona-disclosure="pipa"');
    expect(koHtml).toContain('PIPA 위탁처리 고지');
    expect(enHtml).toContain('data-persona-disclosure="processor"');
    expect(enHtml).toContain('Processor disclosure');
    expect(enHtml).not.toContain('PIPA 위탁처리 고지');
  });
});
