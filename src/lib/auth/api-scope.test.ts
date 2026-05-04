import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const validateApiKeyMock = vi.hoisted(() => vi.fn());

vi.mock('./api-key', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api-key')>();
  return {
    ...actual,
    validateApiKey: validateApiKeyMock,
  };
});

import { requireApiScope } from './api-scope';

function makeRequest(): NextRequest {
  return new NextRequest('https://test.seizn.com/api/v1/graph', {
    headers: {
      authorization: 'Bearer szn_test_key_value_long_enough_for_validation',
    },
  });
}

describe('requireApiScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when API key validation fails', async () => {
    validateApiKeyMock.mockResolvedValue({ valid: false, error: 'Invalid key' });

    const result = await requireApiScope(makeRequest(), 'graph:read');

    expect(result.response?.status).toBe(401);
    expect(await result.response?.json()).toEqual({
      error: 'Unauthorized',
      message: 'Invalid key',
    });
  });

  it('returns 403 when a valid key lacks the required namespace scope', async () => {
    validateApiKeyMock.mockResolvedValue({
      valid: true,
      userId: 'user-1',
      organizationId: 'org-1',
      scopes: ['memory:read'],
      keyId: 'key-1',
      plan: 'pro',
    });

    const result = await requireApiScope(makeRequest(), 'graph:read');

    expect(result.response?.status).toBe(403);
    expect(await result.response?.json()).toEqual({
      error: 'Forbidden',
      message: 'Requires graph:read scope',
    });
  });

  it('returns auth when the key has a matching namespace wildcard', async () => {
    validateApiKeyMock.mockResolvedValue({
      valid: true,
      userId: 'user-1',
      organizationId: 'org-1',
      scopes: ['fall:*'],
      keyId: 'key-1',
      plan: 'pro',
    });

    const result = await requireApiScope(makeRequest(), 'fall:delete');

    expect(result.response).toBeUndefined();
    expect(result.auth?.organizationId).toBe('org-1');
  });
});
