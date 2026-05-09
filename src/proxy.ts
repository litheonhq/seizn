import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale, getLocaleFromCountry, type Locale } from '@/i18n/config';
import { verifyReviewToken, isPathAllowed } from '@/lib/review-token';
import { DASHBOARD_ROUTES, canonicalAuthorDashboardPath } from '@/lib/dashboard-routes';
import { AUTHOR_FLAGSHIP_ORIGIN, ENGINE_HOST, normalizeHost } from '@/lib/surface';

const LEGACY_AUTH_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
] as const;

// Paths that should not be locale-prefixed (completely skip middleware)
const publicPaths = [
  '/api',
  '/_next',
  '/favicon.ico',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/og-image.png',
  '/monitoring',
  '/robots.txt',
  '/sitemap.xml',
  '/dashboard',  // Dashboard routes (separate route group, not locale-prefixed)
  '/login',      // Auth routes
  '/signup',
  '/device',     // Device auth flow (root route, not locale-prefixed)
  '/invite',     // Invite/token links (root route, not locale-prefixed)
  '/status',     // Status page (root route, not locale-prefixed)
  '/offline',    // Offline fallback (root route, not locale-prefixed)
  '/terms',      // Legal pages exist at root (see next.config.ts redirects)
  '/privacy',
  '/refund',
  '/t/',         // Short token redirect routes (root route, not locale-prefixed)
  '/trace/',     // Trace share routes (root route, not locale-prefixed)
  // Note: /docs removed - now uses locale-prefixed routes (/en/docs, /ko/docs, etc.)
];

function getLocaleFromPath(pathname: string): Locale | null {
  const segments = pathname.split('/');
  const potentialLocale = segments[1];
  if (locales.includes(potentialLocale as Locale)) {
    return potentialLocale as Locale;
  }
  return null;
}

function isPublicPath(pathname: string): boolean {
  // Skip all static files (files with extensions like .svg, .png, .css, etc.)
  if (/\.\w+$/.test(pathname)) return true;
  return publicPaths.some((path) => pathname.startsWith(path));
}

// Check if path is a dashboard route (P0-4: security headers required)
function isDashboardPath(pathname: string): boolean {
  return pathname.startsWith('/dashboard');
}

// Add security headers for dashboard routes (P0-4: review_token leak prevention)
function addDashboardSecurityHeaders(response: NextResponse): NextResponse {
  // Keep consistent with next.config.ts dashboard headers (P0-4: review_token leak prevention)
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Origin-Agent-Cluster', '?1');
  return response;
}

function normalizeCookieDomain(value: string | undefined): string | undefined {
  const domain = value?.trim();
  if (!domain || domain === 'localhost' || domain === '127.0.0.1') return undefined;
  return domain.startsWith('.') ? domain : `.${domain}`;
}

function expireLegacyAuthCookies(response: NextResponse, host: string | null): NextResponse {
  const configuredDomain = normalizeCookieDomain(process.env.AUTH_COOKIE_DOMAIN);
  const domains = new Set<string | undefined>([undefined, configuredDomain]);
  if (host === 'www.seizn.com') {
    domains.add('.www.seizn.com');
  }

  for (const cookieName of LEGACY_AUTH_COOKIE_NAMES) {
    for (const domain of domains) {
      response.cookies.set(cookieName, '', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 0,
        ...(domain ? { domain } : {}),
      });
    }
  }

  return response;
}

// Parse Accept-Language header with q-value support
function parseAcceptLanguage(header: string): string[] {
  // Example: "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
  return header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number(qParam.split('=')[1]) : 1;
      return { tag: tag.toLowerCase().trim(), q };
    })
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
}

// Match Accept-Language tag to supported locale
function matchLocale(tag: string): Locale | null {
  // 1) exact match
  if (locales.includes(tag as Locale)) return tag as Locale;

  // 2) Chinese script rules (must-have)
  // zh-tw / zh-hk -> zh-hant
  if (tag.startsWith('zh')) {
    if (tag.includes('tw') || tag.includes('hk') || tag.includes('hant') || tag.includes('mo')) {
      return 'zh-hant';
    }
    // default for zh-cn / zh-hans / generic zh
    return 'zh-hans';
  }

  // 3) Portuguese regional rules
  if (tag.startsWith('pt')) {
    if (tag.includes('br')) return 'pt-BR';
    if (tag.includes('pt')) return 'pt-PT';
    return 'pt-BR'; // default to Brazilian Portuguese
  }

  // 4) prefix match (fr-ca -> fr, en-us -> en)
  const base = tag.split('-')[0];
  if (locales.includes(base as Locale)) return base as Locale;

  return null;
}

// Get locale from Accept-Language header
function getLocaleFromAcceptLanguage(header: string): Locale | null {
  const tags = parseAcceptLanguage(header);
  for (const tag of tags) {
    const matched = matchLocale(tag);
    if (matched) return matched;
  }
  return null;
}

// Handle review token validation for dashboard routes
async function handleReviewToken(
  request: NextRequest,
  pathname: string
): Promise<NextResponse | null> {
  const reviewToken = request.nextUrl.searchParams.get('review_token');

  if (!reviewToken) {
    return null; // No token, proceed with normal flow
  }

  // Verify the token
  const result = await verifyReviewToken(reviewToken);

  if (!result.valid || !result.payload) {
    // Invalid token - redirect to login or show error
    console.warn('Invalid review token:', result.error);
    const url = request.nextUrl.clone();
    url.searchParams.delete('review_token');
    url.pathname = '/login';
    url.searchParams.set('error', 'invalid_review_token');
    return NextResponse.redirect(url);
  }

  // Check if path is allowed
  if (!isPathAllowed(pathname, result.payload.paths)) {
    console.warn('Path not allowed for review token:', pathname);
    const url = request.nextUrl.clone();
    url.searchParams.delete('review_token');
    url.pathname = '/login';
    url.searchParams.set('error', 'path_not_allowed');
    return NextResponse.redirect(url);
  }

  // Token is valid - set review_mode cookie and remove token from URL
  const url = request.nextUrl.clone();
  url.searchParams.delete('review_token');

  const response = NextResponse.redirect(url);

  // Set review_mode cookie (valid for token duration)
  const expiresInSeconds = Math.floor((result.payload.exp - Date.now()) / 1000);
  response.cookies.set('review_mode', 'true', {
    maxAge: expiresInSeconds > 0 ? expiresInSeconds : 3600,
    path: '/',
    httpOnly: false, // Client-side needs to read this
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  // Store allowed paths for client-side use
  response.cookies.set('review_paths', JSON.stringify(result.payload.paths), {
    maxAge: expiresInSeconds > 0 ? expiresInSeconds : 3600,
    path: '/',
    httpOnly: false, // Client needs to read this
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  return addDashboardSecurityHeaders(response);
}

// Engine surface (engine.seizn.com) — rewrite to /engine/* before i18n redirect
// Author-only entry points: redirect to seizn.com when accessed from engine surface
const AUTHOR_ONLY_PREFIXES = [
  '/dashboard',
  '/signup',
  '/device',
  '/invite',
  '/t/',
  '/trace/',
];

// Shared infra: pass through on both surfaces
function isSharedInfraPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/monitoring') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/apple-touch-icon') ||
    pathname.startsWith('/og-image') ||
    pathname.startsWith('/robots.txt') ||
    pathname.startsWith('/sitemap.xml')
  );
}

function requestHeadersWithPath(request: NextRequest): Headers {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-seizn-pathname', request.nextUrl.pathname);
  requestHeaders.set('x-seizn-search', request.nextUrl.search);
  return requestHeaders;
}

function redirectToCanonicalAuthorSettings(request: NextRequest, byok = false): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = '/dashboard/author/settings';
  if (byok) {
    url.searchParams.set('section', 'byok');
  }
  return addDashboardSecurityHeaders(NextResponse.redirect(url, 308));
}

function redirectToAuthorUsageTab(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = DASHBOARD_ROUTES.author;
  url.searchParams.set('tab', 'usage');
  return addDashboardSecurityHeaders(NextResponse.redirect(url, 308));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = normalizeHost(request.headers.get('x-forwarded-host') || request.headers.get('host'));

  // Engine surface routing (must run before i18n redirect)
  if (host === ENGINE_HOST) {
    if (pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/engine/login';
      return NextResponse.rewrite(url);
    }

    const canonicalAuthorPath = canonicalAuthorDashboardPath(pathname, request.nextUrl.search);
    if (canonicalAuthorPath) {
      return NextResponse.redirect(`${AUTHOR_FLAGSHIP_ORIGIN}${canonicalAuthorPath}`, 308);
    }

    // Author-only entry: cross-domain redirect to seizn.com (308 preserves method)
    if (AUTHOR_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(
        `${AUTHOR_FLAGSHIP_ORIGIN}${pathname}${request.nextUrl.search}`,
        308
      );
    }
    // /engine/* and shared infra: pass through
    if (pathname.startsWith('/engine') || isSharedInfraPath(pathname)) {
      return NextResponse.next();
    }
    // Everything else: rewrite to /engine/*
    const url = request.nextUrl.clone();
    url.pathname = pathname === '/' ? '/engine' : `/engine${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (pathname === '/dashboard/settings/author') {
    return redirectToCanonicalAuthorSettings(request);
  }
  if (pathname === '/dashboard/settings/byok') {
    return redirectToCanonicalAuthorSettings(request, true);
  }
  if (pathname === DASHBOARD_ROUTES.authorUsage || pathname === DASHBOARD_ROUTES.legacyUsage) {
    return redirectToAuthorUsageTab(request);
  }

  const pathnameLocale = getLocaleFromPath(pathname);
  if (pathnameLocale && pathname === `/${pathnameLocale}/dashboard/author/settings`) {
    return redirectToCanonicalAuthorSettings(request);
  }

  // Skip public paths (API routes, static files, etc.)
  // But still apply security headers for dashboard routes
  if (isPublicPath(pathname)) {
    // P0-4: Apply security headers to dashboard routes even for public paths
    if (isDashboardPath(pathname)) {
      // Check for review_token in URL
      const reviewTokenResponse = await handleReviewToken(request, pathname);
      if (reviewTokenResponse) {
        return reviewTokenResponse;
      }

      const response = NextResponse.next({
        request: {
          headers: requestHeadersWithPath(request),
        },
      });
      return addDashboardSecurityHeaders(response);
    }
    const response = NextResponse.next();
    if (pathname === '/login') {
      return expireLegacyAuthCookies(response, host);
    }
    return response;
  }

  if (pathnameLocale) {
    // Path has a valid locale, continue
    return NextResponse.next();
  }

  // Detect locale from various sources (priority order)
  let detectedLocale: Locale = defaultLocale;

  // 1. Check cookie for saved preference (highest priority)
  const savedLocale = request.cookies.get('NEXT_LOCALE')?.value as Locale | undefined;
  if (savedLocale && locales.includes(savedLocale)) {
    detectedLocale = savedLocale;
  } else {
    // 2. Check Accept-Language header (q-value aware)
    const acceptLanguage = request.headers.get('accept-language');
    if (acceptLanguage) {
      const preferredLocale = getLocaleFromAcceptLanguage(acceptLanguage);
      if (preferredLocale) {
        detectedLocale = preferredLocale;
      } else {
        // 3. Fallback to IP-based geolocation (Vercel provides this header)
        const country = request.headers.get('x-vercel-ip-country');
        if (country) {
          detectedLocale = getLocaleFromCountry(country);
        }
      }
    } else {
      // No Accept-Language, use IP geolocation
      const country = request.headers.get('x-vercel-ip-country');
      if (country) {
        detectedLocale = getLocaleFromCountry(country);
      }
    }
  }

  // Redirect to locale-prefixed path
  const url = request.nextUrl.clone();
  url.pathname = `/${detectedLocale}${pathname}`;

  const response = NextResponse.redirect(url);

  // Set cookie to remember preference
  response.cookies.set('NEXT_LOCALE', detectedLocale, {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: '/',
  });

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and API routes
    '/((?!api|_next/static|_next/image|favicon.ico|monitoring|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)',
  ],
};
