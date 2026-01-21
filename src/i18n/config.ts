export const locales = [
  'en',
  'ko',
  'ja',
  // Chinese (split by script, not region)
  'zh-hans', // Simplified Chinese (CN, SG)
  'zh-hant', // Traditional Chinese (TW, HK, MO)
  // Spanish
  'es',
  // Eastern European
  'ru',
  'uk',
  // Middle Eastern (RTL)
  'he',
  'ar',
  // Western European
  'fr',
  'de',
  'it',
  'sv',
  'nl',
  'pl',
  // South/Southeast Asian
  'hi',
  'th',
  'id',
  'vi',
  // Portuguese (split by region)
  'pt-BR',
  'pt-PT',
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ko: '한국어',
  ja: '日本語',
  'zh-hans': '简体中文',
  'zh-hant': '繁體中文',
  es: 'Español',
  ru: 'Русский',
  uk: 'Українська',
  he: 'עברית',
  ar: 'العربية',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  sv: 'Svenska',
  nl: 'Nederlands',
  pl: 'Polski',
  hi: 'हिन्दी',
  th: 'ไทย',
  id: 'Bahasa Indonesia',
  vi: 'Tiếng Việt',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
};

// RTL languages
export const rtlLocales = new Set<Locale>(['he', 'ar']);

export function isRtl(locale: Locale): boolean {
  return rtlLocales.has(locale);
}

// Country to locale mapping (fallback only, don't force for multilingual countries)
export const countryToLocale: Record<string, Locale> = {
  KR: 'ko',
  JP: 'ja',
  // Chinese regions (script-based)
  CN: 'zh-hans',
  SG: 'zh-hans', // Singapore uses Simplified
  TW: 'zh-hant',
  HK: 'zh-hant',
  MO: 'zh-hant', // Macau
  // Spanish-speaking
  ES: 'es',
  MX: 'es',
  AR: 'es',
  CO: 'es',
  CL: 'es',
  PE: 'es',
  // Eastern European
  RU: 'ru',
  UA: 'uk',
  // Middle Eastern (RTL)
  IL: 'he',
  SA: 'ar',
  AE: 'ar',
  EG: 'ar',
  // Western European
  FR: 'fr',
  // CA/BE/CH: Accept-Language takes priority, these are multilingual
  DE: 'de',
  AT: 'de',
  IT: 'it',
  SE: 'sv',
  NL: 'nl',
  PL: 'pl',
  // South/Southeast Asian
  IN: 'hi',
  TH: 'th',
  ID: 'id',
  VN: 'vi',
  // Portuguese-speaking
  BR: 'pt-BR',
  PT: 'pt-PT',
  // English-speaking
  US: 'en',
  GB: 'en',
  AU: 'en',
  IE: 'en',
  // All other countries default to English
};

export function getLocaleFromCountry(countryCode: string | null): Locale {
  if (!countryCode) return defaultLocale;
  return countryToLocale[countryCode.toUpperCase()] || defaultLocale;
}
