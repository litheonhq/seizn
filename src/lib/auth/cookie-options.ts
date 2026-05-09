import 'server-only';

export function shouldUseSecureAuthCookies(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getAuthCookiePrefix(): string {
  return shouldUseSecureAuthCookies() ? '__Secure-' : '';
}

export function getAuthCookieDomain(): string | undefined {
  const value = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (!value) return undefined;
  if (value === 'localhost' || value === '127.0.0.1') return undefined;
  return value.startsWith('.') ? value : `.${value}`;
}

export function getSharedAuthCookieOptions() {
  const domain = getAuthCookieDomain();
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: shouldUseSecureAuthCookies(),
    ...(domain ? { domain } : {}),
  };
}

export function getAuthJsSessionCookieName(): string {
  return `${getAuthCookiePrefix()}authjs.session-token`;
}

export const DEPRECATED_AUTH_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
] as const;
