'use client';

import { useState, useEffect, useCallback } from 'react';
import { Locale, defaultLocale } from '@/i18n/config';
import { getStoredLocale, setStoredLocale, detectLocale } from '@/lib/locale';
import type { Dictionary } from '@/i18n/get-dictionary';

// Cache dictionaries to avoid re-fetching
const dictionaryCache: Partial<Record<Locale, Dictionary>> = {};

async function loadDictionary(locale: Locale): Promise<Dictionary> {
  if (dictionaryCache[locale]) {
    return dictionaryCache[locale]!;
  }

  const dict = await import(`@/i18n/dictionaries/${locale}.json`).then(m => m.default);
  dictionaryCache[locale] = dict;
  return dict;
}

interface UseLocaleOptions {
  userLocale?: Locale | null; // From user profile
  countryCode?: string | null; // From IP detection
}

export function useLocale(options?: UseLocaleOptions) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize locale
  useEffect(() => {
    const detected = detectLocale({
      userLocale: options?.userLocale,
      countryCode: options?.countryCode,
    });
    setLocaleState(detected);
  }, [options?.userLocale, options?.countryCode]);

  // Load dictionary when locale changes
  useEffect(() => {
    setIsLoading(true);
    loadDictionary(locale)
      .then(setDictionary)
      .finally(() => setIsLoading(false));
  }, [locale]);

  // Change locale and persist
  const setLocale = useCallback(async (newLocale: Locale, saveToProfile = false) => {
    setLocaleState(newLocale);
    setStoredLocale(newLocale);

    // Optionally save to user profile
    if (saveToProfile) {
      try {
        await fetch('/api/profile/language', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: newLocale }),
        });
      } catch (error) {
        console.error('Failed to save language preference:', error);
      }
    }
  }, []);

  // Helper to get translated text with fallback
  const t = useCallback((key: string, fallback?: string): string => {
    if (!dictionary) return fallback || key;

    const keys = key.split('.');
    let value: unknown = dictionary;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return fallback || key;
      }
    }

    return typeof value === 'string' ? value : fallback || key;
  }, [dictionary]);

  return {
    locale,
    setLocale,
    dictionary,
    isLoading,
    t,
  };
}
