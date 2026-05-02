import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, GET, POST } from '@/app/api/account/byok/route';

const mocks = vi.hoisted(() => ({
  userId: 'author-user-1',
  serviceState: {
    enabled: false,
    provider: null as 'anthropic' | null,
    key_last_4: null as string | null,
    verified_at: null as string | null,
    status: 'missing' as 'active' | 'invalid' | 'missing',
  },
  byokStatus: {
    enabled: false,
    provider: null as 'anthropic' | null,
    status: 'missing' as 'active' | 'invalid' | 'missing',
  },
  saveAuthorByokKey: vi.fn(),
  applyDiscount: vi.fn(),
  removeDiscount: vi.fn(),
  providerKeyUpdates: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/author/ui', () => {
  class AuthorUiValidationError extends Error {}

  return {
    AuthorUiValidationError,
    readJsonBody: async (request: NextRequest) => {
      try {
        return await request.json();
      } catch {
        return {};
      }
    },
    withAuthorUiService: async (
      _request: NextRequest,
      handler: (service: unknown, userId: string) => Promise<unknown> | unknown
    ) => {
      const service = {
        getByok: () => mocks.serviceState,
        saveByok: (input: { provider?: string; api_key?: string }) => {
          mocks.serviceState = {
            enabled: true,
            provider: input.provider === 'anthropic' ? 'anthropic' : null,
            key_last_4: input.api_key?.slice(-4) ?? null,
            verified_at: '2026-05-03T00:00:00.000Z',
            status: 'active',
          };
        },
        clearByok: () => {
          mocks.serviceState = {
            enabled: false,
            provider: null,
            key_last_4: null,
            verified_at: null,
            status: 'missing',
          };
        },
      };
      return new Response(JSON.stringify(await handler(service, mocks.userId)), {
        headers: { 'content-type': 'application/json' },
      });
    },
  };
});

vi.mock('@/lib/author/llm', () => ({
  AuthorLlmError: class AuthorLlmError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status?: number
    ) {
      super(message);
    }
  },
  getAuthorByokStatus: async () => mocks.byokStatus,
  saveAuthorByokKey: mocks.saveAuthorByokKey,
}));

vi.mock('@/lib/supabase', () => ({
  hasServerSupabaseServiceRoleConfig: () => true,
  createServerClient: () => ({
    from: () => ({
      update: (values: Record<string, unknown>) => ({
        eq: (column: string, value: string) => {
          mocks.providerKeyUpdates.push({ column, value, values });
          return {
            eq: (nextColumn: string, nextValue: string) => {
              mocks.providerKeyUpdates.push({ column: nextColumn, value: nextValue });
              return {};
            },
          };
        },
      }),
    }),
  }),
}));

vi.mock('@/lib/stripe/byok-discount', () => ({
  applyAuthorByokDiscount: mocks.applyDiscount,
  removeAuthorByokDiscount: mocks.removeDiscount,
}));

describe('account BYOK route', () => {
  beforeEach(() => {
    mocks.serviceState = {
      enabled: false,
      provider: null,
      key_last_4: null,
      verified_at: null,
      status: 'missing',
    };
    mocks.byokStatus = { enabled: false, provider: null, status: 'missing' };
    mocks.saveAuthorByokKey.mockResolvedValue({
      enabled: true,
      provider: 'anthropic',
      key_last_4: '7890',
      status: 'active',
    });
    mocks.applyDiscount.mockResolvedValue({ status: 'applied', applied: true });
    mocks.removeDiscount.mockResolvedValue({ status: 'inactive', removed: true });
    mocks.providerKeyUpdates = [];
    vi.clearAllMocks();
  });

  it('returns the active DB BYOK status after POST saves a key', async () => {
    const post = await POST(makeRequest('POST', {
      provider: 'anthropic',
      api_key: 'sk-ant-test-7890',
    }));
    expect(post.status).toBe(200);
    await expect(post.json()).resolves.toMatchObject({
      enabled: true,
      status: 'active',
      byok_discount: { status: 'applied' },
    });

    mocks.byokStatus = { enabled: true, provider: 'anthropic', status: 'active' };
    const get = await GET(makeRequest('GET'));

    expect(get.status).toBe(200);
    await expect(get.json()).resolves.toMatchObject({
      enabled: true,
      provider: 'anthropic',
      status: 'active',
    });
  });

  it('clears DB and service BYOK state on DELETE so GET returns missing', async () => {
    await POST(makeRequest('POST', {
      provider: 'anthropic',
      api_key: 'sk-ant-test-7890',
    }));

    const deleted = await DELETE(makeRequest('DELETE'));
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toMatchObject({
      enabled: false,
      provider: null,
      status: 'missing',
      byok_discount: { status: 'inactive' },
    });
    expect(mocks.providerKeyUpdates).toContainEqual(expect.objectContaining({
      column: 'user_id',
      value: 'author-user-1',
    }));

    mocks.byokStatus = { enabled: false, provider: null, status: 'missing' };
    const get = await GET(makeRequest('GET'));
    await expect(get.json()).resolves.toMatchObject({
      enabled: false,
      provider: null,
      status: 'missing',
    });
  });

  it('blocks stale service fallback after POST then DELETE then GET', async () => {
    await POST(makeRequest('POST', {
      provider: 'anthropic',
      api_key: 'sk-ant-test-7890',
    }));
    expect(mocks.serviceState).toMatchObject({ enabled: true, status: 'active' });

    await DELETE(makeRequest('DELETE'));
    mocks.byokStatus = { enabled: false, provider: null, status: 'missing' };

    const get = await GET(makeRequest('GET'));
    const body = await get.json();

    expect(body).toMatchObject({
      enabled: false,
      provider: null,
      status: 'missing',
    });
    expect(JSON.stringify(body)).not.toContain('7890');
  });
});

function makeRequest(method: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest('https://app.seizn.test/api/account/byok', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
