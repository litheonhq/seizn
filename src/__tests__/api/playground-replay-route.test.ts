import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { createQueryEmbedding } from '@/lib/ai';
import { logServerError } from '@/lib/server/logger';
import { POST } from '@/app/api/playground/replay/route';

vi.mock('@/lib/api/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/ai', () => ({
  createQueryEmbedding: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  logServerError: vi.fn(),
}));

describe('playground replay route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRequestUser).mockResolvedValue({
      id: 'profile-1',
      email: 'user@example.com',
      name: 'Smoke User',
      lastSignInAt: null,
    });
    vi.mocked(createQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it('returns 401 when request auth cannot resolve a user', async () => {
    vi.mocked(getRequestUser).mockResolvedValueOnce(null);

    const request = new NextRequest('https://example.com/api/playground/replay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ originalLogId: 'log-1' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('falls back to degraded keyword search when replay search RPCs are missing', async () => {
    const originalLog = {
      id: 'log-1',
      endpoint: '/api/playground/query',
      method: 'POST',
      request_body: {
        query: 'production smoke',
        namespace: 'production-smoke',
        topK: 3,
        threshold: 0.7,
        mode: 'vector',
      },
      response_body: {
        results: [
          { id: 'mem-0', content: 'older result', similarity: 0.62 },
        ],
      },
      latency_ms: 42,
      cost_cents: 1,
      created_at: '2026-03-07T00:00:00.000Z',
    };

    const degradedRows = [
      {
        id: 'mem-1',
        content: 'production smoke memory',
        memory_type: 'fact',
      },
    ];

    const usageLogsBuilder = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: originalLog,
              error: null,
            }),
          }),
        }),
      }),
    };

    const degradedSearchBuilder = {
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      or: vi.fn().mockResolvedValue({
        data: degradedRows,
        error: null,
      }),
      ilike: vi.fn().mockResolvedValue({
        data: degradedRows,
        error: null,
      }),
    };

    vi.mocked(createServerClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'function public.search_memories(vector) does not exist' },
      }),
      from: vi.fn((table: string) => {
        if (table === 'usage_logs') {
          return usageLogsBuilder;
        }
        if (table === 'memories') {
          return {
            select: vi.fn().mockReturnValue(degradedSearchBuilder),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest('https://example.com/api/playground/replay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        originalLogId: 'log-1',
        overrides: {
          mode: 'vector',
          topK: 3,
        },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.replay.settings.mode).toBe('keyword');
    expect(body.replay.settings.requestedMode).toBe('vector');
    expect(body.replay.fallback).toEqual({
      applied: true,
      from: 'vector',
      to: 'keyword',
      reason: 'search_error',
    });
    expect(body.replay.results).toEqual([
      {
        id: 'mem-1',
        content: 'production smoke memory',
        similarity: 1,
      },
    ]);
    expect(logServerError).not.toHaveBeenCalled();
  });
});
