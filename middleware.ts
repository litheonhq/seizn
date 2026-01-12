import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale, getLocaleFromCountry, type Locale } from '@/i18n/config';

// Paths that should not be locale-prefixed
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
  '/docs',       // Documentation
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
  return publicPaths.some((path) => pathname.startsWith(path));
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths (API routes, static files, etc.)
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Check if path already has a locale
  const pathnameLocale = getLocaleFromPath(pathname);

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
    '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-touch-icon.png|og-image.png|monitoring|robots.txt|sitemap.xml).*)',
  ],
};
