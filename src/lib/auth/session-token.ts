import 'server-only';

import { encode, getToken } from '@auth/core/jwt';
import { headers } from 'next/headers';

type CreateAuthJsSessionTokenParams = {
  userId: string;
  email: string;
  name?: string;
  picture?: string;
  maxAgeSeconds?: number;
};

type AuthJsSessionTokenClaims = {
  id?: string | null;
  sub?: string | null;
  email?: string | null;
  name?: string | null;
};

export function getAuthJsSessionCookieName(): string {
  const useSecureCookies = process.env.NODE_ENV === 'production';
  const cookiePrefix = useSecureCookies ? '__Secure-' : '';
  return `${cookiePrefix}authjs.session-token`;
}

export async function readAuthJsSessionTokenClaims(): Promise<AuthJsSessionTokenClaims | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return null;
  }

  const requestHeaders = await headers();
  const decoded = await getToken({
    req: { headers: requestHeaders },
    secret,
    secureCookie: process.env.NODE_ENV === 'production',
    cookieName: getAuthJsSessionCookieName(),
  });

  if (!decoded) {
    return null;
  }

  return {
    id: typeof decoded.id === 'string' ? decoded.id : null,
    sub: typeof decoded.sub === 'string' ? decoded.sub : null,
    email: typeof decoded.email === 'string' ? decoded.email : null,
    name: typeof decoded.name === 'string' ? decoded.name : null,
  };
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

  const cookieName = getAuthJsSessionCookieName();

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
