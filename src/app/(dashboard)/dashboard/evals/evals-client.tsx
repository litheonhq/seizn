"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { formatDate } from "@/lib/format-date";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";

// ============================================
// Types
// ============================================

type ViewTab = "comparison" | "charts" | "timeline";

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

interface HistoricalTrend {
  date: string;
  f1: number;
  ndcg: number;
  mrr: number;
  latency: number;
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
  {
    id: "eval-004",
    name: "Top-K Optimization",
    dataset_id: "ds-002",
    dataset_name: "Support Tickets",
    config_a: {
      label: "Top-K 5",
      search_type: "hybrid",
      embedding_model: "text-embedding-3-small",
      top_k: 5,
      rerank_enabled: true,
      rerank_model: "cohere-rerank-v3",
      hybrid_alpha: 0.6,
    },
    config_b: {
      label: "Top-K 20",
      search_type: "hybrid",
      embedding_model: "text-embedding-3-small",
      top_k: 20,
      rerank_enabled: true,
      rerank_model: "cohere-rerank-v3",
      hybrid_alpha: 0.6,
    },
    status: "completed",
    metrics: {
      config_a: {
        precision: 0.89,
        recall: 0.71,
        f1: 0.79,
        ndcg: 0.86,
        mrr: 0.91,
        avg_latency_ms: 178,
        avg_cost_usd: 0.0009,
      },
      config_b: {
        precision: 0.82,
        recall: 0.88,
        f1: 0.85,
        ndcg: 0.91,
        mrr: 0.89,
        avg_latency_ms: 298,
        avg_cost_usd: 0.0016,
      },
      winner: "B",
      confidence: 0.87,
    },
    created_at: "2026-01-12T14:00:00Z",
    completed_at: "2026-01-12T14:35:00Z",
  },
];

const HISTORICAL_TRENDS: HistoricalTrend[] = [
  { date: "Jan 8", f1: 0.72, ndcg: 0.78, mrr: 0.80, latency: 280 },
  { date: "Jan 9", f1: 0.74, ndcg: 0.79, mrr: 0.82, latency: 265 },
  { date: "Jan 10", f1: 0.76, ndcg: 0.82, mrr: 0.84, latency: 258 },
  { date: "Jan 11", f1: 0.78, ndcg: 0.84, mrr: 0.86, latency: 252 },
  { date: "Jan 12", f1: 0.79, ndcg: 0.86, mrr: 0.87, latency: 245 },
  { date: "Jan 13", f1: 0.81, ndcg: 0.87, mrr: 0.89, latency: 238 },
  { date: "Jan 14", f1: 0.83, ndcg: 0.89, mrr: 0.91, latency: 232 },
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

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const TrophyIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
  </svg>
);

const TrendingUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
  </svg>
);

type EvalWinner = "A" | "B" | "tie";

function WinnerBadge({
  winner,
  tieLabel,
  winnerLabel,
}: {
  winner: EvalWinner;
  tieLabel: string;
  winnerLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
      <TrophyIcon className="w-3 h-3" />
      {winner === "tie" ? tieLabel : `${winnerLabel}: ${winner}`}
    </span>
  );
}

type MetricComparisonProps = {
  label: string;
  valueA: number;
  valueB?: number;
  format: (v: number) => string;
  higherIsBetter?: boolean;
  winner?: EvalWinner;
};

function MetricComparison({
  label,
  valueA,
  valueB,
  format,
  higherIsBetter = true,
  winner,
}: MetricComparisonProps) {
  const diff = valueB !== undefined ? valueA - valueB : 0;
  const percentDiff = valueB !== undefined && valueB !== 0 ? Math.abs(diff / valueB) * 100 : 0;
  const isWinnerA = higherIsBetter ? diff > 0 : diff < 0;
  const showComparison = valueB !== undefined && diff !== 0;

  return (
    <div className="flex items-center justify-between py-3 border-b border-szn-border last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-szn-text-2">{label}</span>
        {showComparison && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              isWinnerA ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}
          >
            {isWinnerA ? "+" : "-"}{percentDiff.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          {winner === "A" && showComparison && isWinnerA && (
            <TrophyIcon className="w-4 h-4 text-yellow-500" />
          )}
          <span
            className={`text-sm font-semibold ${
              showComparison && isWinnerA ? "text-green-600" : "text-szn-text-1"
            }`}
          >
            {format(valueA)}
          </span>
        </div>
        {valueB !== undefined && (
          <>
            <span className="text-szn-text-3 text-xs">vs</span>
            <div className="flex items-center gap-1">
              <span
                className={`text-sm font-semibold ${
                  showComparison && !isWinnerA ? "text-green-600" : "text-szn-text-1"
                }`}
              >
                {format(valueB)}
              </span>
              {winner === "B" && showComparison && !isWinnerA && (
                <TrophyIcon className="w-4 h-4 text-yellow-500" />
              )}
            </div>
            {showComparison && (
              <span className={`inline-flex items-center text-xs ${isWinnerA ? "text-green-500" : "text-red-500"}`}>
                {isWinnerA ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type CustomTooltipPayloadEntry = {
  name: string;
  value: number;
  color: string;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: CustomTooltipPayloadEntry[];
  label?: string;
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-szn-card/95 backdrop-blur-sm border border-szn-border rounded-lg shadow-lg p-3">
        <p className="font-medium text-szn-text-1 mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}%
          </p>
        ))}
      </div>
    );
  }
  return null;
}


// ============================================
// Component
// ============================================

export default function EvalsClient() {
  const { t } = useDashboardTranslation();
  const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<EvalRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>("comparison");

  useEffect(() => {
    // Simulate API fetch
    const timer = setTimeout(() => {
      setEvalRuns(MOCK_EVAL_RUNS);
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // formatDate imported from @/lib/format-date (using "long" style for date+time)

  const formatPercent = (value: number) => `${(Number(value) * 100).toFixed(1)}%`;
  const formatLatency = (ms: number) => `${ms}ms`;
  const formatCost = (usd: number) => `$${(usd * 1000).toFixed(2)}m`;

  // Prepare bar chart data
  const barChartData = useMemo(() => {
    if (!selectedRun?.metrics) return [];
    const metrics = ["precision", "recall", "f1", "ndcg", "mrr"];
    return metrics.map((metric) => ({
      name: metric.toUpperCase(),
      "Config A": Math.round((selectedRun.metrics!.config_a[metric as keyof MetricSet] as number) * 100),
      "Config B": selectedRun.metrics!.config_b
        ? Math.round((selectedRun.metrics!.config_b[metric as keyof MetricSet] as number) * 100)
        : 0,
    }));
  }, [selectedRun]);

  // Prepare radar chart data
  const radarChartData = useMemo(() => {
    if (!selectedRun?.metrics) return [];
    const metrics = ["precision", "recall", "f1", "ndcg", "mrr"];
    return metrics.map((metric) => ({
      subject: metric.toUpperCase(),
      A: Math.round((selectedRun.metrics!.config_a[metric as keyof MetricSet] as number) * 100),
      B: selectedRun.metrics!.config_b
        ? Math.round((selectedRun.metrics!.config_b[metric as keyof MetricSet] as number) * 100)
        : 0,
      fullMark: 100,
    }));
  }, [selectedRun]);

  // Export as CSV
  const exportAsCSV = useCallback(() => {
    if (!selectedRun?.metrics) return;

    const headers = ["Metric", "Config A", "Config B", "Difference", "Winner"];
    const metrics = [
      { name: "Precision", key: "precision" },
      { name: "Recall", key: "recall" },
      { name: "F1 Score", key: "f1" },
      { name: "NDCG", key: "ndcg" },
      { name: "MRR", key: "mrr" },
      { name: "Avg Latency (ms)", key: "avg_latency_ms" },
      { name: "Avg Cost (USD)", key: "avg_cost_usd" },
    ];

    const rows = metrics.map(({ name, key }) => {
      const valueA = selectedRun.metrics!.config_a[key as keyof MetricSet];
      const valueB = selectedRun.metrics!.config_b?.[key as keyof MetricSet] ?? "-";
      const diff = typeof valueB === "number" ? ((valueA as number) - valueB).toFixed(4) : "-";
      const isHigherBetter = !["avg_latency_ms", "avg_cost_usd"].includes(key);
      const winner =
        typeof valueB === "number"
          ? isHigherBetter
            ? (valueA as number) > valueB
              ? "A"
              : "B"
            : (valueA as number) < valueB
              ? "A"
              : "B"
          : "-";
      return [name, valueA, valueB, diff, winner].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `eval-${selectedRun.id}-metrics.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [selectedRun]);

  // Export as JSON
  const exportAsJSON = useCallback(() => {
    if (!selectedRun) return;

    const data = {
      id: selectedRun.id,
      name: selectedRun.name,
      dataset: selectedRun.dataset_name,
      status: selectedRun.status,
      config_a: selectedRun.config_a,
      config_b: selectedRun.config_b,
      metrics: selectedRun.metrics,
      created_at: selectedRun.created_at,
      completed_at: selectedRun.completed_at,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `eval-${selectedRun.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [selectedRun]);

  const getStatusBadge = (status: EvalRun["status"]) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">
            <CheckCircleIcon className="w-3 h-3" />
            {t("dashboard.evals.completed") || "Completed"}
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            {t("dashboard.evals.running") || "Running"}
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">
            <XCircleIcon className="w-3 h-3" />
            {t("dashboard.evals.failed") || "Failed"}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-szn-surface text-szn-text-2 rounded-full">
            <ClockIcon className="w-3 h-3" />
            {t("dashboard.evals.pending") || "Pending"}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="szn-card rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center">
              <BeakerIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-szn-text-1">{t("dashboard.evals.title") || "Evaluations"}</h1>
              <p className="text-szn-text-2">{t("dashboard.evals.subtitle") || "A/B test and measure retrieval quality"}</p>
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
        <div className="lg:col-span-1 szn-card rounded-lg overflow-hidden">
          <div className="p-4 border-b border-szn-border">
            <h2 className="font-semibold text-szn-text-1">{t("dashboard.evals.runs") || "Evaluation Runs"}</h2>
          </div>
          <div className="divide-y divide-szn-border max-h-[600px] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : evalRuns.length === 0 ? (
              <div className="p-8 text-center text-szn-text-2">
                <BeakerIcon className="w-12 h-12 text-szn-text-3 mx-auto mb-2" />
                <p>{t("dashboard.evals.noRuns") || "No evaluation runs yet"}</p>
              </div>
            ) : (
              evalRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  className={`w-full p-4 text-left transition-colors ${
                    selectedRun?.id === run.id ? "bg-purple-50 border-l-2 border-purple-500" : "hover:bg-szn-surface"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-szn-text-1 line-clamp-1">{run.name}</h3>
                    {getStatusBadge(run.status)}
                  </div>
                  <p className="text-sm text-szn-text-2 mb-2">{run.dataset_name}</p>
                  <div className="flex items-center gap-2 text-xs text-szn-text-3">
                    <ClockIcon className="w-3 h-3" />
                    {formatDate(run.created_at, "long")}
                    {run.metrics?.winner && (
                      <span className="ml-auto px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full inline-flex items-center gap-1">
                        <TrophyIcon className="w-3 h-3" />
                        {run.metrics.winner}
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
              <div className="szn-card rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-szn-text-1">{selectedRun.name}</h2>
                    <p className="text-szn-text-2">{selectedRun.dataset_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedRun.metrics?.winner && (
                      <WinnerBadge
                        winner={selectedRun.metrics.winner}
                        tieLabel={t("dashboard.evals.tie") || "Tie"}
                        winnerLabel={t("dashboard.evals.winner") || "Winner"}
                      />
                    )}
                    {getStatusBadge(selectedRun.status)}
                  </div>
                </div>

                {/* Export Buttons */}
                {selectedRun.metrics && (
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={exportAsCSV}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-szn-surface hover:bg-szn-surface-1 text-szn-text-2 rounded-lg transition-colors"
                    >
                      <DownloadIcon className="w-4 h-4" />
                      {t("dashboard.evals.exportCSV") || "Export CSV"}
                    </button>
                    <button
                      onClick={exportAsJSON}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-szn-surface hover:bg-szn-surface-1 text-szn-text-2 rounded-lg transition-colors"
                    >
                      <DownloadIcon className="w-4 h-4" />
                      {t("dashboard.evals.exportJSON") || "Export JSON"}
                    </button>
                  </div>
                )}

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


              {/* Tab Navigation */}
              {selectedRun.metrics && (
                <div className="szn-card rounded-lg overflow-hidden">
                  <div className="flex border-b border-szn-border">
                    {(["comparison", "charts", "timeline"] as ViewTab[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                          activeTab === tab
                            ? "text-purple-600 border-b-2 border-purple-500 bg-purple-50/50"
                            : "text-szn-text-2 hover:text-szn-text-1 hover:bg-szn-surface"
                        }`}
                      >
                        {tab === "comparison" && (t("dashboard.evals.tabComparison") || "Comparison")}
                        {tab === "charts" && (t("dashboard.evals.tabCharts") || "Charts")}
                        {tab === "timeline" && (t("dashboard.evals.tabTimeline") || "Timeline")}
                      </button>
                    ))}
                  </div>

                  <div className="p-6">
                    {/* Comparison Tab */}
                    {activeTab === "comparison" && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 mb-4">
                          <ChartIcon className="w-5 h-5 text-purple-500" />
                          <h2 className="font-semibold text-szn-text-1">{t("dashboard.evals.metrics") || "Metrics"}</h2>
                          {selectedRun.metrics.winner && selectedRun.metrics.confidence && (
                            <span className="ml-auto text-sm text-szn-text-2">
                              {formatPercent(selectedRun.metrics.confidence)} {t("dashboard.evals.confidence") || "confidence"}
                            </span>
                          )}
                        </div>
                        <MetricComparison
                          label={t("dashboard.evals.precision") || "Precision"}
                          valueA={selectedRun.metrics.config_a.precision}
                          valueB={selectedRun.metrics.config_b?.precision}
                          format={formatPercent}
                          winner={selectedRun.metrics.winner}
                        />
                        <MetricComparison
                          label={t("dashboard.evals.recall") || "Recall"}
                          valueA={selectedRun.metrics.config_a.recall}
                          valueB={selectedRun.metrics.config_b?.recall}
                          format={formatPercent}
                          winner={selectedRun.metrics.winner}
                        />
                        <MetricComparison
                          label={t("dashboard.evals.f1Score") || "F1 Score"}
                          valueA={selectedRun.metrics.config_a.f1}
                          valueB={selectedRun.metrics.config_b?.f1}
                          format={formatPercent}
                          winner={selectedRun.metrics.winner}
                        />
                        <MetricComparison
                          label="NDCG"
                          valueA={selectedRun.metrics.config_a.ndcg}
                          valueB={selectedRun.metrics.config_b?.ndcg}
                          format={formatPercent}
                          winner={selectedRun.metrics.winner}
                        />
                        <MetricComparison
                          label="MRR"
                          valueA={selectedRun.metrics.config_a.mrr}
                          valueB={selectedRun.metrics.config_b?.mrr}
                          format={formatPercent}
                          winner={selectedRun.metrics.winner}
                        />
                        <MetricComparison
                          label={t("dashboard.evals.avgLatency") || "Avg Latency"}
                          valueA={selectedRun.metrics.config_a.avg_latency_ms}
                          valueB={selectedRun.metrics.config_b?.avg_latency_ms}
                          format={formatLatency}
                          higherIsBetter={false}
                          winner={selectedRun.metrics.winner}
                        />
                        <MetricComparison
                          label={t("dashboard.evals.avgCost") || "Avg Cost"}
                          valueA={selectedRun.metrics.config_a.avg_cost_usd}
                          valueB={selectedRun.metrics.config_b?.avg_cost_usd}
                          format={formatCost}
                          higherIsBetter={false}
                          winner={selectedRun.metrics.winner}
                        />
                      </div>
                    )}


                    {/* Charts Tab */}
                    {activeTab === "charts" && (
                      <div className="space-y-8">
                        {/* Bar Chart */}
                        <div>
                          <h3 className="font-semibold text-szn-text-1 mb-4">{t("dashboard.evals.barChart") || "Metric Comparison"}</h3>
                          <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={barChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--szn-border)" />
                                <XAxis dataKey="name" tick={{ fill: "var(--szn-text-3)", fontSize: 12 }} />
                                <YAxis tick={{ fill: "var(--szn-text-3)", fontSize: 12 }} domain={[0, 100]} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend />
                                <Bar dataKey="Config A" fill="var(--szn-chart-2)" radius={[4, 4, 0, 0]} />
                                {selectedRun.config_b && (
                                  <Bar dataKey="Config B" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                                )}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Radar Chart */}
                        <div>
                          <h3 className="font-semibold text-szn-text-1 mb-4">{t("dashboard.evals.radarChart") || "Multi-Metric Overview"}</h3>
                          <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart data={radarChartData}>
                                <PolarGrid stroke="var(--szn-border)" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--szn-text-3)", fontSize: 12 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 10 }} />
                                <Radar name="Config A" dataKey="A" stroke="var(--szn-chart-2)" fill="var(--szn-chart-2)" fillOpacity={0.5} />
                                {selectedRun.config_b && (
                                  <Radar name="Config B" dataKey="B" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.5} />
                                )}
                                <Legend />
                              </RadarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    )}


                    {/* Timeline Tab */}
                    {activeTab === "timeline" && (
                      <div className="space-y-8">
                        {/* Metrics Trend Line Chart */}
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <TrendingUpIcon className="w-5 h-5 text-purple-500" />
                            <h3 className="font-semibold text-szn-text-1">{t("dashboard.evals.metricsTrend") || "Metrics Trend"}</h3>
                          </div>
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={HISTORICAL_TRENDS} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--szn-border)" />
                                <XAxis dataKey="date" tick={{ fill: "var(--szn-text-3)", fontSize: 12 }} />
                                <YAxis tick={{ fill: "var(--szn-text-3)", fontSize: 12 }} domain={[0.6, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                                <Tooltip
                                  formatter={(value) => [`${(Number(value) * 100).toFixed(1)}%`]}
                                  contentStyle={{
                                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                                    borderRadius: "8px",
                                    border: "1px solid var(--szn-border)",
                                  }}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="f1" stroke="var(--szn-chart-2)" strokeWidth={2} dot={{ fill: "var(--szn-chart-2)" }} name="F1 Score" />
                                <Line type="monotone" dataKey="ndcg" stroke="var(--szn-success)" strokeWidth={2} dot={{ fill: "var(--szn-success)" }} name="NDCG" />
                                <Line type="monotone" dataKey="mrr" stroke="var(--szn-warning)" strokeWidth={2} dot={{ fill: "var(--szn-warning)" }} name="MRR" />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Latency Area Chart */}
                        <div>
                          <h3 className="font-semibold text-szn-text-1 mb-4">{t("dashboard.evals.latencyTrend") || "Latency Trend"}</h3>
                          <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={HISTORICAL_TRENDS} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--szn-border)" />
                                <XAxis dataKey="date" tick={{ fill: "var(--szn-text-3)", fontSize: 12 }} />
                                <YAxis tick={{ fill: "var(--szn-text-3)", fontSize: 12 }} domain={[200, 300]} tickFormatter={(v) => `${v}ms`} />
                                <Tooltip
                                  formatter={(value) => value !== undefined ? [`${value}ms`] : [""]}
                                  contentStyle={{
                                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                                    borderRadius: "8px",
                                    border: "1px solid var(--szn-border)",
                                  }}
                                />
                                <Area type="monotone" dataKey="latency" stroke="var(--szn-danger)" fill="#fecaca" strokeWidth={2} name="Latency" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Recent Runs */}
                        <div>
                          <h3 className="font-semibold text-szn-text-1 mb-4">{t("dashboard.evals.recentRuns") || "Recent Completed Runs"}</h3>
                          <div className="space-y-2">
                            {evalRuns
                              .filter((run) => run.status === "completed")
                              .slice(0, 5)
                              .map((run) => (
                                <div
                                  key={run.id}
                                  className="flex items-center justify-between p-3 bg-szn-surface rounded-lg hover:bg-szn-surface-1 transition-colors cursor-pointer"
                                  onClick={() => setSelectedRun(run)}
                                >
                                  <div>
                                    <p className="font-medium text-szn-text-1">{run.name}</p>
                                    <p className="text-xs text-szn-text-2">{formatDate(run.created_at, "long")}</p>
                                  </div>
                                  {run.metrics?.winner && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                                      <TrophyIcon className="w-3 h-3" />
                                      {run.metrics.winner}
                                    </span>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}


              {/* Visual Chart (Simple bars - kept for non-metric runs) */}
              {!selectedRun.metrics && (
                <div className="szn-card rounded-lg p-6">
                  <h2 className="font-semibold text-szn-text-1 mb-4">{t("dashboard.evals.comparison") || "Visual Comparison"}</h2>
                  <p className="text-szn-text-2 text-center py-8">
                    {t("dashboard.evals.waitingForMetrics") || "Waiting for evaluation to complete..."}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="szn-card rounded-lg p-12 text-center">
              <BeakerIcon className="w-16 h-16 text-szn-text-3 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-szn-text-3 mb-2">
                {t("dashboard.evals.selectRun") || "Select an evaluation run"}
              </h2>
              <p className="text-szn-text-3">
                {t("dashboard.evals.selectRunHint") || "Choose a run from the list to view detailed metrics"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
