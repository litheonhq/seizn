"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckoutButton, PLAN_VARIANTS } from "@/components/checkout-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { CheckoutLegalCopy } from "@/lib/checkout-copy";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";


interface HomeClientProps {
  dict: Dictionary;
  locale: Locale;
  checkoutLegalCopy: CheckoutLegalCopy;
}

export function HomeClient({ dict, locale, checkoutLegalCopy }: HomeClientProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);


  // Close mobile menu on resize
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
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--ink-0)]/80 backdrop-blur-md border-b border-[var(--ink-200)]" role="navigation" aria-label="Main navigation">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-2" aria-label="Seizn Home">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-xl tracking-tight">Seizn</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">{t.nav.features}</a>
            <Link href={`/${locale}/pricing`} className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">{t.nav.pricing}</Link>
            <Link href={`/${locale}/docs`} className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">{t.nav.docs}</Link>
            <Link href="/login" className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">{t.nav.login}</Link>
            <LanguageSwitcher currentLocale={locale} />
            <Link href="/login" className="text-sm bg-black text-white px-4 py-2 rounded-full hover:bg-[var(--ink-800)] transition-colors btn-hover-lift">
              {t.nav.getStarted}
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors"
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
          <div className="md:hidden bg-[var(--ink-0)] border-t border-[var(--ink-200)] animate-fade-in">
            <div className="px-6 py-4 space-y-4">
              <a href="#features" className="block text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors" onClick={() => setMobileMenuOpen(false)}>{t.nav.features}</a>
              <Link href={`/${locale}/pricing`} className="block text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors" onClick={() => setMobileMenuOpen(false)}>{t.nav.pricing}</Link>
              <Link href={`/${locale}/docs`} className="block text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors" onClick={() => setMobileMenuOpen(false)}>{t.nav.docs}</Link>
              <Link href="/login" className="block text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors" onClick={() => setMobileMenuOpen(false)}>{t.nav.login}</Link>
              <div className="py-2">
                <LanguageSwitcher currentLocale={locale} />
              </div>
              <Link href="/login" className="block w-full text-center bg-black text-white px-4 py-3 rounded-full hover:bg-[var(--ink-800)] transition-colors" onClick={() => setMobileMenuOpen(false)}>
                {t.nav.getStarted}
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-[var(--ink-50)] rounded-full px-4 py-1.5 mb-8 animate-fade-in">
            <span className="w-2 h-2 bg-[var(--ink-900)] rounded-full animate-pulse" />
            <span className="text-sm text-[var(--ink-600)]">{t.hero.badge}</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-[var(--ink-900)] mb-6 animate-fade-in-up">
            {t.hero.title}
            <br />
            <span className="text-[var(--ink-500)]">{t.hero.titleHighlight}</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-[var(--ink-600)] max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up animate-delay-100">
            {t.hero.subtitle}
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            {status === "success" ? (
              <div className="flex items-center gap-2 text-[var(--ink-900)] bg-[var(--ink-900)]/10 px-6 py-3 rounded-full">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{t.hero.onTheList}</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.hero.emailPlaceholder}
                  className="flex-1 px-5 py-3 rounded-full border border-[var(--ink-200)] focus:outline-none focus:border-gray-400 transition-colors text-[var(--ink-900)]"
                  required
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="px-6 py-3 rounded-full bg-black text-white font-medium hover:bg-[var(--ink-800)] transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {status === "loading" ? t.hero.joining : t.hero.joinWaitlist}
                </button>
              </form>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 text-center">
            <div>
              <div className="text-3xl font-semibold text-[var(--ink-900)]">10k+</div>
              <div className="text-sm text-[var(--ink-600)]">{t.hero.stats.tokenSavings}</div>
            </div>
            <div className="w-px h-12 bg-[var(--ink-200)]" />
            <div>
              <div className="text-3xl font-semibold text-[var(--ink-900)]">&lt;50ms</div>
              <div className="text-sm text-[var(--ink-600)]">{t.hero.stats.retrievalTime}</div>
            </div>
            <div className="w-px h-12 bg-[var(--ink-200)]" />
            <div>
              <div className="text-3xl font-semibold text-[var(--ink-900)]">∞</div>
              <div className="text-sm text-[var(--ink-600)]">{t.hero.stats.uptimeSla}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 bg-[var(--ink-50)]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-[var(--ink-900)] mb-4">
              {t.features.title}
            </h2>
            <p className="text-[var(--ink-600)] max-w-xl mx-auto">
              {t.features.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="bg-[var(--ink-0)] p-8 rounded-2xl border border-[var(--ink-200)] card-hover">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-[var(--ink-900)] mb-2">{t.features.smartExtraction.title}</h3>
              <p className="text-[var(--ink-600)] leading-relaxed">
                {t.features.smartExtraction.description}
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-[var(--ink-0)] p-8 rounded-2xl border border-[var(--ink-200)] card-hover">
              <div className="w-12 h-12 bg-[var(--ink-50)] rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-[var(--ink-900)] underline" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-[var(--ink-900)] mb-2">{t.features.instantRetrieval.title}</h3>
              <p className="text-[var(--ink-600)] leading-relaxed">
                {t.features.instantRetrieval.description}
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-[var(--ink-0)] p-8 rounded-2xl border border-[var(--ink-200)] card-hover">
              <div className="w-12 h-12 bg-[var(--signal-canon-soft)] rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-[var(--signal-canon-ink)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-[var(--ink-900)] mb-2">{t.features.enterpriseSecurity.title}</h3>
              <p className="text-[var(--ink-600)] leading-relaxed">
                {t.features.enterpriseSecurity.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Code Preview Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold text-[var(--ink-900)] mb-4">
              {t.codePreview.title}
            </h2>
            <p className="text-[var(--ink-600)]">
              {t.codePreview.subtitle}
            </p>
          </div>

          <div className="bg-[var(--ink-900)] rounded-2xl p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-[var(--signal-conflict)]" />
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
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6 bg-[var(--ink-50)]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-[var(--ink-900)] mb-4">
              {t.pricing.title}
            </h2>
            <p className="text-[var(--ink-600)]">
              {t.pricing.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {/* Free */}
            <div className="bg-[var(--ink-0)] p-6 rounded-2xl border border-[var(--ink-200)] card-hover">
              <div className="text-sm font-medium text-[var(--ink-600)] mb-2">{t.pricing.free.name}</div>
              <div className="text-3xl font-semibold text-[var(--ink-900)] mb-1">{t.pricing.free.price}</div>
              <div className="text-sm text-[var(--ink-600)] mb-6">{t.pricing.free.period}</div>
              <ul className="space-y-3 mb-8">
                {t.pricing.free.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[var(--ink-600)]">
                    <svg className="w-4 h-4 text-[var(--ink-900)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block w-full py-3 rounded-full border border-[var(--ink-200)] text-[var(--ink-900)] font-medium hover:bg-[var(--ink-50)] transition-colors text-center">
                {t.pricing.free.cta}
              </Link>
            </div>

            {/* Starter */}
            <div className="bg-[var(--ink-0)] p-6 rounded-2xl border border-[var(--ink-200)] card-hover">
              <div className="text-sm font-medium text-[var(--ink-600)] mb-2">{t.pricing.starter.name}</div>
              <div className="text-3xl font-semibold text-[var(--ink-900)] mb-1">{t.pricing.starter.price}</div>
              <div className="text-sm text-[var(--ink-600)] mb-6">{t.pricing.starter.period}</div>
              <ul className="space-y-3 mb-8">
                {t.pricing.starter.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[var(--ink-600)]">
                    <svg className="w-4 h-4 text-[var(--ink-900)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <CheckoutButton
                priceId={PLAN_VARIANTS.starter}
                privacyHref={`/${locale}/legal/privacy`}
                termsHref={`/${locale}/legal/terms`}
                legalCopy={checkoutLegalCopy}
                className="block w-full py-3 rounded-full border border-[var(--ink-200)] text-[var(--ink-900)] font-medium hover:bg-[var(--ink-50)] transition-colors text-center"
              >
                {t.pricing.starter.cta}
              </CheckoutButton>
            </div>

            {/* Plus */}
            <div className="bg-[var(--ink-0)] p-6 rounded-2xl border border-[var(--ink-200)] card-hover">
              <div className="text-sm font-medium text-[var(--ink-600)] mb-2">{t.pricing.plus.name}</div>
              <div className="text-3xl font-semibold text-[var(--ink-900)] mb-1">{t.pricing.plus.price}</div>
              <div className="text-sm text-[var(--ink-600)] mb-6">{t.pricing.plus.period}</div>
              <ul className="space-y-3 mb-8">
                {t.pricing.plus.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[var(--ink-600)]">
                    <svg className="w-4 h-4 text-[var(--ink-900)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <CheckoutButton
                priceId={PLAN_VARIANTS.plus}
                privacyHref={`/${locale}/legal/privacy`}
                termsHref={`/${locale}/legal/terms`}
                legalCopy={checkoutLegalCopy}
                className="block w-full py-3 rounded-full border border-[var(--ink-200)] text-[var(--ink-900)] font-medium hover:bg-[var(--ink-50)] transition-colors text-center"
              >
                {t.pricing.plus.cta}
              </CheckoutButton>
            </div>

            {/* Pro */}
            <div className="bg-black p-6 rounded-2xl relative card-hover">
              <div className="absolute top-4 right-4 bg-[var(--ink-900)] text-white text-xs px-2 py-1 rounded-full">
                {t.pricing.pro.badge}
              </div>
              <div className="text-sm font-medium text-gray-400 mb-2">{t.pricing.pro.name}</div>
              <div className="text-3xl font-semibold text-white mb-1">{t.pricing.pro.price}</div>
              <div className="text-sm text-gray-400 mb-6">{t.pricing.pro.period}</div>
              <ul className="space-y-3 mb-8">
                {t.pricing.pro.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-[var(--ink-900)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <CheckoutButton
                priceId={PLAN_VARIANTS.pro}
                privacyHref={`/${locale}/legal/privacy`}
                termsHref={`/${locale}/legal/terms`}
                legalCopy={checkoutLegalCopy}
                className="block w-full py-3 rounded-full bg-white text-black font-medium hover:bg-gray-100 transition-colors text-center"
              >
                {t.pricing.pro.cta}
              </CheckoutButton>
            </div>

            {/* Enterprise */}
            <div className="bg-[var(--ink-0)] p-6 rounded-2xl border border-[var(--ink-200)] card-hover">
              <div className="text-sm font-medium text-[var(--ink-600)] mb-2">{t.pricing.enterprise.name}</div>
              <div className="text-3xl font-semibold text-[var(--ink-900)] mb-1">{t.pricing.enterprise.price}</div>
              <div className="text-sm text-[var(--ink-600)] mb-6">{t.pricing.enterprise.period}</div>
              <ul className="space-y-3 mb-8">
                {t.pricing.enterprise.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[var(--ink-600)]">
                    <svg className="w-4 h-4 text-[var(--ink-900)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <a href="mailto:enterprise@seizn.com" className="block w-full py-3 rounded-full border border-[var(--ink-200)] text-[var(--ink-900)] font-medium hover:bg-[var(--ink-50)] transition-colors text-center">
                {t.pricing.enterprise.cta}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-[var(--ink-200)]" role="contentinfo">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start justify-between gap-8">
          <div className="flex flex-col gap-2">
            <Link href={`/${locale}`} className="flex items-center gap-2" aria-label="Seizn Home">
              <div className="w-6 h-6 bg-black rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-xs">S</span>
              </div>
              <span className="font-medium">Seizn</span>
            </Link>
            <div className="text-sm text-[var(--ink-600)]">
              {t.footer.copyright.replace('{year}', new Date().getFullYear().toString())}
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-6" aria-label="Footer navigation">
            <Link href={`/${locale}/legal/privacy`} className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">{t.footer.privacy}</Link>
            <Link href={`/${locale}/legal/terms`} className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">{t.footer.terms}</Link>
            <Link href={`/${locale}/legal/beta-disclosure`} className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">Beta Disclosure</Link>
            <Link href={`/${locale}/docs/faq`} className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">{t.footer.contact}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
