import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { LanguageSwitcher } from "@/components/language-switcher";
import { FAQCategoryFilter } from "./faq-category-filter";

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

interface Props {
  locale: Locale;
  dictionary: Dictionary;
}

export function FAQServer({ locale, dictionary }: Props) {
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
  const faqItems: FAQItem[] = (faqPage?.items || []).map(
    (item: { question: string; answer: string; category: string }) => ({
      question: item.question,
      answer: item.answer,
      category: item.category,
    })
  );

  // Category keys for filtering
  const categoryKeys = [
    "all",
    "gettingStarted",
    "coreConcepts",
    "searchRetrieval",
    "extraction",
    "operations",
    "securityCompliance",
  ];

  // Generate JSON-LD for FAQPage schema (SSR - included in HTML)
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item: FAQItem) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  // Get translated category display name
  const getCategoryDisplayName = (categoryKey: string) => {
    return categories[categoryKey as keyof typeof categories] || categoryKey;
  };

  return (
    <>
      {/* JSON-LD Schema for SEO - Server-rendered */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="min-h-screen bg-zinc-950">
        {/* Header */}
        <header className="border-b border-zinc-800 sticky top-0 bg-zinc-950/80 backdrop-blur-sm z-10">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href={`/${locale}`} className="text-xl font-bold text-white">
              Seizn<span className="text-emerald-400">.</span>
            </Link>
            <nav className="flex items-center gap-4">
              <LanguageSwitcher currentLocale={locale} />
              <Link
                href={`/${locale}/docs`}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                {dictionary.nav?.docs || "Docs"}
              </Link>
              <Link
                href="/dashboard"
                className="text-zinc-400 hover:text-white transition-colors"
              >
                {dictionary.docs?.nav?.dashboard || "Dashboard"}
              </Link>
              <Link
                href="/login"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
              >
                {dictionary.docs?.nav?.getStarted ||
                  dictionary.nav?.getStarted ||
                  "Get Started"}
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
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              {faqPage?.subtitle ||
                "Common questions about Seizn Memory API, from getting started to advanced operations."}
            </p>
          </div>

          {/* Category Filter - Client Component for interactivity */}
          <FAQCategoryFilter
            categoryKeys={categoryKeys}
            categories={categories}
          />

          {/* FAQ List - All answers are SSR rendered in HTML for SEO */}
          <div className="space-y-4" id="faq-list">
            {faqItems.map((item: FAQItem, index: number) => (
              <details
                key={index}
                className="group bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
                data-category={item.category}
              >
                <summary className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-mono text-sm">
                      Q{index + 1}
                    </span>
                    <span className="text-white font-medium">
                      {item.question}
                    </span>
                  </div>
                  <ChevronIcon className="w-5 h-5 text-zinc-400 transition-transform flex-shrink-0 group-open:rotate-180" />
                </summary>

                {/* Answer is always in HTML for SEO - CSS controls visibility */}
                <div className="px-6 pb-4">
                  <div className="pl-10 text-zinc-400 leading-relaxed">
                    {item.answer}
                  </div>
                  <div className="pl-10 mt-3">
                    <span className="text-xs px-2 py-1 bg-zinc-800 text-zinc-500 rounded">
                      {getCategoryDisplayName(item.category)}
                    </span>
                  </div>
                </div>
              </details>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                {faqPage?.stillHaveQuestions || "Still have questions?"}
              </h2>
              <p className="text-zinc-400 mb-6">
                {faqPage?.stillHaveQuestionsDesc ||
                  "Check out our documentation or get in touch with our support team."}
              </p>
              <div className="flex gap-4 justify-center flex-wrap">
                <Link
                  href={`/${locale}/docs`}
                  className="px-6 py-3 bg-zinc-800 text-white font-medium rounded-lg hover:bg-zinc-700 transition-colors"
                >
                  {faqPage?.readDocs || "Read Docs"}
                </Link>
                <Link
                  href="mailto:support@seizn.com"
                  className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-500 transition-colors"
                >
                  {faqPage?.contactSupport || "Contact Support"}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-zinc-800 py-8">
          <div className="max-w-6xl mx-auto px-6 text-center text-zinc-500 text-sm">
            {dictionary.docs?.footer?.copyright?.replace(
              "{year}",
              String(currentYear)
            ) || `© ${currentYear} Seizn. All rights reserved.`}
          </div>
        </footer>
      </div>
    </>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
