"use client";

import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/i18n/config";
import { LanguageSwitcher } from "@/components/language-switcher";

type Dictionary = Record<string, unknown>;

interface Props {
  locale: Locale;
  dictionary: Dictionary;
}

// Get nested value from object using dot notation
function getNestedValue(obj: unknown, path: string): string | string[] | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  if (typeof current === "string") return current;
  if (Array.isArray(current)) return current as string[];
  return undefined;
}

// Replace {param} placeholders with values
function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;

  return str.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key]?.toString() ?? `{${key}}`;
  });
}

export function QuickstartClient({ locale, dictionary }: Props) {
  const [activeTab, setActiveTab] = useState<Record<number, number>>({});
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const t = (key: string, params?: Record<string, string | number>): string => {
    const value = getNestedValue(dictionary, key);
    if (!value || Array.isArray(value)) return key;
    return interpolate(value, params);
  };

  const toggleStep = (index: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const getTabIndex = (stepIndex: number) => activeTab[stepIndex] || 0;
  const setTabIndex = (stepIndex: number, tabIndex: number) =>
    setActiveTab((prev) => ({ ...prev, [stepIndex]: tabIndex }));

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const steps = [
    {
      title: t("docs.quickstartPage.steps.getApiKey.title"),
      time: t("docs.quickstartPage.steps.getApiKey.time"),
      description: t("docs.quickstartPage.steps.getApiKey.description"),
      action: {
        label: t("docs.quickstartPage.steps.getApiKey.actionLabel"),
        href: "/dashboard/keys",
      },
      code: null,
    },
    {
      title: t("docs.quickstartPage.steps.install.title"),
      time: t("docs.quickstartPage.steps.install.time"),
      description: t("docs.quickstartPage.steps.install.description"),
      code: {
        tabs: [
          { lang: "npm", code: "npm install @seizn/sdk" },
          { lang: "yarn", code: "yarn add @seizn/sdk" },
          { lang: "pnpm", code: "pnpm add @seizn/sdk" },
        ],
      },
    },
    {
      title: t("docs.quickstartPage.steps.ingest.title") || "Ingest Documents",
      time: t("docs.quickstartPage.steps.ingest.time") || "30 sec",
      description: t("docs.quickstartPage.steps.ingest.description") || "Upload documents to your dataset for retrieval",
      code: {
        tabs: [
          {
            lang: "TypeScript",
            code: `import { Seizn } from '@seizn/sdk';

const seizn = new Seizn({ apiKey: process.env.SEIZN_API_KEY });

// Ingest documents
await seizn.ingest({
  dataset: "my-docs",
  documents: [
    { id: "doc-1", content: "Authentication best practices..." },
    { id: "doc-2", content: "OAuth 2.0 implementation guide..." }
  ]
});`,
          },
          {
            lang: "curl",
            code: `curl -X POST https://api.seizn.com/v1/ingest \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "dataset": "my-docs",
    "documents": [
      {"id": "doc-1", "content": "Authentication best practices..."}
    ]
  }'`,
          },
        ],
      },
    },
    {
      title: t("docs.quickstartPage.steps.query.title") || "Run Your First Query",
      time: t("docs.quickstartPage.steps.query.time") || "10 sec",
      description: t("docs.quickstartPage.steps.query.description") || "Search your documents with a natural language query",
      code: {
        tabs: [
          {
            lang: "TypeScript",
            code: `// Search with built-in tracing
const response = await seizn.query({
  dataset: "my-docs",
  query: "How do I implement secure authentication?",
  topK: 5,
  rerank: true,      // Cross-encoder reranking
  hybridSearch: true // Vector + keyword fusion
});

console.log(response.results);
// Returns: results + trace + cost breakdown`,
          },
          {
            lang: "curl",
            code: `curl -X POST https://api.seizn.com/v1/query \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "dataset": "my-docs",
    "query": "How do I implement secure authentication?",
    "topK": 5,
    "rerank": true
  }'`,
          },
        ],
      },
    },
  ];

  const progress = Math.round((completedSteps.size / steps.length) * 100);
  const currentYear = new Date().getFullYear();

  // Full 10-line example code
  const fullExampleCode = `import { Seizn } from '@seizn/sdk';

const seizn = new Seizn({ apiKey: process.env.SEIZN_API_KEY });

// Query with automatic tracing
const response = await seizn.query({
  dataset: "my-docs",
  query: "How do I implement authentication?",
  topK: 5,
  rerank: true
});

console.log(response.results); // Results
console.log(response.trace);   // Pipeline trace
console.log(response.cost);    // Cost breakdown`;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 sticky top-0 bg-zinc-950/80 backdrop-blur-sm z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/${locale}`} className="text-xl font-bold text-white">
              Seizn<span className="text-emerald-400">.</span>
            </Link>
            <span className="text-zinc-600">/</span>
            <Link href={`/${locale}/docs`} className="text-zinc-400 hover:text-white transition-colors">
              {t("docs.nav.dashboard") === "docs.nav.dashboard" ? "Docs" : t("nav.docs")}
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-white">Quickstart</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href="/dashboard/keys"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors text-sm"
            >
              {t("docs.quickstartPage.getApiKey")}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 bg-emerald-400/10 text-emerald-400 text-sm font-medium rounded-full">
              {t("docs.quickstartPage.badge")}
            </span>
            <span className="text-zinc-500">-</span>
            <span className="text-zinc-400 text-sm">{t("docs.quickstartPage.noCreditCard")}</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            {t("docs.quickstartPage.title")}
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            {t("docs.quickstartPage.subtitle")}
          </p>
        </div>

        {/* 10-Line Example Preview */}
        <div className="mb-12 p-6 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border border-emerald-500/20 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              {t("docs.quickstartPage.fullExample")}
            </h2>
            <button
              onClick={() => copyToClipboard(fullExampleCode, -1)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              {copiedIndex === -1 ? (
                <>
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {t("docs.quickstartPage.copied")}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {t("docs.quickstartPage.copy")}
                </>
              )}
            </button>
          </div>
          <pre className="bg-zinc-900 rounded-lg p-4 overflow-x-auto">
            <code className="text-sm text-zinc-300">{fullExampleCode}</code>
          </pre>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-zinc-400">{t("docs.quickstartPage.progress")}</span>
            <span className="text-sm text-zinc-400">{completedSteps.size} / {steps.length} {t("docs.quickstartPage.stepsLabel")}</span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-6">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`border rounded-xl transition-colors ${
                completedSteps.has(index)
                  ? "bg-emerald-500/5 border-emerald-500/30"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              {/* Step Header */}
              <button
                onClick={() => toggleStep(index)}
                className="w-full p-6 flex items-start gap-4 text-left"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    completedSteps.has(index)
                      ? "bg-emerald-500 text-white"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {completedSteps.has(index) ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                      {step.time}
                    </span>
                  </div>
                  <p className="text-zinc-400 text-sm">{step.description}</p>
                </div>
              </button>

              {/* Step Content */}
              <div className="px-6 pb-6">
                {step.action && (
                  <Link
                    href={step.action.href}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors text-sm"
                  >
                    {step.action.label}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                )}

                {step.code && (
                  <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
                    {/* Code Tabs */}
                    {step.code.tabs.length > 1 && (
                      <div className="flex border-b border-zinc-700">
                        {step.code.tabs.map((tab, tabIndex) => (
                          <button
                            key={tabIndex}
                            onClick={() => setTabIndex(index, tabIndex)}
                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                              getTabIndex(index) === tabIndex
                                ? "text-emerald-400 border-b-2 border-emerald-400 -mb-px"
                                : "text-zinc-400 hover:text-white"
                            }`}
                          >
                            {tab.lang}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Code Block */}
                    <div className="p-4 relative group">
                      <button
                        onClick={() => copyToClipboard(step.code!.tabs[getTabIndex(index)].code, index)}
                        className="absolute top-3 right-3 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded transition-colors opacity-0 group-hover:opacity-100"
                      >
                        {copiedIndex === index ? t("docs.quickstartPage.copied") : t("docs.quickstartPage.copy")}
                      </button>
                      {step.code.tabs.length === 1 && (
                        <div className="absolute top-3 right-12 text-xs text-zinc-500">
                          {step.code.tabs[0].lang}
                        </div>
                      )}
                      <pre className="text-sm text-zinc-300 overflow-x-auto">
                        <code>{step.code.tabs[getTabIndex(index)].code}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Completion */}
        {progress === 100 && (
          <div className="mt-12 p-8 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-2xl text-center">
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{t("docs.quickstartPage.completion.title")}</h2>
            <p className="text-zinc-400 mb-6">
              {t("docs.quickstartPage.completion.description")}
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href={`/${locale}/docs`}
                className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg transition-colors"
              >
                {t("docs.quickstartPage.completion.readDocs")}
              </Link>
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
              >
                {t("docs.quickstartPage.completion.goToDashboard")}
              </Link>
            </div>
          </div>
        )}

        {/* Expected Output */}
        <div className="mt-12">
          <h2 className="text-xl font-bold text-white mb-4">{t("docs.quickstartPage.expectedOutput.title")}</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-400 mb-4">{t("docs.quickstartPage.expectedOutput.description")}</p>
            <pre className="bg-zinc-800 rounded-lg p-4 overflow-x-auto">
              <code className="text-sm text-zinc-300">{`{
  "results": [
    {
      "id": "doc-1",
      "content": "Authentication best practices: Use JWT tokens...",
      "score": 0.92,
      "rerankScore": 0.95,
      "metadata": { "source": "docs", "section": "security" }
    }
  ],
  "trace": {
    "totalLatencyMs": 347,
    "steps": [
      { "name": "Embedding", "latencyMs": 45, "model": "voyage-3" },
      { "name": "Vector Search", "latencyMs": 53 },
      { "name": "Rerank", "latencyMs": 170, "model": "rerank-v3.5" }
    ]
  },
  "cost": { "total": 0.0023, "embedding": 0.0001, "rerank": 0.0018 }
}`}</code>
            </pre>
          </div>
        </div>

        {/* Next Steps */}
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <Link href={`/${locale}/docs#endpoints`} className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors group">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-emerald-400 transition-colors">
              {t("docs.quickstartPage.nextSteps.apiReference.title")}
            </h3>
            <p className="text-zinc-400 text-sm">
              {t("docs.quickstartPage.nextSteps.apiReference.description")}
            </p>
          </Link>

          <Link href={`/${locale}/docs#sdks`} className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors group">
            <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-emerald-400 transition-colors">
              {t("docs.quickstartPage.nextSteps.sdkExamples.title")}
            </h3>
            <p className="text-zinc-400 text-sm">
              {t("docs.quickstartPage.nextSteps.sdkExamples.description")}
            </p>
          </Link>

          <Link href={`/${locale}/docs/faq`} className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors group">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-emerald-400 transition-colors">
              {t("docs.quickstartPage.nextSteps.faq.title")}
            </h3>
            <p className="text-zinc-400 text-sm">
              {t("docs.quickstartPage.nextSteps.faq.description")}
            </p>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-zinc-500 text-sm">
          {t("docs.footer.copyright", { year: currentYear })}
        </div>
      </footer>
    </div>
  );
}
