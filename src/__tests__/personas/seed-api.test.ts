/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { KoreanPersona } from '@seizn/personas-kr';
import { GET as previewGET } from '@/app/api/personas/preview/route';
import { POST as seedPOST } from '@/app/api/personas/seed/route';
import { getRequestUser } from '@/lib/api/request-user';
import { logAuditEvent } from '@/lib/audit';
import { resolveComplianceOrganizationId } from '@/lib/compliance/organization';
import { loadPersonas } from '@/lib/personas/source';
import { createServerClient } from '@/lib/supabase';

const { loadPersonasMock, logAuditEventMock } = vi.hoisted(() => ({
  loadPersonasMock: vi.fn(),
  logAuditEventMock: vi.fn(async () => 'audit-1'),
}));

vi.mock('@/lib/api/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  getAuditContext: vi.fn(() => ({ requestId: 'req-1', ipAddress: '127.0.0.1' })),
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/compliance/organization', () => ({
  resolveComplianceOrganizationId: vi.fn(),
}));

vi.mock('@/lib/compliance/consent', async () => {
  const actual = await vi.importActual<typeof import('@/lib/compliance/consent')>('@/lib/compliance/consent');
  return {
    ...actual,
    assertConsent: vi.fn(async () => undefined),
  };
});

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

function makePersona(index: number, overrides: Partial<KoreanPersona> = {}): KoreanPersona {
  const id = String(index).padStart(3, '0');
  return {
    uuid: `persona-${id}`,
    professional_persona: `persona-${id} professional`,
    sports_persona: `persona-${id} sports`,
    arts_persona: `persona-${id} arts`,
    travel_persona: `persona-${id} travel`,
    culinary_persona: `persona-${id} culinary`,
    family_persona: `persona-${id} family`,
    persona: `persona-${id} 씨는 서울에서 일하는 게임 NPC입니다.`,
    cultural_background: `persona-${id} background`,
    skills_and_expertise: `persona-${id} skills`,
    skills_and_expertise_list: [`skill-${id}`],
    hobbies_and_interests: `persona-${id} hobbies`,
    hobbies_and_interests_list: [`hobby-${id}`],
    career_goals_and_ambitions: `persona-${id} goals`,
    sex: '남자' as KoreanPersona['sex'],
    age: 30 + (index % 10),
    marital_status: 'single',
    military_status: 'completed',
    family_type: 'single household',
    housing_type: 'apartment',
    education_level: 'college',
    bachelors_field: 'computer science',
    occupation: '개발자',
    district: '서울-마포구',
    province: '서울',
    country: '대한민국',
    ...overrides,
  } as KoreanPersona;
}

function makeRequest(path: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(path, 'https://test.seizn.com'), {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function installSupabase(plan: string, insertedRows: Record<string, unknown>[]) {
  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn(async () => ({
              data: { plan, subscription_ends_at: null },
              error: null,
            })),
          }),
        }),
      };
    }

    if (table === 'graph_entities') {
      return {
        insert: vi.fn((rows: Record<string, unknown>[]) => {
          insertedRows.push(...rows);
          return {
            select: vi.fn(async () => ({
              data: rows.map((_row, index) => ({ id: `entity-${index + 1}` })),
              error: null,
            })),
          };
        }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  vi.mocked(createServerClient).mockReturnValue({
    from,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  return { from };
}

describe('persona seed API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRequestUser).mockResolvedValue({
      id: USER_ID,
      email: 'studio@example.com',
      name: 'Studio User',
      organizationId: null,
      organizationSelection: null,
      lastSignInAt: null,
    });
    vi.mocked(resolveComplianceOrganizationId).mockResolvedValue(ORG_ID);
    loadPersonasMock.mockResolvedValue([]);
  });

  it('blocks Free plan seed requests above the 25 persona quota', async () => {
    const insertedRows: Record<string, unknown>[] = [];
    installSupabase('free', insertedRows);

    const response = await seedPOST(
      makeRequest('/api/personas/seed', {
        count: 26,
        criteria: {},
        mode: 'auto',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('quota_exceeded');
    expect(body.error.limit).toBe(25);
    expect(loadPersonas).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('auto mode inserts 50 Pro personas as synthetic graph people with provenance', async () => {
    const personas = Array.from({ length: 50 }, (_value, index) => makePersona(index + 1));
    const insertedRows: Record<string, unknown>[] = [];
    installSupabase('pro', insertedRows);
    loadPersonasMock.mockResolvedValue(personas);

    const response = await seedPOST(
      makeRequest('/api/personas/seed', {
        count: 50,
        criteria: { region: '서울', occupation: '개발자' },
        mode: 'auto',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.inserted).toHaveLength(50);
    expect(insertedRows).toHaveLength(50);
    expect(insertedRows.every((row) => row.type === 'person')).toBe(true);
    expect(insertedRows.every((row) => row.is_synthetic === true)).toBe(true);
    expect(insertedRows.every((row) => (row.provenance as Record<string, unknown>).source === 'nemotron-personas-kr')).toBe(true);
    expect(insertedRows.every((row) => (row.provenance as Record<string, unknown>).source_uuid)).toBe(true);
    expect(insertedRows.every((row) => (row.metadata as Record<string, unknown>).organization_id === ORG_ID)).toBe(true);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        action: 'persona.seed',
        organizationId: ORG_ID,
        details: expect.objectContaining({
          source: 'bundled',
          count: 50,
          mode: 'auto',
        }),
      }),
    );
  });

  it('hybrid mode only inserts accepted selections', async () => {
    const personas = Array.from({ length: 5 }, (_value, index) => makePersona(index + 1));
    const insertedRows: Record<string, unknown>[] = [];
    installSupabase('studio', insertedRows);
    loadPersonasMock.mockResolvedValue(personas);

    const response = await seedPOST(
      makeRequest('/api/personas/seed', {
        count: 5,
        criteria: {},
        mode: 'hybrid',
        selections: [
          { personaId: 'persona-001', accept: true },
          { personaId: 'persona-002', accept: false },
          { personaId: 'persona-003', accept: true },
          { personaId: 'persona-004', accept: false },
          { personaId: 'persona-005', accept: false },
        ],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.inserted).toHaveLength(2);
    expect(body.skipped).toBe(3);
    expect(insertedRows.map((row) => (row.provenance as Record<string, unknown>).source_uuid)).toEqual([
      'persona-001',
      'persona-003',
    ]);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'persona.seed',
        details: expect.objectContaining({ count: 2, mode: 'hybrid', skipped: 3 }),
      }),
      expect.any(Object),
    );
  });

  it('manual mode returns previews and does not insert graph entities', async () => {
    const personas = Array.from({ length: 4 }, (_value, index) => makePersona(index + 1));
    const insertedRows: Record<string, unknown>[] = [];
    installSupabase('indie', insertedRows);
    loadPersonasMock.mockResolvedValue(personas);

    const response = await seedPOST(
      makeRequest('/api/personas/seed', {
        count: 4,
        criteria: {},
        mode: 'manual',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.inserted).toEqual([]);
    expect(body.previews).toHaveLength(4);
    expect(body.skipped).toBe(4);
    expect(insertedRows).toHaveLength(0);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'persona.seed',
        details: expect.objectContaining({ count: 0, mode: 'manual' }),
      }),
      expect.any(Object),
    );
  });

  it('preview endpoint returns matching personas for query criteria', async () => {
    const personas = [
      makePersona(1, { age: 34, province: '서울', district: '서울-성동구', occupation: '개발자' }),
      makePersona(2, { age: 38, province: '서울', district: '서울-마포구', occupation: '개발자' }),
      makePersona(3, { age: 41, province: '서울', district: '서울-용산구', occupation: '개발자' }),
    ];
    const insertedRows: Record<string, unknown>[] = [];
    installSupabase('studio', insertedRows);
    loadPersonasMock.mockResolvedValue(personas);

    const response = await previewGET(
      makeRequest('/api/personas/preview?region=서울&occupation=개발자&lifeStage=adult&count=3'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.personas).toHaveLength(3);
    expect(body.personas.every((persona: PersonaPreviewResponse) => persona.province === '서울')).toBe(true);
    expect(body.personas.every((persona: PersonaPreviewResponse) => persona.occupation === '개발자')).toBe(true);
    expect(body.source).toBe('bundled');
    expect(insertedRows).toHaveLength(0);
    expect(loadPersonas).toHaveBeenCalledWith({
      plan: 'studio',
      count: 3,
      criteria: { region: '서울', occupation: '개발자', ageRange: [30, 44] },
    });
  });
});

type PersonaPreviewResponse = {
  province: string;
  occupation: string;
};
