import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import {
  createRequestAuthClient,
  hasServerSupabasePublicConfig,
} from '@/lib/supabase';
import {
  getRequestUser,
  getSupabaseUserFromBearer,
} from '@/lib/api/request-user';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

describe('request user helpers', () => {
  it('prefers Auth.js session when available', async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User One',
      },
    } as Awaited<ReturnType<typeof auth>>);

    const request = new NextRequest('https://example.com/api/test');
    const user = await getRequestUser(request);

    expect(user).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User One',
    });
  });

  it('returns null when bearer auth config is unavailable', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    vi.mocked(hasServerSupabasePublicConfig).mockReturnValueOnce(false);

    const request = new NextRequest('https://example.com/api/test', {
      headers: {
        Authorization: 'Bearer token-123',
      },
    });

    await expect(getSupabaseUserFromBearer(request)).resolves.toBeNull();
    expect(createRequestAuthClient).not.toHaveBeenCalled();
  });

  it('returns null when Supabase rejects the bearer token', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    const getUser = vi.fn().mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid jwt' },
    });
    vi.mocked(createRequestAuthClient).mockReturnValueOnce({
      auth: { getUser },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest('https://example.com/api/test', {
      headers: {
        Authorization: 'Bearer token-123',
      },
    });

    await expect(getSupabaseUserFromBearer(request)).resolves.toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});
