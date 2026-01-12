import type { Locale } from './config';

// Type for the dictionary
export type Dictionary = typeof import('./dictionaries/en.json');

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
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
  return dictionaries[locale]?.() ?? dictionaries.en();
};
