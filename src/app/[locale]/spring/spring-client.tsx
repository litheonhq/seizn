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
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-xl tracking-tight">Seizn</span>
            <span className="text-pink-500 text-xl">🌸</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link href={`/${locale}/summer`} className="text-sm text-gray-600 hover:text-black transition-colors hidden md:block">
              Summer ☀️
            </Link>
            <LanguageSwitcher currentLocale={locale} />
            <Link href="/login" className="text-sm bg-pink-500 text-white px-4 py-2 rounded-full hover:bg-pink-600 transition-colors">
              {nav.getStarted}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-pink-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-pink-100 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 bg-pink-500 rounded-full animate-pulse" />
            <span className="text-sm text-pink-700">{t.badge}</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-gray-900 mb-6">
            {t.title}
            <br />
            <span className="text-pink-400">{t.titleHighlight}</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            {t.subtitle}
          </p>

          {/* Waitlist Form */}
          <div className="max-w-md mx-auto">
            {status === "success" ? (
              <div className="flex items-center justify-center gap-2 text-pink-600 bg-pink-50 px-6 py-3 rounded-full">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{t.onTheList}</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                  className="flex-1 px-5 py-3 rounded-full border border-pink-200 focus:outline-none focus:border-pink-400 transition-colors text-gray-900"
                  required
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="px-6 py-3 rounded-full bg-pink-500 text-white font-medium hover:bg-pink-600 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {status === "loading" ? t.joining : t.joinWaitlist}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* AI Models Showcase */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-60">
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-2xl">🤖</span>
              <span className="font-medium">GPT-4</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-2xl">🧠</span>
              <span className="font-medium">Claude</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-2xl">✨</span>
              <span className="font-medium">Gemini</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-2xl">🦙</span>
              <span className="font-medium">Llama</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-2xl">🔮</span>
              <span className="font-medium">Mistral</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-gray-50">
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
            <div className="bg-white p-8 rounded-2xl border border-gray-100 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{t.features.multiModel.title}</h3>
              <p className="text-gray-500 leading-relaxed">
                {t.features.multiModel.description}
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-8 rounded-2xl border border-gray-100 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{t.features.persistentMemory.title}</h3>
              <p className="text-gray-500 leading-relaxed">
                {t.features.persistentMemory.description}
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-8 rounded-2xl border border-gray-100 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{t.features.freeGenerosity.title}</h3>
              <p className="text-gray-500 leading-relaxed">
                {t.features.freeGenerosity.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-4">
              {t.pricing.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Free */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 hover:shadow-lg transition-shadow">
              <div className="text-sm font-medium text-gray-500 mb-2">{t.pricing.free.name}</div>
              <div className="text-3xl font-semibold text-gray-900 mb-1">{t.pricing.free.price}</div>
              <div className="text-sm text-gray-500 mb-6">{t.pricing.free.period}</div>
              <ul className="space-y-3 mb-8">
                {t.pricing.free.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                    <svg className="w-4 h-4 text-pink-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  const form = document.querySelector('form');
                  form?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="block w-full py-3 rounded-full border border-gray-200 text-gray-900 font-medium hover:bg-gray-50 transition-colors text-center"
              >
                {t.pricing.free.cta}
              </button>
            </div>

            {/* Pro */}
            <div className="bg-pink-500 p-6 rounded-2xl relative hover:shadow-lg transition-shadow">
              {t.pricing.pro.badge && (
                <div className="absolute top-4 right-4 bg-white text-pink-600 text-xs px-2 py-1 rounded-full font-medium">
                  {t.pricing.pro.badge}
                </div>
              )}
              <div className="text-sm font-medium text-pink-200 mb-2">{t.pricing.pro.name}</div>
              <div className="text-3xl font-semibold text-white mb-1">{t.pricing.pro.price}</div>
              <div className="text-sm text-pink-200 mb-6">{t.pricing.pro.period}</div>
              <ul className="space-y-3 mb-8">
                {t.pricing.pro.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-pink-100">
                    <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  const form = document.querySelector('form');
                  form?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="block w-full py-3 rounded-full bg-white text-pink-600 font-medium hover:bg-pink-50 transition-colors text-center"
              >
                {t.pricing.pro.cta}
              </button>
            </div>
          </div>
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
