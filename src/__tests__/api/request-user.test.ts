const { headersMock, getTokenMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  getTokenMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

vi.mock('@auth/core/jwt', () => ({
  getToken: getTokenMock,
  encode: vi.fn(),
}));

import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import {
  createRequestAuthClient,
  createServerClient,
  hasServerSupabasePublicConfig,
} from '@/lib/supabase';
import {
  getRequestUser,
  getSessionUser,
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
      lastSignInAt: null,
    });
  });

  it('resolves Auth.js session ids to profile ids when needed', async () => {
    process.env.NEXTAUTH_SECRET = 'test-secret';
    vi.mocked(auth).mockResolvedValueOnce({
      user: {
        id: 'auth-user-1',
      },
    } as Awaited<ReturnType<typeof auth>>);
    headersMock.mockResolvedValueOnce(new Headers({
      cookie: '__Secure-authjs.session-token=raw-token',
    }));
    getTokenMock.mockResolvedValueOnce({
      id: 'auth-user-1',
      sub: 'auth-user-1',
      email: 'user@example.com',
      name: 'User One',
    });

    vi.mocked(createServerClient).mockReturnValueOnce({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((column: string, value: string) => ({
          single: vi.fn().mockResolvedValue(
            column === 'id' && value === 'auth-user-1'
              ? {
                  data: null,
                  error: {
                    code: 'PGRST116',
                    message: 'JSON object requested, multiple (or no) rows returned',
                  },
                }
              : {
                  data: { id: 'profile-1' },
                  error: null,
                }
          ),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(getSessionUser()).resolves.toEqual({
      id: 'profile-1',
      email: 'user@example.com',
      name: 'User One',
      lastSignInAt: null,
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
