import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => vi.fn());
const supabaseMock = vi.hoisted(() => ({
  client: null as unknown,
}));
const recordAuditMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const rotateApiKeyServiceMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  createServerClient: () => supabaseMock.client,
}));
vi.mock('@/lib/api-keys', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-keys')>('@/lib/api-keys');
  return {
    ...actual,
    recordAudit: recordAuditMock,
    rotateApiKey: rotateApiKeyServiceMock,
  };
});

import {
  TRACK_2_KEY_CAP_PER_USER,
  createApiKey,
  revokeApiKey,
  rotateApiKey,
} from '../actions';

type SelectChain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function mockSupabase(handlers: { [table: string]: SelectChain }) {
  return {
    from(table: string) {
      const handler = handlers[table];
      if (!handler) {
        throw new Error(`unexpected table: ${table}`);
      }
      return handler;
    },
  };
}

function buildSelectCount(count: number, error: unknown = null) {
  return {
    eq: vi.fn().mockReturnValue({
      is: vi.fn().mockReturnValue(Promise.resolve({ count, error, data: null })),
    }),
  };
}

describe('createApiKey server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-42' } });
  });

  afterEach(() => {
    supabaseMock.client = null;
  });

  it('rejects when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const result = await createApiKey({ name: 'My key' });
    expect(result).toEqual({ ok: false, code: 'unauthorized' });
  });

  it('returns invalid_name when the name is blank', async () => {
    const result = await createApiKey({ name: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid_name');
    }
  });

  it('returns cap_reached when the user already holds 5 active keys', async () => {
    supabaseMock.client = mockSupabase({
      api_keys: {
        select: vi.fn().mockReturnValue(buildSelectCount(TRACK_2_KEY_CAP_PER_USER)),
        insert: vi.fn(),
        update: vi.fn(),
      },
    });
    const result = await createApiKey({ name: 'Sixth key' });
    expect(result).toEqual({ ok: false, code: 'cap_reached' });
  });

  it('inserts a new key and emits a created audit event under the cap', async () => {
    const insertSelect = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'key-row-1',
          prefix: 'sk_seizn_aa11bb22',
          name: 'My key',
          scopes: ['recall', 'remember', 'graph', 'search'],
          created_at: '2026-05-06T00:00:00.000Z',
        },
        error: null,
      }),
    });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    supabaseMock.client = mockSupabase({
      api_keys: {
        select: vi.fn().mockReturnValue(buildSelectCount(2)),
        insert,
        update: vi.fn(),
      },
    });

    const result = await createApiKey({ name: 'My key' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe('key-row-1');
      expect(result.prefix).toMatch(/^sk_seizn_/);
      expect(result.scopes).toContain('recall');
    }
    expect(insert).toHaveBeenCalledTimes(1);
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'created', userId: 'user-42' }),
    );
  });

  it('drops unknown scopes and falls back to defaults', async () => {
    const insertSelect = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'key-row-2',
          prefix: 'sk_seizn_cc33dd44',
          name: 'Scoped key',
          scopes: ['recall'],
          created_at: '2026-05-06T00:00:00.000Z',
        },
        error: null,
      }),
    });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    supabaseMock.client = mockSupabase({
      api_keys: {
        select: vi.fn().mockReturnValue(buildSelectCount(0)),
        insert,
        update: vi.fn(),
      },
    });

    await createApiKey({ name: 'Scoped key', scopes: ['drop-this', 'check'] });
    const insertedScopes = insert.mock.calls[0][0].scopes;
    expect(insertedScopes).toContain('check');
    expect(insertedScopes).not.toContain('drop-this');
  });
});

describe('revokeApiKey server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-42' } });
  });

  it('rejects without auth', async () => {
    authMock.mockResolvedValueOnce(null);
    const result = await revokeApiKey('key-1');
    expect(result).toEqual({ ok: false, code: 'unauthorized' });
  });

  it('returns not_found when the key is missing or already revoked', async () => {
    const updateChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };
    supabaseMock.client = mockSupabase({
      api_keys: {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn().mockReturnValue(updateChain),
      },
    });
    const result = await revokeApiKey('missing-key');
    expect(result).toEqual({ ok: false, code: 'not_found' });
  });

  it('records a revoked audit row when the update finds a row', async () => {
    const updateChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'key-9' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };
    supabaseMock.client = mockSupabase({
      api_keys: {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn().mockReturnValue(updateChain),
      },
    });
    const result = await revokeApiKey('key-9');
    expect(result).toEqual({ ok: true, id: 'key-9' });
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'revoked', apiKeyId: 'key-9' }),
    );
  });
});

describe('rotateApiKey server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-42' } });
  });

  it('returns not_found when the key does not exist', async () => {
    const selectChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };
    supabaseMock.client = mockSupabase({
      api_keys: {
        select: vi.fn().mockReturnValue(selectChain),
        insert: vi.fn(),
        update: vi.fn(),
      },
    });
    const result = await rotateApiKey('missing');
    expect(result).toEqual({ ok: false, code: 'not_found' });
  });

  it('delegates to the rotateApiKey service for an existing key', async () => {
    const selectChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'old-key', name: 'Old key', scopes: ['recall'] },
              error: null,
            }),
          }),
        }),
      }),
    };
    supabaseMock.client = mockSupabase({
      api_keys: {
        select: vi.fn().mockReturnValue(selectChain),
        insert: vi.fn(),
        update: vi.fn(),
      },
    });
    rotateApiKeyServiceMock.mockResolvedValue({
      id: 'new-key',
      key: 'sk_seizn_newnew_secret',
      prefix: 'sk_seizn_newnew',
      hash: 'hash',
      rotatedFromId: 'old-key',
    });

    const result = await rotateApiKey('old-key');
    expect(result).toEqual({
      ok: true,
      id: 'new-key',
      key: 'sk_seizn_newnew_secret',
      prefix: 'sk_seizn_newnew',
      rotatedFromId: 'old-key',
    });
    expect(rotateApiKeyServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ oldKeyId: 'old-key', userId: 'user-42' }),
    );
  });
});
