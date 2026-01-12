"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { RequestBuilder, type RequestConfig } from "./request-builder";
import { ResultsPanel, type SearchResult } from "./results-panel";
import { TracePanel, type TraceSummary } from "./trace-panel";
import { SnippetTabs } from "./snippet-tabs";

interface ExtremeHomepageClientProps {
  dict: Dictionary;
  locale: Locale;
}

type ResultTab = "results" | "trace";

const scrollToDemo = () => {
  const demo = document.getElementById("demo");
  if (demo) demo.scrollIntoView({ behavior: "smooth" });
};

const DEFAULT_CONFIG: RequestConfig = {
  query: "",
  dataset: "tech-docs",
  budgetMs: 500,
  hybridSearch: true,
  rerank: true,
  answerContract: false,
  topK: 5,
};

// Mock data for demo
const MOCK_RESULTS: SearchResult[] = [
  {
    id: "1",
    title: "Authentication Best Practices",
    content: "JWT tokens should be stored securely and rotated regularly. Use httpOnly cookies for web applications and secure storage for mobile apps. Implement proper token validation on every request.",
    score: 0.92,
    rerankScore: 0.95,
    metadata: { source: "docs", section: "security" },
  },
  {
    id: "2",
    title: "OAuth 2.0 Implementation Guide",
    content: "OAuth 2.0 provides a robust framework for authorization. The authorization code flow is recommended for web applications, while PKCE should be used for mobile and single-page apps.",
    score: 0.88,
    rerankScore: 0.91,
    metadata: { source: "docs", section: "auth" },
  },
  {
    id: "3",
    title: "Session Management",
    content: "Secure session management is crucial for application security. Implement session timeouts, regenerate session IDs after authentication, and use secure session storage mechanisms.",
    score: 0.85,
    rerankScore: 0.84,
    metadata: { source: "docs", section: "security" },
  },
  {
    id: "4",
    title: "API Key Security",
    content: "API keys should never be exposed in client-side code. Use environment variables and secure vaults for storage. Implement key rotation policies and monitor for unauthorized usage.",
    score: 0.79,
    rerankScore: 0.82,
    metadata: { source: "docs", section: "api" },
  },
  {
    id: "5",
    title: "Multi-factor Authentication",
    content: "MFA adds an extra layer of security beyond passwords. Support TOTP authenticator apps, SMS codes, and hardware security keys for enterprise users.",
    score: 0.76,
    rerankScore: 0.78,
    metadata: { source: "docs", section: "auth" },
  },
];

const MOCK_TRACE: TraceSummary = {
  totalLatencyMs: 347,
  totalCost: 0.0023,
  tokensUsed: 1847,
  vectorOps: 1,
  steps: [
    {
      name: "Query Embedding",
      stage: "embed",
      startMs: 0,
      endMs: 45,
      model: "voyage-3",
      inputSize: 42,
      outputSize: 1024,
      cost: 0.0001,
    },
    {
      name: "Vector Search",
      stage: "search",
      startMs: 45,
      endMs: 98,
      model: "pgvector",
      inputSize: 1024,
      outputSize: 50,
      cached: false,
      cost: 0.0,
      details: { candidates: 50, index: "hnsw_l2", ef_search: 100 },
    },
    {
      name: "Hybrid Merge",
      stage: "search",
      startMs: 98,
      endMs: 125,
      inputSize: 50,
      outputSize: 25,
      details: { bm25_weight: 0.3, vector_weight: 0.7 },
    },
    {
      name: "Cross-encoder Rerank",
      stage: "rerank",
      startMs: 125,
      endMs: 295,
      model: "rerank-v3.5",
      inputSize: 25,
      outputSize: 5,
      cost: 0.0018,
    },
    {
      name: "Answer Contract Validation",
      stage: "validate",
      startMs: 295,
      endMs: 347,
      model: "gpt-4o-mini",
      cost: 0.0004,
      details: { contract: "sufficient_evidence", passed: true },
    },
  ],
};

export function ExtremeHomepageClient({ dict, locale }: ExtremeHomepageClientProps) {
  const [config, setConfig] = useState<RequestConfig>(DEFAULT_CONFIG);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [trace, setTrace] = useState<TraceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ResultTab>("results");
  const [hasRun, setHasRun] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileConsoleTab, setMobileConsoleTab] = useState<"request" | "results" | "trace">("request");

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

  const handleRun = useCallback(async () => {
    setIsLoading(true);
    setHasRun(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Use mock data for demo
    setResults(MOCK_RESULTS.slice(0, config.topK));
    setTrace({
      ...MOCK_TRACE,
      totalLatencyMs: config.budgetMs * 0.7 + Math.random() * 100,
      steps: MOCK_TRACE.steps.filter((step) => {
        if (step.name.includes("Rerank") && !config.rerank) return false;
        if (step.name.includes("Hybrid") && !config.hybridSearch) return false;
        if (step.name.includes("Contract") && !config.answerContract) return false;
        return true;
      }),
    });

    setIsLoading(false);
    setActiveTab("results");
    setMobileConsoleTab("results");
  }, [config]);

  const t = dict;

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/seizn-icon.svg" alt="Seizn" className="w-8 h-8" />
            <span className="font-semibold text-xl tracking-tight">Seizn</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/docs" className="text-sm text-gray-600 hover:text-black transition-colors">
              {t.extremeHome?.nav?.docs || "Docs"}
            </Link>
            <Link href={`/${locale}/pricing`} className="text-sm text-gray-600 hover:text-black transition-colors">
              {t.extremeHome?.nav?.pricing || "Pricing"}
            </Link>
            <Link href={`/${locale}/enterprise`} className="text-sm text-gray-600 hover:text-black transition-colors">
              {t.extremeHome?.nav?.enterprise || "Enterprise"}
            </Link>
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href="/dashboard/keys"
              className="text-sm bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
            >
              Get API Key
            </Link>
            <button onClick={scrollToDemo} className="text-sm border-2 border-gray-800 text-gray-800 px-4 py-2 rounded-full hover:bg-gray-800 hover:text-white transition-all font-medium">
              {t.extremeHome?.nav?.tryDemo || "Try Demo"}
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-gray-600"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
          <div className="md:hidden bg-white border-t border-gray-100">
            <div className="px-4 py-4 space-y-4">
              <Link href="/docs" className="block text-gray-600">{t.extremeHome?.nav?.docs || "Docs"}</Link>
              <Link href={`/${locale}/pricing`} className="block text-gray-600">{t.extremeHome?.nav?.pricing || "Pricing"}</Link>
              <Link href={`/${locale}/enterprise`} className="block text-gray-600">{t.extremeHome?.nav?.enterprise || "Enterprise"}</Link>
              <LanguageSwitcher currentLocale={locale} />
              <Link href="/dashboard/keys" className="block w-full text-center bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 rounded-full">
                {t.extremeHome?.nav?.getApiKey || "Get API Key"}
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero = Live Console */}
      <section id="demo" className="pt-24 pb-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          {/* Hero Text */}
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-gray-900 mb-4">
              {t.extremeHome?.heroTitle || "Search you can debug."}
            </h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              {t.extremeHome?.heroSubtitle || "Integrated retrieval stack with built-in tracing, evaluation, and governance. One request = results + trace + cost."}
            </p>
          </div>

          {/* Progress Indicator */}
          {hasRun && (
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm text-gray-600">{t.extremeHome?.firstRetrievalComplete || "First retrieval complete"}</span>
              </div>
              <span className="text-gray-300">|</span>
              <span className="text-sm text-gray-500">{t.extremeHome?.copySnippetHint || "Copy the snippet below to reproduce"}</span>
            </div>
          )}

          {/* Live Console - Desktop */}
          <div className="hidden md:block bg-gray-50 rounded-2xl p-6 border border-gray-100">
            <div className="grid grid-cols-2 gap-6">
              {/* Left: Request Builder */}
              <div className="bg-white rounded-xl p-6 border border-gray-100">
                <h3 className="text-sm font-medium text-gray-500 mb-4">{t.extremeHome?.requestBuilder || "Request Builder"}</h3>
                <RequestBuilder
                  config={config}
                  onConfigChange={setConfig}
                  onRun={handleRun}
                  isLoading={isLoading}
                />
              </div>

              {/* Right: Results + Trace */}
              <div className="bg-white rounded-xl p-6 border border-gray-100">
                {/* Tabs */}
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setActiveTab("results")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === "results"
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Results
                    {results.length > 0 && (
                      <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                        {results.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("trace")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === "trace"
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Trace
                    {trace && (
                      <span className="ml-2 text-xs bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">
                        {trace.totalLatencyMs.toFixed(0)}ms
                      </span>
                    )}
                  </button>
                </div>

                {/* Tab Content */}
                {activeTab === "results" ? (
                  <ResultsPanel results={results} isLoading={isLoading} showRerankDelta={config.rerank} />
                ) : (
                  <TracePanel trace={trace} isLoading={isLoading} />
                )}
              </div>
            </div>
          </div>

          {/* Live Console - Mobile */}
          <div className="md:hidden bg-gray-50 rounded-2xl p-4 border border-gray-100">
            {/* Mobile Tabs */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto">
              {(["request", "results", "trace"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMobileConsoleTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                    mobileConsoleTab === tab
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500"
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-100 min-h-[400px]">
              {mobileConsoleTab === "request" && (
                <RequestBuilder
                  config={config}
                  onConfigChange={setConfig}
                  onRun={handleRun}
                  isLoading={isLoading}
                />
              )}
              {mobileConsoleTab === "results" && (
                <ResultsPanel results={results} isLoading={isLoading} showRerankDelta={config.rerank} />
              )}
              {mobileConsoleTab === "trace" && (
                <TracePanel trace={trace} isLoading={isLoading} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Copy Snippet Section */}
      <section className="py-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{t.extremeHome?.copySnippetTitle || "Copy this snippet"}</h2>
            <p className="text-sm text-gray-500">
              {t.extremeHome?.copySnippetSubtitle || "Generated from your exact settings above"}
            </p>
          </div>
          <SnippetTabs config={config} />
        </div>
      </section>

      {/* Why Seizn Section */}
      <section className="py-16 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-semibold text-gray-900 mb-4">
              {t.extremeHome?.whySeizn?.title || "Why Seizn vs LangChain + Pinecone?"}
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              {t.extremeHome?.whySeizn?.subtitle || "Stop gluing together fragmented tools. Get everything you need in one integrated stack."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Built-in Tracing */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.extremeHome?.whySeizn?.tracingTitle || "Built-in Tracing + Eval"}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {t.extremeHome?.whySeizn?.tracingDesc || "Every request is traced by default. Run evals, detect regressions, and debug production issues without adding LangSmith or custom logging."}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">{t.extremeHome?.whySeizn?.tracingBadge || "Default ON"}</span>
              </div>
            </div>

            {/* Budget-aware Planning */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.extremeHome?.whySeizn?.autopilotTitle || "Budget-aware Autopilot"}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {t.extremeHome?.whySeizn?.autopilotDesc || "Set a latency or cost budget, and Autopilot automatically chooses the optimal retrieval strategy. No manual tuning required."}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">{t.extremeHome?.whySeizn?.autopilotBadge || "Optional"}</span>
              </div>
            </div>

            {/* Governance */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100">
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.extremeHome?.whySeizn?.governanceTitle || "Governance + Audit Logs"}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {t.extremeHome?.whySeizn?.governanceDesc || "PII detection, GDPR-compliant forget, and complete audit trails. Built for teams who need compliance, not bolted on later."}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">{t.extremeHome?.whySeizn?.governanceBadge || "Default for Teams"}</span>
              </div>
            </div>

            {/* Less Glue Code */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.extremeHome?.whySeizn?.lessGlueTitle || "Fewer Moving Parts"}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {t.extremeHome?.whySeizn?.lessGlueDesc || "No more juggling LangChain + Pinecone + LangSmith + custom PII filters. One SDK, one dashboard, one bill."}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{t.extremeHome?.whySeizn?.lessGlueBadge || "Less Glue Code"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="py-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
            <div className="flex items-center gap-3 text-gray-600">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <div className="font-medium text-gray-900">{t.extremeHome?.trust?.security || "RLS + Key Hashing"}</div>
                <div className="text-xs text-gray-500">{t.extremeHome?.trust?.securityDesc || "Secure by default"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="font-medium text-gray-900">{t.extremeHome?.trust?.rateLimits || "Rate Limits"}</div>
                <div className="text-xs text-gray-500">{t.extremeHome?.trust?.rateLimitsDesc || "Usage alerts"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <div className="font-medium text-gray-900">{t.extremeHome?.trust?.auditLogs || "Audit Logs"}</div>
                <div className="text-xs text-gray-500">{t.extremeHome?.trust?.auditLogsDesc || "Full traceability"}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing CTA */}
      <section className="py-16 px-4 sm:px-6 bg-[#0B1220] text-[#EAF0FF]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-semibold mb-4">{t.extremeHome?.pricingCta?.title || "Simple, transparent pricing"}</h2>
          <p className="text-[#EAF0FF]/70 mb-8">
            {t.extremeHome?.pricingCta?.subtitle || "Start free, scale as you grow. No hidden fees."}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={`/${locale}/pricing`}
              className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium rounded-full hover:opacity-90 transition-opacity"
            >
              {t.extremeHome?.pricingCta?.viewPricing || "View Pricing"}
            </Link>
            <Link
              href={`/${locale}/enterprise`}
              className="px-8 py-3 border border-[#EAF0FF]/20 text-[#EAF0FF] font-medium rounded-full hover:bg-[#EAF0FF]/10 transition-colors"
            >
              {t.extremeHome?.pricingCta?.contactSales || "Contact Sales"}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/seizn-icon.svg" alt="Seizn" className="w-6 h-6" />
            <span className="font-medium">Seizn</span>
          </Link>
          <div className="text-sm text-gray-500">
            {t.footer?.copyright?.replace('{year}', new Date().getFullYear().toString()) || `© ${new Date().getFullYear()} Seizn. All rights reserved.`}
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/docs" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{t.extremeHome?.nav?.docs || "Docs"}</Link>
            <a href="https://github.com/seizn" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">GitHub</a>
            <a href={`/${locale}/terms`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Terms</a>
            <a href={`/${locale}/privacy`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Privacy</a>
            <a href="mailto:info@seizn.com" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
