'use client';

import { usePathname, useRouter } from 'next/navigation';
import { locales, localeNames, type Locale } from '@/i18n/config';
import { setStoredLocale } from '@/lib/locale';

interface LanguageSwitcherProps {
  currentLocale: Locale;
  className?: string;
}

export function LanguageSwitcher({ currentLocale, className = '' }: LanguageSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleChange = (newLocale: Locale) => {
    // Remove current locale from pathname and add new one
    const segments = pathname.split('/');
    segments[1] = newLocale;
    const newPath = segments.join('/');

    // Set cookie
    document.cookie = `NEXT_LOCALE=${newLocale};max-age=${60 * 60 * 24 * 365};path=/`;

    router.push(newPath);
  };

  return (
    <div className={`relative ${className}`}>
      <select
        value={currentLocale}
        onChange={(e) => handleChange(e.target.value as Locale)}
        className="appearance-none bg-transparent border border-gray-200 rounded-full px-3 py-1.5 pr-8 text-sm text-gray-600 hover:border-gray-400 focus:outline-none focus:border-gray-400 cursor-pointer"
        aria-label="Select language"
      >
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {localeNames[locale]}
          </option>
        ))}
      </select>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

// Icon version for mobile/compact layouts
export function LanguageSwitcherIcon({ currentLocale, className = '' }: LanguageSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();

  const cycleLocale = () => {
    const currentIndex = locales.indexOf(currentLocale);
    const nextIndex = (currentIndex + 1) % locales.length;
    const newLocale = locales[nextIndex];

    const segments = pathname.split('/');
    segments[1] = newLocale;
    const newPath = segments.join('/');

    document.cookie = `NEXT_LOCALE=${newLocale};max-age=${60 * 60 * 24 * 365};path=/`;

    router.push(newPath);
  };

  const flagEmoji: Record<Locale, string> = {
    en: '🇺🇸',
    ko: '🇰🇷',
    ja: '🇯🇵',
  };

  return (
    <button
      onClick={cycleLocale}
      className={`flex items-center gap-1 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors ${className}`}
      aria-label={`Current language: ${localeNames[currentLocale]}. Click to change.`}
    >
      <span className="text-lg">{flagEmoji[currentLocale]}</span>
      <span className="text-xs text-gray-500 uppercase">{currentLocale}</span>
    </button>
  );
}
