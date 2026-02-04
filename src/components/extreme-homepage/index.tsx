"use client";

import { useState, useCallback, useEffect, Suspense, memo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { RequestBuilder, type RequestConfig, type RequestBuilderTranslations } from "./request-builder";
import { type SearchResult, type ResultsPanelTranslations } from "./results-panel";
import { type TraceSummary, type TracePanelTranslations } from "./trace-panel";
import { type CostBreakdown, type CostPanelTranslations } from "./cost-panel";
import { type PlaygroundError, type ErrorDisplayTranslations } from "./error-display";
import { PanelSkeleton, SnippetSkeleton } from "./loading-skeleton";
import {
  DocsIcon,
  PricingIcon,
  EnterpriseIcon,
  MenuIcon,
  CloseIcon,
  CheckIcon,
  GitHubIcon,
  StatusIcon,
} from "./icons";

// Dynamic imports for below-the-fold and heavy components (code-split for better LCP)
const ResultsPanel = dynamic(
  () => import("./results-panel").then((mod) => ({ default: mod.ResultsPanel })),
  { loading: () => <PanelSkeleton />, ssr: false }
);

const TracePanel = dynamic(
  () => import("./trace-panel").then((mod) => ({ default: mod.TracePanel })),
  { loading: () => <PanelSkeleton />, ssr: false }
);

const CostPanel = dynamic(
  () => import("./cost-panel").then((mod) => ({ default: mod.CostPanel })),
  { loading: () => <PanelSkeleton />, ssr: false }
);

const ErrorDisplay = dynamic(
  () => import("./error-display").then((mod) => ({ default: mod.ErrorDisplay })),
  { ssr: false }
);

// SnippetTabs uses react-syntax-highlighter which is heavy - lazy load it
const SnippetTabs = dynamic(
  () => import("./snippet-tabs").then((mod) => ({ default: mod.SnippetTabs })),
  { loading: () => <SnippetSkeleton />, ssr: false }
);

// DemoQuery removed - integrated into main hero section with Mock/Real mode

interface ExtremeHomepageClientProps {
  dict: Dictionary;
  locale: Locale;
}

type ResultTab = "results" | "trace" | "cost";
type DemoMode = "mock" | "real";

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

const MOCK_COST: CostBreakdown = {
  embedding: 0.0001,
  vectorSearch: 0.0,
  rerank: 0.0018,
  answerContract: 0.0004,
  total: 0.0023,
  tokensIn: 1024,
  tokensOut: 823,
  queryUnits: 1.5,
};

// Memoized Navigation component to prevent unnecessary re-renders
const Navigation = memo(function Navigation({
  locale,
  mobileMenuOpen,
  setMobileMenuOpen,
  t,
}: {
  locale: Locale;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  t: Dictionary;
}) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Left: Logo + Navigation Links */}
        <div className="flex items-center gap-8">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/seizn-icon.svg"
              alt="Seizn"
              className="w-8 h-8"
              width={32}
              height={32}
            />
            <span className="font-semibold text-xl tracking-tight text-gray-900">Seizn</span>
          </Link>

          {/* Desktop Nav - Links next to logo */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/docs" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              {t.extremeHome?.nav?.docs || "Docs"}
            </Link>
            <Link href={`/${locale}/pricing`} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              {t.extremeHome?.nav?.pricing || "Pricing"}
            </Link>
            <Link href={`/${locale}/enterprise`} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              {t.extremeHome?.nav?.enterprise || "Enterprise"}
            </Link>
            <a href="https://github.com/seizn-ai" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              {t.extremeHome?.nav?.github || "GitHub"}
            </a>
            <Link href="/status" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              {t.extremeHome?.nav?.status || "Status"}
            </Link>
          </div>
        </div>

        {/* Desktop Nav - Right Side */}
        <div className="hidden md:flex items-center gap-4">
          <LanguageSwitcher currentLocale={locale} />
          <Link
            href="/dashboard/keys"
            className="text-sm bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
          >
            {t.extremeHome?.nav?.getApiKey || "Get API Key"}
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 text-gray-600"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {mobileMenuOpen ? <CloseIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100">
          <div className="px-4 py-4 space-y-3">
            <Link href="/docs" className="block py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              {t.extremeHome?.nav?.docs || "Docs"}
            </Link>
            <Link href={`/${locale}/pricing`} className="block py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              {t.extremeHome?.nav?.pricing || "Pricing"}
            </Link>
            <Link href={`/${locale}/enterprise`} className="block py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              {t.extremeHome?.nav?.enterprise || "Enterprise"}
            </Link>
            <a href="https://github.com/seizn-ai" target="_blank" rel="noopener noreferrer" className="block py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              {t.extremeHome?.nav?.github || "GitHub"}
            </a>
            <Link href="/status" className="block py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              {t.extremeHome?.nav?.status || "Status"}
            </Link>
            <div className="pt-2 border-t border-gray-100">
              <LanguageSwitcher currentLocale={locale} />
            </div>
            <Link href="/dashboard/keys" className="block w-full text-center bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 rounded-full mt-3">
              {t.extremeHome?.nav?.getApiKey || "Get API Key"}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
});

export function ExtremeHomepageClient({ dict, locale }: ExtremeHomepageClientProps) {
  const [mode, setMode] = useState<DemoMode>("mock");
  const [config, setConfig] = useState<RequestConfig>(DEFAULT_CONFIG);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [trace, setTrace] = useState<TraceSummary | null>(null);
  const [cost, setCost] = useState<CostBreakdown | null>(null);
  const [error, setError] = useState<PlaygroundError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ResultTab>("results");
  const [hasRun, setHasRun] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileConsoleTab, setMobileConsoleTab] = useState<"request" | "results" | "trace" | "cost">("request");
  const [traceId, setTraceId] = useState<string | null>(null);
  const [shareToastVisible, setShareToastVisible] = useState(false);
  const [rateLimitRetryAfter, setRateLimitRetryAfter] = useState<number | null>(null);

  // Close mobile menu on resize - use passive listener
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleRun = useCallback(async () => {
    setIsLoading(true);
    setHasRun(true);
    setError(null);
    setRateLimitRetryAfter(null);

    if (mode === "mock") {
      // Mock mode - simulate API call
      const responseTime = 600 + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, responseTime));

      // Generate a trace ID for this request
      const newTraceId = `tr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
      setTraceId(newTraceId);

      // Use mock data for demo
      setResults(MOCK_RESULTS.slice(0, config.topK));

      // Calculate trace based on config
      const filteredSteps = MOCK_TRACE.steps.filter((step) => {
        if (step.name.includes("Rerank") && !config.rerank) return false;
        if (step.name.includes("Hybrid") && !config.hybridSearch) return false;
        if (step.name.includes("Contract") && !config.answerContract) return false;
        return true;
      });

      const totalLatency = config.budgetMs * 0.7 + Math.random() * 100;
      setTrace({
        ...MOCK_TRACE,
        totalLatencyMs: totalLatency,
        steps: filteredSteps,
      });

      // Calculate cost based on config
      const costData: CostBreakdown = {
        embedding: MOCK_COST.embedding,
        vectorSearch: MOCK_COST.vectorSearch,
        rerank: config.rerank ? MOCK_COST.rerank : 0,
        answerContract: config.answerContract ? MOCK_COST.answerContract : 0,
        total: MOCK_COST.embedding + (config.rerank ? MOCK_COST.rerank : 0) + (config.answerContract ? MOCK_COST.answerContract : 0),
        tokensIn: MOCK_COST.tokensIn,
        tokensOut: config.answerContract ? MOCK_COST.tokensOut : 0,
        queryUnits: 1 + (config.hybridSearch ? 0.5 : 0) + (config.rerank ? 1 : 0),
      };
      setCost(costData);

      setIsLoading(false);
      setActiveTab("results");
      setMobileConsoleTab("results");
    } else {
      // Real API mode
      if (!config.query.trim()) {
        setError({ message: "Please enter a query", details: "" });
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/public/demo-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: config.query,
            topK: config.topK,
            hybridSearch: config.hybridSearch,
            rerank: config.rerank,
            answerContract: config.answerContract,
            budgetMs: config.budgetMs,
          }),
        });

        if (response.status === 429) {
          const data = await response.json();
          setError({
            message: "Rate limit exceeded. Please wait before trying again.",
            details: data.message || "",
          });
          setRateLimitRetryAfter(data.retryAfter || 60);
          setIsLoading(false);
          return;
        }

        if (!response.ok) {
          const data = await response.json();
          setError({
            message: data.message || "An error occurred",
            details: data.details || "",
          });
          setIsLoading(false);
          return;
        }

        const data = await response.json();
        setResults(data.results || []);
        setTrace(data.trace || null);
        setCost(data.cost || null);
        setTraceId(data.traceId || `tr_${Date.now().toString(36)}`);
        setActiveTab("results");
        setMobileConsoleTab("results");
      } catch (err) {
        setError({
          message: "Network error. Please check your connection and try again.",
          details: err instanceof Error ? err.message : "",
        });
      } finally {
        setIsLoading(false);
      }
    }
  }, [config, mode]);

  const handleRetry = useCallback(() => {
    setError(null);
    handleRun();
  }, [handleRun]);

  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

  // Handle Share Trace - copy trace link to clipboard
  const handleShareTrace = useCallback(async () => {
    if (!traceId) return;

    const shareUrl = `${window.location.origin}/traces/${traceId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareToastVisible(true);
      setTimeout(() => setShareToastVisible(false), 3000);
    } catch {
      console.error('Failed to copy trace link');
    }
  }, [traceId]);

  // Auto-run demo on page load (once per session)
  useEffect(() => {
    // Skip if already run in this session or already executed
    const hasAutoRun = sessionStorage.getItem("seizn-demo-auto-run");
    if (hasAutoRun || hasRun) return;

    // Wait for page to fully load, then auto-run demo
    const timer = setTimeout(() => {
      // Set a demo query
      setConfig((prev) => ({
        ...prev,
        query: "How do I implement secure authentication?",
      }));

      // Trigger the demo run after a short delay
      setTimeout(async () => {
        await handleRun();
        sessionStorage.setItem("seizn-demo-auto-run", "true");
        // Switch to trace tab to show the trace visualization
        setActiveTab("trace");
      }, 500);
    }, 1500);

    return () => clearTimeout(timer);
  }, [hasRun, handleRun]);

  const t = dict;

  return (
    <>
      {/* Sticky Navigation - Memoized */}
      <Navigation
        locale={locale}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        t={t}
      />

      {/* Hero Section - Clean, focused above-the-fold with proper spacing */}
      <section className="min-h-[70vh] flex items-center pt-20 lg:pt-24 pb-16 lg:pb-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* H1 - Concise tagline */}
          <h1 className="text-[clamp(36px,4.5vw,60px)] font-semibold tracking-tight text-gray-900 leading-[1.08]">
            {t.extremeHome?.heroTitle || "Governed memory & retrieval for agents."}
          </h1>

          {/* Subtitle - Single sentence, clear value prop */}
          <p className="text-lg lg:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            {t.extremeHome?.heroSubtitle || "Trace, evaluate, and enforce policies — all in one request."}
          </p>

          {/* CTAs - Primary and Secondary */}
          <div className="flex items-center justify-center gap-4 flex-wrap pt-2">
            <Link
              href={`/${locale}/signup`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors shadow-sm"
            >
              {"Get API Key"}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <button
              onClick={() => {
                document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {"Try Demo"}
            </button>
          </div>

          {/* Feature Chips - Trust signals below CTAs */}
          <div className="flex items-center justify-center gap-3 flex-wrap pt-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 text-sm font-medium rounded-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {t.extremeHome?.chips?.trace || "Trace"}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t.extremeHome?.chips?.eval || "Eval"}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 text-sm font-medium rounded-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {t.extremeHome?.chips?.policy || "Policy"}
            </span>
          </div>
        </div>
      </section>

      {/* Playground Section - Visually distinct with subtle background */}
      <section id="demo" className="py-16 px-4 sm:px-6 bg-gradient-to-b from-gray-50/50 to-white">
        <div className="max-w-7xl mx-auto">
          {/* Playground Header with Mode Toggle */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {t.extremeHome?.playgroundTitle || "Playground"}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {"Test the API with your own queries"}
              </p>
            </div>

            {/* Mode Toggle - Moved here */}
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setMode("mock")}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    mode === "mock"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Mock
                </button>
                <button
                  onClick={() => setMode("real")}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    mode === "real"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Real API
                </button>
              </div>
              {mode === "real" && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                  Rate limited
                </span>
              )}
            </div>
          </div>

          {/* Progress Indicator */}
          {hasRun && (
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckIcon className="w-4 h-4 text-emerald-600" />
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
                <h3 className="text-sm font-medium text-gray-500 mb-4">{(t.extremeHome?.requestBuilder as RequestBuilderTranslations)?.title || "Request Builder"}</h3>
                <RequestBuilder
                  config={config}
                  onConfigChange={setConfig}
                  onRun={handleRun}
                  isLoading={isLoading}
                  translations={t.extremeHome?.requestBuilder as RequestBuilderTranslations}
                />
              </div>

              {/* Right: Results + Trace */}
              <div className="bg-white rounded-xl p-6 border border-gray-100 flex flex-col min-h-[600px]">
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
                    {t.extremeHome?.tabs?.results || "Results"}
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
                    {t.extremeHome?.tabs?.trace || "Trace"}
                    {trace && (
                      <span className="ml-2 text-xs bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">
                        {trace.totalLatencyMs.toFixed(0)}ms
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("cost")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === "cost"
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {t.extremeHome?.tabs?.cost || "Cost"}
                    {cost && (
                      <span className="ml-2 text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">
                        ${cost.total.toFixed(4)}
                      </span>
                    )}
                  </button>
                </div>

                {/* Error Display - Lazy loaded */}
                {error && (
                  <Suspense fallback={null}>
                    <ErrorDisplay
                      error={error}
                      onRetry={handleRetry}
                      onDismiss={handleDismissError}
                      translations={t.extremeHome?.errorDisplay as ErrorDisplayTranslations}
                    />
                  </Suspense>
                )}

                {/* Tab Content - Lazy loaded panels */}
                <div className="flex-1">
                  {activeTab === "results" && (
                    <Suspense fallback={<PanelSkeleton />}>
                      <ResultsPanel
                        results={results}
                        isLoading={isLoading}
                        showRerankDelta={config.rerank}
                        translations={t.extremeHome?.resultsPanel as ResultsPanelTranslations}
                      />
                    </Suspense>
                  )}
                  {activeTab === "trace" && (
                    <Suspense fallback={<PanelSkeleton />}>
                      <TracePanel
                        trace={trace}
                        isLoading={isLoading}
                        translations={t.extremeHome?.tracePanel as TracePanelTranslations}
                      />
                    </Suspense>
                  )}
                  {activeTab === "cost" && (
                    <Suspense fallback={<PanelSkeleton />}>
                      <CostPanel
                        cost={cost}
                        isLoading={isLoading}
                        translations={t.extremeHome?.costPanel as CostPanelTranslations}
                      />
                    </Suspense>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Live Console - Mobile */}
          <div className="md:hidden bg-gray-50 rounded-2xl p-4 border border-gray-100">
            {/* Mobile Tabs */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto">
              <button
                onClick={() => setMobileConsoleTab("request")}
                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  mobileConsoleTab === "request"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                {(t.extremeHome?.requestBuilder as RequestBuilderTranslations)?.title || "Request"}
              </button>
              <button
                onClick={() => setMobileConsoleTab("results")}
                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  mobileConsoleTab === "results"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                {t.extremeHome?.tabs?.results || "Results"}
              </button>
              <button
                onClick={() => setMobileConsoleTab("trace")}
                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  mobileConsoleTab === "trace"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                {t.extremeHome?.tabs?.trace || "Trace"}
              </button>
              <button
                onClick={() => setMobileConsoleTab("cost")}
                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  mobileConsoleTab === "cost"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                {t.extremeHome?.tabs?.cost || "Cost"}
              </button>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-100 min-h-[400px]">
              {mobileConsoleTab === "request" && (
                <RequestBuilder
                  config={config}
                  onConfigChange={setConfig}
                  onRun={handleRun}
                  isLoading={isLoading}
                  translations={t.extremeHome?.requestBuilder as RequestBuilderTranslations}
                />
              )}
              {mobileConsoleTab === "results" && (
                <Suspense fallback={<PanelSkeleton />}>
                  <ResultsPanel
                    results={results}
                    isLoading={isLoading}
                    showRerankDelta={config.rerank}
                    translations={t.extremeHome?.resultsPanel as ResultsPanelTranslations}
                  />
                </Suspense>
              )}
              {mobileConsoleTab === "trace" && (
                <Suspense fallback={<PanelSkeleton />}>
                  <TracePanel
                    trace={trace}
                    isLoading={isLoading}
                    translations={t.extremeHome?.tracePanel as TracePanelTranslations}
                  />
                </Suspense>
              )}
              {mobileConsoleTab === "cost" && (
                <Suspense fallback={<PanelSkeleton />}>
                  <CostPanel
                    cost={cost}
                    isLoading={isLoading}
                    translations={t.extremeHome?.costPanel as CostPanelTranslations}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Copy Snippet Section - Lazy loaded */}
      <section className="py-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{t.extremeHome?.copySnippetTitle || "Copy this snippet"}</h2>
            <p className="text-sm text-gray-500">
              {t.extremeHome?.copySnippetSubtitle || "Generated from your exact settings above"}
            </p>
          </div>
          <Suspense fallback={<SnippetSkeleton />}>
            <SnippetTabs
              config={config}
              traceId={traceId}
              onShareTrace={handleShareTrace}
            />
          </Suspense>
        </div>
      </section>

      {/* Share Trace Toast Notification */}
      {shareToastVisible && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-gray-900 text-white rounded-xl shadow-lg flex items-center gap-3 animate-fade-in-up">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm">Trace link copied to clipboard!</span>
        </div>
      )}

    </>
  );
}
