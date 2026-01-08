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

          <div className="flex items-center gap-6">
            <a href={`/${locale}#features`} className="text-sm text-gray-600 hover:text-black transition-colors hidden md:block">{t.nav.features}</a>
            <Link href={`/${locale}/pricing`} className="text-sm text-black font-medium hidden md:block">{t.nav.pricing}</Link>
            <a href={`/${locale}/docs`} className="text-sm text-gray-600 hover:text-black transition-colors hidden md:block">{t.nav.docs}</a>
            <LanguageSwitcher currentLocale={locale} />
            <Link href="/login" className="text-sm bg-black text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors">
              {t.nav.getStarted}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-gray-900 mb-4">
            {t.pricingPage.title}
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            {t.pricingPage.subtitle}
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Free */}
            <PricingCard plan={t.pricing.free} locale={locale} type="free" />
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
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-semibold text-gray-900 mb-4">{faq.title}</h2>
            <p className="text-gray-500">{faq.subtitle}</p>
          </div>

          <div className="space-y-4">
            {faq.questions.map((item, index) => (
              <FaqItem key={index} item={item} index={index} openFaq={openFaq} setOpenFaq={setOpenFaq} />
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-gray-500">
              {faq.stillQuestions}{" "}
              <a href="mailto:contact@seizn.com" className="text-black font-medium hover:underline">
                {faq.contactUs} contact@seizn.com
              </a>
            </p>
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
            {t.footer.copyright.replace("{year}", new Date().getFullYear().toString())}
          </div>
          <nav className="flex items-center gap-6">
            <a href={`/${locale}/privacy`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{t.footer.privacy}</a>
            <a href={`/${locale}/terms`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{t.footer.terms}</a>
            <a href="mailto:contact@seizn.com" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{t.footer.contact}</a>
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
    <div className={`${isPro ? "bg-black" : "bg-white border border-gray-100"} p-6 rounded-2xl ${isPro ? "" : "hover:border-gray-200"} hover:shadow-lg transition-all relative`}>
      {isPro && plan.badge && (
        <div className="absolute top-4 right-4 bg-emerald-500 text-white text-xs px-2 py-1 rounded-full">
          {plan.badge}
        </div>
      )}
      <div className={`text-sm font-medium ${isPro ? "text-gray-400" : "text-gray-500"} mb-2`}>{plan.name}</div>
      <div className={`text-3xl font-semibold ${isPro ? "text-white" : "text-gray-900"} mb-1`}>{plan.price}</div>
      <div className={`text-sm ${isPro ? "text-gray-400" : "text-gray-500"} mb-6`}>{plan.period}</div>
      <ul className="space-y-3 mb-8">
        {plan.features.map((feature: string, i: number) => (
          <li key={i} className={`flex items-center gap-2 text-sm ${isPro ? "text-gray-300" : "text-gray-600"}`}>
            <svg className={`w-4 h-4 ${isPro ? "text-emerald-400" : "text-emerald-500"} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
      {type === "free" && (
        <Link href="/login" className="block w-full py-3 rounded-full border border-gray-200 text-gray-900 font-medium hover:bg-gray-50 transition-colors text-center">
          {plan.cta}
        </Link>
      )}
      {type === "plus" && (
        <CheckoutButton variantId={PLAN_VARIANTS.plus} className="block w-full py-3 rounded-full border border-gray-200 text-gray-900 font-medium hover:bg-gray-50 transition-colors text-center">
          {plan.cta}
        </CheckoutButton>
      )}
      {type === "pro" && (
        <CheckoutButton variantId={PLAN_VARIANTS.pro} className="block w-full py-3 rounded-full bg-white text-black font-medium hover:bg-gray-100 transition-colors text-center">
          {plan.cta}
        </CheckoutButton>
      )}
      {type === "enterprise" && (
        <Link href={`/${locale}/enterprise`} className="block w-full py-3 rounded-full border border-gray-200 text-gray-900 font-medium hover:bg-gray-50 transition-colors text-center">
          {plan.cta}
        </Link>
      )}
    </div>
  );
}

function FaqItem({ item, index, openFaq, setOpenFaq }: { item: { q: string; a: string }; index: number; openFaq: number | null; setOpenFaq: (n: number | null) => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpenFaq(openFaq === index ? null : index)}
        className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-900 pr-4">{item.q}</span>
        <svg
          className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${openFaq === index ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {openFaq === index && (
        <div className="px-6 pb-4 text-gray-600 leading-relaxed">
          {item.a}
        </div>
      )}
    </div>
  );
}
