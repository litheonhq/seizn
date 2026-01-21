"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import Script from "next/script";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

// FAQ item keys for translation lookup
const faqKeys = [
  // Getting Started
  { categoryKey: "gettingStarted", questionKey: "q1" },
  { categoryKey: "gettingStarted", questionKey: "q2" },
  { categoryKey: "gettingStarted", questionKey: "q3" },
  { categoryKey: "gettingStarted", questionKey: "q4" },
  // Core Concepts
  { categoryKey: "coreConcepts", questionKey: "q1" },
  { categoryKey: "coreConcepts", questionKey: "q2" },
  { categoryKey: "coreConcepts", questionKey: "q3" },
  { categoryKey: "coreConcepts", questionKey: "q4" },
  { categoryKey: "coreConcepts", questionKey: "q5" },
  // Search & Retrieval
  { categoryKey: "searchRetrieval", questionKey: "q1" },
  { categoryKey: "searchRetrieval", questionKey: "q2" },
  { categoryKey: "searchRetrieval", questionKey: "q3" },
  // Extraction
  { categoryKey: "extraction", questionKey: "q1" },
  { categoryKey: "extraction", questionKey: "q2" },
  // Operations
  { categoryKey: "operations", questionKey: "q1" },
  { categoryKey: "operations", questionKey: "q2" },
  { categoryKey: "operations", questionKey: "q3" },
  { categoryKey: "operations", questionKey: "q4" },
  // Security & Compliance
  { categoryKey: "security", questionKey: "q1" },
  { categoryKey: "security", questionKey: "q2" },
];

export function FAQClient() {
  const { t } = useDashboardTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const currentYear = new Date().getFullYear();

  // Build FAQ data from translations
  const faqData: FAQItem[] = useMemo(() => {
    return faqKeys.map(({ categoryKey, questionKey }) => ({
      category: t(`docs.faq.categories.${categoryKey}`),
      question: t(`docs.faq.${categoryKey}.${questionKey}.question`),
      answer: t(`docs.faq.${categoryKey}.${questionKey}.answer`),
    }));
  }, [t]);

  // Get unique categories
  const categoryKeys = ["all", "gettingStarted", "coreConcepts", "searchRetrieval", "extraction", "operations", "security"];
  const categories = categoryKeys.map(key => ({
    key,
    label: key === "all" ? t("docs.faq.categories.all") : t(`docs.faq.categories.${key}`)
  }));

  // Filter FAQ by category
  const filteredFAQ = activeCategory === "all"
    ? faqData
    : faqData.filter((_, index) => faqKeys[index].categoryKey === activeCategory);

  // Generate JSON-LD for FAQPage schema (uses current language)
  const faqJsonLd = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqData.map(item => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer
      }
    }))
  }), [faqData]);

  return (
    <>
      {/* JSON-LD Schema for SEO */}
      <Script
        id="faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <header className="border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-10">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white">
              Seizn<span className="text-emerald-600">.</span>
            </Link>
            <nav className="flex items-center gap-6">
              <Link
                href="/docs"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                {t("nav.docs")}
              </Link>
              <Link
                href="/dashboard"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                {t("docs.faq.nav.dashboard")}
              </Link>
              <Link
                href="/login"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
              >
                {t("nav.getStarted")}
              </Link>
            </nav>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* Hero */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t("docs.faq.title")}
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              {t("docs.faq.subtitle")}
            </p>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2 mb-8 justify-center">
            {categories.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === key
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* FAQ List */}
          <div className="space-y-4">
            {filteredFAQ.map((item, _index) => {
              const globalIndex = faqData.indexOf(item);
              const isOpen = openIndex === globalIndex;

              return (
                <div
                  key={globalIndex}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : globalIndex)}
                    className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-600 font-mono text-sm">
                        Q{globalIndex + 1}
                      </span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {item.question}
                      </span>
                    </div>
                    <ChevronIcon className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="px-6 pb-4">
                      <div className="pl-10 text-gray-600 dark:text-gray-300 leading-relaxed">
                        {item.answer}
                      </div>
                      <div className="pl-10 mt-3">
                        <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                          {item.category}
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
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                {t("docs.faq.cta.title")}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {t("docs.faq.cta.subtitle")}
              </p>
              <div className="flex gap-4 justify-center">
                <Link
                  href="/docs"
                  className="px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {t("docs.faq.cta.readDocs")}
                </Link>
                <Link
                  href="mailto:support@seizn.com"
                  className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-500 transition-colors"
                >
                  {t("docs.faq.cta.contactSupport")}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-gray-200 dark:border-gray-700 py-8">
          <div className="max-w-6xl mx-auto px-6 text-center text-gray-500 dark:text-gray-400 text-sm">
            &copy; {currentYear} Seizn. {t("docs.faq.footer.rights")}
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
