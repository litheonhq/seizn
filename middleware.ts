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

  // Detect locale from various sources
  let detectedLocale: Locale = defaultLocale;

  // 1. Check cookie for saved preference
  const savedLocale = request.cookies.get('NEXT_LOCALE')?.value as Locale | undefined;
  if (savedLocale && locales.includes(savedLocale)) {
    detectedLocale = savedLocale;
  } else {
    // 2. Check IP-based geolocation (Vercel provides this header)
    const country = request.headers.get('x-vercel-ip-country');
    if (country) {
      detectedLocale = getLocaleFromCountry(country);
    } else {
      // 3. Fallback to Accept-Language header
      const acceptLanguage = request.headers.get('accept-language');
      if (acceptLanguage) {
        const preferredLocale = acceptLanguage
          .split(',')
          .map((lang) => lang.split(';')[0].trim().substring(0, 2).toLowerCase())
          .find((lang) => locales.includes(lang as Locale)) as Locale | undefined;

        if (preferredLocale) {
          detectedLocale = preferredLocale;
        }
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
