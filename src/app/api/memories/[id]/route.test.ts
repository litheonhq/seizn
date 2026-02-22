import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const authenticateRequestMock = vi.fn();
const authErrorResponseMock = vi.fn(() => new Response('unauthorized', { status: 401 }));
const getRequestUserMock = vi.fn();
const createServerClientMock = vi.fn();
const createEmbeddingMock = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: authenticateRequestMock,
  isAuthError: (result: unknown) =>
    Boolean(result && typeof result === 'object' && 'authError' in (result as Record<string, unknown>)),
  authErrorResponse: authErrorResponseMock,
}));

vi.mock('@/lib/api/request-user', () => ({
  getRequestUser: getRequestUserMock,
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: createServerClientMock,
}));

vi.mock('@/lib/ai', () => ({
  createEmbedding: createEmbeddingMock,
}));

vi.mock('@/lib/audit', () => ({
  logMemoryAccess: vi.fn().mockResolvedValue(undefined),
}));

type MemoryRow = {
  id: string;
  is_encrypted?: boolean;
};

type UpdateError = { code?: string | null; message?: string | null } | null;

function makeRequest(
  body: Record<string, unknown>,
  options?: { headers?: Record<string, string>; includeApiKey?: boolean }
): NextRequest {
  const includeApiKey = options?.includeApiKey !== false;
  const request = new Request('http://localhost/api/memories/mem-1', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(includeApiKey ? { 'x-api-key': 'szn_test_key_1234567890' } : {}),
      ...(options?.headers || {}),
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest & {
    cookies?: { get: (name: string) => { value: string } | undefined };
  };

  const cookieHeader =
    options?.headers?.cookie ??
    options?.headers?.Cookie ??
    '';
  const cookieMap = new Map<string, string>();
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (!name || rest.length === 0) continue;
    cookieMap.set(name, rest.join('='));
  }
  request.cookies = {
    get: (name: string) => {
      const value = cookieMap.get(name);
      return value === undefined ? undefined : { value };
    },
  };

  return request as NextRequest;
}

function mockMemoriesTable(args: {
  existing: MemoryRow | null;
  existingError?: UpdateError;
  updated: Record<string, unknown> | null;
  updateError?: UpdateError;
}) {
  const existingSingle = vi.fn().mockResolvedValue({
    data: args.existing,
    error: args.existingError || null,
  });
  const existingEq3 = vi.fn(() => ({ single: existingSingle }));
  const existingEq2 = vi.fn(() => ({ eq: existingEq3 }));
  const existingEq1 = vi.fn(() => ({ eq: existingEq2 }));
  const select = vi.fn(() => ({ eq: existingEq1 }));

  const updateSingle = vi.fn().mockResolvedValue({
    data: args.updated,
    error: args.updateError || null,
  });
  const updateSelect = vi.fn(() => ({ single: updateSingle }));
  const updateEq3 = vi.fn(() => ({ select: updateSelect }));
  const updateEq2 = vi.fn(() => ({ eq: updateEq3 }));
  const updateEq1 = vi.fn(() => ({ eq: updateEq2 }));
  const update = vi.fn(() => ({ eq: updateEq1 }));

  const from = vi.fn((table: string) => {
    if (table === 'memories') {
      return { select, update };
    }
    return { select: vi.fn(), update: vi.fn() };
  });

  createServerClientMock.mockReturnValue({ from });

  return { update };
}

describe('PATCH /api/memories/[id] validation and error mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequestMock.mockResolvedValue({
      userId: 'user-1',
      keyId: 'key-1',
      plan: 'pro',
      rateLimitHeaders: {},
    });
    getRequestUserMock.mockResolvedValue(null);
    createEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it('rejects when content and encrypted_content are provided together', async () => {
    mockMemoriesTable({
      existing: { id: 'mem-1', is_encrypted: false },
      updated: null,
    });

    const { PATCH } = await import('./route');
    const response = await PATCH(makeRequest({
      content: 'plain',
      encrypted_content: 'ciphertext',
    }), { params: Promise.resolve({ id: 'mem-1' }) });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('cannot be provided together');
  });

  it('rejects cross-site PATCH requests for session-authenticated calls', async () => {
    const mocked = mockMemoriesTable({
      existing: { id: 'mem-1', is_encrypted: false },
      updated: null,
    });

    const { PATCH } = await import('./route');
    const response = await PATCH(makeRequest({
      importance: 8,
    }, {
      headers: { origin: 'https://evil.example' },
      includeApiKey: false,
    }), { params: Promise.resolve({ id: 'mem-1' }) });

    expect(response.status).toBe(403);
    expect(mocked.update).not.toHaveBeenCalled();
  });

  it('rejects same-origin session PATCH requests without csrf token in strict mode', async () => {
    const mocked = mockMemoriesTable({
      existing: { id: 'mem-1', is_encrypted: false },
      updated: null,
    });

    const { PATCH } = await import('./route');
    const response = await PATCH(makeRequest({
      importance: 8,
    }, {
      headers: { origin: 'http://localhost:3000' },
      includeApiKey: false,
    }), { params: Promise.resolve({ id: 'mem-1' }) });

    expect(response.status).toBe(403);
    expect(mocked.update).not.toHaveBeenCalled();
  });

  it('rejects plaintext update for encrypted memory unless is_encrypted=false is explicit', async () => {
    mockMemoriesTable({
      existing: { id: 'mem-1', is_encrypted: true },
      updated: null,
    });

    const { PATCH } = await import('./route');
    const response = await PATCH(makeRequest({
      content: 'new plain text',
    }), { params: Promise.resolve({ id: 'mem-1' }) });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('set is_encrypted=false');
  });

  it('maps PostgREST no-row update error (PGRST116) to 404', async () => {
    mockMemoriesTable({
      existing: { id: 'mem-1', is_encrypted: false },
      updated: null,
      updateError: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });

    const { PATCH } = await import('./route');
    const response = await PATCH(makeRequest({
      importance: 8,
    }), { params: Promise.resolve({ id: 'mem-1' }) });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toContain('Memory not found');
  });

  it('maps non-row existing-memory lookup errors to 500', async () => {
    mockMemoriesTable({
      existing: null,
      existingError: { code: '08006', message: 'connection failure' },
      updated: null,
    });

    const { PATCH } = await import('./route');
    const response = await PATCH(makeRequest({
      importance: 8,
    }), { params: Promise.resolve({ id: 'mem-1' }) });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toContain('database error');
  });

  it('maps non-row database errors to 500', async () => {
    mockMemoriesTable({
      existing: { id: 'mem-1', is_encrypted: false },
      updated: null,
      updateError: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    const { PATCH } = await import('./route');
    const response = await PATCH(makeRequest({
      importance: 8,
    }), { params: Promise.resolve({ id: 'mem-1' }) });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toContain('database error');
  });

  it('deduplicates tags and accepts companion_meta updates', async () => {
    const mocked = mockMemoriesTable({
      existing: { id: 'mem-1', is_encrypted: false },
      updated: {
        id: 'mem-1',
        tags: ['alpha', 'beta'],
        companion_meta: { character_subtype: '4w5' },
      },
    });

    const { PATCH } = await import('./route');
    const response = await PATCH(makeRequest({
      tags: ['alpha', 'alpha', 'beta'],
      companion_meta: { character_subtype: '4w5' },
      importance: 7,
    }), { params: Promise.resolve({ id: 'mem-1' }) });

    expect(response.status).toBe(200);
    expect(mocked.update).toHaveBeenCalledTimes(1);

    const payload = mocked.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.tags).toEqual(['alpha', 'beta']);
    expect(payload.companion_meta).toEqual({ character_subtype: '4w5' });
  });
});
