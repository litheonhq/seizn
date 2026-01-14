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
  TracingIcon,
  AutopilotIcon,
  GovernanceIcon,
  LessGlueIcon,
  SecurityIcon,
  RateLimitIcon,
  AuditIcon,
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

interface ExtremeHomepageClientProps {
  dict: Dictionary;
  locale: Locale;
}

type ResultTab = "results" | "trace" | "cost";

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
        <Link href={`/${locale}`} className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/seizn-icon.svg"
            alt="Seizn"
            className="w-8 h-8"
            width={32}
            height={32}
          />
          <span className="font-semibold text-xl tracking-tight">Seizn</span>
        </Link>

        {/* Desktop Nav - Centered Links with Memoized Icons */}
        <div className="hidden md:flex items-center justify-center gap-8 absolute left-1/2 -translate-x-1/2">
          <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-emerald-600 transition-colors group">
            <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
              <DocsIcon className="w-4 h-4" />
            </div>
            {t.extremeHome?.nav?.docs || "Docs"}
          </Link>
          <Link href={`/${locale}/pricing`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-emerald-600 transition-colors group">
            <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
              <PricingIcon className="w-4 h-4" />
            </div>
            {t.extremeHome?.nav?.pricing || "Pricing"}
          </Link>
          <Link href={`/${locale}/enterprise`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-emerald-600 transition-colors group">
            <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
              <EnterpriseIcon className="w-4 h-4" />
            </div>
            {t.extremeHome?.nav?.enterprise || "Enterprise"}
          </Link>
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
          <div className="px-4 py-4 space-y-4">
            <div className="flex justify-center gap-8 py-2">
              <Link href="/docs" className="flex flex-col items-center gap-1 text-gray-600 hover:text-emerald-600 transition-colors">
                <DocsIcon className="w-5 h-5" />
                <span className="text-xs">{t.extremeHome?.nav?.docs || "Docs"}</span>
              </Link>
              <Link href={`/${locale}/pricing`} className="flex flex-col items-center gap-1 text-gray-600 hover:text-emerald-600 transition-colors">
                <PricingIcon className="w-5 h-5" />
                <span className="text-xs">{t.extremeHome?.nav?.pricing || "Pricing"}</span>
              </Link>
              <Link href={`/${locale}/enterprise`} className="flex flex-col items-center gap-1 text-gray-600 hover:text-emerald-600 transition-colors">
                <EnterpriseIcon className="w-5 h-5" />
                <span className="text-xs">{t.extremeHome?.nav?.enterprise || "Enterprise"}</span>
              </Link>
            </div>
            <LanguageSwitcher currentLocale={locale} />
            <Link href="/dashboard/keys" className="block w-full text-center bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 rounded-full">
              {t.extremeHome?.nav?.getApiKey || "Get API Key"}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
});

// Memoized Why Seizn section - static content that doesn't need re-renders
const WhySeizn = memo(function WhySeizn({ t }: { t: Dictionary }) {
  return (
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
              <TracingIcon className="w-5 h-5 text-purple-600" />
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
              <AutopilotIcon className="w-5 h-5 text-blue-600" />
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
              <GovernanceIcon className="w-5 h-5 text-rose-600" />
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
              <LessGlueIcon className="w-5 h-5 text-amber-600" />
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
  );
});

// Memoized Trust Badges section
const TrustBadges = memo(function TrustBadges({ t }: { t: Dictionary }) {
  return (
    <section className="py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
          <div className="flex items-center gap-3 text-gray-600">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <SecurityIcon className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">{t.extremeHome?.trust?.security || "RLS + Key Hashing"}</div>
              <div className="text-xs text-gray-500">{t.extremeHome?.trust?.securityDesc || "Secure by default"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <RateLimitIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">{t.extremeHome?.trust?.rateLimits || "Rate Limits"}</div>
              <div className="text-xs text-gray-500">{t.extremeHome?.trust?.rateLimitsDesc || "Usage alerts"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <AuditIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">{t.extremeHome?.trust?.auditLogs || "Audit Logs"}</div>
              <div className="text-xs text-gray-500">{t.extremeHome?.trust?.auditLogsDesc || "Full traceability"}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

// Memoized Pricing CTA section
const PricingCTA = memo(function PricingCTA({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
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
  );
});

// Memoized Footer section
const Footer = memo(function Footer({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <footer className="py-12 px-4 sm:px-6 border-t border-gray-100">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/seizn-icon.svg"
            alt="Seizn"
            className="w-6 h-6"
            width={24}
            height={24}
            loading="lazy"
          />
          <span className="font-medium">Seizn</span>
        </Link>
        <div className="text-sm text-gray-500">
          {t.footer?.copyright?.replace('{year}', new Date().getFullYear().toString()) || `© ${new Date().getFullYear()} Seizn. All rights reserved.`}
        </div>
        <nav className="flex items-center gap-6">
          <Link href="/docs" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{t.extremeHome?.nav?.docs || "Docs"}</Link>
          <a href="https://github.com/seizn" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">GitHub</a>
          <Link href="/terms" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Terms</Link>
          <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Privacy</Link>
          <Link href="/refund" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Refund</Link>
          <a href="mailto:support@seizn.com" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Contact</a>
        </nav>
      </div>
    </footer>
  );
});

export function ExtremeHomepageClient({ dict, locale }: ExtremeHomepageClientProps) {
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

    // Simulate API call - faster response (600-800ms)
    const responseTime = 600 + Math.random() * 200;
    await new Promise((resolve) => setTimeout(resolve, responseTime));

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
  }, [config]);

  const handleRetry = useCallback(() => {
    setError(null);
    handleRun();
  }, [handleRun]);

  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

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
    <div className="min-h-screen bg-white">
      {/* Sticky Navigation - Memoized */}
      <Navigation
        locale={locale}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        t={t}
      />

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
            <SnippetTabs config={config} />
          </Suspense>
        </div>
      </section>

      {/* Why Seizn Section - Memoized static content */}
      <WhySeizn t={t} />

      {/* Trust Badges - Memoized */}
      <TrustBadges t={t} />

      {/* Pricing CTA - Memoized */}
      <PricingCTA locale={locale} t={t} />

      {/* Footer - Memoized */}
      <Footer locale={locale} t={t} />
    </div>
  );
}
