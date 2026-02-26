import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const validateApiKeyMock = vi.fn();
const createServerClientMock = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  validateApiKey: validateApiKeyMock,
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: createServerClientMock,
}));

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'https://test.seizn.com'), options);
}

function createBuilder(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const builder: {
    data?: unknown;
    error?: unknown;
    count?: number | null;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    lte: ReturnType<typeof vi.fn>;
  } = {
    ...result,
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
  };

  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.range.mockReturnValue(builder);
  builder.gte.mockReturnValue(builder);
  builder.lte.mockReturnValue(builder);
  return builder;
}

describe('Security Audit API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when API key validation fails', async () => {
    validateApiKeyMock.mockResolvedValue(null);

    const { GET } = await import('./route');
    const response = await GET(makeRequest('/api/security/audit'));

    expect(response.status).toBe(401);
  });

  it('GET returns 500 when audit log query fails', async () => {
    validateApiKeyMock.mockResolvedValue({
      success: true,
      orgId: 'org-1',
      userId: 'user-1',
    });

    const queryBuilder = createBuilder({
      data: null,
      count: null,
      error: { message: 'relation "audit_logs" does not exist' },
    });

    const select = vi.fn(() => queryBuilder);
    const from = vi.fn(() => ({ select }));
    createServerClientMock.mockReturnValue({ from });

    const { GET } = await import('./route');
    const response = await GET(makeRequest('/api/security/audit?limit=10&offset=0'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error?.error_code).toBe('INTERNAL_ERROR');
  });

  it('POST returns 500 when insert fails', async () => {
    validateApiKeyMock.mockResolvedValue({
      success: true,
      orgId: 'org-1',
      userId: 'user-1',
    });

    const insert = vi.fn().mockResolvedValue({
      error: { message: 'insert failed' },
    });
    const from = vi.fn(() => ({ insert }));
    createServerClientMock.mockReturnValue({ from });

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest('/api/security/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test.action' }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error?.error_code).toBe('INTERNAL_ERROR');
  });
});

