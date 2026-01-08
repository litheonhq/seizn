import { Locale, defaultLocale, getLocaleFromCountry } from '@/i18n/config';

const LOCALE_STORAGE_KEY = 'seizn-locale';

/**
 * Get locale from localStorage (client-side only)
 */
export function getStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && ['en', 'ko', 'ja'].includes(stored)) {
    return stored as Locale;
  }
  return null;
}

/**
 * Save locale to localStorage
 */
export function setStoredLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

/**
 * Detect locale with priority:
 * 1. Stored preference (localStorage)
 * 2. User profile setting (if logged in)
 * 3. IP-based country detection
 * 4. Default (en)
 */
export function detectLocale(options?: {
  userLocale?: Locale | null;
  countryCode?: string | null;
}): Locale {
  // 1. Check localStorage first
  const stored = getStoredLocale();
  if (stored) return stored;

  // 2. Check user profile setting
  if (options?.userLocale) return options.userLocale;

  // 3. Check IP-based country
  if (options?.countryCode) {
    return getLocaleFromCountry(options.countryCode);
  }

  // 4. Default
  return defaultLocale;
}

/**
 * Get country code from Vercel headers (server-side)
 */
export function getCountryFromHeaders(headers: Headers): string | null {
  // Vercel provides this header automatically
  return headers.get('x-vercel-ip-country');
}
