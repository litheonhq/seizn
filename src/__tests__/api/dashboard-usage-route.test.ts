import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { GET } from '@/app/api/dashboard/usage/route';

vi.mock('@/lib/api/request-user', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

describe('dashboard usage route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when no session user is available', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const response = await GET(new NextRequest('https://example.com/api/dashboard/usage'));

    expect(response.status).toBe(403);
  });

  it('builds usage analytics from a single usage log query and api key lookup', async () => {
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
              gte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      endpoint: '/api/v1/memories',
                      method: 'GET',
                      status_code: 200,
                      embedding_tokens: 10,
                      cost_cents: 5,
                      latency_ms: 110,
                      created_at: '2026-03-06T10:00:00.000Z',
                      api_key_id: 'key-1',
                    },
                    {
                      endpoint: '/api/playground/query',
                      method: 'POST',
                      status_code: 500,
                      embedding_tokens: 20,
                      cost_cents: 15,
                      latency_ms: 330,
                      created_at: '2026-03-07T10:00:00.000Z',
                      api_key_id: null,
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
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'key-1', name: 'Primary key', key_prefix: 'szn_live' },
              ],
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
      new NextRequest('https://example.com/api/dashboard/usage?period=7d')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenCalledWith('usage_logs');
    expect(from).toHaveBeenCalledWith('api_keys');
    expect(body.usage.apiKeys).toEqual([
      expect.objectContaining({
        keyId: 'key-1',
        calls: 1,
        name: 'Primary key',
        prefix: 'szn_live',
      }),
      expect.objectContaining({
        keyId: 'direct',
        calls: 1,
        name: 'Unknown',
        prefix: '???',
      }),
    ]);
    expect(body.usage.summary).toEqual(
      expect.objectContaining({
        totalCalls: 2,
        totalTokens: 30,
        totalCostCents: 20,
        totalErrors: 1,
        avgLatency: 220,
      })
    );
  });
});
