/**
 * CSRF Protection via Origin / Referer header verification.
 *
 * For cookie-authenticated routes only. API-key-authenticated routes are
 * inherently CSRF-safe because browsers do not auto-send Authorization headers.
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 */

import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = new Set([
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean) as string[]);

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
  const auth = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key');
  if (auth?.startsWith('Bearer ') && auth.length > 15) return null;
  if (apiKey && apiKey.startsWith('szn_') && apiKey.length > 10) return null;

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

  // No Origin or Referer — this can happen with same-origin requests in some
  // browsers or non-browser clients. Allow it (defense-in-depth: cookie SameSite
  // attribute provides additional protection).
  return null;
}
