"use client";

import { useState, useCallback, memo } from "react";
import Link from "next/link";
import type { Dictionary } from "@/i18n/get-dictionary";


// =============================================================================
// Types
// =============================================================================

interface SearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
  rerankScore?: number;
  metadata: {
    source: string;
    section: string;
    tags: string[];
  };
}

interface TraceStep {
  name: string;
  stage: "embed" | "search" | "rerank" | "generate" | "validate";
  startMs: number;
  endMs: number;
  model?: string;
  inputSize?: number;
  outputSize?: number;
  cached?: boolean;
  cost?: number;
  details?: Record<string, unknown>;
}

interface TraceSummary {
  totalLatencyMs: number;
  totalCost: number;
  tokensUsed: number;
  vectorOps: number;
  steps: TraceStep[];
}

interface CostBreakdown {
  embedding: number;
  vectorSearch: number;
  rerank: number;
  answerContract: number;
  total: number;
  tokensIn: number;
  tokensOut: number;
  queryUnits: number;
}

interface DemoConfig {
  query: string;
  topK: number;
  hybridSearch: boolean;
  rerank: boolean;
  answerContract: boolean;
  budgetMs: number;
}

interface DemoSearchResponse {
  traceId: string;
  results: SearchResult[];
  trace: TraceSummary;
  cost: CostBreakdown;
  cached: boolean;
}

interface DemoQueryTranslations {
  title?: string;
  subtitle?: string;
  tryItNow?: string;
  queryPlaceholder?: string;
  runDemo?: string;
  running?: string;
  results?: string;
  trace?: string;
  cost?: string;
  noResults?: string;
  errorTitle?: string;
  rateLimitError?: string;
  retryIn?: string;
  seconds?: string;
  score?: string;
  rerankScore?: string;
  latency?: string;
  tokens?: string;
  cached?: string;
  model?: string;
  input?: string;
  output?: string;
  costBreakdown?: string;
  total?: string;
  embedding?: string;
  vectorSearch?: string;
  rerank?: string;
  answerContract?: string;
  tokensIn?: string;
  tokensOut?: string;
  queryUnits?: string;
  prefilledQueries?: string[];
}

interface DemoQueryProps {
  translations?: DemoQueryTranslations;
  dict?: Dictionary;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: DemoConfig = {
  query: "How do I implement secure authentication?",
  topK: 5,
  hybridSearch: true,
  rerank: true,
  answerContract: false,
  budgetMs: 500,
};

const SAMPLE_QUERIES = [
  "How do I implement secure authentication?",
  "What is hybrid search and how does it work?",
  "Explain rate limiting strategies",
  "How to optimize vector search performance?",
  "Configure autopilot for retrieval",
];

// =============================================================================
// Loading Skeleton
// =============================================================================

function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-szn-surface rounded w-3/4"></div>
      <div className="h-4 bg-szn-surface rounded w-1/2"></div>
      <div className="h-20 bg-szn-surface rounded"></div>
      <div className="h-20 bg-szn-surface rounded"></div>
    </div>
  );
}

// =============================================================================
// Stage Colors for Trace
// =============================================================================

const STAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  embed: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  search: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  rerank: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  generate: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  validate: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
};

// =============================================================================
// Results Panel Component
// =============================================================================

const ResultsPanel = memo(function ResultsPanel({
  results,
  isLoading,
  showRerankDelta,
  t,
}: {
  results: SearchResult[];
  isLoading: boolean;
  showRerankDelta: boolean;
  t: DemoQueryTranslations;
}) {
  if (isLoading) {
    return <PanelSkeleton />;
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-szn-text-3">
        <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className="text-sm">{t.noResults || "Run the demo to see results"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 h-full overflow-auto max-h-[400px]">
      {results.map((result, index) => (
        <div
          key={result.id}
          className="p-4 bg-szn-card border border-szn-border rounded-xl hover:border-szn-border transition-colors"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-szn-text-3 bg-szn-surface px-2 py-1 rounded">
                #{index + 1}
              </span>
              <h4 className="font-medium text-szn-text-1 text-sm">{result.title}</h4>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-szn-text-2">
                {t.score || "Score"}: {result.score.toFixed(2)}
              </span>
              {showRerankDelta && result.rerankScore && (
                <span className="text-xs text-szn-accent bg-szn-accent/10 px-2 py-0.5 rounded">
                  {t.rerankScore || "Rerank"}: {result.rerankScore.toFixed(2)}
                </span>
              )}
            </div>
          </div>
          <p className="text-sm text-szn-text-2 line-clamp-2">{result.content}</p>
          <div className="mt-2 flex items-center gap-2">
            {result.metadata.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs text-szn-text-3 bg-szn-bg px-2 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

// =============================================================================
// Trace Panel Component
// =============================================================================

const TracePanel = memo(function TracePanel({
  trace,
  isLoading,
  t,
}: {
  trace: TraceSummary | null;
  isLoading: boolean;
  t: DemoQueryTranslations;
}) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  if (isLoading) {
    return <PanelSkeleton />;
  }

  if (!trace) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-szn-text-3">
        <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-sm">{t.noResults || "Run the demo to see trace"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full overflow-auto max-h-[400px]">
      {/* Summary Bar */}
      <div className="flex items-center justify-between p-3 bg-szn-bg rounded-xl text-sm">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-szn-text-2">{t.latency || "Latency"}:</span>{" "}
            <span className="font-semibold text-szn-text-1">{trace.totalLatencyMs.toFixed(0)}ms</span>
          </div>
          <div className="w-px h-6 bg-szn-border" />
          <div>
            <span className="text-szn-text-2">{t.cost || "Cost"}:</span>{" "}
            <span className="font-semibold text-szn-text-1">${trace.totalCost.toFixed(4)}</span>
          </div>
          <div className="w-px h-6 bg-szn-border" />
          <div>
            <span className="text-szn-text-2">{t.tokens || "Tokens"}:</span>{" "}
            <span className="font-semibold text-szn-text-1">{trace.tokensUsed.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-szn-border" />
        <div className="space-y-2">
          {trace.steps.map((step, index) => {
            const colors = STAGE_COLORS[step.stage] || STAGE_COLORS.search;
            const duration = step.endMs - step.startMs;
            const isExpanded = expandedStep === index;

            return (
              <div key={index} className="relative pl-8">
                <div className={`absolute left-1 top-3 w-3 h-3 rounded-full border-2 ${colors.border} ${colors.bg}`} />
                <button
                  onClick={() => setExpandedStep(isExpanded ? null : index)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    isExpanded ? `${colors.bg} ${colors.border}` : "bg-szn-card border-szn-border hover:border-szn-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                        {step.stage}
                      </span>
                      <span className="font-medium text-szn-text-1 text-sm">{step.name}</span>
                      {step.cached && (
                        <span className="text-xs bg-szn-accent/10 text-szn-accent px-2 py-0.5 rounded-full">
                          {t.cached || "cached"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-szn-text-2">{duration.toFixed(0)}ms</span>
                      {step.cost !== undefined && step.cost > 0 && (
                        <span className="text-xs text-szn-text-3">${step.cost.toFixed(5)}</span>
                      )}
                    </div>
                  </div>
                  {step.model && (
                    <div className="mt-1 text-xs text-szn-text-2">
                      {t.model || "Model"}: {step.model}
                    </div>
                  )}
                  {isExpanded && step.details && (
                    <pre className="mt-2 text-xs text-szn-text-2 bg-szn-bg p-2 rounded overflow-auto max-h-24">
                      {JSON.stringify(step.details, null, 2)}
                    </pre>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// Cost Panel Component
// =============================================================================

const CostPanel = memo(function CostPanel({
  cost,
  isLoading,
  t,
}: {
  cost: CostBreakdown | null;
  isLoading: boolean;
  t: DemoQueryTranslations;
}) {
  if (isLoading) {
    return <PanelSkeleton />;
  }

  if (!cost) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-szn-text-3">
        <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm">{t.noResults || "Run the demo to see cost"}</p>
      </div>
    );
  }

  const costItems = [
    { label: t.embedding || "Embedding", value: cost.embedding, color: "bg-blue-500" },
    { label: t.vectorSearch || "Vector Search", value: cost.vectorSearch, color: "bg-purple-500" },
    { label: t.rerank || "Rerank", value: cost.rerank, color: "bg-amber-500" },
    { label: t.answerContract || "Answer Contract", value: cost.answerContract, color: "bg-rose-500" },
  ].filter((item) => item.value > 0);

  return (
    <div className="space-y-4 h-full overflow-auto max-h-[400px]">
      {/* Total Cost */}
      <div className="p-4 bg-gradient-to-br from-szn-accent/10 to-szn-accent-2/10 rounded-xl border border-szn-accent/20">
        <div className="text-sm text-szn-accent">{t.total || "Total Cost"}</div>
        <div className="text-3xl font-bold text-szn-accent">${cost.total.toFixed(6)}</div>
        <div className="text-xs text-szn-accent/70 mt-1">Per query</div>
      </div>

      {/* Breakdown */}
      {costItems.length > 0 && (
        <div className="bg-szn-card rounded-xl border border-szn-border p-3">
          <h3 className="text-sm font-medium text-szn-text-1 mb-3">{t.costBreakdown || "Breakdown"}</h3>
          <div className="space-y-2">
            {costItems.map((item, index) => {
              const percentage = cost.total > 0 ? (item.value / cost.total) * 100 : 0;
              return (
                <div key={index}>
                  <div className="flex items-center justify-between mb-1 text-sm">
                    <span className="text-szn-text-2">{item.label}</span>
                    <span className="font-medium text-szn-text-1">${item.value.toFixed(6)}</span>
                  </div>
                  <div className="h-1.5 bg-szn-surface rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full`} style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Usage Stats */}
      <div className="bg-szn-card rounded-xl border border-szn-border p-3">
        <h3 className="text-sm font-medium text-szn-text-1 mb-3">Usage</h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 bg-szn-bg rounded-lg">
            <div className="text-lg font-semibold text-szn-text-1">{cost.tokensIn.toLocaleString()}</div>
            <div className="text-xs text-szn-text-2">{t.tokensIn || "Tokens In"}</div>
          </div>
          <div className="text-center p-2 bg-szn-bg rounded-lg">
            <div className="text-lg font-semibold text-szn-text-1">{cost.tokensOut.toLocaleString()}</div>
            <div className="text-xs text-szn-text-2">{t.tokensOut || "Tokens Out"}</div>
          </div>
          <div className="text-center p-2 bg-szn-bg rounded-lg">
            <div className="text-lg font-semibold text-szn-text-1">{cost.queryUnits.toFixed(1)}</div>
            <div className="text-xs text-szn-text-2">{t.queryUnits || "Query Units"}</div>
          </div>
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// Main DemoQuery Component
// =============================================================================

export function DemoQuery({ translations, dict }: DemoQueryProps) {
  const t = translations || (dict?.demoQuery as DemoQueryTranslations) || {};

  const [config, setConfig] = useState<DemoConfig>(DEFAULT_CONFIG);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [trace, setTrace] = useState<TraceSummary | null>(null);
  const [cost, setCost] = useState<CostBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; retryAfter?: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"results" | "trace" | "cost">("results");
  const [hasRun, setHasRun] = useState(false);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [showSamples, setShowSamples] = useState(false);

  const handleRun = useCallback(async () => {
    if (!config.query.trim()) return;

    setIsLoading(true);
    setError(null);
    setHasRun(true);

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
          message: t.rateLimitError || "Rate limit exceeded. Please wait.",
          retryAfter: data.retryAfter || 60,
        });
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        setError({ message: data.message || "An error occurred" });
        return;
      }

      const data: DemoSearchResponse = await response.json();
      setResults(data.results);
      setTrace(data.trace);
      setCost(data.cost);
      setTraceId(data.traceId);
      setActiveTab("results");
    } catch {
      setError({ message: "Network error. Please try again." });
    } finally {

      setIsLoading(false);
    }
  }, [config, t.rateLimitError]);

  const selectSampleQuery = useCallback((query: string) => {
    setConfig((prev) => ({ ...prev, query }));
    setShowSamples(false);
  }, []);

  return (
    <section id="live-demo" className="py-16 px-4 sm:px-6 bg-gradient-to-b from-szn-bg to-szn-card">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-szn-accent/10 text-szn-accent rounded-full text-sm font-medium mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {t.tryItNow || "Try it now - No signup required"}
          </div>
          <h2 className="text-3xl font-semibold text-szn-text-1 mb-3">
            {t.title || "Live Demo"}
          </h2>
          <p className="text-szn-text-2 max-w-xl mx-auto">
            {t.subtitle || "Experience Seizn's retrieval pipeline with full tracing and cost transparency."}
          </p>
        </div>

        {/* Demo Console */}
        <div className="bg-szn-card rounded-2xl border border-szn-border shadow-sm overflow-hidden">
          <div className="grid md:grid-cols-2 gap-0 divide-x divide-szn-border">
            {/* Left: Query Input */}
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-szn-text-1 mb-2">
                  {t.queryPlaceholder || "Search Query"}
                </label>
                <div className="relative">
                  <textarea
                    value={config.query}
                    onChange={(e) => setConfig((prev) => ({ ...prev, query: e.target.value }))}
                    placeholder="Enter your search query..."
                    className="w-full px-4 py-3 border border-szn-border rounded-xl focus:outline-none focus:ring-2 focus:ring-szn-accent/20 focus:border-szn-accent resize-none text-szn-text-1"
                    rows={3}
                  />
                  <button
                    onClick={() => setShowSamples(!showSamples)}
                    className="absolute right-3 bottom-3 text-xs text-szn-text-3 hover:text-szn-text-2"
                  >
                    {t.prefilledQueries?.[0] || "Try examples"}
                  </button>
                </div>
                {showSamples && (
                  <div className="mt-2 p-3 bg-szn-bg rounded-lg space-y-1">
                    {SAMPLE_QUERIES.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => selectSampleQuery(q)}
                        className="block w-full text-left text-sm text-szn-text-2 hover:text-szn-text-1 hover:bg-szn-card px-3 py-2 rounded-lg transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Feature Toggles */}
              <div className="space-y-2 mb-6">
                <label className="flex items-center justify-between p-3 bg-szn-bg rounded-lg cursor-pointer hover:bg-szn-surface">
                  <span className="text-sm text-szn-text-1">Hybrid Search</span>
                  <input
                    type="checkbox"
                    checked={config.hybridSearch}
                    onChange={(e) => setConfig((prev) => ({ ...prev, hybridSearch: e.target.checked }))}
                    className="w-4 h-4 rounded border-szn-border text-szn-accent focus:ring-szn-accent"
                  />
                </label>
                <label className="flex items-center justify-between p-3 bg-szn-bg rounded-lg cursor-pointer hover:bg-szn-surface">
                  <span className="text-sm text-szn-text-1">Rerank</span>
                  <input
                    type="checkbox"
                    checked={config.rerank}
                    onChange={(e) => setConfig((prev) => ({ ...prev, rerank: e.target.checked }))}
                    className="w-4 h-4 rounded border-szn-border text-szn-accent focus:ring-szn-accent"
                  />
                </label>
                <label className="flex items-center justify-between p-3 bg-szn-bg rounded-lg cursor-pointer hover:bg-szn-surface">
                  <span className="text-sm text-szn-text-1">Answer Contract</span>
                  <input
                    type="checkbox"
                    checked={config.answerContract}
                    onChange={(e) => setConfig((prev) => ({ ...prev, answerContract: e.target.checked }))}
                    className="w-4 h-4 rounded border-szn-border text-szn-accent focus:ring-szn-accent"
                  />
                </label>
              </div>

              {/* Run Button */}
              <button
                onClick={handleRun}
                disabled={isLoading || !config.query.trim()}
                className="w-full py-3 bg-gradient-to-r from-szn-accent to-szn-accent-2 text-white font-medium rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t.running || "Running..."}
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {t.runDemo || "Run Demo"}
                  </>
                )}
              </button>

              {/* Error Display */}
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <div className="flex items-center gap-2 text-red-700">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-sm font-medium">{error.message}</span>
                  </div>
                  {error.retryAfter && (
                    <p className="text-xs text-red-600 mt-1">
                      {t.retryIn || "Retry in"} {error.retryAfter} {t.seconds || "seconds"}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Right: Results Panel */}
            <div className="p-6 bg-szn-bg/50">
              {/* Tabs */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setActiveTab("results")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === "results" ? "bg-szn-card text-szn-text-1 shadow-sm" : "text-szn-text-2 hover:text-szn-text-1"
                  }`}
                >
                  {t.results || "Results"}
                  {results.length > 0 && (
                    <span className="ml-2 text-xs bg-szn-surface text-szn-text-2 px-1.5 py-0.5 rounded-full">
                      {results.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("trace")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === "trace" ? "bg-szn-card text-szn-text-1 shadow-sm" : "text-szn-text-2 hover:text-szn-text-1"
                  }`}
                >
                  {t.trace || "Trace"}
                  {trace && (
                    <span className="ml-2 text-xs bg-szn-accent/10 text-szn-accent px-1.5 py-0.5 rounded-full">
                      {trace.totalLatencyMs.toFixed(0)}ms
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("cost")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === "cost" ? "bg-szn-card text-szn-text-1 shadow-sm" : "text-szn-text-2 hover:text-szn-text-1"
                  }`}
                >
                  {t.cost || "Cost"}
                  {cost && (
                    <span className="ml-2 text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">
                      ${cost.total.toFixed(4)}
                    </span>
                  )}
                </button>
              </div>

              {/* Tab Content */}
              <div className="min-h-[300px]">
                {activeTab === "results" && (
                  <ResultsPanel results={results} isLoading={isLoading} showRerankDelta={config.rerank} t={t} />
                )}
                {activeTab === "trace" && <TracePanel trace={trace} isLoading={isLoading} t={t} />}
                {activeTab === "cost" && <CostPanel cost={cost} isLoading={isLoading} t={t} />}
              </div>

              {/* Trace ID */}
              {traceId && hasRun && !isLoading && (
                <div className="mt-4 pt-4 border-t border-szn-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-szn-text-3">Trace ID: {traceId}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(traceId)}
                      className="text-xs text-szn-text-2 hover:text-szn-text-1"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CTA Below Demo */}
        <div className="mt-8 text-center">
          <p className="text-sm text-szn-text-2 mb-4">
            Ready to integrate? Get your API key in seconds.
          </p>
          <Link
            href="/dashboard/keys"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-medium rounded-full hover:bg-gray-800 transition-colors"
          >
            Get Free API Key
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>

        </div>
      </div>
    </section>
  );
}

export default DemoQuery;
