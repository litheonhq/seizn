import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { encodeMock } = vi.hoisted(() => ({
  encodeMock: vi.fn(async () => 'mock-session-token'),
}));

vi.mock('server-only', () => ({}), { virtual: true });
vi.mock('@auth/core/jwt', () => ({
  encode: encodeMock,
}));

import { createAuthJsSessionToken } from './session-token';

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
};

beforeEach(() => {
  encodeMock.mockClear();
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  process.env.NEXTAUTH_SECRET = ORIGINAL_ENV.NEXTAUTH_SECRET;
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
