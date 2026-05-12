/**
 * CSRF Protection via Origin / Referer header verification.
 *
 * For cookie-authenticated routes only. API-key-authenticated routes are
 * inherently CSRF-safe because browsers do not auto-send Authorization headers.
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const LOCAL_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3100',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3100',
];

const PRODUCTION_ALLOWED_ORIGINS = [
  'https://www.seizn.com',
  'https://seizn.com',
];

function vercelUrl(value: string | undefined): string | undefined {
  return value ? `https://${value}` : undefined;
}

const ALLOWED_ORIGINS = new Set([
  ...PRODUCTION_ALLOWED_ORIGINS,
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.NEXTAUTH_URL,
  process.env.PLAYWRIGHT_BASE_URL,
  vercelUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  vercelUrl(process.env.VERCEL_BRANCH_URL),
  vercelUrl(process.env.VERCEL_URL),
  ...LOCAL_ALLOWED_ORIGINS,
].filter(Boolean) as string[]);
const CSRF_TOKEN_BYTES = 32;

export const CSRF_COOKIE_NAME = 'seizn_csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

function isApiKeyAuthenticatedRequest(request: NextRequest): boolean {
  const auth = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key');
  if (auth?.startsWith('Bearer ') && auth.length > 15) return true;
  if (apiKey && apiKey.startsWith('szn_') && apiKey.length > 10) return true;
  return false;
}

function safeTokenEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify that a state-changing request originates from our own site.
 * Returns null if the check passes, or an error NextResponse if it fails.
 */
export function verifyCsrf(request: NextRequest): NextResponse | null {
  const method = request.method.toUpperCase();

  // Safe methods are exempt
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null;

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // Skip CSRF only for properly formatted Bearer / API-key headers.
  // Require valid prefix to prevent bypass via empty or garbage auth headers.
  if (isApiKeyAuthenticatedRequest(request)) return null;

  // Check Origin header first (most reliable)
  if (origin) {
    if (ALLOWED_ORIGINS.has(origin)) return null;
    return NextResponse.json(
      { error: 'CSRF validation failed: origin not allowed' },
      { status: 403 },
    );
  }

  // Fallback to Referer header
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (ALLOWED_ORIGINS.has(refererOrigin)) return null;
    } catch {
      // invalid URL
    }
    return NextResponse.json(
      { error: 'CSRF validation failed: referer not allowed' },
      { status: 403 },
    );
  }

  // No Origin or Referer — require double-submit CSRF token to prevent
  // CSRF attacks via cURL or non-browser clients with cookies.
  return verifyDoubleSubmitToken(request);
}

/**
 * Verify the double-submit CSRF token (cookie vs header).
 * Extracted to avoid circular calls between verifyCsrf/verifyCsrfToken.
 */
function verifyDoubleSubmitToken(request: NextRequest): NextResponse | null {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value ?? '';
  const headerToken = request.headers.get(CSRF_HEADER_NAME) ?? '';
  if (!cookieToken || !headerToken || !safeTokenEquals(cookieToken, headerToken)) {
    return NextResponse.json(
      { error: 'CSRF validation failed: token mismatch' },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Issue (if missing) a per-session CSRF token cookie for browser clients.
 * API-key traffic is excluded because it does not rely on browser cookies.
 */
export function ensureCsrfCookie(request: NextRequest, response: NextResponse): NextResponse {
  if (isApiKeyAuthenticatedRequest(request)) return response;

  const existing = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (existing && existing.length >= CSRF_TOKEN_BYTES * 2) {
    return response;
  }

  response.cookies.set(CSRF_COOKIE_NAME, randomBytes(CSRF_TOKEN_BYTES).toString('hex'), {
    httpOnly: false, // must be readable by browser JS to send as header
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

/**
 * Stronger CSRF check for state-changing cookie-authenticated requests.
 * Requires both Origin/Referer validation and double-submit token match.
 */
export function verifyCsrfToken(request: NextRequest): NextResponse | null {
  const baseCheck = verifyCsrf(request);
  if (baseCheck) return baseCheck;

  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null;
  if (isApiKeyAuthenticatedRequest(request)) return null;

  return verifyDoubleSubmitToken(request);
}
