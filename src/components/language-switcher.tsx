'use client';

import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { locales, localeNames, type Locale } from '@/i18n/config';

interface LanguageSwitcherProps {
  currentLocale: Locale;
  className?: string;
}

const flagEmoji: Record<Locale, string> = {
  en: '🇺🇸',
  ko: '🇰🇷',
  ja: '🇯🇵',
  'zh-hans': '🇨🇳',
  'zh-hant': '🇹🇼',
  es: '🇪🇸',
  ru: '🇷🇺',
  uk: '🇺🇦',
  he: '🇮🇱',
  ar: '🇸🇦',
  fr: '🇫🇷',
  de: '🇩🇪',
  it: '🇮🇹',
  sv: '🇸🇪',
  nl: '🇳🇱',
  pl: '🇵🇱',
  hi: '🇮🇳',
  th: '🇹🇭',
  id: '🇮🇩',
  vi: '🇻🇳',
  'pt-BR': '🇧🇷',
  'pt-PT': '🇵🇹',
};

// Language groups for organized display
const languageGroups = {
  popular: ['en', 'ko', 'ja', 'zh-hans', 'zh-hant'] as Locale[],
  europe: ['fr', 'de', 'es', 'it', 'nl', 'pl', 'sv', 'ru', 'uk', 'pt-PT'] as Locale[],
  asia: ['hi', 'th', 'id', 'vi', 'ar', 'he'] as Locale[],
  americas: ['pt-BR'] as Locale[],
};

function changeLocale(newLocale: Locale, currentLocale: Locale, pathname: string) {
  if (newLocale === currentLocale) return;

  // Remove current locale from pathname and add new one
  const segments = pathname.split('/');
  segments[1] = newLocale;
  const newPath = segments.join('/');

  // Set cookie
  document.cookie = `NEXT_LOCALE=${newLocale};max-age=${60 * 60 * 24 * 365};path=/`;

  // Persist to profile if logged in (best-effort)
  fetch('/api/profile/language', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: newLocale }),
    credentials: 'include',
  }).catch(() => {
    // ignore errors (e.g., anonymous user)
  });

  // Force full page reload to load new dictionary from server
  window.location.href = newPath;
}

export function LanguageSwitcher({ currentLocale, className = '' }: LanguageSwitcherProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleSelect = (locale: Locale) => {
    setIsOpen(false);
    changeLocale(locale, currentLocale, pathname);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-zinc-800 transition-colors"
        aria-label={`Current language: ${localeNames[currentLocale]}. Click to change.`}
        aria-expanded={isOpen}
      >
        <span className="text-base">{flagEmoji[currentLocale]}</span>
        <span className="text-sm text-gray-700 dark:text-gray-300">{localeNames[currentLocale]}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800 shadow-xl z-50">
          <div className="p-3 space-y-4">
            {/* Popular Languages */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-1">
                Popular
              </h4>
              <div className="grid grid-cols-2 gap-1">
                {languageGroups.popular.map((locale) => (
                  <LanguageOption
                    key={locale}
                    locale={locale}
                    isSelected={locale === currentLocale}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </div>

            {/* Europe */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-1">
                Europe
              </h4>
              <div className="grid grid-cols-2 gap-1">
                {languageGroups.europe.map((locale) => (
                  <LanguageOption
                    key={locale}
                    locale={locale}
                    isSelected={locale === currentLocale}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </div>

            {/* Asia & Middle East */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-1">
                Asia & Middle East
              </h4>
              <div className="grid grid-cols-2 gap-1">
                {languageGroups.asia.map((locale) => (
                  <LanguageOption
                    key={locale}
                    locale={locale}
                    isSelected={locale === currentLocale}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </div>

            {/* Americas */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-1">
                Americas
              </h4>
              <div className="grid grid-cols-2 gap-1">
                {languageGroups.americas.map((locale) => (
                  <LanguageOption
                    key={locale}
                    locale={locale}
                    isSelected={locale === currentLocale}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LanguageOption({
  locale,
  isSelected,
  onSelect,
}: {
  locale: Locale;
  isSelected: boolean;
  onSelect: (locale: Locale) => void;
}) {
  return (
    <button
      onClick={() => onSelect(locale)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
        isSelected
          ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
          : 'hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300'
      }`}
    >
      <span className="text-base">{flagEmoji[locale]}</span>
      <span className="text-sm font-medium truncate">{localeNames[locale]}</span>
      {isSelected && (
        <svg className="w-4 h-4 ml-auto text-emerald-600 dark:text-emerald-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}

// Icon version for mobile/compact layouts
export function LanguageSwitcherIcon({ currentLocale, className = '' }: LanguageSwitcherProps) {
  const pathname = usePathname();

  const cycleLocale = () => {
    const currentIndex = locales.indexOf(currentLocale);
    const nextIndex = (currentIndex + 1) % locales.length;
    const newLocale = locales[nextIndex];
    changeLocale(newLocale, currentLocale, pathname);
  };

  return (
    <button
      onClick={cycleLocale}
      className={`flex items-center gap-1 px-2 py-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors ${className}`}
      aria-label={`Current language: ${localeNames[currentLocale]}. Click to change.`}
    >
      <span className="text-lg">{flagEmoji[currentLocale]}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">{currentLocale}</span>
    </button>
  );
}
