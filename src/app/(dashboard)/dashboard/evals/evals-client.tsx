"use client";

import { useState, useEffect, useCallback } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

// ============================================
// Types
// ============================================

interface EvalRun {
  id: string;
  name: string;
  dataset_id: string;
  dataset_name: string;
  config_a: EvalConfig;
  config_b?: EvalConfig;
  status: "pending" | "running" | "completed" | "failed";
  metrics?: EvalMetrics;
  created_at: string;
  completed_at?: string;
}

interface EvalConfig {
  label: string;
  search_type: "semantic" | "keyword" | "hybrid";
  embedding_model: string;
  top_k: number;
  rerank_enabled: boolean;
  rerank_model?: string;
  hybrid_alpha?: number;
}

interface EvalMetrics {
  config_a: MetricSet;
  config_b?: MetricSet;
  winner?: "A" | "B" | "tie";
  confidence?: number;
}

interface MetricSet {
  precision: number;
  recall: number;
  f1: number;
  ndcg: number;
  mrr: number;
  avg_latency_ms: number;
  avg_cost_usd: number;
}

// ============================================
// Mock Data
// ============================================

const MOCK_EVAL_RUNS: EvalRun[] = [
  {
    id: "eval-001",
    name: "Hybrid vs Semantic Search",
    dataset_id: "ds-001",
    dataset_name: "Product QA Dataset",
    config_a: {
      label: "Hybrid (0.7)",
      search_type: "hybrid",
      embedding_model: "text-embedding-3-small",
      top_k: 10,
      rerank_enabled: true,
      rerank_model: "cohere-rerank-v3",
      hybrid_alpha: 0.7,
    },
    config_b: {
      label: "Semantic Only",
      search_type: "semantic",
      embedding_model: "text-embedding-3-small",
      top_k: 10,
      rerank_enabled: true,
      rerank_model: "cohere-rerank-v3",
    },
    status: "completed",
    metrics: {
      config_a: {
        precision: 0.85,
        recall: 0.78,
        f1: 0.81,
        ndcg: 0.89,
        mrr: 0.92,
        avg_latency_ms: 245,
        avg_cost_usd: 0.0012,
      },
      config_b: {
        precision: 0.82,
        recall: 0.75,
        f1: 0.78,
        ndcg: 0.85,
        mrr: 0.88,
        avg_latency_ms: 198,
        avg_cost_usd: 0.001,
      },
      winner: "A",
      confidence: 0.94,
    },
    created_at: "2026-01-14T08:00:00Z",
    completed_at: "2026-01-14T08:15:00Z",
  },
  {
    id: "eval-002",
    name: "Rerank Model Comparison",
    dataset_id: "ds-002",
    dataset_name: "Support Tickets",
    config_a: {
      label: "Cohere Rerank v3",
      search_type: "hybrid",
      embedding_model: "text-embedding-3-small",
      top_k: 20,
      rerank_enabled: true,
      rerank_model: "cohere-rerank-v3",
      hybrid_alpha: 0.6,
    },
    config_b: {
      label: "No Rerank",
      search_type: "hybrid",
      embedding_model: "text-embedding-3-small",
      top_k: 10,
      rerank_enabled: false,
      hybrid_alpha: 0.6,
    },
    status: "completed",
    metrics: {
      config_a: {
        precision: 0.91,
        recall: 0.84,
        f1: 0.87,
        ndcg: 0.93,
        mrr: 0.95,
        avg_latency_ms: 312,
        avg_cost_usd: 0.0018,
      },
      config_b: {
        precision: 0.73,
        recall: 0.79,
        f1: 0.76,
        ndcg: 0.78,
        mrr: 0.81,
        avg_latency_ms: 156,
        avg_cost_usd: 0.0008,
      },
      winner: "A",
      confidence: 0.98,
    },
    created_at: "2026-01-13T15:00:00Z",
    completed_at: "2026-01-13T15:22:00Z",
  },
  {
    id: "eval-003",
    name: "Embedding Model Test",
    dataset_id: "ds-001",
    dataset_name: "Product QA Dataset",
    config_a: {
      label: "ada-002",
      search_type: "semantic",
      embedding_model: "text-embedding-ada-002",
      top_k: 10,
      rerank_enabled: false,
    },
    status: "running",
    created_at: "2026-01-14T10:00:00Z",
  },
];

// ============================================
// Icons
// ============================================

const ChartIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
);

const BeakerIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.772.129A12.007 12.007 0 0112 21a12.007 12.007 0 01-7.363-2.558l-.772-.129c-1.717-.293-2.299-2.379-1.067-3.611L5 14.5" />
  </svg>
);

const PlayIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
  </svg>
);

const CheckCircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const XCircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ArrowUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
  </svg>
);

const ArrowDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
  </svg>
);

// ============================================
// Component
// ============================================

export default function EvalsClient() {
  const { t } = useDashboardTranslation();
  const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<EvalRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate API fetch
    const timer = setTimeout(() => {
      setEvalRuns(MOCK_EVAL_RUNS);
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatLatency = (ms: number) => `${ms}ms`;
  const formatCost = (usd: number) => `$${(usd * 1000).toFixed(2)}m`;

  const getStatusBadge = (status: EvalRun["status"]) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">
            <CheckCircleIcon className="w-3 h-3" />
            Completed
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Running
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">
            <XCircleIcon className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
            <ClockIcon className="w-3 h-3" />
            Pending
          </span>
        );
    }
  };

  const MetricComparison = ({ label, valueA, valueB, format, higherIsBetter = true }: {
    label: string;
    valueA: number;
    valueB?: number;
    format: (v: number) => string;
    higherIsBetter?: boolean;
  }) => {
    const diff = valueB !== undefined ? valueA - valueB : 0;
    const isWinner = higherIsBetter ? diff > 0 : diff < 0;
    const showComparison = valueB !== undefined && diff !== 0;

    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
        <span className="text-sm text-gray-600">{label}</span>
        <div className="flex items-center gap-4">
          <span className={`text-sm font-medium ${showComparison && isWinner ? "text-green-600" : "text-gray-900"}`}>
            {format(valueA)}
          </span>
          {valueB !== undefined && (
            <>
              <span className="text-gray-400">vs</span>
              <span className={`text-sm font-medium ${showComparison && !isWinner ? "text-green-600" : "text-gray-900"}`}>
                {format(valueB)}
              </span>
              {showComparison && (
                <span className={`inline-flex items-center text-xs ${isWinner ? "text-green-500" : "text-red-500"}`}>
                  {isWinner ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
                  {formatPercent(Math.abs(diff))}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center">
              <BeakerIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t("dashboard.evals.title") || "Evaluations"}</h1>
              <p className="text-gray-500">{t("dashboard.evals.subtitle") || "A/B test and measure retrieval quality"}</p>
            </div>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl hover:opacity-90 transition-opacity">
            <PlayIcon className="w-4 h-4" />
            {t("dashboard.evals.newRun") || "New Eval Run"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Eval Runs List */}
        <div className="lg:col-span-1 glass-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{t("dashboard.evals.runs") || "Evaluation Runs"}</h2>
          </div>
          <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : evalRuns.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <BeakerIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p>{t("dashboard.evals.noRuns") || "No evaluation runs yet"}</p>
              </div>
            ) : (
              evalRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  className={`w-full p-4 text-left transition-colors ${
                    selectedRun?.id === run.id ? "bg-purple-50 border-l-2 border-purple-500" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-gray-900 line-clamp-1">{run.name}</h3>
                    {getStatusBadge(run.status)}
                  </div>
                  <p className="text-sm text-gray-500 mb-2">{run.dataset_name}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <ClockIcon className="w-3 h-3" />
                    {formatDate(run.created_at)}
                    {run.metrics?.winner && (
                      <span className="ml-auto px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                        Winner: {run.metrics.winner}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Eval Details */}
        <div className="lg:col-span-2">
          {selectedRun ? (
            <div className="space-y-6">
              {/* Run Info */}
              <div className="glass-card rounded-2xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selectedRun.name}</h2>
                    <p className="text-gray-500">{selectedRun.dataset_name}</p>
                  </div>
                  {getStatusBadge(selectedRun.status)}
                </div>

                {/* Config Comparison */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-purple-50 rounded-xl">
                    <h3 className="font-semibold text-purple-900 mb-2">Config A: {selectedRun.config_a.label}</h3>
                    <div className="space-y-1 text-sm text-purple-700">
                      <p>Search: {selectedRun.config_a.search_type}</p>
                      <p>Top K: {selectedRun.config_a.top_k}</p>
                      <p>Rerank: {selectedRun.config_a.rerank_enabled ? selectedRun.config_a.rerank_model : "Off"}</p>
                      {selectedRun.config_a.hybrid_alpha !== undefined && (
                        <p>Alpha: {selectedRun.config_a.hybrid_alpha}</p>
                      )}
                    </div>
                  </div>
                  {selectedRun.config_b && (
                    <div className="p-4 bg-blue-50 rounded-xl">
                      <h3 className="font-semibold text-blue-900 mb-2">Config B: {selectedRun.config_b.label}</h3>
                      <div className="space-y-1 text-sm text-blue-700">
                        <p>Search: {selectedRun.config_b.search_type}</p>
                        <p>Top K: {selectedRun.config_b.top_k}</p>
                        <p>Rerank: {selectedRun.config_b.rerank_enabled ? selectedRun.config_b.rerank_model : "Off"}</p>
                        {selectedRun.config_b.hybrid_alpha !== undefined && (
                          <p>Alpha: {selectedRun.config_b.hybrid_alpha}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Metrics */}
              {selectedRun.metrics && (
                <div className="glass-card rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ChartIcon className="w-5 h-5 text-purple-500" />
                    <h2 className="font-semibold text-gray-900">{t("dashboard.evals.metrics") || "Metrics"}</h2>
                    {selectedRun.metrics.winner && (
                      <span className="ml-auto text-sm text-gray-500">
                        Winner: <span className="font-bold text-green-600">{selectedRun.metrics.winner}</span>
                        {selectedRun.metrics.confidence && (
                          <span className="text-gray-400 ml-1">
                            ({formatPercent(selectedRun.metrics.confidence)} confidence)
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <MetricComparison
                      label="Precision"
                      valueA={selectedRun.metrics.config_a.precision}
                      valueB={selectedRun.metrics.config_b?.precision}
                      format={formatPercent}
                    />
                    <MetricComparison
                      label="Recall"
                      valueA={selectedRun.metrics.config_a.recall}
                      valueB={selectedRun.metrics.config_b?.recall}
                      format={formatPercent}
                    />
                    <MetricComparison
                      label="F1 Score"
                      valueA={selectedRun.metrics.config_a.f1}
                      valueB={selectedRun.metrics.config_b?.f1}
                      format={formatPercent}
                    />
                    <MetricComparison
                      label="NDCG"
                      valueA={selectedRun.metrics.config_a.ndcg}
                      valueB={selectedRun.metrics.config_b?.ndcg}
                      format={formatPercent}
                    />
                    <MetricComparison
                      label="MRR"
                      valueA={selectedRun.metrics.config_a.mrr}
                      valueB={selectedRun.metrics.config_b?.mrr}
                      format={formatPercent}
                    />
                    <MetricComparison
                      label="Avg Latency"
                      valueA={selectedRun.metrics.config_a.avg_latency_ms}
                      valueB={selectedRun.metrics.config_b?.avg_latency_ms}
                      format={formatLatency}
                      higherIsBetter={false}
                    />
                    <MetricComparison
                      label="Avg Cost"
                      valueA={selectedRun.metrics.config_a.avg_cost_usd}
                      valueB={selectedRun.metrics.config_b?.avg_cost_usd}
                      format={formatCost}
                      higherIsBetter={false}
                    />
                  </div>
                </div>
              )}

              {/* Visual Chart */}
              {selectedRun.metrics && (
                <div className="glass-card rounded-2xl p-6">
                  <h2 className="font-semibold text-gray-900 mb-4">{t("dashboard.evals.comparison") || "Visual Comparison"}</h2>
                  <div className="space-y-4">
                    {["precision", "recall", "f1", "ndcg", "mrr"].map((metric) => {
                      const valueA = selectedRun.metrics!.config_a[metric as keyof MetricSet] as number;
                      const valueB = selectedRun.metrics!.config_b?.[metric as keyof MetricSet] as number | undefined;
                      return (
                        <div key={metric}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="capitalize text-gray-600">{metric.toUpperCase()}</span>
                            <span className="text-gray-400">
                              {formatPercent(valueA)} {valueB !== undefined && `vs ${formatPercent(valueB)}`}
                            </span>
                          </div>
                          <div className="flex gap-2 h-4">
                            <div
                              className="h-full bg-purple-500 rounded-full transition-all"
                              style={{ width: `${valueA * 100}%` }}
                            />
                            {valueB !== undefined && (
                              <div
                                className="h-full bg-blue-400 rounded-full transition-all"
                                style={{ width: `${valueB * 100}%` }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-purple-500 rounded-full" />
                      <span className="text-xs text-gray-500">Config A</span>
                    </div>
                    {selectedRun.config_b && (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-400 rounded-full" />
                        <span className="text-xs text-gray-500">Config B</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-12 text-center">
              <BeakerIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-400 mb-2">
                {t("dashboard.evals.selectRun") || "Select an evaluation run"}
              </h2>
              <p className="text-gray-400">
                {t("dashboard.evals.selectRunHint") || "Choose a run from the list to view detailed metrics"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
