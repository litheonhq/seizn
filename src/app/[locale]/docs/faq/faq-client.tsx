"use client";

import Link from "next/link";
import { useState } from "react";
import Script from "next/script";
import type { Locale } from "@/i18n/config";

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqData: FAQItem[] = [
  // Getting Started
  {
    category: "Getting Started",
    question: "What is Seizn Memory and what problem does it solve?",
    answer: "Seizn Memory is an AI memory infrastructure that provides persistent, searchable memory for AI applications. Unlike vector databases that only store/search vectors, Seizn includes the full product layer: memory extraction, policy management, key management, deletion, audit logs, and SDKs. It solves the problem of maintaining context across AI sessions and enabling personalized AI experiences."
  },
  {
    category: "Getting Started",
    question: "How is Seizn different from vector databases like Pinecone or Weaviate?",
    answer: "Vector databases are storage/search infrastructure for vectors. Seizn is a complete memory system built on top of that, providing: automatic memory extraction from conversations, memory type classification, namespace/scope management, API key rotation, audit logging, SDKs, and governance features. Think of it as 'memory infrastructure' vs 'search infrastructure'."
  },
  {
    category: "Getting Started",
    question: "Do I need RAG to use Seizn?",
    answer: "No. The most common starting point is: store memory → search → inject into prompt. RAG (automatic context composition + response generation) is the next step. You can start simple and add complexity as needed."
  },
  {
    category: "Getting Started",
    question: "What's the fastest way to build a PoC?",
    answer: "1) POST /api/memories to store a user preference. 2) GET /api/memories to search. 3) Inject the results into your LLM prompt. 4) Later, add /api/extract for auto-extraction and /api/query for memory-augmented responses."
  },
  // Core Concepts
  {
    category: "Core Concepts",
    question: "What should I store in /api/memories?",
    answer: "Store information that remains valid across conversations: preferences (tone, language, format), facts (job, tools, project structure), instructions (\"always summarize in tables\"), relationships (\"Alice is the team lead\"). Avoid storing temporary or session-specific data unless using session scope."
  },
  {
    category: "Core Concepts",
    question: "What data should I NOT store?",
    answer: "Never store: passwords, API keys, tokens, session cookies (auth info), SSN, passport numbers, bank accounts (PII), credit card info (payment data). For temporary data, use session scope with TTL if needed."
  },
  {
    category: "Core Concepts",
    question: "Why is namespace important?",
    answer: "Namespace separates memories by project/tenant/environment. Without it, data gets mixed, search quality drops, and deletion/export becomes painful. Recommended: 'org:acme/app:chat/env:prod' or 'project:myapp/env:staging'. Never use just 'default' in production."
  },
  {
    category: "Core Concepts",
    question: "When should I use scope (user/session/agent)?",
    answer: "user: Preferences that apply to a user globally. session: Goals or context valid only for this conversation. agent: Rules specific to one agent in a multi-agent system. Using scope properly reduces prompt length and improves response consistency."
  },
  {
    category: "Core Concepts",
    question: "What are memory_types and why do they matter?",
    answer: "memory_type classifies memories: fact (unchanging info), preference (user choices), instruction (rules to follow), relationship (people/org connections), experience (past events). This is the most powerful axis for filtering, deletion, and policy application."
  },
  // Search & Retrieval
  {
    category: "Search & Retrieval",
    question: "How do threshold and limit work?",
    answer: "limit: Number of candidate memories to retrieve (too low = miss relevant ones, too high = noisy context). threshold: 0-1 similarity cutoff (higher = stricter). Start with limit=10, threshold=0.7. If missing memories, lower threshold to 0.6 and raise limit to 20. If getting irrelevant results, raise threshold to 0.75-0.8."
  },
  {
    category: "Search & Retrieval",
    question: "Why are my search results irrelevant?",
    answer: "Usually one of: 1) namespaces are mixed, 2) too many memories stored (noise), 3) threshold too low, 4) content is too abstract ('likes things' vs specific facts). Fix: separate namespaces, make content specific, raise threshold."
  },
  {
    category: "Search & Retrieval",
    question: "Search quality dropped as memories grew. What do I do?",
    answer: "Add importance scoring and keep only high-importance memories. Use TTL to auto-expire old memories. Periodically merge similar memories into summaries. Separate namespaces to reduce search scope."
  },
  // Extraction
  {
    category: "Extraction",
    question: "How should I use /api/extract?",
    answer: "Recommended flow: 1) Call with auto_store=false to preview extracted memories. 2) Show results to user for confirmation. 3) Store only approved memories. 4) Once extraction quality is proven, switch to auto_store=true for automation."
  },
  {
    category: "Extraction",
    question: "What's the difference between model=haiku and model=sonnet?",
    answer: "haiku: Faster, cheaper, good for most cases. sonnet: More accurate, better for important extractions (onboarding, contracts, policies). Use haiku for bulk/initial extraction, sonnet for high-stakes scenarios."
  },
  // Operations
  {
    category: "Operations",
    question: "Can I modify a memory after storing it?",
    answer: "Yes, but the recommended pattern is: create new memory + delete/archive old one. This approach is better for audit trails and prevents regression issues."
  },
  {
    category: "Operations",
    question: "How do I delete memories?",
    answer: "Two approaches: 1) Delete by ID (precise), 2) Delete by namespace (bulk cleanup). For enterprise/compliance, ensure 'complete deletion + audit log'. Document your deletion policy clearly."
  },
  {
    category: "Operations",
    question: "I'm getting 429 Too Many Requests. What should I do?",
    answer: "You've hit the rate limit. Solutions: 1) Implement exponential backoff (1s → 2s → 4s). 2) Queue requests server-side. 3) Reduce request frequency: cache duplicate queries, batch operations, lower extract frequency."
  },
  {
    category: "Operations",
    question: "How do I reduce costs?",
    answer: "Biggest cost drivers: 1) Extract frequency - reduce calls. 2) Search scope - use namespace to narrow. 3) Model choice - use haiku for routine, sonnet for important. 4) Caching - cache repeated queries. 5) Batch operations when possible."
  },
  // Security & Compliance
  {
    category: "Security & Compliance",
    question: "Can I use the API key in browser (frontend)?",
    answer: "Not recommended - high risk of key exposure. Call Seizn from your server (Next.js Route Handler, Cloudflare Worker, serverless function) and have the browser call your server. Never expose API keys to client-side code."
  },
  {
    category: "Security & Compliance",
    question: "What documentation does my security/legal team need?",
    answer: "They'll want: 1) Data scope (what's stored/not stored), 2) Encryption (at rest: AES-256, in transit: TLS), 3) Tenant isolation method, 4) Deletion/retention policy, 5) Audit log access, 6) Key rotation/expiration policy. Keep a Security & Governance page in your docs."
  },
];

// Generate JSON-LD for FAQPage schema
const faqJsonLd = {
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
};

interface Props {
  locale: Locale;
}

export function LocaleFAQClient({ locale }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const currentYear = new Date().getFullYear();

  const categories = ["All", ...Array.from(new Set(faqData.map(f => f.category)))];
  const filteredFAQ = activeCategory === "All"
    ? faqData
    : faqData.filter(f => f.category === activeCategory);

  return (
    <>
      {/* JSON-LD Schema for SEO */}
      <Script
        id="faq-schema"
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
            <nav className="flex items-center gap-6">
              <Link
                href={`/${locale}/docs`}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                Docs
              </Link>
              <Link
                href="/dashboard"
                className="text-zinc-400 hover:text-white transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/login"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
              >
                Get Started
              </Link>
            </nav>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* Hero */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold text-white mb-4">
              Frequently Asked Questions
            </h1>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Common questions about Seizn Memory API, from getting started to advanced operations.
            </p>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2 mb-8 justify-center">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* FAQ List */}
          <div className="space-y-4">
            {filteredFAQ.map((item, index) => {
              const globalIndex = faqData.indexOf(item);
              const isOpen = openIndex === globalIndex;

              return (
                <div
                  key={globalIndex}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : globalIndex)}
                    className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-400 font-mono text-sm">
                        Q{globalIndex + 1}
                      </span>
                      <span className="text-white font-medium">
                        {item.question}
                      </span>
                    </div>
                    <ChevronIcon className={`w-5 h-5 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="px-6 pb-4">
                      <div className="pl-10 text-zinc-400 leading-relaxed">
                        {item.answer}
                      </div>
                      <div className="pl-10 mt-3">
                        <span className="text-xs px-2 py-1 bg-zinc-800 text-zinc-500 rounded">
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                Still have questions?
              </h2>
              <p className="text-zinc-400 mb-6">
                Check out our documentation or get in touch with our support team.
              </p>
              <div className="flex gap-4 justify-center">
                <Link
                  href={`/${locale}/docs`}
                  className="px-6 py-3 bg-zinc-800 text-white font-medium rounded-lg hover:bg-zinc-700 transition-colors"
                >
                  Read Docs
                </Link>
                <Link
                  href="mailto:support@seizn.com"
                  className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-500 transition-colors"
                >
                  Contact Support
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-zinc-800 py-8">
          <div className="max-w-6xl mx-auto px-6 text-center text-zinc-500 text-sm">
            &copy; {currentYear} Seizn. All rights reserved.
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
