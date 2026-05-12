import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, GET, POST } from '@/app/api/account/byok/route';

const mocks = vi.hoisted(() => ({
  userId: 'author-user-1',
  byokProviders: ['anthropic', 'openai', 'google'] as readonly string[],
  serviceState: {
    enabled: false,
    provider: null as 'anthropic' | 'openai' | 'google' | null,
    key_last_4: null as string | null,
    verified_at: null as string | null,
    status: 'missing' as 'active' | 'invalid' | 'missing',
  },
  byokStatus: {
    enabled: false,
    provider: null as 'anthropic' | 'openai' | 'google' | null,
    status: 'missing' as 'active' | 'invalid' | 'missing',
  },
  saveAuthorByokKey: vi.fn(),
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
          const provider = input.provider && mocks.byokProviders.includes(input.provider)
            ? input.provider as 'anthropic' | 'openai' | 'google'
            : null;
          mocks.serviceState = {
            enabled: true,
            provider,
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
  BYOK_PROVIDERS: mocks.byokProviders,
  isByokProvider: (value: unknown) =>
    typeof value === 'string' && mocks.byokProviders.includes(value),
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

vi.mock('@/lib/analytics/funnel', () => ({
  recordFirstFunnelEvent: vi.fn(async () => undefined),
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

  it('saves an OpenAI BYOK key when provider=openai is sent in body', async () => {
    mocks.saveAuthorByokKey.mockResolvedValueOnce({
      enabled: true,
      provider: 'openai',
      key_last_4: 'abcd',
      status: 'active',
    });
    const post = await POST(makeRequest('POST', {
      provider: 'openai',
      api_key: 'sk-test-openai-key-abcd',
    }));
    expect(post.status).toBe(200);
    expect(mocks.saveAuthorByokKey).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', apiKey: 'sk-test-openai-key-abcd' }),
    );
    await expect(post.json()).resolves.toMatchObject({
      provider: 'openai',
      key_last_4: 'abcd',
    });
  });

  it('DELETE ?provider=openai targets the openai keys, leaving anthropic intact', async () => {
    // Other-provider check (anthropic) returns active → service NOT cleared
    mocks.byokStatus = { enabled: true, provider: 'anthropic', status: 'active' };
    const deleted = await DELETE(
      new NextRequest('https://app.seizn.test/api/account/byok?provider=openai', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(deleted.status).toBe(200);
    expect(mocks.providerKeyUpdates).toContainEqual(expect.objectContaining({
      column: 'provider',
      value: 'openai',
    }));
    await expect(deleted.json()).resolves.toMatchObject({
      enabled: true,
      provider: 'anthropic',
    });
  });

  it('GET ?provider=openai forwards the provider override to getAuthorByokStatus', async () => {
    mocks.byokStatus = { enabled: true, provider: 'openai', status: 'active' };
    const get = await GET(
      new NextRequest('https://app.seizn.test/api/account/byok?provider=openai', {
        method: 'GET',
      }),
    );
    expect(get.status).toBe(200);
    await expect(get.json()).resolves.toMatchObject({
      enabled: true,
      provider: 'openai',
      status: 'active',
    });
  });
});

function makeRequest(method: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest('https://app.seizn.test/api/account/byok', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
