"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckoutButton, PLAN_VARIANTS } from "@/components/checkout-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
  }
}

interface SummerClientProps {
  dict: Dictionary;
  locale: Locale;
}

export function SummerClient({ dict, locale }: SummerClientProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.createLemonSqueezy) {
      window.createLemonSqueezy();
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setStatus("success");
    setEmail("");
  };

  const t = dict;

  return (
    <div className="min-h-screen gradient-summer relative overflow-hidden">
      {/* Decorative Floating Elements - Ocean Waves */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-cyan-300/30 rounded-full blur-3xl animate-float" />
        <div
          className="absolute top-40 right-20 w-96 h-96 bg-sky-200/30 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute bottom-40 left-1/4 w-64 h-64 bg-teal-200/40 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "4s" }}
        />
        <div
          className="absolute bottom-20 right-1/3 w-80 h-80 bg-cyan-200/20 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "3s" }}
        />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/20" role="navigation" aria-label="Main navigation">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-2 group" aria-label="Seizn Home">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 via-sky-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-xl tracking-tight bg-gradient-to-r from-cyan-600 to-teal-500 bg-clip-text text-transparent">
              Seizn
            </span>
            <span className="text-amber-500 text-xl">☀️</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-6">
            <Link href={`/${locale}/spring`} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Spring 🌸</Link>
            <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">{t.nav.features}</a>
            <Link href={`/${locale}/pricing`} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">{t.nav.pricing}</Link>
            <a href={`/${locale}/docs`} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">{t.nav.docs}</a>
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">{t.nav.login}</Link>
            <LanguageSwitcher currentLocale={locale} />
            <Link href="/login" className="text-sm summer-gradient-btn text-white px-5 py-2.5 rounded-full shadow-md hover:shadow-lg transition-all duration-300">
              {t.nav.getStarted}
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-gray-600 hover:text-gray-900 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden glass border-t border-white/20 animate-fade-in">
            <div className="px-6 py-4 space-y-4">
              <Link href={`/${locale}/spring`} className="block text-gray-600 hover:text-gray-900 transition-colors">Spring 🌸</Link>
              <a href="#features" className="block text-gray-600 hover:text-gray-900 transition-colors" onClick={() => setMobileMenuOpen(false)}>{t.nav.features}</a>
              <Link href={`/${locale}/pricing`} className="block text-gray-600 hover:text-gray-900 transition-colors" onClick={() => setMobileMenuOpen(false)}>{t.nav.pricing}</Link>
              <a href={`/${locale}/docs`} className="block text-gray-600 hover:text-gray-900 transition-colors" onClick={() => setMobileMenuOpen(false)}>{t.nav.docs}</a>
              <Link href="/login" className="block text-gray-600 hover:text-gray-900 transition-colors" onClick={() => setMobileMenuOpen(false)}>{t.nav.login}</Link>
              <div className="py-2">
                <LanguageSwitcher currentLocale={locale} />
              </div>
              <Link href="/login" className="block w-full text-center summer-gradient-btn text-white px-4 py-3 rounded-full shadow-md" onClick={() => setMobileMenuOpen(false)}>
                {t.nav.getStarted}
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-36 pb-20 px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 glass-card-premium rounded-full px-4 py-1.5 mb-8 animate-fade-in">
            <span className="w-2 h-2 bg-gradient-to-r from-cyan-500 to-teal-500 rounded-full animate-pulse" />
            <span className="text-sm text-cyan-700 font-medium">{t.hero.badge}</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-semibold tracking-tight text-gray-900 mb-6 animate-fade-in">
            {t.hero.title}
            <br />
            <span className="bg-gradient-to-r from-cyan-500 via-sky-400 to-teal-400 bg-clip-text text-transparent">
              {t.hero.titleHighlight}
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in" style={{ animationDelay: "0.2s" }}>
            {t.hero.subtitle}
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-in" style={{ animationDelay: "0.4s" }}>
            {status === "success" ? (
              <div className="flex items-center gap-2 text-cyan-600 glass-card-premium px-6 py-4 rounded-full shadow-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">{t.hero.onTheList}</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.hero.emailPlaceholder}
                  className="input-elegant flex-1"
                  required
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="px-6 py-3.5 rounded-full summer-gradient-btn text-white font-medium shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 whitespace-nowrap"
                >
                  {status === "loading" ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t.hero.joining}
                    </span>
                  ) : (
                    t.hero.joinWaitlist
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Stats */}
          <div className="glass-card-premium rounded-2xl p-8 inline-flex items-center justify-center gap-12 text-center">
            <div>
              <div className="text-3xl font-semibold text-gray-900">90%</div>
              <div className="text-sm text-gray-500">{t.hero.stats.tokenSavings}</div>
            </div>
            <div className="w-px h-12 bg-gray-200" />
            <div>
              <div className="text-3xl font-semibold text-gray-900">&lt;50ms</div>
              <div className="text-sm text-gray-500">{t.hero.stats.retrievalTime}</div>
            </div>
            <div className="w-px h-12 bg-gray-200" />
            <div>
              <div className="text-3xl font-semibold text-gray-900">99.9%</div>
              <div className="text-sm text-gray-500">{t.hero.stats.uptimeSla}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 relative z-10">
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
              <div className="w-14 h-14 bg-gradient-to-br from-cyan-100 to-sky-100 rounded-2xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{t.features.smartExtraction.title}</h3>
              <p className="text-gray-500 leading-relaxed">{t.features.smartExtraction.description}</p>
            </div>

            {/* Feature 2 */}
            <div className="glass-card-premium rounded-3xl p-8 glass-card-hover">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-violet-100 rounded-2xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{t.features.instantRetrieval.title}</h3>
              <p className="text-gray-500 leading-relaxed">{t.features.instantRetrieval.description}</p>
            </div>

            {/* Feature 3 */}
            <div className="glass-card-premium rounded-3xl p-8 glass-card-hover">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{t.features.enterpriseSecurity.title}</h3>
              <p className="text-gray-500 leading-relaxed">{t.features.enterpriseSecurity.description}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Code Preview Section */}
      <section className="py-20 px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-4">
              {t.codePreview.title}
            </h2>
            <p className="text-gray-500">
              {t.codePreview.subtitle}
            </p>
          </div>

          <div className="glass-card-premium rounded-3xl overflow-hidden shadow-2xl">
            <div className="bg-gray-900 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <pre className="text-sm text-gray-300 overflow-x-auto">
                <code>{`import { Seizn } from 'seizn';

const seizn = new Seizn({ apiKey: process.env.SEIZN_API_KEY });

// Add a memory
await seizn.add({
  content: "User prefers dark mode and lives in Seoul",
  userId: "user_123"
});

// Search memories
const memories = await seizn.search({
  query: "What are the user's preferences?",
  userId: "user_123"
});`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-4">
              {t.pricing.title}
            </h2>
            <p className="text-gray-500">
              {t.pricing.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Free */}
            <div className="glass-card-premium rounded-3xl p-6 glass-card-hover flex flex-col">
              <div className="text-sm font-medium text-gray-500 mb-2">{t.pricing.free.name}</div>
              <div className="text-3xl font-semibold text-gray-900 mb-1">{t.pricing.free.price}</div>
              <div className="text-sm text-gray-500 mb-6">{t.pricing.free.period}</div>
              <ul className="space-y-3 flex-grow">
                {t.pricing.free.features.map((feature, i) => (
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
              <Link href="/login" className="block w-full py-3.5 rounded-full border-2 border-cyan-200 text-cyan-600 font-medium hover:bg-cyan-50 transition-all duration-300 text-center mt-8">
                {t.pricing.free.cta}
              </Link>
            </div>

            {/* Plus */}
            <div className="glass-card-premium rounded-3xl p-6 glass-card-hover flex flex-col">
              <div className="text-sm font-medium text-gray-500 mb-2">{t.pricing.plus.name}</div>
              <div className="text-3xl font-semibold text-gray-900 mb-1">{t.pricing.plus.price}</div>
              <div className="text-sm text-gray-500 mb-6">{t.pricing.plus.period}</div>
              <ul className="space-y-3 flex-grow">
                {t.pricing.plus.features.map((feature, i) => (
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
              <CheckoutButton
                priceId={PLAN_VARIANTS.plus}
                className="block w-full py-3.5 rounded-full border-2 border-cyan-200 text-cyan-600 font-medium hover:bg-cyan-50 transition-all duration-300 text-center mt-8"
              >
                {t.pricing.plus.cta}
              </CheckoutButton>
            </div>

            {/* Pro */}
            <div className="relative summer-gradient-btn rounded-3xl p-6 glass-card-hover overflow-hidden flex flex-col">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
              <div className="relative flex flex-col flex-grow">
                <div className="absolute top-0 right-0 bg-white text-cyan-600 text-xs px-3 py-1 rounded-full font-medium shadow-md">
                  {t.pricing.pro.badge}
                </div>
                <div className="text-sm font-medium text-cyan-100 mb-2">{t.pricing.pro.name}</div>
                <div className="text-3xl font-semibold text-white mb-1">{t.pricing.pro.price}</div>
                <div className="text-sm text-cyan-100 mb-6">{t.pricing.pro.period}</div>
                <ul className="space-y-3 flex-grow">
                  {t.pricing.pro.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-cyan-50">
                      <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>
                <CheckoutButton
                  priceId={PLAN_VARIANTS.pro}
                  className="block w-full py-3.5 rounded-full bg-white text-cyan-600 font-medium hover:bg-cyan-50 transition-all duration-300 text-center shadow-lg mt-8"
                >
                  {t.pricing.pro.cta}
                </CheckoutButton>
              </div>
            </div>

            {/* Enterprise */}
            <div className="glass-card-premium rounded-3xl p-6 glass-card-hover flex flex-col">
              <div className="text-sm font-medium text-gray-500 mb-2">{t.pricing.enterprise.name}</div>
              <div className="text-3xl font-semibold text-gray-900 mb-1">{t.pricing.enterprise.price}</div>
              <div className="text-sm text-gray-500 mb-6">{t.pricing.enterprise.period}</div>
              <ul className="space-y-3 flex-grow">
                {t.pricing.enterprise.features.map((feature, i) => (
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
              <a href="mailto:info@seizn.com" className="block w-full py-3.5 rounded-full border-2 border-cyan-200 text-cyan-600 font-medium hover:bg-cyan-50 transition-all duration-300 text-center mt-8">
                {t.pricing.enterprise.cta}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 glass border-t border-white/20 relative z-10" role="contentinfo">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href={`/${locale}`} className="flex items-center gap-2 group" aria-label="Seizn Home">
            <div className="w-6 h-6 bg-gradient-to-br from-cyan-400 via-sky-500 to-teal-500 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="font-medium text-gray-700">Seizn</span>
          </Link>
          <div className="text-sm text-gray-500">
            {t.footer.copyright.replace('{year}', new Date().getFullYear().toString())}
          </div>
          <nav className="flex items-center gap-6" aria-label="Footer navigation">
            <a href={`/${locale}/privacy`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{t.footer.privacy}</a>
            <a href={`/${locale}/terms`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{t.footer.terms}</a>
            <a href="mailto:info@seizn.com" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{t.footer.contact}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
