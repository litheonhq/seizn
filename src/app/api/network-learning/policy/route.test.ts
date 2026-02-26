import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authenticateRequestMock = vi.fn();
const isAuthErrorMock = vi.fn();
const authErrorResponseMock = vi.fn();
const createServerClientMock = vi.fn();

const getPolicyUpdatesMock = vi.fn();
const getPolicyUpdateCountMock = vi.fn();
const approvePolicyUpdateMock = vi.fn();
const rejectPolicyUpdateMock = vi.fn();
const applyPolicyUpdateMock = vi.fn();
const generatePolicyRecommendationsMock = vi.fn();
const createPolicyUpdateMock = vi.fn();
const createABTestConfigMock = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: authenticateRequestMock,
  isAuthError: isAuthErrorMock,
  authErrorResponse: authErrorResponseMock,
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: createServerClientMock,
}));

vi.mock('@/lib/network-learning', () => ({
  getPolicyUpdates: getPolicyUpdatesMock,
  getPolicyUpdateCount: getPolicyUpdateCountMock,
  approvePolicyUpdate: approvePolicyUpdateMock,
  rejectPolicyUpdate: rejectPolicyUpdateMock,
  applyPolicyUpdate: applyPolicyUpdateMock,
  generatePolicyRecommendations: generatePolicyRecommendationsMock,
  createPolicyUpdate: createPolicyUpdateMock,
  createABTestConfig: createABTestConfigMock,
}));

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'https://test.seizn.com'), options);
}

function buildAccessClient(options: {
  keyData: unknown;
  keyError?: unknown;
  membershipData?: unknown;
  membershipError?: unknown;
}) {
  const apiKeysTable = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: options.keyData,
            error: options.keyError ?? null,
          }),
        }),
      }),
    }),
  };

  const orgMembersTable = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: options.membershipData ?? null,
            error: options.membershipError ?? null,
          }),
        }),
      }),
    }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'api_keys') return apiKeysTable;
      if (table === 'org_members') return orgMembersTable;
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe('Network Learning Policy Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRequestMock.mockResolvedValue({
      userId: 'user_1',
      keyId: 'key_1',
      plan: 'pro',
    });
    isAuthErrorMock.mockReturnValue(false);
    authErrorResponseMock.mockReturnValue(new Response(null, { status: 401 }));
    createABTestConfigMock.mockReturnValue({ experimentName: 'exp', trafficPercentage: 10 });
  });

  it('GET returns 403 when key lacks read scope', async () => {
    createServerClientMock.mockReturnValue(
      buildAccessClient({
        keyData: {
          id: 'key_1',
          user_id: 'user_1',
          org_id: null,
          scopes: ['memory:read'],
        },
      })
    );

    const { GET } = await import('./route');
    const response = await GET(makeRequest('/api/network-learning/policy'));

    expect(response.status).toBe(403);
  });

  it('GET returns exact counts from count queries', async () => {
    createServerClientMock.mockReturnValue(
      buildAccessClient({
        keyData: {
          id: 'key_1',
          user_id: 'user_1',
          org_id: null,
          scopes: ['network-learning:policy:read'],
        },
      })
    );
    getPolicyUpdatesMock.mockResolvedValue([{ id: 'pu_1' }]);
    getPolicyUpdateCountMock.mockResolvedValueOnce(7).mockResolvedValueOnce(13);

    const { GET } = await import('./route');
    const response = await GET(makeRequest('/api/network-learning/policy?status=pending&limit=10'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pendingCount).toBe(7);
    expect(body.appliedCount).toBe(13);
    expect(getPolicyUpdateCountMock).toHaveBeenNthCalledWith(1, 'pending');
    expect(getPolicyUpdateCountMock).toHaveBeenNthCalledWith(2, 'applied');
  });

  it('POST returns 403 when org member is not admin/owner', async () => {
    createServerClientMock.mockReturnValue(
      buildAccessClient({
        keyData: {
          id: 'key_1',
          user_id: 'user_1',
          org_id: 'org_1',
          scopes: ['network-learning:policy:write'],
        },
        membershipData: { role: 'member' },
      })
    );

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest('/api/network-learning/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', updateId: 'pu_1' }),
      })
    );

    expect(response.status).toBe(403);
  });

  it('POST approve returns 409 when update is already processed', async () => {
    createServerClientMock.mockReturnValue(
      buildAccessClient({
        keyData: {
          id: 'key_1',
          user_id: 'user_1',
          org_id: null,
          scopes: ['network-learning:policy:write'],
        },
      })
    );
    approvePolicyUpdateMock.mockRejectedValue(new Error('Policy update is already applied'));

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest('/api/network-learning/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', updateId: 'pu_1' }),
      })
    );

    expect(response.status).toBe(409);
  });

  it('POST apply returns 409 when current status is not approved', async () => {
    createServerClientMock.mockReturnValue(
      buildAccessClient({
        keyData: {
          id: 'key_1',
          user_id: 'user_1',
          org_id: null,
          scopes: ['network-learning:policy:write'],
        },
      })
    );
    applyPolicyUpdateMock.mockRejectedValue(
      new Error('Policy update must be approved before applying (current status: pending)')
    );

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest('/api/network-learning/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', updateId: 'pu_1' }),
      })
    );

    expect(response.status).toBe(409);
  });
});
