import { beforeEach, describe, expect, it, vi } from 'vitest';

const logAuditEventMock = vi.fn(async () => 'audit-1');
const logTamperEvidentEventMock = vi.fn(async () => ({ id: 'tamper-1' }));

vi.mock('@/lib/audit/logger', () => ({
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/audit/tamper-evident', async () => {
  const crypto = await vi.importActual<typeof import('crypto')>('crypto');
  return {
    sha256: (value: string) => crypto.createHash('sha256').update(value).digest('hex'),
    logTamperEvidentEvent: logTamperEvidentEventMock,
  };
});

function createDsrDeleteSupabase() {
  const memories = [
    {
      id: 'memory-1',
      organization_id: 'org-1',
      subject_id: 'player-1',
      content: 'remembered detail',
      encrypted_content: 'ciphertext',
      created_at: '2026-04-01T00:00:00.000Z',
    },
  ];
  const interactions = [
    {
      id: 'trace-1',
      organization_id: 'org-1',
      subject_id: 'player-1',
      trace: { subject_id: 'player-1' },
      created_at: '2026-04-01T00:00:00.000Z',
    },
  ];
  const updates: unknown[] = [];
  const inserts: unknown[] = [];

  const selectQuery = (rows: unknown[]) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: async () => ({ data: rows, error: null }),
    };
    return query;
  };

  const updateQuery = {
    eq: () => updateQuery,
    in: async () => ({ data: null, error: null }),
  };

  return {
    updates,
    inserts,
    client: {
      from: (table: string) => ({
        select: () => selectQuery(table === 'memories' ? memories : interactions),
        update: (payload: unknown) => {
          updates.push(payload);
          return updateQuery;
        },
        insert: async (payload: unknown) => {
          inserts.push(payload);
          return { data: null, error: null };
        },
      }),
    } as never,
  };
}

describe('DSR deletion', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('zeroes encrypted content and returns a verifiable deletion certificate', async () => {
    const { createDsrDeletion, verifyComplianceSignature } = await import('@/lib/compliance/dsr');
    const supabase = createDsrDeleteSupabase();

    const result = await createDsrDeletion(supabase.client, {
      actor: {
        userId: 'user-1',
        keyId: 'key-1',
        organizationId: 'org-1',
      },
      subjectId: 'player-1',
      reason: 'GDPR Article 17 request',
    });

    expect(result.status).toBe('completed');
    expect(result.certificate.affected.memories).toBe(1);
    expect(result.certificate.affected.interactions).toBe(1);
    expect(result.certificate.content_zeroed).toBe(true);
    expect(supabase.updates[0]).toMatchObject({
      content: '[deleted-by-dsr]',
      encrypted_content: '0'.repeat(128),
      embedding: null,
      is_deleted: true,
    });
    expect(supabase.inserts).toHaveLength(1);
    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(logTamperEvidentEventMock).toHaveBeenCalledTimes(1);

    const { signature, ...unsigned } = result.certificate;
    expect(verifyComplianceSignature(unsigned, signature)).toBe(true);
  });
});
