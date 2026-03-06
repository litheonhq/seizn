import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';
import { POST } from '@/app/api/auth/device/approve/route';

vi.mock('@/lib/api/request-user', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  logServerError: vi.fn(),
}));

vi.mock('@/lib/api-key', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-key')>('@/lib/api-key');
  return {
    ...actual,
    generateApiKey: vi.fn(() => ({
      key: 'szn_generated_key',
      hash: 'hash-value',
      prefix: 'szn_prefix_1',
    })),
  };
});

describe('device approve route', () => {
  let insertedApiKeyPayload: Record<string, unknown> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    insertedApiKeyPayload = null;

    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'profile-1',
      email: 'user@example.com',
      name: 'User One',
      lastSignInAt: null,
    });

    const deviceCodesBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'code-1',
          status: 'pending',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        error: null,
      }),
      update: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    const apiKeysBuilder = {
      insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        insertedApiKeyPayload = payload;
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'api-key-1' },
              error: null,
            }),
          }),
        };
      }),
    };

    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'device_auth_codes') {
          return deviceCodesBuilder;
        }

        if (table === 'api_keys') {
          return apiKeysBuilder;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it('creates device API keys with scopes instead of permissions', async () => {
    const request = new NextRequest('https://example.com/api/auth/device/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user_code: 'ABCD-1234',
        action: 'approve',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'approved' });
    expect(insertedApiKeyPayload).toMatchObject({
      user_id: 'profile-1',
      name: 'MCP Device (ABCD-1234)',
      scopes: ['memory:read', 'memory:write', 'memory:delete'],
      scope_config: {
        level: 'user',
        actions: ['read', 'write'],
        customPermissions: ['memory:delete'],
      },
      metadata: {
        source: 'device_auth',
        device_user_code: 'ABCD-1234',
      },
    });
    expect(insertedApiKeyPayload).not.toHaveProperty('permissions');
    expect(logServerError).not.toHaveBeenCalled();
  });
});
