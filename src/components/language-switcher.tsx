'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { locales, localeNames, type Locale } from '@/i18n/config';

interface LanguageSwitcherProps {
  currentLocale: Locale;
  className?: string;
  variant?: 'light' | 'dark';
  align?: 'left' | 'right';
  fullWidth?: boolean;
}

const languageGroups: Array<{ label: string; locales: Locale[] }> = [
  { label: 'Primary', locales: ['en', 'ko', 'ja', 'zh-hans', 'zh-hant'] },
  { label: 'Europe', locales: ['fr', 'de', 'es', 'it', 'nl', 'pl', 'sv', 'ru', 'uk', 'pt-PT'] },
  { label: 'Asia and Middle East', locales: ['hi', 'th', 'id', 'vi', 'ar', 'he'] },
  { label: 'Americas', locales: ['pt-BR'] },
];
const orderedLocales = languageGroups.flatMap((group) => group.locales);

function getLocaleCode(locale: Locale): string {
  if (locale === 'zh-hans') return 'ZH-S';
  if (locale === 'zh-hant') return 'ZH-T';
  return locale.toUpperCase();
}

export function getLocalizedPath(pathname: string, newLocale: Locale): string {
  const segments = (pathname || '/').split('/');
  const currentSegment = segments[1];

  if (locales.includes(currentSegment as Locale)) {
    segments[1] = newLocale;
  } else {
    segments.splice(1, 0, newLocale);
  }

  const nextPath = segments.join('/').replace(/\/{2,}/g, '/');
  return nextPath === '' ? `/${newLocale}` : nextPath;
}

function changeLocale(
  newLocale: Locale,
  currentLocale: Locale,
  pathname: string,
  navigate: (path: string) => void,
) {
  if (newLocale === currentLocale) return;

  const newPath = getLocalizedPath(pathname, newLocale);
  const urlSuffix = typeof window === 'undefined' ? '' : `${window.location.search}${window.location.hash}`;

  document.cookie = `NEXT_LOCALE=${newLocale};max-age=${60 * 60 * 24 * 365};path=/;SameSite=Lax`;
  window.dispatchEvent(new CustomEvent('localeChange', { detail: { locale: newLocale } }));
  navigate(`${newPath}${urlSuffix}`);
}

export function LanguageSwitcher({
  currentLocale,
  className = '',
  variant = 'light',
  align = 'right',
  fullWidth = false,
}: LanguageSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = variant === 'dark';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    changeLocale(locale, currentLocale, pathname, (path) => router.push(path));
  };

  const triggerClassName = [
    'inline-flex min-h-10 items-center justify-center rounded-full border px-3.5 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]',
    fullWidth ? 'w-full' : 'min-w-14',
    isDark
      ? 'border-white/15 bg-white/[0.07] text-white hover:border-white/25 hover:bg-white/[0.12]'
      : 'border-szn-border-subtle bg-szn-card/85 text-szn-text-1 shadow-sm hover:bg-szn-surface',
  ].join(' ');
  const panelPosition = align === 'left' ? 'left-0' : 'right-0';

  return (
    <div ref={containerRef} className={`relative ${fullWidth ? 'w-full' : ''} ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={triggerClassName}
        aria-label={`Current language: ${localeNames[currentLocale]}. Change language.`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        data-testid="language-switcher-trigger"
      >
        {getLocaleCode(currentLocale)}
      </button>

      {isOpen && (
        <div
          className={`absolute ${panelPosition} top-full z-[80] mt-2 max-h-[70vh] w-[min(15rem,calc(100vw-2rem))] overflow-y-auto rounded-[var(--radius-md)] border border-[color:var(--ink-200)] bg-[color:var(--ink-0)] p-2 text-[color:var(--ink-900)] shadow-2xl`}
          aria-label="Choose language"
          tabIndex={0}
        >
          <div className="grid grid-cols-3 gap-1">
            {orderedLocales.map((locale) => (
              <LanguageOption
                key={locale}
                locale={locale}
                isSelected={locale === currentLocale}
                onSelect={handleSelect}
              />
            ))}
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
      type="button"
      onClick={() => onSelect(locale)}
      data-locale={locale}
      aria-pressed={isSelected}
      aria-label={localeNames[locale]}
      className={`flex min-h-10 items-center justify-center rounded-[var(--radius-sm)] px-2 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
        isSelected
          ? 'bg-[color:var(--terracotta-100)] text-[color:var(--ink-900)]'
          : 'text-[color:var(--ink-700)] hover:bg-[color:var(--ink-100)] hover:text-[color:var(--ink-900)]'
      }`}
    >
      {getLocaleCode(locale)}
    </button>
  );
}

export function LanguageSwitcherIcon({
  currentLocale,
  className = '',
  variant = 'light',
}: LanguageSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isDark = variant === 'dark';

  const cycleLocale = () => {
    const currentIndex = locales.indexOf(currentLocale);
    const nextIndex = (currentIndex + 1) % locales.length;
    const newLocale = locales[nextIndex];
    changeLocale(newLocale, currentLocale, pathname, (path) => router.push(path));
  };

  return (
    <button
      type="button"
      onClick={cycleLocale}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        isDark
          ? 'border-white/15 bg-white/[0.07] text-white hover:bg-white/[0.12]'
          : 'border-szn-border-subtle bg-szn-card text-szn-text-1 hover:bg-szn-surface'
      } ${className}`}
      aria-label={`Current language: ${localeNames[currentLocale]}. Change language.`}
    >
      <span className="font-mono text-xs uppercase">{getLocaleCode(currentLocale)}</span>
    </button>
  );
}
