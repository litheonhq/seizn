"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import type { Locale } from "@/i18n/config";

type Dictionary = Record<string, unknown>;

interface DashboardLocaleContextType {
  locale: Locale;
  dictionary: Dictionary;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLoading: boolean;
}

const DashboardLocaleContext = createContext<DashboardLocaleContextType | null>(null);

// Get nested value from object using dot notation
function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : undefined;
}

// Replace {param} placeholders with values
function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;

  return str.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key]?.toString() ?? `{${key}}`;
  });
}

// Get locale from cookie
function getLocaleFromCookie(): Locale {
  if (typeof document === "undefined") return "en";

  const match = document.cookie.match(/NEXT_LOCALE=([^;]+)/);
  return (match?.[1] as Locale) || "en";
}

// Dynamic dictionary import
async function loadDictionary(locale: Locale): Promise<Dictionary> {
  try {
    const dict = await import(`@/i18n/dictionaries/${locale}.json`);
    return dict.default || dict;
  } catch {
    // Fallback to English
    const dict = await import("@/i18n/dictionaries/en.json");
    return dict.default || dict;
  }
}

interface Props {
  children: ReactNode;
  initialLocale?: Locale;
}

export function DashboardLocaleProvider({ children, initialLocale }: Props) {
  const [locale, setLocale] = useState<Locale>(initialLocale || "en");
  const [dictionary, setDictionary] = useState<Dictionary>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load dictionary on mount and when locale changes
  useEffect(() => {
    const detectedLocale = getLocaleFromCookie();
    setLocale(detectedLocale);

    setIsLoading(true);
    loadDictionary(detectedLocale)
      .then(setDictionary)
      .finally(() => setIsLoading(false));
  }, []);

  // Translation function
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const value = getNestedValue(dictionary, key);
      if (!value) {
        // Only warn if dictionary is loaded (not during initial render/build)
        if (Object.keys(dictionary).length > 0) {
          console.warn(`[i18n] Missing translation: ${key}`);
        }
        return key.split(".").pop() || key;
      }
      return interpolate(value, params);
    },
    [dictionary]
  );

  return (
    <DashboardLocaleContext.Provider value={{ locale, dictionary, t, isLoading }}>
      {children}
    </DashboardLocaleContext.Provider>
  );
}

export function useDashboardTranslation() {
  const context = useContext(DashboardLocaleContext);

  if (!context) {
    throw new Error("useDashboardTranslation must be used within DashboardLocaleProvider");
  }

  return context;
}
