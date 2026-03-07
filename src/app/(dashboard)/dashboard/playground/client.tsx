"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ttfsEvents } from "@/lib/analytics";
import { markOnboardingStepComplete } from "@/lib/onboarding/progress";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { PlaygroundTutorial } from "@/components/dashboard/PlaygroundTutorial";

interface TraceStep {
  name: string;
  latencyMs: number;
  status: "pending" | "running" | "completed" | "error";
  details?: Record<string, unknown>;
}

interface QueryResult {
  id: string;
  content: string;
  similarity: number;
  memory_type?: string;
  rerank_score?: number;
}

interface QueryResponse {
  success: boolean;
  results: QueryResult[];
  trace: {
    latency_ms: number;
    mode: string;
    embedding_model?: string;
    estimated_cost?: string;
  };
  steps?: TraceStep[];
}

export function PlaygroundClient() {
  const { t } = useDashboardTranslation();
  const [query, setQuery] = useState("");
  const [namespace, setNamespace] = useState("default");
  const [topK, setTopK] = useState(5);
  const [threshold, setThreshold] = useState(0.7);
  const [mode, setMode] = useState<"vector" | "hybrid" | "keyword">("vector");
  const [enableRerank, setEnableRerank] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<QueryResult[]>([]);
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [totalLatency, setTotalLatency] = useState(0);
  const [totalCost, setTotalCost] = useState("$0.00000");
  const [activeTab, setActiveTab] = useState<"results" | "trace" | "cost">("results");
  const hasTrackedTraceViewRef = useRef(false);

  const handleTryExample = useCallback((exampleQuery: string) => {
    setQuery(exampleQuery);
    // Auto-run after a brief delay to show the query was filled
    setTimeout(() => {
      const runButton = document.querySelector('[data-action="run-query"]') as HTMLButtonElement;
      if (runButton && !runButton.disabled) {
        runButton.click();
      }
    }, 300);
  }, []);

  const runQuery = useCallback(async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResults([]);

    // Initialize trace steps
    const steps: TraceStep[] = [
      { name: t("dashboard.playground.steps.parseInput"), latencyMs: 0, status: "pending" },
      { name: t("dashboard.playground.steps.createEmbedding"), latencyMs: 0, status: "pending" },
      { name: t("dashboard.playground.steps.vectorSearch"), latencyMs: 0, status: "pending" },
    ];
    if (mode === "hybrid") {
      steps.push({ name: t("dashboard.playground.steps.keywordSearch"), latencyMs: 0, status: "pending" });
      steps.push({ name: t("dashboard.playground.steps.mergeResults"), latencyMs: 0, status: "pending" });
    }
    if (enableRerank) {
      steps.push({ name: t("dashboard.playground.steps.rerank"), latencyMs: 0, status: "pending" });
    }
    steps.push({ name: t("dashboard.playground.steps.returnResults"), latencyMs: 0, status: "pending" });

    setTraceSteps(steps);

    // Simulate step-by-step execution for visualization
    const startTime = Date.now();
    let currentStep = 0;

    const updateStep = (status: "running" | "completed" | "error", latencyMs?: number) => {
      setTraceSteps(prev => prev.map((step, i) =>
        i === currentStep
          ? { ...step, status, latencyMs: latencyMs || step.latencyMs }
          : step
      ));
    };

    try {
      // Step 1: Parse input
      updateStep("running");
      await new Promise(r => setTimeout(r, 50));
      updateStep("completed", 12);
      currentStep++;

      // Step 2: Create embedding
      updateStep("running");
      ttfsEvents.firstRequestSent("/api/playground/query");

      // Call actual API
      const res = await fetch("/api/playground/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          namespace,
          topK,
          threshold,
          mode,
          rerank: enableRerank,
        }),
      });

      const data: QueryResponse = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.trace?.mode || "Query failed");
      }

      // Complete remaining steps with simulated timing
      const totalTime = data.trace?.latency_ms || Date.now() - startTime;
      const stepTimes = distributeTime(totalTime, steps.length - 1);

      for (let i = 1; i < steps.length; i++) {
        currentStep = i;
        updateStep("completed", stepTimes[i - 1]);
      }

      setResults(data.results || []);
      setTotalLatency(totalTime);
      setTotalCost(data.trace?.estimated_cost || "$0.00000");
      ttfsEvents.firstSuccessResponse("/api/playground/query", totalTime);

      // Mark first query as complete for onboarding
      markOnboardingStepComplete("first_query");
      hasTrackedTraceViewRef.current = false;

    } catch (err) {
      updateStep("error");
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setIsLoading(false);
    }
  }, [query, namespace, topK, threshold, mode, enableRerank, t]);

  useEffect(() => {
    const hasTrace = totalLatency > 0 && traceSteps.length > 0;
    if (activeTab !== "trace" || !hasTrace || hasTrackedTraceViewRef.current) {
      return;
    }

    hasTrackedTraceViewRef.current = true;
    markOnboardingStepComplete("view_trace");
    ttfsEvents.traceViewOpened("playground-trace");
  }, [activeTab, totalLatency, traceSteps]);

  return (
    <div className="space-y-6">
      {/* Playground Tutorial */}
      <PlaygroundTutorial onTryExample={handleTryExample} />

      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold text-szn-text-1 mb-2">
          {t("dashboard.playground.title")}
        </h1>
        <p className="text-szn-text-2">
          {t("dashboard.playground.subtitle")}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Query Builder */}
        <div className="szn-card border border-szn-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-szn-text-1 mb-4">
            {t("dashboard.playground.queryBuilder")}
          </h2>

          {/* Query Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-szn-text-1 mb-1">
              {t("dashboard.playground.query")}
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("dashboard.playground.queryPlaceholder")}
              data-testid="playground-query-input"
              className="w-full h-24 px-4 py-3 rounded-xl border border-szn-border focus:outline-none focus:ring-2 focus:ring-szn-accent resize-none"
            />
          </div>

          {/* Namespace */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-szn-text-1 mb-1">
              {t("dashboard.playground.namespace")}
            </label>
            <input
              type="text"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder="default"
              className="w-full px-4 py-2 rounded-xl border border-szn-border focus:outline-none focus:ring-2 focus:ring-szn-accent"
            />
          </div>

          {/* Settings Row */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Top K */}
            <div>
              <label className="block text-sm font-medium text-szn-text-1 mb-1">
                Top K
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={topK}
                onChange={(e) => setTopK(Math.max(1, Math.min(100, parseInt(e.target.value) || 5)))}
                className="w-full px-4 py-2 rounded-xl border border-szn-border focus:outline-none focus:ring-2 focus:ring-szn-accent"
              />
            </div>

            {/* Threshold */}
            <div>
              <label className="block text-sm font-medium text-szn-text-1 mb-1">
                {t("dashboard.playground.threshold")}
              </label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.7)))}
                className="w-full px-4 py-2 rounded-xl border border-szn-border focus:outline-none focus:ring-2 focus:ring-szn-accent"
              />
            </div>
          </div>

          {/* Search Mode */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-szn-text-1 mb-2">
              {t("dashboard.playground.searchMode")}
            </label>
            <div className="flex gap-2">
              {(["vector", "hybrid", "keyword"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mode === m
                      ? "bg-gradient-to-r from-szn-accent to-szn-accent-2 text-white"
                      : "bg-szn-surface text-szn-text-2 hover:bg-szn-surface-1"
                  }`}
                >
                  {t(`dashboard.playground.mode.${m}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Rerank Toggle */}
          <div className="mb-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enableRerank}
                onChange={(e) => setEnableRerank(e.target.checked)}
                className="w-5 h-5 rounded border-szn-border text-szn-accent focus:ring-szn-accent"
              />
              <div>
                <span className="text-sm font-medium text-szn-text-1">
                  {t("dashboard.playground.enableRerank")}
                </span>
                <p className="text-xs text-szn-text-2">
                  {t("dashboard.playground.rerankDesc")}
                </p>
              </div>
            </label>
          </div>

          {/* Run Button */}
          <button
            onClick={runQuery}
            disabled={isLoading || !query.trim()}
            data-action="run-query"
            data-testid="playground-run-query"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-szn-accent to-szn-accent-2 text-white font-semibold hover:from-szn-accent/90 hover:to-szn-accent-2/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <LoadingSpinner className="w-5 h-5" />
                {t("dashboard.playground.running")}
              </>
            ) : (
              <>
                <PlayIcon className="w-5 h-5" />
                {t("dashboard.playground.runQuery")}
              </>
            )}
          </button>
        </div>

        {/* Right Panel - Results & Trace */}
        <div className="szn-card border border-szn-border rounded-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-szn-border">
            {(["results", "trace", "cost"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                data-testid={`playground-tab-${tab}`}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-szn-card text-szn-text-1 border-b-2 border-szn-accent"
                    : "bg-szn-bg text-szn-text-2 hover:text-szn-text-1"
                }`}
              >
                {t(`dashboard.playground.tabs.${tab}`)}
                {tab === "results" && results.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-szn-accent/10 text-szn-accent rounded-full text-xs">
                    {results.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6 min-h-[400px]">
            {activeTab === "results" && (
              <ResultsPanel results={results} error={error} isLoading={isLoading} />
            )}
            {activeTab === "trace" && (
              <TracePanel steps={traceSteps} totalLatency={totalLatency} isLoading={isLoading} />
            )}
            {activeTab === "cost" && (
              <CostPanel
                totalCost={totalCost}
                mode={mode}
                rerank={enableRerank}
                topK={topK}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </div>

      {/* Rerank Comparison (if enabled and has results) */}
      {enableRerank && results.length > 0 && (
        <div className="szn-card border border-szn-border rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-szn-text-1 mb-4">
            {t("dashboard.playground.rerankComparison")}
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-szn-text-2 mb-2">
                {t("dashboard.playground.beforeRerank")}
              </h4>
              <div className="space-y-2">
                {results.slice(0, 5).map((r, i) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <span className="w-6 h-6 rounded-full bg-szn-surface flex items-center justify-center text-szn-text-2">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate text-szn-text-1">{r.content}</span>
                    <span className="text-szn-text-3">{(r.similarity * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-szn-text-2 mb-2">
                {t("dashboard.playground.afterRerank")}
              </h4>
              <div className="space-y-2">
                {[...results]
                  .sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0))
                  .slice(0, 5)
                  .map((r, i) => (
                    <div key={r.id} className="flex items-center gap-2 text-sm">
                      <span className="w-6 h-6 rounded-full bg-szn-accent/10 flex items-center justify-center text-szn-accent">
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate text-szn-text-1">{r.content}</span>
                      <span className="text-szn-accent">{((r.rerank_score || r.similarity) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsPanel({
  results,
  error,
  isLoading
}: {
  results: QueryResult[];
  error: string | null;
  isLoading: boolean;
}) {
  const { t } = useDashboardTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-szn-text-2">
        <LoadingSpinner className="w-8 h-8 mr-3" />
        {t("dashboard.playground.searching")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-szn-danger">
        <ErrorIcon className="w-12 h-12 mb-3" />
        <p className="font-medium">{t("dashboard.playground.error")}</p>
        <p className="text-sm text-szn-text-2 mt-1">{error}</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-szn-text-3">
        <SearchIcon className="w-12 h-12 mb-3" />
        <p>{t("dashboard.playground.noResults")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="playground-results-panel">
      {results.map((result, index) => (
        <div
          key={result.id}
          data-testid="playground-result-item"
          className="p-4 rounded-xl bg-szn-bg border border-szn-border hover:border-szn-accent/30 transition-colors"
        >
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-r from-szn-accent to-szn-accent-2 flex items-center justify-center text-white text-sm font-medium">
              {index + 1}
            </span>
            <div className="flex-1">
              <p className="text-szn-text-1">{result.content}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-szn-text-2">
                <span className="flex items-center gap-1">
                  <ScoreIcon className="w-3 h-3" />
                  {(result.similarity * 100).toFixed(1)}%
                </span>
                {result.memory_type && (
                  <span className="px-2 py-0.5 bg-szn-surface rounded-full">
                    {result.memory_type}
                  </span>
                )}
                {result.rerank_score !== undefined && (
                  <span className="flex items-center gap-1 text-szn-accent">
                    <RerankIcon className="w-3 h-3" />
                    {(result.rerank_score * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TracePanel({
  steps,
  totalLatency,
  isLoading
}: {
  steps: TraceStep[];
  totalLatency: number;
  isLoading: boolean;
}) {
  const { t } = useDashboardTranslation();

  if (steps.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-szn-text-3">
        <TraceIcon className="w-12 h-12 mb-3" />
        <p>{t("dashboard.playground.noTrace")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Total Latency */}
      {totalLatency > 0 && (
        <div
          data-testid="playground-trace-latency"
          className="flex items-center justify-between p-3 rounded-lg bg-szn-accent/10 border border-szn-accent/20"
        >
          <span className="text-sm font-medium text-szn-accent">
            {t("dashboard.playground.totalLatency")}
          </span>
          <span className="text-lg font-bold text-szn-accent">
            {totalLatency}ms
          </span>
        </div>
      )}

      {/* Step Timeline */}
      <div className="relative">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-4 pb-4 last:pb-0">
            {/* Timeline Line */}
            <div className="relative flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step.status === "completed" ? "bg-szn-success/10" :
                step.status === "running" ? "bg-szn-accent/10 animate-pulse" :
                step.status === "error" ? "bg-szn-danger/10" :
                "bg-szn-surface"
              }`}>
                {step.status === "completed" && <CheckIcon className="w-4 h-4 text-szn-success" />}
                {step.status === "running" && <LoadingSpinner className="w-4 h-4 text-szn-accent" />}
                {step.status === "error" && <ErrorIcon className="w-4 h-4 text-szn-danger" />}
                {step.status === "pending" && <span className="w-2 h-2 rounded-full bg-szn-text-3" />}
              </div>
              {index < steps.length - 1 && (
                <div className={`w-0.5 h-8 ${
                  step.status === "completed" ? "bg-szn-success/30" : "bg-szn-border"
                }`} />
              )}
            </div>

            {/* Step Content */}
            <div className="flex-1 pt-1">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${
                  step.status === "completed" ? "text-szn-text-1" :
                  step.status === "running" ? "text-szn-accent" :
                  step.status === "error" ? "text-szn-danger" :
                  "text-szn-text-3"
                }`}>
                  {step.name}
                </span>
                {step.status === "completed" && (
                  <span className="text-xs text-szn-text-2">
                    {step.latencyMs}ms
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CostPanel({
  totalCost,
  mode,
  rerank,
  topK,
  isLoading
}: {
  totalCost: string;
  mode: string;
  rerank: boolean;
  topK: number;
  isLoading: boolean;
}) {
  const { t } = useDashboardTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-szn-text-2">
        <LoadingSpinner className="w-8 h-8 mr-3" />
        {t("dashboard.playground.calculating")}
      </div>
    );
  }

  if (totalCost === "$0.00000") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-szn-text-3">
        <CostIcon className="w-12 h-12 mb-3" />
        <p>{t("dashboard.playground.noCost")}</p>
      </div>
    );
  }

  // Estimate cost breakdown
  const embeddingCost = 0.00002;
  const searchCost = 0.00001 * topK;
  const rerankCost = rerank ? 0.00005 * topK : 0;
  const estimatedTotal = embeddingCost + searchCost + rerankCost;

  return (
    <div className="space-y-6">
      {/* Total Cost */}
      <div className="text-center py-6 rounded-xl bg-szn-accent/10 border border-szn-accent/20">
        <p className="text-sm text-szn-text-2 mb-1">{t("dashboard.playground.totalCost")}</p>
        <p className="text-3xl font-bold bg-gradient-to-r from-szn-accent to-szn-accent-2 bg-clip-text text-transparent">
          {totalCost}
        </p>
      </div>

      {/* Cost Breakdown */}
      <div>
        <h4 className="text-sm font-medium text-szn-text-1 mb-3">
          {t("dashboard.playground.costBreakdown")}
        </h4>
        <div className="space-y-2">
          <CostRow
            label={t("dashboard.playground.embedding")}
            cost={embeddingCost}
            model="text-embedding-3-small"
          />
          <CostRow
            label={t("dashboard.playground.vectorSearch")}
            cost={searchCost}
            note={`${topK} ${t("dashboard.playground.results")}`}
          />
          {mode === "hybrid" && (
            <CostRow
              label={t("dashboard.playground.keywordSearch")}
              cost={0.00001}
            />
          )}
          {rerank && (
            <CostRow
              label={t("dashboard.playground.rerank")}
              cost={rerankCost}
              model="cross-encoder"
            />
          )}
          <div className="pt-2 mt-2 border-t border-szn-border">
            <CostRow
              label={t("dashboard.playground.total")}
              cost={estimatedTotal}
              isBold
            />
          </div>
        </div>
      </div>

      {/* Monthly Estimate */}
      <div className="p-4 rounded-xl bg-szn-bg border border-szn-border">
        <p className="text-sm text-szn-text-2 mb-1">{t("dashboard.playground.monthlyEstimate")}</p>
        <p className="text-lg font-semibold text-szn-text-1">
          ${(estimatedTotal * 1000 * 30).toFixed(2)}
          <span className="text-sm font-normal text-szn-text-2 ml-2">
            @ 1000 {t("dashboard.playground.queriesDay")}
          </span>
        </p>
      </div>
    </div>
  );
}

function CostRow({
  label,
  cost,
  model,
  note,
  isBold
}: {
  label: string;
  cost: number;
  model?: string;
  note?: string;
  isBold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span className={isBold ? "font-semibold text-szn-text-1" : "text-szn-text-2"}>
          {label}
        </span>
        {model && <span className="text-xs text-szn-text-3">({model})</span>}
        {note && <span className="text-xs text-szn-text-3">({note})</span>}
      </div>
      <span className={isBold ? "font-semibold text-szn-text-1" : "text-szn-text-1"}>
        ${cost.toFixed(5)}
      </span>
    </div>
  );
}

function distributeTime(total: number, steps: number): number[] {
  const weights = [0.05, 0.3, 0.4, 0.15, 0.05, 0.03, 0.02];
  return weights.slice(0, steps).map(w => Math.round(total * w));
}

// Icons
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ScoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function RerankIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function TraceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  );
}

function CostIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
