export const locales = ['en', 'ko', 'ja'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ko: '한국어',
  ja: '日本語',
};

// Country to locale mapping
export const countryToLocale: Record<string, Locale> = {
  KR: 'ko',
  JP: 'ja',
  // All other countries default to English
};

export function getLocaleFromCountry(countryCode: string | null): Locale {
  if (!countryCode) return defaultLocale;
  return countryToLocale[countryCode.toUpperCase()] || defaultLocale;
}
