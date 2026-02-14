import 'server-only';

import { encode } from '@auth/core/jwt';

type CreateAuthJsSessionTokenParams = {
  userId: string;
  email: string;
  name?: string;
  picture?: string;
  maxAgeSeconds?: number;
};

function getSessionCookieName(): string {
  const useSecureCookies = process.env.NODE_ENV === 'production';
  const cookiePrefix = useSecureCookies ? '__Secure-' : '';
  return `${cookiePrefix}authjs.session-token`;
}

/**
 * Create an Auth.js-compatible encrypted session token for NextAuth v5 (JWT strategy).
 *
 * NextAuth uses `@auth/core/jwt.encode` which issues a JWE by default.
 * Do not use `SignJWT` (JWS) here or the session cookie will not be readable.
 */
export async function createAuthJsSessionToken({
  userId,
  email,
  name,
  picture,
  maxAgeSeconds = 24 * 60 * 60,
}: CreateAuthJsSessionTokenParams): Promise<string> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET not configured');
  }

  const cookieName = getSessionCookieName();

  return encode({
    token: {
      id: userId,
      sub: userId,
      email,
      name,
      picture,
    },
    secret,
    salt: cookieName,
    maxAge: maxAgeSeconds,
  });
}

