import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  createServerClient: createServerClientMock,
}));

import { hasApiScope, validateApiKey } from './api-key';

function makeRequest(): NextRequest {
  return new NextRequest('https://test.seizn.com/api/v1/graph', {
    headers: {
      authorization: 'Bearer szn_test_key_value_long_enough_for_validation',
    },
  });
}

function makeSupabase(responses: Record<string, { single?: unknown; maybeSingle?: unknown }>) {
  const from = vi.fn((table: string) => {
    const response = responses[table] ?? {};
    const builder: {
      select: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      single: ReturnType<typeof vi.fn>;
      maybeSingle: ReturnType<typeof vi.fn>;
    } = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    };

    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.single.mockResolvedValue(response.single ?? { data: null, error: null });
    builder.maybeSingle.mockResolvedValue(response.maybeSingle ?? response.single ?? { data: null, error: null });
    return builder;
  });

  return { from };
}

describe('API key authorization hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches exact, namespace wildcard, and admin scopes', () => {
    expect(hasApiScope(['graph:read'], 'graph:read')).toBe(true);
    expect(hasApiScope(['graph:*'], 'graph:delete')).toBe(true);
    expect(hasApiScope(['admin'], 'fall:delete')).toBe(true);
    expect(hasApiScope(['memory:write'], 'graph:write')).toBe(false);
  });

  it('rejects an organization id attached to a user-level API key scope', async () => {
    createServerClientMock.mockReturnValue(
      makeSupabase({
        api_keys: {
          single: {
            data: {
              id: 'key-1',
              user_id: 'user-1',
              scopes: ['graph:read'],
              expires_at: null,
              organization_id: 'org-attacker-selected',
              scope_config: { level: 'user', actions: ['read'] },
            },
            error: null,
          },
        },
        profiles: {
          single: {
            data: { plan: 'pro', organization_id: 'org-owned' },
            error: null,
          },
        },
      })
    );

    const result = await validateApiKey(makeRequest());

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('inconsistent');
    }
  });

  it('rejects an organization-scoped key when the owner is not a member', async () => {
    createServerClientMock.mockReturnValue(
      makeSupabase({
        api_keys: {
          single: {
            data: {
              id: 'key-1',
              user_id: 'user-1',
              scopes: ['graph:read'],
              expires_at: null,
              organization_id: 'org-2',
              scope_config: { level: 'organization', organizationId: 'org-2', actions: ['read'] },
            },
            error: null,
          },
        },
        profiles: {
          single: {
            data: { plan: 'pro', organization_id: 'org-1' },
            error: null,
          },
        },
        organization_members: {
          maybeSingle: { data: null, error: null },
        },
      })
    );

    const result = await validateApiKey(makeRequest());

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('not authorized');
    }
  });
});
