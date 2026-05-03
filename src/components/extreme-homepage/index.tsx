"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense, memo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SeiznMark } from "@/components/landing/brand-marks";
import { analytics } from "@/lib/analytics";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { RequestBuilder, type RequestConfig, type RequestBuilderTranslations } from "./request-builder";
import { type SearchResult, type ResultsPanelTranslations } from "./results-panel";
import { type TraceSummary, type TracePanelTranslations } from "./trace-panel";
import { type CostBreakdown, type CostPanelTranslations } from "./cost-panel";
import { type PlaygroundError, type ErrorDisplayTranslations } from "./error-display";
import { PanelSkeleton, SnippetSkeleton } from "./loading-skeleton";
import {
  MenuIcon,
  CloseIcon,
  CheckIcon,
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

// Knowledge graph background animation for hero section
const HeroGraphAnimation = dynamic(
  () => import("./hero-graph-animation").then((mod) => ({ default: mod.HeroGraphAnimation })),
  { ssr: false }
);

// Memory pipeline flow animation for hero section
const MemoryFlowAnimation = dynamic(
  () => import("./memory-flow-animation").then((mod) => ({ default: mod.MemoryFlowAnimation })),
  { loading: () => <div className="h-24" />, ssr: false }
);

// DemoQuery removed - integrated into main hero section with Mock/Real mode

type ExtremeHomeMessages = NonNullable<Dictionary["extremeHome"]>;

interface ExtremeHomepageClientProps {
  messages: Dictionary["extremeHome"];
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

/** Determine seasonal theme class based on current month */
function getSeasonalTheme(): string {
  const month = new Date().getMonth(); // 0-11
  if (month >= 2 && month <= 4) return "theme-spring";
  if (month >= 5 && month <= 7) return "theme-summer";
  if (month >= 8 && month <= 10) return "theme-autumn";
  return "theme-winter";
}

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
  t: ExtremeHomeMessages;
}) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--ink-50)]/95 backdrop-blur-sm border-b border-[var(--ink-200)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Left: Logo + Navigation Links */}
        <div className="flex items-center gap-8">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <span aria-label="Seizn" className="w-8 h-8 inline-flex items-center justify-center">
              <SeiznMark size={32} color="var(--ink-900)" />
            </span>
            <span className="font-semibold text-xl tracking-tight text-[var(--ink-900)]">Seizn</span>
          </Link>

          {/* Desktop Nav - Links next to logo */}
          <div className="hidden md:flex items-center gap-6">
            <Link
              href={`/${locale}/docs`}
              className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors"
            >
              {t.nav?.docs || "Docs"}
            </Link>
            <Link
              href={`/${locale}/pricing`}
              className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors"
            >
              {t.nav?.pricing || "Pricing"}
            </Link>
            <Link
              href={`/${locale}/comparison`}
              className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors"
            >
              {t.nav?.compare || "Compare"}
            </Link>
            <Link
              href={`/${locale}/enterprise`}
              className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors"
            >
              {t.nav?.enterprise || "Enterprise"}
            </Link>
            <a
              href="https://github.com/seizn-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors"
            >
              {t.nav?.github || "GitHub"}
            </a>
            <Link
              href="/status"
              className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors"
            >
              {t.nav?.status || "Status"}
            </Link>
          </div>
        </div>

        {/* Desktop Nav - Right Side */}
        <div className="hidden md:flex items-center gap-4">
          <LanguageSwitcher currentLocale={locale} />
          <Link
            href="/dashboard/keys"
            className="text-sm bg-gradient-to-r from-[var(--ink-900)] to-[var(--ink-700)] text-white px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
          >
            {t.nav?.getApiKey || "Get API Key"}
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 text-[var(--ink-600)]"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="extreme-home-mobile-menu"
        >
          {mobileMenuOpen ? <CloseIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu - animated */}
      <div
        id="extreme-home-mobile-menu"
        className={`md:hidden bg-[var(--ink-50)] border-t border-[var(--ink-200)] overflow-hidden transition-all duration-300 ease-in-out ${
          mobileMenuOpen ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 py-4 space-y-3">
          <Link href={`/${locale}/docs`} className="block py-2.5 text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">
            {t.nav?.docs || "Docs"}
          </Link>
          <Link href={`/${locale}/pricing`} className="block py-2.5 text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">
            {t.nav?.pricing || "Pricing"}
          </Link>
          <Link href={`/${locale}/comparison`} className="block py-2.5 text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">
            {t.nav?.compare || "Compare"}
          </Link>
          <Link href={`/${locale}/enterprise`} className="block py-2.5 text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">
            {t.nav?.enterprise || "Enterprise"}
          </Link>
          <a href="https://github.com/seizn-ai" target="_blank" rel="noopener noreferrer" className="block py-2.5 text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">
            {t.nav?.github || "GitHub"}
          </a>
          <Link href="/status" className="block py-2.5 text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] transition-colors">
            {t.nav?.status || "Status"}
          </Link>
          <div className="pt-2 border-t border-[var(--ink-200)]">
            <LanguageSwitcher currentLocale={locale} />
          </div>
          <Link href="/dashboard/keys" className="block w-full text-center bg-gradient-to-r from-[var(--ink-900)] to-[var(--ink-700)] text-white py-3 rounded-full mt-3">
            {t.nav?.getApiKey || "Get API Key"}
          </Link>
        </div>
      </div>
    </nav>
  );
});

export function ExtremeHomepageClient({ messages, locale }: ExtremeHomepageClientProps) {
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
  const [isHeroMotionReady, setIsHeroMotionReady] = useState(false);
  const autoRunAttemptedRef = useRef(false);
  const liveDemoCtaLabel = "Open Live Playground";

  const scrollToDemo = useCallback((source: "hero_cta" = "hero_cta") => {
    analytics.featureUsed("extreme_home_scroll_to_demo", { source });
    document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleModeChange = useCallback((nextMode: DemoMode) => {
    setMode(nextMode);
    analytics.featureUsed("extreme_home_demo_mode_changed", { mode: nextMode });
  }, []);

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

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const enableHeroMotion = () => setIsHeroMotionReady(true);

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(enableHeroMotion, { timeout: 1200 });
    } else {
      timeoutId = setTimeout(enableHeroMotion, 250);
    }

    return () => {
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const handleRun = useCallback(async (source: "manual" | "auto" = "manual") => {
    analytics.featureUsed("extreme_home_demo_run_started", { mode, source });
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
      analytics.featureUsed("extreme_home_demo_completed", {
        mode: "mock",
        source,
        result_count: Math.min(config.topK, MOCK_RESULTS.length),
        latency_ms: Math.round(totalLatency),
      });

      setIsLoading(false);
      setActiveTab("results");
      setMobileConsoleTab("results");
    } else {
      // Real API mode
      if (!config.query.trim()) {
        setError({ message: "Please enter a query", details: "" });
        analytics.errorOccurred("extreme_home_empty_query", "Attempted to run demo without query");
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
          analytics.errorOccurred("extreme_home_rate_limit", data.message || "Rate limit exceeded");
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
          analytics.errorOccurred("extreme_home_api_error", data.message || "Demo API request failed");
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
        analytics.featureUsed("extreme_home_demo_completed", {
          mode: "real",
          source,
          result_count: Array.isArray(data.results) ? data.results.length : 0,
          latency_ms: data.trace?.totalLatencyMs ? Math.round(data.trace.totalLatencyMs) : null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown network error";
        setError({
          message: "Network error. Please check your connection and try again.",
          details: message,
        });
        analytics.errorOccurred("extreme_home_network_error", message);
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
      analytics.featureUsed("extreme_home_trace_shared", { trace_id: traceId });
      setTimeout(() => setShareToastVisible(false), 3000);
    } catch {
      analytics.errorOccurred("extreme_home_trace_share_failed", "Failed to copy trace link to clipboard");
      console.error('Failed to copy trace link');
    }
  }, [traceId]);

  // Auto-run demo once when the demo section enters viewport (session-scoped)
  useEffect(() => {
    if (hasRun || autoRunAttemptedRef.current || mode !== "mock") return;
    const hasAutoRun = sessionStorage.getItem("seizn-demo-auto-run");
    if (hasAutoRun) return;

    const demoSection = document.getElementById("demo");
    if (!demoSection) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible || autoRunAttemptedRef.current) return;

        autoRunAttemptedRef.current = true;
        observer.disconnect();
        timer = setTimeout(async () => {
          setConfig((prev) => ({
            ...prev,
            query: "How do I implement secure authentication?",
          }));
          await handleRun("auto");
          sessionStorage.setItem("seizn-demo-auto-run", "true");
          setActiveTab("trace");
          setMobileConsoleTab("trace");
          analytics.featureUsed("extreme_home_auto_demo_completed", { mode: "mock" });
        }, 500);
      },
      { rootMargin: "160px 0px" }
    );

    observer.observe(demoSection);
    return () => {
      observer.disconnect();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [hasRun, handleRun, mode]);

  const t = (messages ?? {}) as ExtremeHomeMessages;
  const seasonalTheme = useMemo(() => getSeasonalTheme(), []);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[70] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--ink-900)] focus:text-white"
      >
        Skip to main content
      </a>

      {/* Sticky Navigation - Memoized */}
      <Navigation
        locale={locale}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        t={t}
      />

      <main id="main-content">
      {/* Hero Section - Fullscreen background video with text overlay */}
      <section className={`relative min-h-screen flex items-center overflow-hidden ${seasonalTheme}`}>
        {/* Background Video Layer */}
        <div className="absolute inset-0 z-0">
          {/* Video element — replace src with actual mp4/webm when ready */}
          <video
            className="hero-video absolute inset-0 w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="none"
            aria-hidden="true"
          >
            {/* Uncomment and add your video sources when ready:
            <source src="/hero-bg.webm" type="video/webm" />
            <source src="/hero-bg.mp4" type="video/mp4" />
            */}
          </video>

          {/* Animated placeholder gradient (shown until real video is added) */}
          <div className="hero-placeholder absolute inset-0 theme-gradient-bg" aria-hidden="true">
            {/* Animated gradient orbs */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-1/4 -left-1/4 w-[60%] h-[60%] rounded-full bg-[color:var(--theme-primary)]/10 blur-[100px] animate-float-slow" />
              <div className="absolute -bottom-1/4 -right-1/4 w-[50%] h-[50%] rounded-full bg-[color:var(--theme-secondary)]/10 blur-[100px] animate-float-medium" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] h-[40%] rounded-full bg-[color:var(--theme-accent)]/15 blur-[80px] animate-float-fast" />
            </div>
            {/* Subtle grid pattern */}
            <div className="absolute inset-0 hero-grid-pattern opacity-[0.03] dark:opacity-[0.05]" />
          </div>

          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--ink-50)]/60 via-szn-bg/40 to-[var(--ink-50)]/80" />
        </div>

        {/* Knowledge Graph Animation Layer */}
        <div className="absolute inset-0 z-[1] pointer-events-none" aria-hidden="true">
          {isHeroMotionReady ? <HeroGraphAnimation /> : null}
        </div>

        {/* Content Layer */}
        <div className="relative z-10 w-full pt-24 lg:pt-32 pb-16 lg:pb-24 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* H1 - Category claim */}
            <h1 className="text-[clamp(36px,4.5vw,60px)] font-semibold tracking-tight text-[var(--ink-900)] leading-[1.08]">
              {t.heroTitle || "The standard backend for agent runtime persistence."}
            </h1>

            {/* Subtitle - Value prop */}
            <p className="text-lg lg:text-xl text-[var(--ink-600)] max-w-2xl mx-auto leading-relaxed">
              {t.heroSubtitle || "MCP server, checkpointer, and policy/trace layer\u2014one SDK to persist, govern, and observe every agent session."}
            </p>

            {/* CTAs - Primary and Secondary */}
            <div className={`flex items-center justify-center gap-4 flex-wrap pt-2 ${isHeroMotionReady ? "animate-fade-in-up animate-delay-300" : ""}`}>
              <Link
                href="/signup"
                onClick={() => analytics.featureUsed("extreme_home_primary_cta_clicked", { target: "signup" })}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-[var(--ink-900)] dark:bg-white text-white dark:text-gray-900 font-medium rounded-xl hover:bg-[var(--ink-800)] dark:hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                {t.ctaStart || "Start Building Free"}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <button
                onClick={() => scrollToDemo("hero_cta")}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-[var(--ink-0)]/80 backdrop-blur-sm text-[var(--ink-900)] font-medium rounded-xl border border-[var(--ink-200)]/80 hover:border-[var(--ink-200)] hover:bg-[var(--ink-0)] transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {liveDemoCtaLabel}
              </button>
            </div>

            {/* Social Proof */}
            <div className={`flex items-center justify-center gap-2 pt-4 ${isHeroMotionReady ? "animate-fade-in-up animate-delay-400" : ""}`}>
              <span className="relative flex h-2.5 w-2.5">
                <span className={`absolute inline-flex h-full w-full rounded-full bg-[var(--ink-900)] opacity-75 ${isHeroMotionReady ? "animate-ping" : ""}`} />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--ink-900)]" />
              </span>
              <span className="text-sm text-[var(--ink-600)]">
                {t.socialProof || "Built for game studios scaling from 10 to 10,000 NPCs."}
              </span>
            </div>

            {/* Memory Flow Pipeline Animation */}
            <div className={`pt-8 ${isHeroMotionReady ? "animate-fade-in-up animate-delay-500" : ""}`}>
              {isHeroMotionReady ? <MemoryFlowAnimation /> : <div className="h-24" aria-hidden="true" />}
            </div>
          </div>
        </div>

        {/* Bottom gradient fade into next section */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[var(--ink-50)] to-transparent z-10 pointer-events-none" />
      </section>

      {/* Playground Section - Visually distinct with subtle background */}
      <section id="demo" className="py-16 px-4 sm:px-6 bg-gradient-to-b from-[var(--ink-50)]/50 to-[var(--ink-50)]">
        <div className="max-w-7xl mx-auto">
          {/* Playground Header with Mode Toggle */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--ink-50)] text-xs font-medium text-[var(--ink-600)] mb-4">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
              {t.liveDemo || "Live Demo"}
            </div>
            <h2 className="text-3xl font-semibold text-[var(--ink-900)] mb-2">
              <span className="theme-gradient-text">{t.playgroundTitle || "Playground"}</span>
            </h2>
            <p className="text-[var(--ink-600)] mb-6">
              {t.heroTagline || "Try the API live - no signup required"}
            </p>

            {/* Mode Toggle */}
            <div className="inline-flex items-center gap-2">
              <div className="inline-flex items-center gap-1 p-1 bg-[var(--ink-50)] rounded-xl">
                <button
                  onClick={() => handleModeChange("mock")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    mode === "mock"
                      ? "bg-[var(--ink-50)] text-[var(--ink-900)] shadow-sm"
                      : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
                  }`}
                >
                  Mock
                </button>
                <button
                  onClick={() => handleModeChange("real")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    mode === "real"
                      ? "bg-[var(--ink-50)] text-[var(--ink-900)] shadow-sm"
                      : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
                  }`}
                >
                  Real API
                </button>
              </div>
              {mode === "real" && (
                <span className="text-xs text-[var(--signal-pending-ink)] bg-[var(--signal-pending-soft)] dark:bg-[var(--signal-pending)]/20 px-2.5 py-1 rounded-full">
                  Rate limited
                </span>
              )}
            </div>
            {rateLimitRetryAfter !== null && (
              <p className="mt-2 text-xs text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)]">
                {`Retry available in ${rateLimitRetryAfter}s`}
              </p>
            )}
          </div>

          {/* Progress Indicator */}
          {hasRun && (
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[var(--ink-900)]/10 flex items-center justify-center">
                  <CheckIcon className="w-4 h-4 text-[var(--ink-900)]" />
                </div>
                <span className="text-sm text-[var(--ink-600)]">{t.firstRetrievalComplete || "First retrieval complete"}</span>
              </div>
              <span className="text-[var(--ink-500)]">|</span>
              <span className="text-sm text-[var(--ink-600)]">{t.copySnippetHint || "Copy the snippet below to reproduce"}</span>
            </div>
          )}

          {/* Live Console - Desktop */}
          <div className="hidden md:block bg-[var(--ink-50)] rounded-2xl p-6 border border-[var(--ink-200)]">
            <div className="grid grid-cols-2 gap-6">
              {/* Left: Request Builder */}
              <div className="bg-[var(--ink-0)] rounded-xl p-6 border border-[var(--ink-200)]">
                <h3 className="text-sm font-medium text-[var(--ink-600)] mb-4">{(t.requestBuilder as RequestBuilderTranslations)?.title || "Request Builder"}</h3>
                <RequestBuilder
                  config={config}
                  onConfigChange={setConfig}
                  onRun={handleRun}
                  isLoading={isLoading}
                  translations={t.requestBuilder as RequestBuilderTranslations}
                />
              </div>

              {/* Right: Results + Trace */}
              <div className="bg-[var(--ink-0)] rounded-xl p-6 border border-[var(--ink-200)] flex flex-col min-h-[600px]">
                {/* Tabs */}
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => {
                      setActiveTab("results");
                      analytics.featureUsed("extreme_home_desktop_tab_changed", { tab: "results" });
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === "results"
                        ? "bg-[var(--ink-50)] text-[var(--ink-900)]"
                        : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
                    }`}
                  >
                    {t.tabs?.results || "Results"}
                    {results.length > 0 && (
                      <span className="ml-2 text-xs bg-[var(--ink-50)] text-[var(--ink-600)] px-1.5 py-0.5 rounded-full">
                        {results.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("trace");
                      analytics.featureUsed("extreme_home_desktop_tab_changed", { tab: "trace" });
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === "trace"
                        ? "bg-[var(--ink-50)] text-[var(--ink-900)]"
                        : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
                    }`}
                  >
                    {t.tabs?.trace || "Trace"}
                    {trace && (
                      <span className="ml-2 text-xs bg-[var(--ink-900)]/10 text-[var(--ink-900)] px-1.5 py-0.5 rounded-full">
                        {trace.totalLatencyMs.toFixed(0)}ms
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("cost");
                      analytics.featureUsed("extreme_home_desktop_tab_changed", { tab: "cost" });
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === "cost"
                        ? "bg-[var(--ink-50)] text-[var(--ink-900)]"
                        : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
                    }`}
                  >
                    {t.tabs?.cost || "Cost"}
                    {cost && (
                      <span className="ml-2 text-xs bg-[var(--signal-pending-soft)] dark:bg-[var(--signal-pending)]/30 text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)] px-1.5 py-0.5 rounded-full">
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
                      translations={t.errorDisplay as ErrorDisplayTranslations}
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
                        translations={t.resultsPanel as ResultsPanelTranslations}
                      />
                    </Suspense>
                  )}
                  {activeTab === "trace" && (
                    <Suspense fallback={<PanelSkeleton />}>
                      <TracePanel
                        trace={trace}
                        isLoading={isLoading}
                        translations={t.tracePanel as TracePanelTranslations}
                      />
                    </Suspense>
                  )}
                  {activeTab === "cost" && (
                    <Suspense fallback={<PanelSkeleton />}>
                      <CostPanel
                        cost={cost}
                        isLoading={isLoading}
                        translations={t.costPanel as CostPanelTranslations}
                      />
                    </Suspense>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Live Console - Mobile */}
          <div className="md:hidden bg-[var(--ink-50)] rounded-2xl p-4 border border-[var(--ink-200)]">
            {/* Mobile Tabs */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto" role="tablist" aria-label="Mobile demo console tabs">
              <button
                onClick={() => {
                  setMobileConsoleTab("request");
                  analytics.featureUsed("extreme_home_mobile_tab_changed", { tab: "request" });
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  mobileConsoleTab === "request"
                    ? "bg-[var(--ink-50)] text-[var(--ink-900)] shadow-sm"
                    : "text-[var(--ink-600)]"
                }`}
              >
                {(t.requestBuilder as RequestBuilderTranslations)?.title || "Request"}
              </button>
              <button
                onClick={() => {
                  setMobileConsoleTab("results");
                  analytics.featureUsed("extreme_home_mobile_tab_changed", { tab: "results" });
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  mobileConsoleTab === "results"
                    ? "bg-[var(--ink-50)] text-[var(--ink-900)] shadow-sm"
                    : "text-[var(--ink-600)]"
                }`}
              >
                {t.tabs?.results || "Results"}
              </button>
              <button
                onClick={() => {
                  setMobileConsoleTab("trace");
                  analytics.featureUsed("extreme_home_mobile_tab_changed", { tab: "trace" });
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  mobileConsoleTab === "trace"
                    ? "bg-[var(--ink-50)] text-[var(--ink-900)] shadow-sm"
                    : "text-[var(--ink-600)]"
                }`}
              >
                {t.tabs?.trace || "Trace"}
              </button>
              <button
                onClick={() => {
                  setMobileConsoleTab("cost");
                  analytics.featureUsed("extreme_home_mobile_tab_changed", { tab: "cost" });
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  mobileConsoleTab === "cost"
                    ? "bg-[var(--ink-50)] text-[var(--ink-900)] shadow-sm"
                    : "text-[var(--ink-600)]"
                }`}
              >
                {t.tabs?.cost || "Cost"}
              </button>
            </div>

            <div className="bg-[var(--ink-0)] rounded-xl p-4 border border-[var(--ink-200)] min-h-[400px]">
              {mobileConsoleTab === "request" && (
                <RequestBuilder
                  config={config}
                  onConfigChange={setConfig}
                  onRun={handleRun}
                  isLoading={isLoading}
                  compact
                  translations={t.requestBuilder as RequestBuilderTranslations}
                />
              )}
              {mobileConsoleTab === "results" && (
                <Suspense fallback={<PanelSkeleton />}>
                  <ResultsPanel
                    results={results}
                    isLoading={isLoading}
                    showRerankDelta={config.rerank}
                    translations={t.resultsPanel as ResultsPanelTranslations}
                  />
                </Suspense>
              )}
              {mobileConsoleTab === "trace" && (
                <Suspense fallback={<PanelSkeleton />}>
                  <TracePanel
                    trace={trace}
                    isLoading={isLoading}
                    translations={t.tracePanel as TracePanelTranslations}
                  />
                </Suspense>
              )}
              {mobileConsoleTab === "cost" && (
                <Suspense fallback={<PanelSkeleton />}>
                  <CostPanel
                    cost={cost}
                    isLoading={isLoading}
                    translations={t.costPanel as CostPanelTranslations}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Copy Snippet Section - Lazy loaded */}
      <section className="py-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto szn-card rounded-2xl p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--ink-50)] mb-3">
              <svg className="w-5 h-5 text-[var(--ink-600)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[var(--ink-900)] mb-2">{t.copySnippetTitle || "Copy this snippet"}</h2>
            <p className="text-sm text-[var(--ink-600)]">
              {t.copySnippetSubtitle || "Generated from your exact settings above"}
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
      </main>

      {/* Share Trace Toast Notification */}
      {shareToastVisible && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-[var(--ink-900)] text-white rounded-xl shadow-lg flex items-center gap-3 animate-fade-in-up">
          <svg className="w-5 h-5 text-[var(--ink-900)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm">Trace link copied to clipboard!</span>
        </div>
      )}

    </>
  );
}
