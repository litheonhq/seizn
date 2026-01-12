export const locales = [
  'en',
  'ko',
  'ja',
  // Chinese (split by region)
  'zh-CN',
  'zh-TW',
  'zh-HK',
  // Spanish
  'es',
  // Eastern European
  'ru',
  'uk',
  // Middle Eastern
  'he',
  'ar',
  // Western European
  'fr',
  'de',
  'sv',
  'nl',
  'vi',
  'pl',
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
  'zh-CN': '中文(简体)',
  'zh-TW': '中文(繁體)',
  'zh-HK': '中文(香港)',
  es: 'Español',
  ru: 'Русский',
  uk: 'Українська',
  he: 'עברית',
  ar: 'العربية',
  fr: 'Français',
  de: 'Deutsch',
  sv: 'Svenska',
  nl: 'Nederlands',
  vi: 'Tiếng Việt',
  pl: 'Polski',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
};

// RTL languages
export const rtlLocales: Locale[] = ['he', 'ar'];

export function isRtl(locale: Locale): boolean {
  return rtlLocales.includes(locale);
}

// Country to locale mapping
export const countryToLocale: Record<string, Locale> = {
  KR: 'ko',
  JP: 'ja',
  // Chinese regions
  CN: 'zh-CN',
  TW: 'zh-TW',
  HK: 'zh-HK',
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
  // Middle Eastern
  IL: 'he',
  SA: 'ar',
  AE: 'ar',
  EG: 'ar',
  // Western European
  FR: 'fr',
  CA: 'fr',
  BE: 'fr',
  CH: 'de',
  DE: 'de',
  AT: 'de',
  SE: 'sv',
  NL: 'nl',
  VN: 'vi',
  PL: 'pl',
  // Portuguese-speaking
  BR: 'pt-BR',
  PT: 'pt-PT',
  // English-speaking
  SG: 'en',
  IE: 'en',
  US: 'en',
  GB: 'en',
  AU: 'en',
  // All other countries default to English
};

export function getLocaleFromCountry(countryCode: string | null): Locale {
  if (!countryCode) return defaultLocale;
  return countryToLocale[countryCode.toUpperCase()] || defaultLocale;
}
