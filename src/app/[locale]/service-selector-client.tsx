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
    <div className="min-h-screen gradient-hero relative overflow-hidden">
      {/* Decorative Floating Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-pink-200/30 rounded-full blur-3xl animate-float" />
        <div
          className="absolute top-40 right-20 w-96 h-96 bg-cyan-200/20 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute bottom-20 left-1/3 w-80 h-80 bg-purple-200/20 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "4s" }}
        />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-xl tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              Seizn
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href="/login"
              className="text-sm btn-premium bg-gradient-to-r from-gray-900 to-gray-700 text-white px-5 py-2.5 rounded-full hover:shadow-lg transition-all duration-300"
            >
              {dict.nav.getStarted}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-36 pb-16 px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Animated Badge */}
          <div className="inline-flex items-center gap-2 glass-card-premium rounded-full px-4 py-1.5 mb-8 animate-fade-in">
            <span className="w-2 h-2 bg-gradient-to-r from-pink-500 to-cyan-500 rounded-full animate-pulse" />
            <span className="text-sm text-gray-600 font-medium">AI-Powered Platform</span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-gray-900 mb-6 animate-fade-in">
            {t.title}
          </h1>
          <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed animate-fade-in" style={{ animationDelay: "0.2s" }}>
            {t.subtitle}
          </p>
        </div>
      </section>

      {/* Service Cards */}
      <section className="py-12 px-6 relative z-10">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Spring Card */}
            <Link href={`/${locale}/spring`} className="group h-full">
              <div className="relative h-full glass-card-premium rounded-3xl p-8 glass-card-hover overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-pink-100/50 via-rose-50/30 to-transparent opacity-60" />
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br from-pink-200/40 to-rose-200/20 rounded-full blur-2xl" />
                <div className="relative">
                  {t.spring.badge && (
                    <div className="absolute top-0 right-0 spring-gradient-btn text-white text-xs px-3 py-1 rounded-full font-medium shadow-md">
                      {t.spring.badge}
                    </div>
                  )}
                  <div className="text-6xl mb-6 filter drop-shadow-sm">{t.spring.icon}</div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    {t.spring.name}
                    <span className="text-base font-normal text-pink-600">{t.spring.tagline}</span>
                  </h2>
                  <p className="text-gray-600 mb-6 leading-relaxed">{t.spring.description}</p>
                  <ul className="space-y-3 mb-8">
                    {t.spring.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-gray-600">
                        <div className="w-5 h-5 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2 spring-gradient-btn text-white font-medium px-5 py-2.5 rounded-full w-fit group-hover:gap-3 transition-all duration-300 shadow-md group-hover:shadow-lg">
                    {t.spring.cta}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            {/* Summer Card */}
            <Link href={`/${locale}/summer`} className="group h-full">
              <div className="relative h-full glass-card-premium rounded-3xl p-8 glass-card-hover overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-100/50 via-sky-50/30 to-transparent opacity-60" />
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br from-cyan-200/40 to-sky-200/20 rounded-full blur-2xl" />
                <div className="relative">
                  {t.summer.badge && (
                    <div className="absolute top-0 right-0 summer-gradient-btn text-white text-xs px-3 py-1 rounded-full font-medium shadow-md">
                      {t.summer.badge}
                    </div>
                  )}
                  <div className="text-6xl mb-6 filter drop-shadow-sm">{t.summer.icon}</div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    {t.summer.name}
                    <span className="text-base font-normal text-cyan-600">{t.summer.tagline}</span>
                  </h2>
                  <p className="text-gray-600 mb-6 leading-relaxed">{t.summer.description}</p>
                  <ul className="space-y-3 mb-8">
                    {t.summer.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-gray-600">
                        <div className="w-5 h-5 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2 summer-gradient-btn text-white font-medium px-5 py-2.5 rounded-full w-fit group-hover:gap-3 transition-all duration-300 shadow-md group-hover:shadow-lg">
                    {t.summer.cta}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="py-16 px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card-premium rounded-2xl p-8">
            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
              <div className="flex items-center gap-3 text-gray-600">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">SOC 2 Compliant</div>
                  <div className="text-xs text-gray-500">Enterprise Security</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">99.9% Uptime</div>
                  <div className="text-xs text-gray-500">High Availability</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">End-to-End Encrypted</div>
                  <div className="text-xs text-gray-500">Your Data is Safe</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Note */}
      <section className="py-8 px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-gray-400 text-sm">{t.footer}</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 glass border-t border-white/20 relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href={`/${locale}`} className="flex items-center gap-2 group">
            <div className="w-6 h-6 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="font-medium text-gray-700">Seizn</span>
          </Link>
          <div className="text-sm text-gray-500">
            {dict.footer.copyright.replace('{year}', new Date().getFullYear().toString())}
          </div>
          <nav className="flex items-center gap-6">
            <a href={`/${locale}/privacy`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{dict.footer.privacy}</a>
            <a href={`/${locale}/terms`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{dict.footer.terms}</a>
            <a href="mailto:info@seizn.com" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{dict.footer.contact}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
