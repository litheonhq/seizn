"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";

interface ServiceSelectorClientProps {
  dict: Dictionary;
  locale: Locale;
}

export function ServiceSelectorClient({ dict, locale }: ServiceSelectorClientProps) {
  const t = dict.serviceSelector;

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-xl tracking-tight">Seizn</span>
          </Link>

          <div className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            <Link href="/login" className="text-sm bg-black text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors">
              {dict.nav.getStarted}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-gray-900 mb-4">
            {t.title}
          </h1>
          <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto">
            {t.subtitle}
          </p>
        </div>
      </section>

      {/* Service Cards */}
      <section className="py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Spring Card */}
            <Link href={`/${locale}/spring`} className="group">
              <div className="relative bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-100 p-8 rounded-3xl hover:shadow-xl hover:shadow-pink-100/50 transition-all duration-300 hover:-translate-y-1">
                {t.spring.badge && (
                  <div className="absolute top-6 right-6 bg-pink-500 text-white text-xs px-3 py-1 rounded-full font-medium">
                    {t.spring.badge}
                  </div>
                )}
                <div className="text-6xl mb-6">{t.spring.icon}</div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  {t.spring.name}
                  <span className="text-base font-normal text-pink-600">{t.spring.tagline}</span>
                </h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  {t.spring.description}
                </p>
                <ul className="space-y-3 mb-8">
                  {t.spring.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-pink-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 text-pink-600 font-medium group-hover:gap-3 transition-all">
                  {t.spring.cta}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Summer Card */}
            <Link href={`/${locale}/summer`} className="group">
              <div className="relative bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 p-8 rounded-3xl hover:shadow-xl hover:shadow-amber-100/50 transition-all duration-300 hover:-translate-y-1">
                {t.summer.badge && (
                  <div className="absolute top-6 right-6 bg-amber-500 text-white text-xs px-3 py-1 rounded-full font-medium">
                    {t.summer.badge}
                  </div>
                )}
                <div className="text-6xl mb-6">{t.summer.icon}</div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  {t.summer.name}
                  <span className="text-base font-normal text-amber-600">{t.summer.tagline}</span>
                </h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  {t.summer.description}
                </p>
                <ul className="space-y-3 mb-8">
                  {t.summer.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 text-amber-600 font-medium group-hover:gap-3 transition-all">
                  {t.summer.cta}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer Note */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-gray-400 text-sm">
            {t.footer}
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <div className="w-6 h-6 bg-black rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="font-medium">Seizn</span>
          </Link>
          <div className="text-sm text-gray-500">
            {dict.footer.copyright.replace('{year}', new Date().getFullYear().toString())}
          </div>
          <nav className="flex items-center gap-6">
            <a href={`/${locale}/privacy`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{dict.footer.privacy}</a>
            <a href={`/${locale}/terms`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{dict.footer.terms}</a>
            <a href="mailto:contact@seizn.com" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{dict.footer.contact}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
