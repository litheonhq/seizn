"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import Script from "next/script";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { LanguageSwitcher } from "@/components/language-switcher";

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

interface Props {
  locale: Locale;
  dictionary: Dictionary;
}

export function LocaleFAQClient({ locale, dictionary }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const currentYear = new Date().getFullYear();

  // Get faqPage translations from dictionary
  const faqPage = dictionary.docs?.faqPage;
  const categories = faqPage?.categories || {
    all: "All",
    gettingStarted: "Getting Started",
    coreConcepts: "Core Concepts",
    searchRetrieval: "Search & Retrieval",
    extraction: "Extraction",
    operations: "Operations",
    securityCompliance: "Security & Compliance",
  };

  // Get FAQ items from dictionary
  const faqItems = useMemo(() => {
    const items = faqPage?.items || [];
    return items.map((item: { question: string; answer: string; category: string }) => ({
      question: item.question,
      answer: item.answer,
      category: item.category,
    }));
  }, [faqPage?.items]);

  // Category keys for filtering
  const categoryKeys = ["all", "gettingStarted", "coreConcepts", "searchRetrieval", "extraction", "operations", "securityCompliance"];

  // Filter FAQ items by category
  const filteredFAQ = useMemo(() => {
    if (activeCategory === "all") {
      return faqItems;
    }
    return faqItems.filter((item: FAQItem) => item.category === activeCategory);
  }, [faqItems, activeCategory]);

  // Generate JSON-LD for FAQPage schema (always in English for SEO)
  const faqJsonLd = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqItems.map((item: FAQItem) => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer
      }
    }))
  }), [faqItems]);

  // Get translated category display name
  const getCategoryDisplayName = (categoryKey: string) => {
    return categories[categoryKey as keyof typeof categories] || categoryKey;
  };

  return (
    <>
      {/* JSON-LD Schema for SEO */}
      <Script
        id="faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="min-h-screen bg-szn-bg">
        {/* Header */}
        <header className="border-b border-szn-border sticky top-0 bg-szn-bg/80 backdrop-blur-sm z-10">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href={`/${locale}`} className="text-xl font-bold text-white">
              Seizn<span className="text-szn-accent">.</span>
            </Link>
            <nav className="flex items-center gap-4">
              <LanguageSwitcher currentLocale={locale} />
              <Link
                href={`/${locale}/docs`}
                className="text-szn-text-2 hover:text-white transition-colors"
              >
                {dictionary.nav?.docs || "Docs"}
              </Link>
              <Link
                href="/dashboard"
                className="text-szn-text-2 hover:text-white transition-colors"
              >
                {dictionary.docs?.nav?.dashboard || "Dashboard"}
              </Link>
              <Link
                href="/login"
                className="px-4 py-2 bg-szn-accent hover:bg-szn-accent/80 text-white font-medium rounded-lg transition-colors"
              >
                {dictionary.docs?.nav?.getStarted || dictionary.nav?.getStarted || "Get Started"}
              </Link>
            </nav>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* Hero */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold text-white mb-4">
              {faqPage?.title || "Frequently Asked Questions"}
            </h1>
            <p className="text-xl text-szn-text-2 max-w-2xl mx-auto">
              {faqPage?.subtitle || "Common questions about Seizn NPC memory, from getting started to advanced operations."}
            </p>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2 mb-8 justify-center">
            {categoryKeys.map(catKey => (
              <button
                key={catKey}
                onClick={() => setActiveCategory(catKey)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === catKey
                    ? "bg-szn-accent text-white"
                    : "bg-szn-surface-1 text-szn-text-2 hover:bg-szn-surface hover:text-szn-text-1"
                }`}
              >
                {getCategoryDisplayName(catKey)}
              </button>
            ))}
          </div>

          {/* FAQ List */}
          <div className="space-y-4">
            {filteredFAQ.map((item: FAQItem, _index: number) => {
              const globalIndex = faqItems.indexOf(item);
              const isOpen = openIndex === globalIndex;

              return (
                <div
                  key={globalIndex}
                  className="bg-szn-surface border border-szn-border rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : globalIndex)}
                    className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-szn-surface-1/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-szn-accent font-mono text-sm">
                        Q{globalIndex + 1}
                      </span>
                      <span className="text-white font-medium">
                        {item.question}
                      </span>
                    </div>
                    <ChevronIcon className={`w-5 h-5 text-szn-text-2 transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="px-6 pb-4">
                      <div className="pl-10 text-szn-text-2 leading-relaxed">
                        {item.answer}
                      </div>
                      <div className="pl-10 mt-3">
                        <span className="text-xs px-2 py-1 bg-szn-surface-1 text-szn-text-3 rounded">
                          {getCategoryDisplayName(item.category)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <div className="bg-szn-surface border border-szn-border rounded-2xl p-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                {faqPage?.stillHaveQuestions || "Still have questions?"}
              </h2>
              <p className="text-szn-text-2 mb-6">
                {faqPage?.stillHaveQuestionsDesc || "Check out our documentation or get in touch with our support team."}
              </p>
              <div className="flex gap-4 justify-center flex-wrap">
                <Link
                  href={`/${locale}/docs`}
                  className="px-6 py-3 bg-szn-surface-1 text-szn-text-1 font-medium rounded-lg hover:bg-szn-surface-1 transition-colors"
                >
                  {faqPage?.readDocs || "Read Docs"}
                </Link>
                <Link
                  href="mailto:support@seizn.com"
                  className="px-6 py-3 bg-szn-accent text-white font-medium rounded-lg hover:bg-szn-accent/80 transition-colors"
                >
                  {faqPage?.contactSupport || "Contact Support"}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-szn-border py-8">
          <div className="max-w-6xl mx-auto px-6 text-center text-szn-text-3 text-sm">
            {dictionary.docs?.footer?.copyright?.replace("{year}", String(currentYear)) || `© ${currentYear} Seizn. All rights reserved.`}
          </div>
        </footer>
      </div>
    </>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
