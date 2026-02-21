import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const executeMock = vi.fn();
const fromHeadersMock = vi.fn(() => ({ traceId: 'trace-1', spanId: 'span-1' }));
const authenticateRequestMock = vi.fn();
const authErrorResponseMock = vi.fn(() => new Response('unauthorized', { status: 401 }));
const createServerClientMock = vi.fn();

vi.mock('@/lib/gateway', () => ({
  GatewayProxy: class GatewayProxyMock {
    execute = executeMock;
  },
  TraceInjector: {
    fromHeaders: fromHeadersMock,
  },
}));

vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: authenticateRequestMock,
  isAuthError: (result: unknown) => Boolean(result && typeof result === 'object' && 'authError' in (result as Record<string, unknown>)),
  authErrorResponse: authErrorResponseMock,
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: createServerClientMock,
}));

function makeRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/gateway/proxy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function setKeyData(keyData: { org_id: string | null; scopes: string[] } | null): void {
  const single = vi.fn().mockResolvedValue({ data: keyData, error: null });
  const secondEq = vi.fn(() => ({ single }));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const select = vi.fn(() => ({ eq: firstEq }));
  const from = vi.fn(() => ({ select }));

  createServerClientMock.mockReturnValue({ from });
}

describe('POST /api/gateway/proxy auth and tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequestMock.mockResolvedValue({
      userId: 'user-1',
      keyId: 'key-1',
      plan: 'pro',
      rateLimitHeaders: { 'x-ratelimit-remaining': '99' },
    });

    executeMock.mockResolvedValue({
      success: true,
      traceId: 'trace-1',
      spanId: 'span-1',
      latencyMs: 12,
      providerLatencyMs: 10,
      provider: 'pgvector',
      operation: 'health',
      timestamp: new Date().toISOString(),
      data: { status: 'ok' },
    });
  });

  it('rejects api keys without gateway:proxy scope', async () => {
    setKeyData({ org_id: 'org-1', scopes: ['memories:read'] });
    const { POST } = await import('./route');

    const response = await POST(makeRequest({
      operation: 'health',
      provider: 'pgvector',
      config: { host: 'https://db.example.com:5432' },
      payload: {},
    }));

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error.code).toBe('AUTH_FORBIDDEN_SCOPE');
  });

  it('rejects tenant mismatch between request and api key org', async () => {
    setKeyData({ org_id: 'org-1', scopes: ['gateway:proxy'] });
    const { POST } = await import('./route');

    const response = await POST(makeRequest({
      operation: 'health',
      provider: 'pgvector',
      config: { host: 'https://db.example.com:5432', orgId: 'org-2' },
      payload: {},
    }));

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error.code).toBe('TENANT_MISMATCH');
  });

  it('blocks raw config apiKey unless raw-config scope exists', async () => {
    setKeyData({ org_id: 'org-1', scopes: ['gateway:proxy'] });
    const { POST } = await import('./route');

    const response = await POST(makeRequest({
      operation: 'health',
      provider: 'pgvector',
      config: { host: 'https://db.example.com:5432', apiKey: 'secret-value', orgId: 'org-1' },
      payload: {},
    }));

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error.code).toBe('FORBIDDEN_RAW_CONFIG');
  });

  it('allows valid scoped key and executes proxy request', async () => {
    setKeyData({ org_id: 'org-1', scopes: ['gateway:proxy', 'gateway:proxy:raw-config'] });
    const { POST } = await import('./route');

    const response = await POST(makeRequest({
      operation: 'health',
      provider: 'pgvector',
      config: { host: 'https://db.example.com:5432', orgId: 'org-1' },
      payload: {},
    }));

    expect(response.status).toBe(200);
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get('x-ratelimit-remaining')).toBe('99');
  });

  it('rejects unsafe private target hosts', async () => {
    setKeyData({ org_id: 'org-1', scopes: ['gateway:proxy'] });
    const { POST } = await import('./route');

    const response = await POST(makeRequest({
      operation: 'health',
      provider: 'pgvector',
      config: { host: 'http://localhost:5432', orgId: 'org-1' },
      payload: {},
    }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe('UNSAFE_TARGET_URL');
  });

  it('rejects malformed pgvector connection strings', async () => {
    setKeyData({ org_id: 'org-1', scopes: ['gateway:proxy'] });
    const { POST } = await import('./route');

    const response = await POST(makeRequest({
      operation: 'health',
      provider: 'pgvector',
      config: { connectionString: 'not-a-valid-url', orgId: 'org-1' },
      payload: {},
    }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe('UNSAFE_TARGET_URL');
  });
});
