import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { createQueryEmbedding } from '@/lib/ai';
import { logServerError } from '@/lib/server/logger';
import { POST } from '@/app/api/playground/query/route';

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

describe('playground query route', () => {
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

    const request = new NextRequest('https://example.com/api/playground/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'hello world' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('falls back to degraded keyword search when search RPCs are missing', async () => {
    const degradedRows = [
      {
        id: 'mem-1',
        content: 'production smoke memory',
        memory_type: 'fact',
      },
    ];

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
        if (table === 'memories') {
          return {
            select: vi.fn().mockReturnValue(degradedSearchBuilder),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest('https://example.com/api/playground/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'production smoke',
        namespace: 'production-smoke',
        mode: 'vector',
        topK: 3,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.results).toEqual([
      {
        id: 'mem-1',
        content: 'production smoke memory',
        memory_type: 'fact',
        similarity: 1,
      },
    ]);
    expect(body.trace.mode).toBe('keyword');
    expect(body.trace.requested_mode).toBe('vector');
    expect(body.trace.fallback).toEqual({
      applied: true,
      from: 'vector',
      to: 'keyword',
      reason: 'search_error',
    });
    expect(logServerError).not.toHaveBeenCalled();
  });
});
