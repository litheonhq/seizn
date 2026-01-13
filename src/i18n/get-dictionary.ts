import type { Locale } from './config';

// Type for the dictionary
export type Dictionary = typeof import('./dictionaries/en.json');

// Deep merge utility for fallback to English
function deepMerge<T extends Record<string, unknown>>(target: T, source: T): T {
  const result = { ...target } as T;
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (targetValue === undefined) {
      result[key] = sourceValue;
    }
  }
  return result;
}

// Partial dictionary loaders (without strict type checking)
const dictionaryLoaders: Record<Locale, () => Promise<Record<string, unknown>>> = {
  en: () => import('./dictionaries/en.json').then((module) => module.default),
  ko: () => import('./dictionaries/ko.json').then((module) => module.default),
  ja: () => import('./dictionaries/ja.json').then((module) => module.default),
  // Chinese (split by script)
  'zh-hans': () => import('./dictionaries/zh-hans.json').then((module) => module.default),
  'zh-hant': () => import('./dictionaries/zh-hant.json').then((module) => module.default),
  // Spanish
  es: () => import('./dictionaries/es.json').then((module) => module.default),
  // Eastern European
  ru: () => import('./dictionaries/ru.json').then((module) => module.default),
  uk: () => import('./dictionaries/uk.json').then((module) => module.default),
  // Middle Eastern (RTL)
  he: () => import('./dictionaries/he.json').then((module) => module.default),
  ar: () => import('./dictionaries/ar.json').then((module) => module.default),
  // Western European
  fr: () => import('./dictionaries/fr.json').then((module) => module.default),
  de: () => import('./dictionaries/de.json').then((module) => module.default),
  sv: () => import('./dictionaries/sv.json').then((module) => module.default),
  nl: () => import('./dictionaries/nl.json').then((module) => module.default),
  vi: () => import('./dictionaries/vi.json').then((module) => module.default),
  pl: () => import('./dictionaries/pl.json').then((module) => module.default),
  // Portuguese (split by region)
  'pt-BR': () => import('./dictionaries/pt-BR.json').then((module) => module.default),
  'pt-PT': () => import('./dictionaries/pt-PT.json').then((module) => module.default),
};

export const getDictionary = async (locale: Locale): Promise<Dictionary> => {
  // Always load English as the base/fallback
  const englishDict = await import('./dictionaries/en.json').then((m) => m.default);

  // If requested locale is English, return directly
  if (locale === 'en') {
    return englishDict;
  }

  // Load the requested locale
  const localeDict = await dictionaryLoaders[locale]?.() ?? {};

  // Deep merge: locale dict with English fallback for missing keys
  return deepMerge(localeDict, englishDict as Record<string, unknown>) as Dictionary;
};
