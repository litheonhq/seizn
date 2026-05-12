import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { encodeMock } = vi.hoisted(() => ({
  encodeMock: vi.fn(async () => 'mock-session-token'),
}));

const { getTokenMock, headersMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(async () => ({
    id: 'user-1',
    sub: 'user-1',
    email: 'user@example.com',
    name: 'User',
    organizationId: 'org-1',
    organizationSelection: 'organization',
  })),
  headersMock: vi.fn(async () => new Headers({ cookie: '__Secure-authjs.session-token=raw-session-token' })),
}));

vi.mock('server-only', () => ({}), { virtual: true });
vi.mock('@auth/core/jwt', () => ({
  encode: encodeMock,
  getToken: getTokenMock,
}));
vi.mock('next/headers', () => ({
  headers: headersMock,
}));

import {
  createAuthJsSessionToken,
  getAuthJsSessionCookieName,
  getAuthJsSessionCookieOptions,
  readAuthJsSessionTokenClaims,
} from './session-token';

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  AUTH_COOKIE_DOMAIN: process.env.AUTH_COOKIE_DOMAIN,
};

beforeEach(() => {
  encodeMock.mockClear();
  getTokenMock.mockClear();
  headersMock.mockClear();
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  process.env.NEXTAUTH_SECRET = ORIGINAL_ENV.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_URL = ORIGINAL_ENV.NEXTAUTH_URL;
  process.env.AUTH_COOKIE_DOMAIN = ORIGINAL_ENV.AUTH_COOKIE_DOMAIN;
});

describe('createAuthJsSessionToken', () => {
  it('throws when NEXTAUTH_SECRET is not configured', async () => {
    delete process.env.NEXTAUTH_SECRET;

    await expect(
      createAuthJsSessionToken({
        userId: 'user-1',
        email: 'user@example.com',
      })
    ).rejects.toThrow('NEXTAUTH_SECRET not configured');
  });

  it('uses __Secure cookie salt in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXTAUTH_SECRET = 'secret-value';

    const token = await createAuthJsSessionToken({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
    });

    expect(token).toBe('mock-session-token');
    expect(encodeMock).toHaveBeenCalledTimes(1);
    expect(encodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: 'secret-value',
        salt: '__Secure-authjs.session-token',
      })
    );
  });

  it('uses non-secure cookie salt outside production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.NEXTAUTH_SECRET = 'secret-value';

    await createAuthJsSessionToken({
      userId: 'user-1',
      email: 'user@example.com',
    });

    expect(encodeMock).toHaveBeenCalledTimes(1);
    expect(encodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        salt: 'authjs.session-token',
      })
    );
  });
});

describe('readAuthJsSessionTokenClaims', () => {
  it('reads and decodes the production session cookie', async () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXTAUTH_SECRET = 'secret-value';

    const claims = await readAuthJsSessionTokenClaims();

    expect(getAuthJsSessionCookieName()).toBe('__Secure-authjs.session-token');
    expect(claims).toEqual({
      id: 'user-1',
      sub: 'user-1',
      email: 'user@example.com',
      name: 'User',
      organizationId: 'org-1',
      organizationSelection: 'organization',
    });
    expect(getTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: 'secret-value',
        secureCookie: true,
        cookieName: '__Secure-authjs.session-token',
      })
    );
  });
});

describe('getAuthJsSessionCookieOptions', () => {
  it('does not derive a cookie domain from NEXTAUTH_URL', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXTAUTH_URL = 'https://www.seizn.com';
    delete process.env.AUTH_COOKIE_DOMAIN;

    expect(getAuthJsSessionCookieOptions()).not.toHaveProperty('domain');
  });

  it('uses explicit AUTH_COOKIE_DOMAIN only', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_COOKIE_DOMAIN = '.seizn.com';

    expect(getAuthJsSessionCookieOptions()).toMatchObject({
      domain: '.seizn.com',
      secure: true,
      sameSite: 'lax',
    });
  });
});
