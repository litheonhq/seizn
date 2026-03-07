import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { GET } from '@/app/api/dashboard/activity/route';

vi.mock('@/lib/api/request-user', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

describe('dashboard activity route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no session user is available', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const response = await GET(new NextRequest('https://example.com/api/dashboard/activity'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns formatted activity with api key prefixes and summary stats', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'profile-1',
      email: 'user@example.com',
      name: 'Smoke User',
      organizationId: null,
      organizationSelection: null,
      lastSignInAt: null,
    });

    const from = vi.fn((table: string) => {
      if (table === 'usage_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'log-1',
                      endpoint: '/api/v1/memories',
                      method: 'GET',
                      status_code: 200,
                      embedding_tokens: 0,
                      cost_cents: 1,
                      latency_ms: 120,
                      api_key_id: 'key-1',
                      created_at: '2026-03-07T00:00:00.000Z',
                    },
                    {
                      id: 'log-2',
                      endpoint: '/api/playground/query',
                      method: 'POST',
                      status_code: 500,
                      embedding_tokens: 42,
                      cost_cents: 3,
                      latency_ms: 300,
                      api_key_id: null,
                      created_at: '2026-03-07T01:00:00.000Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'api_keys') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'key-1', key_prefix: 'szn_live' }],
              error: null,
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    vi.mocked(createServerClient).mockReturnValue({
      from,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const response = await GET(
      new NextRequest('https://example.com/api/dashboard/activity?limit=2')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.activity).toEqual([
      expect.objectContaining({
        id: 'log-1',
        keyPrefix: 'szn_live',
        statusCategory: 'success',
      }),
      expect.objectContaining({
        id: 'log-2',
        keyPrefix: 'direct',
        statusCategory: 'server_error',
      }),
    ]);
    expect(body.stats).toEqual({
      totalRequests: 2,
      successCount: 1,
      errorCount: 1,
      avgLatencyMs: 210,
    });
  });
});
