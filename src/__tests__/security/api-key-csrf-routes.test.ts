import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createLegacyKey, DELETE as deleteLegacyKey } from '@/app/api/keys/route';
import { POST as createDashboardKey, DELETE as deleteDashboardKey } from '@/app/api/dashboard/keys/route';
import { POST as rotateDashboardKey } from '@/app/api/dashboard/keys/rotate/route';
import { POST as createScopedKey } from '@/app/api/dashboard/keys/scoped/route';
import { PATCH as updateScopedKey, DELETE as deleteScopedKey } from '@/app/api/dashboard/keys/scoped/[id]/route';
import { POST as rotateScopedKey } from '@/app/api/dashboard/keys/scoped/[id]/rotate/route';
import { POST as testByokKey } from '@/app/api/onboarding/byok/test/route';
import { POST as createToolToken } from '@/app/api/tool-tokens/route';
import { DELETE as deleteToolToken } from '@/app/api/tool-tokens/[id]/route';
import { DELETE as disconnectConnector } from '@/app/api/connectors/[type]/status/route';
import { POST as enableScim, PUT as updateScim, DELETE as disableScim } from '@/app/api/organizations/[orgId]/scim/route';
import { POST as rotateScimToken } from '@/app/api/organizations/[orgId]/scim/token/route';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/api/request-user', () => ({
  getRequestUser: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkIpRateLimitAsync: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  logServerError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
  hasServerSupabaseServiceRoleConfig: vi.fn(() => false),
}));

vi.mock('@/lib/audit', () => ({
  AuditActions: {
    API_KEY_CREATE: 'api_key_create',
    API_KEY_REVOKE: 'api_key_revoke',
  },
  getAuditContext: vi.fn(() => ({})),
  logAuditEvent: vi.fn(),
}));

describe('sensitive cookie-authenticated key routes', () => {
  it('rejects legacy API key creation without CSRF token before authentication work', async () => {
    const response = await createLegacyKey(jsonRequest('https://www.seizn.com/api/keys'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'CSRF validation failed: token mismatch',
    });
  });

  it('rejects legacy API key revocation without CSRF token before authentication work', async () => {
    const response = await deleteLegacyKey(new NextRequest('https://www.seizn.com/api/keys?id=00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
    }));

    expect(response.status).toBe(403);
  });

  it('rejects scoped key mutations without CSRF token before authentication work', async () => {
    const params = { params: Promise.resolve({ id: 'scoped-key-1' }) };
    const responses = await Promise.all([
      createScopedKey(jsonRequest('https://www.seizn.com/api/dashboard/keys/scoped')),
      updateScopedKey(jsonRequest('https://www.seizn.com/api/dashboard/keys/scoped/scoped-key-1', 'PATCH'), params),
      deleteScopedKey(new NextRequest('https://www.seizn.com/api/dashboard/keys/scoped/scoped-key-1', {
        method: 'DELETE',
      }), params),
      rotateScopedKey(jsonRequest('https://www.seizn.com/api/dashboard/keys/scoped/scoped-key-1/rotate'), params),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
    }
  });

  it('rejects dashboard API key mutations without CSRF token before authentication work', async () => {
    const responses = await Promise.all([
      createDashboardKey(jsonRequest('https://www.seizn.com/api/dashboard/keys')),
      deleteDashboardKey(new NextRequest('https://www.seizn.com/api/dashboard/keys?id=dashboard-key-1', {
        method: 'DELETE',
      })),
      rotateDashboardKey(jsonRequest('https://www.seizn.com/api/dashboard/keys/rotate')),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
    }
  });

  it('rejects BYOK test calls without CSRF token before outbound provider checks', async () => {
    const response = await testByokKey(jsonRequest('https://www.seizn.com/api/onboarding/byok/test'));

    expect(response.status).toBe(403);
  });

  it('rejects token and integration management mutations without CSRF token', async () => {
    const tokenParams = { params: Promise.resolve({ id: 'tool-token-1' }) };
    const connectorParams = { params: Promise.resolve({ type: 'github' }) };
    const scimParams = { params: Promise.resolve({ orgId: 'org-1' }) };
    const responses = await Promise.all([
      createToolToken(jsonRequest('https://www.seizn.com/api/tool-tokens')),
      deleteToolToken(new NextRequest('https://www.seizn.com/api/tool-tokens/tool-token-1', {
        method: 'DELETE',
      }), tokenParams),
      disconnectConnector(new NextRequest('https://www.seizn.com/api/connectors/github/status?connectionId=conn-1', {
        method: 'DELETE',
      }), connectorParams),
      enableScim(jsonRequest('https://www.seizn.com/api/organizations/org-1/scim'), scimParams),
      updateScim(jsonRequest('https://www.seizn.com/api/organizations/org-1/scim', 'PUT'), scimParams),
      disableScim(new NextRequest('https://www.seizn.com/api/organizations/org-1/scim', {
        method: 'DELETE',
      }), scimParams),
      rotateScimToken(jsonRequest('https://www.seizn.com/api/organizations/org-1/scim/token'), scimParams),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
    }
  });
});

function jsonRequest(url: string, method = 'POST'): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'test', provider: 'openai', api_key: 'sk-testkeyvaluekeyvaluekeyvalue' }),
  });
}
