"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckoutButton, PLAN_VARIANTS } from "@/components/checkout-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PaddleInit } from "@/components/paddle-init";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
  }
}

interface PricingClientProps {
  dict: Dictionary;
  locale: Locale;
}

export function PricingClient({ dict, locale }: PricingClientProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.createLemonSqueezy) {
      window.createLemonSqueezy();
    }
  }, []);

  const t = dict;
  const faq = t.pricingPage.faq;

  return (
    <div className="min-h-screen gradient-hero relative overflow-hidden">
      <PaddleInit />
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
        <div
          className="absolute top-1/2 right-10 w-64 h-64 bg-emerald-200/20 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "3s" }}
        />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-szn-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-xl tracking-tight bg-gradient-to-r from-szn-text-1 to-szn-text-2 bg-clip-text text-transparent">
              Seizn
            </span>
          </Link>

          <div className="flex items-center gap-6">
            <a href={`/${locale}#features`} className="text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors hidden md:block">{t.nav.features}</a>
            <Link href={`/${locale}/pricing`} className="text-sm text-szn-text-1 font-medium hidden md:block">{t.nav.pricing}</Link>
            <Link href={`/${locale}/comparison`} className="text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors hidden md:block">{t.extremeHome?.nav?.compare || "Compare"}</Link>
            <Link href="/docs" className="text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors hidden md:block">{t.nav.docs}</Link>
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href="/login"
              className="text-sm btn-premium bg-gradient-to-r from-gray-900 to-gray-700 text-white px-5 py-2.5 rounded-full hover:shadow-lg transition-all duration-300"
            >
              {t.nav.getStarted}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="pt-36 pb-12 px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            {/* Animated Badge */}
            <div className="inline-flex items-center gap-2 szn-card rounded-full px-4 py-1.5 mb-8 animate-fade-in">
              <span className="w-2 h-2 bg-gradient-to-r from-pink-500 to-cyan-500 rounded-full animate-pulse" />
              <span className="text-sm text-szn-text-2 font-medium">Flexible Plans</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-szn-text-1 mb-6 animate-fade-in">
              {t.pricingPage.title}
            </h1>
            <p className="text-lg md:text-xl text-szn-text-2 max-w-2xl mx-auto leading-relaxed animate-fade-in" style={{ animationDelay: "0.2s" }}>
              {t.pricingPage.subtitle}
            </p>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-12 px-6 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {/* Free */}
              <PricingCard plan={t.pricing.free} locale={locale} type="free" />
              {/* Starter */}
              <PricingCard plan={t.pricing.starter} locale={locale} type="starter" />
              {/* Plus */}
              <PricingCard plan={t.pricing.plus} locale={locale} type="plus" />
              {/* Pro */}
              <PricingCard plan={t.pricing.pro} locale={locale} type="pro" />
              {/* Enterprise */}
              <PricingCard plan={t.pricing.enterprise} locale={locale} type="enterprise" />
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 px-6 relative z-10">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-semibold text-szn-text-1 mb-4">{faq.title}</h2>
              <p className="text-szn-text-2 text-lg">{faq.subtitle}</p>
            </div>

            <div className="space-y-4">
              {faq.questions.map((item, index) => (
                <FaqItem key={index} item={item} index={index} openFaq={openFaq} setOpenFaq={setOpenFaq} />
              ))}
            </div>

            <div className="mt-12 text-center">
              <div className="szn-card rounded-2xl p-6 inline-block">
                <p className="text-szn-text-2">
                  {faq.stillQuestions}{" "}
                  <a href="mailto:sales@seizn.com" className="text-purple-600 font-medium hover:text-purple-500 transition-colors">
                    {faq.contactUs} sales@seizn.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Trust Badges */}
        <section className="py-16 px-6 relative z-10">
          <div className="max-w-4xl mx-auto">
            <div className="szn-card rounded-2xl p-8">
              <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
                <div className="flex items-center gap-3 text-szn-text-2">
                  <div className="w-10 h-10 rounded-full bg-szn-accent/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-szn-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-szn-text-1">Money-Back Guarantee</div>
                    <div className="text-xs text-szn-text-2">14-day refund policy</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-szn-text-2">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-szn-text-1">Cancel Anytime</div>
                    <div className="text-xs text-szn-text-2">No lock-in contracts</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-szn-text-2">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-szn-text-1">Priority Support</div>
                    <div className="text-xs text-szn-text-2">24/7 assistance</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 px-6 glass border-t border-szn-border relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href={`/${locale}`} className="flex items-center gap-2 group">
            <div className="w-6 h-6 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="font-medium text-szn-text-1">Seizn</span>
          </Link>
          <div className="text-sm text-szn-text-2">
            {t.footer.copyright.replace("{year}", new Date().getFullYear().toString())}
          </div>
          <nav className="flex items-center gap-6">
            <a href={`/${locale}/privacy`} className="text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors">{t.footer.privacy}</a>
            <a href={`/${locale}/terms`} className="text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors">{t.footer.terms}</a>
            <a href="mailto:sales@seizn.com" className="text-sm text-szn-text-2 hover:text-szn-text-1 transition-colors">{t.footer.contact}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

interface PlanType {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  badge?: string;
}

function PricingCard({ plan, locale, type }: { plan: PlanType; locale: Locale; type: string }) {
  const isPro = type === "pro";

  return (
    <div
      className={`relative szn-card rounded-3xl p-6 szn-card-hover overflow-hidden h-full flex flex-col ${
        isPro ? "ring-2 ring-purple-500/50 shadow-xl" : ""
      }`}
    >
      {/* Background gradient for Pro */}
      {isPro && (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-cyan-500/10" />
      )}

      {/* Badge */}
      {isPro && plan.badge && (
        <div className="absolute top-4 right-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs px-3 py-1 rounded-full font-medium shadow-md">
          {plan.badge}
        </div>
      )}

      <div className="relative flex flex-col flex-grow">
        <div className="text-sm font-medium text-szn-text-2 mb-2">{plan.name}</div>
        <div className="text-3xl font-semibold text-szn-text-1 mb-1">{plan.price}</div>
        <div className="text-sm text-szn-text-2 mb-6">{plan.period}</div>

        <ul className="space-y-3 flex-grow">
          {plan.features.map((feature: string, i: number) => (
            <li key={i} className="flex items-center gap-2 text-sm text-szn-text-2">
              <div className={`w-5 h-5 rounded-full ${isPro ? "bg-purple-100" : "bg-szn-accent/10"} flex items-center justify-center flex-shrink-0`}>
                <svg className={`w-3 h-3 ${isPro ? "text-purple-600" : "text-szn-accent"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-8">
        {type === "free" && (
          <Link
            href="/login"
            className="block w-full py-3 rounded-full border border-szn-border text-szn-text-1 font-medium hover:bg-white/50 hover:border-szn-border transition-all text-center"
          >
            {plan.cta}
          </Link>
        )}
        {type === "starter" && (
          <CheckoutButton
            priceId={PLAN_VARIANTS.starter}
            className="block w-full py-3 rounded-full border border-szn-border text-szn-text-1 font-medium hover:bg-white/50 hover:border-szn-border transition-all text-center"
          >
            {plan.cta}
          </CheckoutButton>
        )}
        {type === "plus" && (
          <CheckoutButton
            priceId={PLAN_VARIANTS.plus}
            className="block w-full py-3 rounded-full border border-szn-border text-szn-text-1 font-medium hover:bg-white/50 hover:border-szn-border transition-all text-center"
          >
            {plan.cta}
          </CheckoutButton>
        )}
        {type === "pro" && (
          <CheckoutButton
            priceId={PLAN_VARIANTS.pro}
            className="block w-full py-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:shadow-lg transition-all text-center"
          >
            {plan.cta}
          </CheckoutButton>
        )}
        {type === "enterprise" && (
          <Link
            href={`/${locale}/enterprise`}
            className="block w-full py-3 rounded-full border border-szn-border text-szn-text-1 font-medium hover:bg-white/50 hover:border-szn-border transition-all text-center"
          >
            {plan.cta}
          </Link>
        )}
        </div>
      </div>
    </div>
  );
}

function FaqItem({ item, index, openFaq, setOpenFaq }: { item: { q: string; a: string }; index: number; openFaq: number | null; setOpenFaq: (n: number | null) => void }) {
  const isOpen = openFaq === index;
  const previewText = item.a.length > 80 ? item.a.slice(0, 80) + "..." : item.a;

  return (
    <div className="szn-card rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpenFaq(isOpen ? null : index)}
        className="w-full px-6 py-5 text-left hover:bg-white/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-szn-text-1 pr-4">{item.q}</span>
          <div className={`w-8 h-8 rounded-full bg-szn-surface flex items-center justify-center flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}>
            <svg
              className="w-4 h-4 text-szn-text-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {!isOpen && (
          <p className="mt-2 text-sm text-szn-text-2 line-clamp-2">{previewText}</p>
        )}
      </button>
      {isOpen && (
        <div className="px-6 pb-5 text-szn-text-2 leading-relaxed">
          {item.a}
        </div>
      )}
    </div>
  );
}
