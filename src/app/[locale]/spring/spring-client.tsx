"use client";

import { useState } from "react";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";

interface SpringClientProps {
  dict: Dictionary;
  locale: Locale;
}

export function SpringClient({ dict, locale }: SpringClientProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setStatus("success");
    setEmail("");
  };

  const t = dict.springPage;
  const nav = dict.nav;
  const footer = dict.footer;

  return (
    <div className="min-h-screen gradient-spring relative overflow-hidden">
      {/* Decorative Floating Elements - Sakura Petals */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-pink-300/30 rounded-full blur-3xl animate-float" />
        <div
          className="absolute top-40 right-20 w-96 h-96 bg-rose-200/30 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute bottom-40 left-1/4 w-64 h-64 bg-pink-200/40 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "4s" }}
        />
        <div
          className="absolute bottom-20 right-1/3 w-80 h-80 bg-rose-300/20 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "3s" }}
        />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-400 via-rose-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-xl tracking-tight bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent">
              Seizn
            </span>
            <span className="text-pink-500 text-xl">🌸</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link href={`/${locale}/summer`} className="text-sm text-gray-600 hover:text-gray-900 transition-colors hidden md:flex items-center gap-1">
              Summer <span>☀️</span>
            </Link>
            <LanguageSwitcher currentLocale={locale} />
            <Link href="/login" className="text-sm spring-gradient-btn text-white px-5 py-2.5 rounded-full shadow-md hover:shadow-lg transition-all duration-300">
              {nav.getStarted}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-36 pb-20 px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 glass-card-premium rounded-full px-4 py-1.5 mb-8 animate-fade-in">
            <span className="w-2 h-2 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full animate-pulse" />
            <span className="text-sm text-pink-700 font-medium">{t.badge}</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-semibold tracking-tight text-gray-900 mb-6 animate-fade-in">
            {t.title}
            <br />
            <span className="bg-gradient-to-r from-pink-500 via-rose-400 to-pink-400 bg-clip-text text-transparent">
              {t.titleHighlight}
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in" style={{ animationDelay: "0.2s" }}>
            {t.subtitle}
          </p>

          {/* Waitlist Form */}
          <div className="max-w-md mx-auto animate-fade-in" style={{ animationDelay: "0.4s" }}>
            {status === "success" ? (
              <div className="flex items-center justify-center gap-2 text-pink-600 glass-card-premium px-6 py-4 rounded-full shadow-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">{t.onTheList}</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                  className="input-elegant flex-1"
                  required
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="px-6 py-3.5 rounded-full spring-gradient-btn text-white font-medium shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 whitespace-nowrap"
                >
                  {status === "loading" ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t.joining}
                    </span>
                  ) : (
                    t.joinWaitlist
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* AI Models Showcase */}
      <section className="py-16 px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card-premium rounded-2xl p-8">
            <div className="flex flex-wrap items-center justify-center gap-8">
              <div className="flex items-center gap-2 text-gray-700">
                <span className="text-2xl">🤖</span>
                <span className="font-medium">GPT-4</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <span className="text-2xl">🧠</span>
                <span className="font-medium">Claude</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <span className="text-2xl">✨</span>
                <span className="font-medium">Gemini</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <span className="text-2xl">🦙</span>
                <span className="font-medium">Llama</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <span className="text-2xl">🔮</span>
                <span className="font-medium">Mistral</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-4">
              {t.features.title}
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              {t.features.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="glass-card-premium rounded-3xl p-8 glass-card-hover">
              <div className="w-14 h-14 bg-gradient-to-br from-pink-100 to-rose-100 rounded-2xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{t.features.multiModel.title}</h3>
              <p className="text-gray-500 leading-relaxed">{t.features.multiModel.description}</p>
            </div>

            {/* Feature 2 */}
            <div className="glass-card-premium rounded-3xl p-8 glass-card-hover">
              <div className="w-14 h-14 bg-gradient-to-br from-pink-100 to-rose-100 rounded-2xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{t.features.persistentMemory.title}</h3>
              <p className="text-gray-500 leading-relaxed">{t.features.persistentMemory.description}</p>
            </div>

            {/* Feature 3 */}
            <div className="glass-card-premium rounded-3xl p-8 glass-card-hover">
              <div className="w-14 h-14 bg-gradient-to-br from-pink-100 to-rose-100 rounded-2xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{t.features.freeGenerosity.title}</h3>
              <p className="text-gray-500 leading-relaxed">{t.features.freeGenerosity.description}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-4">
              {t.pricing.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Free */}
            <div className="glass-card-premium rounded-3xl p-8 glass-card-hover">
              <div className="text-sm font-medium text-gray-500 mb-2">{t.pricing.free.name}</div>
              <div className="text-4xl font-semibold text-gray-900 mb-1">{t.pricing.free.price}</div>
              <div className="text-sm text-gray-500 mb-6">{t.pricing.free.period}</div>
              <ul className="space-y-3 mb-8">
                {t.pricing.free.features.map((feature, i) => (
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
              <button
                onClick={() => {
                  const form = document.querySelector('form');
                  form?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="block w-full py-3.5 rounded-full border-2 border-pink-200 text-pink-600 font-medium hover:bg-pink-50 transition-all duration-300 text-center"
              >
                {t.pricing.free.cta}
              </button>
            </div>

            {/* Pro */}
            <div className="relative spring-gradient-btn rounded-3xl p-8 glass-card-hover overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
              <div className="relative">
                {t.pricing.pro.badge && (
                  <div className="absolute top-0 right-0 bg-white text-pink-600 text-xs px-3 py-1 rounded-full font-medium shadow-md">
                    {t.pricing.pro.badge}
                  </div>
                )}
                <div className="text-sm font-medium text-pink-100 mb-2">{t.pricing.pro.name}</div>
                <div className="text-4xl font-semibold text-white mb-1">{t.pricing.pro.price}</div>
                <div className="text-sm text-pink-100 mb-6">{t.pricing.pro.period}</div>
                <ul className="space-y-3 mb-8">
                  {t.pricing.pro.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-pink-50">
                      <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    const form = document.querySelector('form');
                    form?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="block w-full py-3.5 rounded-full bg-white text-pink-600 font-medium hover:bg-pink-50 transition-all duration-300 text-center shadow-lg"
                >
                  {t.pricing.pro.cta}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 glass border-t border-white/20 relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href={`/${locale}`} className="flex items-center gap-2 group">
            <div className="w-6 h-6 bg-gradient-to-br from-pink-400 via-rose-500 to-pink-600 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="font-medium text-gray-700">Seizn</span>
          </Link>
          <div className="text-sm text-gray-500">
            {footer.copyright.replace('{year}', new Date().getFullYear().toString())}
          </div>
          <nav className="flex items-center gap-6">
            <a href={`/${locale}/privacy`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{footer.privacy}</a>
            <a href={`/${locale}/terms`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{footer.terms}</a>
            <a href="mailto:contact@seizn.com" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{footer.contact}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
