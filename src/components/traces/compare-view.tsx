"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
} from "recharts";

// ============================================
// Types
// ============================================

export interface TraceData {
  id: string;
  query: string;
  collection_id?: string;
  created_at: string;
  replay_of?: string;
  config?: TraceConfig;
  metrics?: TraceMetrics;
  stages?: PipelineStage[];
  results?: TraceResult[];
}

export interface TraceConfig {
  search_type?: string;
  hybrid_alpha?: number;
  rerank?: boolean;
  rerank_model?: string;
  top_k?: number;
  embedding_model?: string;
  [key: string]: unknown;
}

export interface TraceMetrics {
  embedding_ms?: number;
  search_ms?: number;
  rerank_ms?: number;
  total_ms?: number;
  total_tokens?: number;
  embedding_tokens?: number;
  rerank_tokens?: number;
  cost_usd?: number;
}

export interface PipelineStage {
  name: string;
  label: string;
  duration_ms: number;
  start_offset_ms: number;
  status: "success" | "error" | "running";
  tokens?: number;
  metadata?: Record<string, unknown>;
}

export interface TraceResult {
  id: string;
  score: number;
  rank: number;
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface ComparisonDiff {
  results: {
    overlap_count: number;
    overlap_percent: number;
    only_in_a: string[];
    only_in_b: string[];
    ranking_changes: Array<{
      id: string;
      rank_a: number;
      rank_b: number;
      delta: number;
    }>;
  };
  latency: {
    embedding_ms: { a: number; b: number; delta: number; delta_percent: number };
    search_ms: { a: number; b: number; delta: number; delta_percent: number };
    rerank_ms: { a: number; b: number; delta: number };
    total_ms: { a: number; b: number; delta: number; delta_percent: number };
  };
  tokens: {
    a: number;
    b: number;
    delta: number;
    delta_percent: number;
  };
  cost: {
    a: number;
    b: number;
    delta: number;
    delta_percent: number;
  };
  config: {
    [key: string]: { a: unknown; b: unknown; changed: boolean };
  };
  summary: {
    results_improved: number;
    results_degraded: number;
    latency_improved: boolean;
    cost_improved: boolean;
  };
}

export interface EvalRunData {
  id: string;
  name: string;
  dataset_id: string;
  dataset_name?: string;
  status: "pending" | "running" | "completed" | "failed";
  config: {
    plan: string;
    collection_id: string;
    [key: string]: unknown;
  };
  metrics?: {
    total_cases: number;
    avg_mrr?: number;
    avg_recall_at_5?: number;
    avg_recall_at_10?: number;
    avg_precision_at_5?: number;
    avg_ndcg?: number;
    avg_latency_ms?: number;
    avg_cost_usd?: number;
  };
  created_at: string;
  completed_at?: string;
}

export interface CompareViewProps {
  mode: "traces" | "evals";
  itemIdA?: string;
  itemIdB?: string;
  traceA?: TraceData;
  traceB?: TraceData;
  evalRunA?: EvalRunData;
  evalRunB?: EvalRunData;
  onClose?: () => void;
  className?: string;
}

type ActiveTab = "overview" | "latency" | "results" | "pipeline" | "config";

// ============================================
// Icons
// ============================================

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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

const ArrowRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CurrencyDollarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ChartBarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
);

const DocumentTextIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const CogIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const BoltIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  </svg>
);

// ============================================
// Utility Functions
// ============================================

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return "-";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatCost(usd: number | undefined): string {
  if (usd === undefined || usd === null) return "-";
  if (usd < 0.0001) return "<$0.0001";
  return `$${usd.toFixed(6)}`;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || value === null) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatTokens(tokens: number | undefined): string {
  if (tokens === undefined || tokens === null) return "-";
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${tokens}`;
}

function getDeltaColor(delta: number, higherIsBetter: boolean = true): string {
  if (delta === 0) return "text-gray-400";
  const isPositive = higherIsBetter ? delta < 0 : delta > 0;
  return isPositive ? "text-green-500" : "text-red-500";
}

// ============================================
// Sub-Components
// ============================================

interface MetricComparisonRowProps {
  label: string;
  valueA: number | undefined;
  valueB: number | undefined;
  formatter: (v: number | undefined) => string;
  higherIsBetter?: boolean;
  icon?: React.ReactNode;
}

function MetricComparisonRow({
  label,
  valueA,
  valueB,
  formatter,
  higherIsBetter = false,
  icon,
}: MetricComparisonRowProps) {
  const delta = (valueA ?? 0) - (valueB ?? 0);
  const deltaPercent =
    valueA && valueB && valueB !== 0 ? ((valueA - valueB) / valueB) * 100 : 0;

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-2">
        {icon && <span className="text-gray-400">{icon}</span>}
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      </div>
      <div className="flex items-center gap-6">
        {/* Value A */}
        <div className="text-right min-w-[80px]">
          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            {formatter(valueA)}
          </span>
          <span className="text-xs text-gray-400 ml-1">A</span>
        </div>

        {/* Arrow */}
        <ArrowRightIcon className="w-4 h-4 text-gray-300" />

        {/* Value B */}
        <div className="text-right min-w-[80px]">
          <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
            {formatter(valueB)}
          </span>
          <span className="text-xs text-gray-400 ml-1">B</span>
        </div>

        {/* Delta */}
        <div className="text-right min-w-[80px]">
          {delta !== 0 && valueA !== undefined && valueB !== undefined && (
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                getDeltaColor(delta, higherIsBetter) === "text-green-500"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : getDeltaColor(delta, higherIsBetter) === "text-red-500"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {deltaPercent.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: React.ReactNode;
  detail?: string;
  positive?: boolean;
  icon?: React.ReactNode;
}

function SummaryCard({ label, value, detail, positive, icon }: SummaryCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-gray-400">{icon}</span>}
        <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div
        className={`text-xl font-bold ${
          positive === true
            ? "text-green-600 dark:text-green-400"
            : positive === false
            ? "text-red-600 dark:text-red-400"
            : "text-gray-900 dark:text-white"
        }`}
      >
        {value}
      </div>
      {detail && <p className="text-xs text-gray-400 mt-1">{detail}</p>}
    </div>
  );
}

interface StageComparisonProps {
  stagesA: PipelineStage[];
  stagesB: PipelineStage[];
}

function StageComparison({ stagesA, stagesB }: StageComparisonProps) {
  // Merge stages by name
  const stageNames = new Set([
    ...stagesA.map((s) => s.name),
    ...stagesB.map((s) => s.name),
  ]);

  const stageMap = Array.from(stageNames).map((name) => ({
    name,
    stageA: stagesA.find((s) => s.name === name),
    stageB: stagesB.find((s) => s.name === name),
  }));

  const maxDuration = Math.max(
    ...stagesA.map((s) => s.duration_ms),
    ...stagesB.map((s) => s.duration_ms),
    1
  );

  return (
    <div className="space-y-4">
      {stageMap.map(({ name, stageA, stageB }) => {
        const durationA = stageA?.duration_ms ?? 0;
        const durationB = stageB?.duration_ms ?? 0;
        const widthA = (durationA / maxDuration) * 100;
        const widthB = (durationB / maxDuration) * 100;
        const label = stageA?.label || stageB?.label || name;

        return (
          <div key={name} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                {label.replace(/_/g, " ")}
              </span>
              <span className="text-gray-500">
                {formatDuration(durationA)} vs {formatDuration(durationB)}
              </span>
            </div>
            <div className="flex gap-2">
              {/* Bar A */}
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${widthA}%` }}
                />
              </div>
              {/* Bar B */}
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${widthB}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-xs text-gray-500">Trace A</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500" />
          <span className="text-xs text-gray-500">Trace B</span>
        </div>
      </div>
    </div>
  );
}

interface RankingChangeListProps {
  changes: Array<{ id: string; rank_a: number; rank_b: number; delta: number }>;
}

function RankingChangeList({ changes }: RankingChangeListProps) {
  if (changes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No ranking changes to display
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto">
      {changes.map((change) => (
        <div
          key={change.id}
          className={`flex items-center gap-3 p-3 rounded-lg ${
            change.delta > 0
              ? "bg-green-50 dark:bg-green-900/20 border-l-3 border-green-500"
              : change.delta < 0
              ? "bg-red-50 dark:bg-red-900/20 border-l-3 border-red-500"
              : "bg-gray-50 dark:bg-gray-800"
          }`}
        >
          <span className="text-sm font-mono text-gray-600 dark:text-gray-400 flex-1 truncate">
            {change.id}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">#{change.rank_a}</span>
            <ArrowRightIcon className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">#{change.rank_b}</span>
          </div>
          {change.delta !== 0 && (
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                change.delta > 0
                  ? "bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-300"
                  : "bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-300"
              }`}
            >
              {change.delta > 0 ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
              {Math.abs(change.delta)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

interface ConfigDiffProps {
  config: { [key: string]: { a: unknown; b: unknown; changed: boolean } };
}

function ConfigDiff({ config }: ConfigDiffProps) {
  const entries = Object.entries(config);

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No configuration differences
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className={`p-3 rounded-lg ${
            value.changed
              ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
              : "bg-gray-50 dark:bg-gray-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {key.replace(/_/g, " ")}
            </span>
            {value.changed && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                Changed
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-sm text-blue-600 dark:text-blue-400">
              {String(value.a ?? "-")}
            </span>
            <ArrowRightIcon className="w-4 h-4 text-gray-300" />
            <span className="text-sm text-purple-600 dark:text-purple-400">
              {String(value.b ?? "-")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function CompareView({
  mode,
  itemIdA,
  itemIdB,
  traceA: propTraceA,
  traceB: propTraceB,
  evalRunA: propEvalRunA,
  evalRunB: propEvalRunB,
  onClose,
  className = "",
}: CompareViewProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traceA, setTraceA] = useState<TraceData | null>(propTraceA || null);
  const [traceB, setTraceB] = useState<TraceData | null>(propTraceB || null);
  const [diff, setDiff] = useState<ComparisonDiff | null>(null);

  const loadComparison = useCallback(async () => {
    if (!itemIdA || !itemIdB) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/traces/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trace_id_a: itemIdA,
          trace_id_b: itemIdB,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setDiff(data.diff);
        if (data.trace_a) {
          setTraceA({
            id: data.trace_a.id,
            query: data.trace_a.query,
            collection_id: data.trace_a.collection_id,
            created_at: data.trace_a.created_at,
            replay_of: data.trace_a.replay_of,
          });
        }
        if (data.trace_b) {
          setTraceB({
            id: data.trace_b.id,
            query: data.trace_b.query,
            collection_id: data.trace_b.collection_id,
            created_at: data.trace_b.created_at,
            replay_of: data.trace_b.replay_of,
          });
        }
      } else {
        setError(data.error?.message || "Failed to load comparison");
      }
    } catch {
      setError("Failed to load comparison data");
    } finally {
      setLoading(false);
    }
  }, [itemIdA, itemIdB]);

  // Load trace data if IDs provided
  useEffect(() => {
    if (mode === "traces" && itemIdA && itemIdB && !propTraceA && !propTraceB) {
      void loadComparison();
    }
  }, [mode, itemIdA, itemIdB, propTraceA, propTraceB, loadComparison]);

  // Build comparison diff from trace data if provided directly
  const computedDiff = useMemo((): ComparisonDiff | null => {
    if (diff) return diff;
    if (!traceA || !traceB) return null;

    // Build config diff
    const configKeys = new Set([
      ...Object.keys(traceA.config || {}),
      ...Object.keys(traceB.config || {}),
    ]);
    const configDiff: ComparisonDiff["config"] = {};
    for (const key of configKeys) {
      const valueA = traceA.config?.[key];
      const valueB = traceB.config?.[key];
      configDiff[key] = {
        a: valueA,
        b: valueB,
        changed: JSON.stringify(valueA) !== JSON.stringify(valueB),
      };
    }

    // Build results diff
    const resultsA = traceA.results || [];
    const resultsB = traceB.results || [];
    const idsA = new Set(resultsA.map((r) => r.id));
    const idsB = new Set(resultsB.map((r) => r.id));
    const overlapIds = [...idsA].filter((id) => idsB.has(id));

    const rankingChanges: ComparisonDiff["results"]["ranking_changes"] = [];
    let improved = 0;
    let degraded = 0;

    for (const id of overlapIds) {
      const resultA = resultsA.find((r) => r.id === id);
      const resultB = resultsB.find((r) => r.id === id);
      if (resultA && resultB) {
        const delta = resultA.rank - resultB.rank;
        rankingChanges.push({
          id,
          rank_a: resultA.rank,
          rank_b: resultB.rank,
          delta,
        });
        if (delta > 0) improved++;
        else if (delta < 0) degraded++;
      }
    }

    // Metrics
    const metricsA = traceA.metrics || {};
    const metricsB = traceB.metrics || {};

    const totalTokensA = (metricsA.embedding_tokens ?? 0) + (metricsA.rerank_tokens ?? 0);
    const totalTokensB = (metricsB.embedding_tokens ?? 0) + (metricsB.rerank_tokens ?? 0);

    return {
      results: {
        overlap_count: overlapIds.length,
        overlap_percent:
          Math.max(resultsA.length, resultsB.length) > 0
            ? (overlapIds.length / Math.max(resultsA.length, resultsB.length)) * 100
            : 0,
        only_in_a: [...idsA].filter((id) => !idsB.has(id)),
        only_in_b: [...idsB].filter((id) => !idsA.has(id)),
        ranking_changes: rankingChanges,
      },
      latency: {
        embedding_ms: {
          a: metricsA.embedding_ms ?? 0,
          b: metricsB.embedding_ms ?? 0,
          delta: (metricsA.embedding_ms ?? 0) - (metricsB.embedding_ms ?? 0),
          delta_percent:
            metricsB.embedding_ms
              ? (((metricsA.embedding_ms ?? 0) - metricsB.embedding_ms) / metricsB.embedding_ms) * 100
              : 0,
        },
        search_ms: {
          a: metricsA.search_ms ?? 0,
          b: metricsB.search_ms ?? 0,
          delta: (metricsA.search_ms ?? 0) - (metricsB.search_ms ?? 0),
          delta_percent:
            metricsB.search_ms
              ? (((metricsA.search_ms ?? 0) - metricsB.search_ms) / metricsB.search_ms) * 100
              : 0,
        },
        rerank_ms: {
          a: metricsA.rerank_ms ?? 0,
          b: metricsB.rerank_ms ?? 0,
          delta: (metricsA.rerank_ms ?? 0) - (metricsB.rerank_ms ?? 0),
        },
        total_ms: {
          a: metricsA.total_ms ?? 0,
          b: metricsB.total_ms ?? 0,
          delta: (metricsA.total_ms ?? 0) - (metricsB.total_ms ?? 0),
          delta_percent:
            metricsB.total_ms
              ? (((metricsA.total_ms ?? 0) - metricsB.total_ms) / metricsB.total_ms) * 100
              : 0,
        },
      },
      tokens: {
        a: totalTokensA,
        b: totalTokensB,
        delta: totalTokensA - totalTokensB,
        delta_percent: totalTokensB ? ((totalTokensA - totalTokensB) / totalTokensB) * 100 : 0,
      },
      cost: {
        a: metricsA.cost_usd ?? 0,
        b: metricsB.cost_usd ?? 0,
        delta: (metricsA.cost_usd ?? 0) - (metricsB.cost_usd ?? 0),
        delta_percent:
          metricsB.cost_usd
            ? (((metricsA.cost_usd ?? 0) - metricsB.cost_usd) / metricsB.cost_usd) * 100
            : 0,
      },
      config: configDiff,
      summary: {
        results_improved: improved,
        results_degraded: degraded,
        latency_improved: (metricsA.total_ms ?? 0) < (metricsB.total_ms ?? 0),
        cost_improved: (metricsA.cost_usd ?? 0) < (metricsB.cost_usd ?? 0),
      },
    };
  }, [diff, traceA, traceB]);

  // Chart data for latency comparison
  const latencyChartData = useMemo(() => {
    if (!computedDiff) return [];
    return [
      { name: "Embedding", A: computedDiff.latency.embedding_ms.a, B: computedDiff.latency.embedding_ms.b },
      { name: "Search", A: computedDiff.latency.search_ms.a, B: computedDiff.latency.search_ms.b },
      { name: "Rerank", A: computedDiff.latency.rerank_ms.a, B: computedDiff.latency.rerank_ms.b },
      { name: "Total", A: computedDiff.latency.total_ms.a, B: computedDiff.latency.total_ms.b },
    ];
  }, [computedDiff]);

  // Radar chart data for eval runs
  const evalRadarData = useMemo(() => {
    if (mode !== "evals" || !propEvalRunA?.metrics || !propEvalRunB?.metrics) return [];

    const metricsA = propEvalRunA.metrics;
    const metricsB = propEvalRunB.metrics;

    return [
      {
        subject: "MRR",
        A: Math.round((metricsA.avg_mrr ?? 0) * 100),
        B: Math.round((metricsB.avg_mrr ?? 0) * 100),
      },
      {
        subject: "Recall@5",
        A: Math.round((metricsA.avg_recall_at_5 ?? 0) * 100),
        B: Math.round((metricsB.avg_recall_at_5 ?? 0) * 100),
      },
      {
        subject: "Recall@10",
        A: Math.round((metricsA.avg_recall_at_10 ?? 0) * 100),
        B: Math.round((metricsB.avg_recall_at_10 ?? 0) * 100),
      },
      {
        subject: "Precision@5",
        A: Math.round((metricsA.avg_precision_at_5 ?? 0) * 100),
        B: Math.round((metricsB.avg_precision_at_5 ?? 0) * 100),
      },
      {
        subject: "NDCG",
        A: Math.round((metricsA.avg_ndcg ?? 0) * 100),
        B: Math.round((metricsB.avg_ndcg ?? 0) * 100),
      },
    ];
  }, [mode, propEvalRunA, propEvalRunB]);

  // Custom tooltip
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
        <p className="font-medium text-gray-900 dark:text-white mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}ms
          </p>
        ))}
      </div>
    );
  };

  // Tab configuration
  const tabs: Array<{ id: ActiveTab; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "Overview", icon: <ChartBarIcon className="w-4 h-4" /> },
    { id: "latency", label: "Latency", icon: <ClockIcon className="w-4 h-4" /> },
    { id: "results", label: "Results", icon: <DocumentTextIcon className="w-4 h-4" /> },
    { id: "pipeline", label: "Pipeline", icon: <BoltIcon className="w-4 h-4" /> },
    { id: "config", label: "Config", icon: <CogIcon className="w-4 h-4" /> },
  ];

  if (loading) {
    return (
      <div className={`bg-white dark:bg-gray-900 rounded-2xl border shadow-lg p-8 ${className}`}>
        <div className="flex flex-col items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
          <p className="mt-4 text-gray-500">Loading comparison...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white dark:bg-gray-900 rounded-2xl border shadow-lg p-8 ${className}`}>
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={loadComparison}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!computedDiff && mode === "traces") {
    return (
      <div className={`bg-white dark:bg-gray-900 rounded-2xl border shadow-lg p-8 ${className}`}>
        <p className="text-center text-gray-500">
          Select two traces to compare
        </p>
      </div>
    );
  }

  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-lg overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {mode === "traces" ? "Trace Comparison" : "Eval Run Comparison"}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "traces" && traceA && traceB && (
                <>
                  {traceA.id.slice(0, 8)}... vs {traceB.id.slice(0, 8)}...
                </>
              )}
              {mode === "evals" && propEvalRunA && propEvalRunB && (
                <>
                  {propEvalRunA.name} vs {propEvalRunB.name}
                </>
              )}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <XIcon className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id
                  ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/50 dark:hover:bg-gray-800/50"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Overview Tab */}
        {activeTab === "overview" && computedDiff && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard
                label="Results Overlap"
                value={`${computedDiff.results.overlap_percent.toFixed(0)}%`}
                detail={`${computedDiff.results.overlap_count} shared results`}
                positive={computedDiff.results.overlap_percent >= 70}
                icon={<DocumentTextIcon className="w-4 h-4" />}
              />
              <SummaryCard
                label="Latency Delta"
                value={`${computedDiff.latency.total_ms.delta > 0 ? "+" : ""}${computedDiff.latency.total_ms.delta}ms`}
                detail={`${formatDuration(computedDiff.latency.total_ms.a)} vs ${formatDuration(computedDiff.latency.total_ms.b)}`}
                positive={computedDiff.summary.latency_improved}
                icon={<ClockIcon className="w-4 h-4" />}
              />
              <SummaryCard
                label="Cost Delta"
                value={`${computedDiff.cost.delta > 0 ? "+" : ""}${formatCost(Math.abs(computedDiff.cost.delta))}`}
                detail={`${formatCost(computedDiff.cost.a)} vs ${formatCost(computedDiff.cost.b)}`}
                positive={computedDiff.summary.cost_improved}
                icon={<CurrencyDollarIcon className="w-4 h-4" />}
              />
              <SummaryCard
                label="Ranking Changes"
                value={
                  <span className="flex items-center gap-2">
                    <span className="text-green-500">
                      <ArrowUpIcon className="w-4 h-4 inline" />
                      {computedDiff.summary.results_improved}
                    </span>
                    <span className="text-red-500">
                      <ArrowDownIcon className="w-4 h-4 inline" />
                      {computedDiff.summary.results_degraded}
                    </span>
                  </span>
                }
                detail="improved / degraded"
                positive={computedDiff.summary.results_improved > computedDiff.summary.results_degraded}
                icon={<ChartBarIcon className="w-4 h-4" />}
              />
            </div>

            {/* Quick Metrics */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                Key Metrics Comparison
              </h4>
              <MetricComparisonRow
                label="Total Latency"
                valueA={computedDiff.latency.total_ms.a}
                valueB={computedDiff.latency.total_ms.b}
                formatter={formatDuration}
                higherIsBetter={false}
                icon={<ClockIcon className="w-4 h-4" />}
              />
              <MetricComparisonRow
                label="Token Usage"
                valueA={computedDiff.tokens.a}
                valueB={computedDiff.tokens.b}
                formatter={formatTokens}
                higherIsBetter={false}
                icon={<BoltIcon className="w-4 h-4" />}
              />
              <MetricComparisonRow
                label="Cost"
                valueA={computedDiff.cost.a}
                valueB={computedDiff.cost.b}
                formatter={formatCost}
                higherIsBetter={false}
                icon={<CurrencyDollarIcon className="w-4 h-4" />}
              />
            </div>
          </div>
        )}

        {/* Eval Run Overview */}
        {activeTab === "overview" && mode === "evals" && propEvalRunA && propEvalRunB && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard
                label="Avg MRR"
                value={formatPercent(propEvalRunA.metrics?.avg_mrr)}
                detail={`vs ${formatPercent(propEvalRunB.metrics?.avg_mrr)}`}
                positive={
                  (propEvalRunA.metrics?.avg_mrr ?? 0) > (propEvalRunB.metrics?.avg_mrr ?? 0)
                }
              />
              <SummaryCard
                label="Avg NDCG"
                value={formatPercent(propEvalRunA.metrics?.avg_ndcg)}
                detail={`vs ${formatPercent(propEvalRunB.metrics?.avg_ndcg)}`}
                positive={
                  (propEvalRunA.metrics?.avg_ndcg ?? 0) > (propEvalRunB.metrics?.avg_ndcg ?? 0)
                }
              />
              <SummaryCard
                label="Avg Latency"
                value={formatDuration(propEvalRunA.metrics?.avg_latency_ms)}
                detail={`vs ${formatDuration(propEvalRunB.metrics?.avg_latency_ms)}`}
                positive={
                  (propEvalRunA.metrics?.avg_latency_ms ?? Infinity) <
                  (propEvalRunB.metrics?.avg_latency_ms ?? Infinity)
                }
              />
              <SummaryCard
                label="Avg Cost"
                value={formatCost(propEvalRunA.metrics?.avg_cost_usd)}
                detail={`vs ${formatCost(propEvalRunB.metrics?.avg_cost_usd)}`}
                positive={
                  (propEvalRunA.metrics?.avg_cost_usd ?? Infinity) <
                  (propEvalRunB.metrics?.avg_cost_usd ?? Infinity)
                }
              />
            </div>

            {/* Radar Chart */}
            {evalRadarData.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                  Multi-Metric Overview
                </h4>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={evalRadarData}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: "#6b7280", fontSize: 12 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 10 }} />
                      <Radar name="Run A" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                      <Radar name="Run B" dataKey="B" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Metrics Comparison */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                Detailed Metrics
              </h4>
              <MetricComparisonRow
                label="MRR"
                valueA={propEvalRunA.metrics?.avg_mrr}
                valueB={propEvalRunB.metrics?.avg_mrr}
                formatter={formatPercent}
                higherIsBetter={true}
              />
              <MetricComparisonRow
                label="Recall@5"
                valueA={propEvalRunA.metrics?.avg_recall_at_5}
                valueB={propEvalRunB.metrics?.avg_recall_at_5}
                formatter={formatPercent}
                higherIsBetter={true}
              />
              <MetricComparisonRow
                label="Recall@10"
                valueA={propEvalRunA.metrics?.avg_recall_at_10}
                valueB={propEvalRunB.metrics?.avg_recall_at_10}
                formatter={formatPercent}
                higherIsBetter={true}
              />
              <MetricComparisonRow
                label="Precision@5"
                valueA={propEvalRunA.metrics?.avg_precision_at_5}
                valueB={propEvalRunB.metrics?.avg_precision_at_5}
                formatter={formatPercent}
                higherIsBetter={true}
              />
              <MetricComparisonRow
                label="NDCG"
                valueA={propEvalRunA.metrics?.avg_ndcg}
                valueB={propEvalRunB.metrics?.avg_ndcg}
                formatter={formatPercent}
                higherIsBetter={true}
              />
              <MetricComparisonRow
                label="Avg Latency"
                valueA={propEvalRunA.metrics?.avg_latency_ms}
                valueB={propEvalRunB.metrics?.avg_latency_ms}
                formatter={formatDuration}
                higherIsBetter={false}
              />
              <MetricComparisonRow
                label="Avg Cost"
                valueA={propEvalRunA.metrics?.avg_cost_usd}
                valueB={propEvalRunB.metrics?.avg_cost_usd}
                formatter={formatCost}
                higherIsBetter={false}
              />
            </div>
          </div>
        )}

        {/* Latency Tab */}
        {activeTab === "latency" && computedDiff && (
          <div className="space-y-6">
            {/* Latency Breakdown */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                Latency Breakdown
              </h4>
              <MetricComparisonRow
                label="Embedding"
                valueA={computedDiff.latency.embedding_ms.a}
                valueB={computedDiff.latency.embedding_ms.b}
                formatter={formatDuration}
                higherIsBetter={false}
              />
              <MetricComparisonRow
                label="Search"
                valueA={computedDiff.latency.search_ms.a}
                valueB={computedDiff.latency.search_ms.b}
                formatter={formatDuration}
                higherIsBetter={false}
              />
              <MetricComparisonRow
                label="Rerank"
                valueA={computedDiff.latency.rerank_ms.a}
                valueB={computedDiff.latency.rerank_ms.b}
                formatter={formatDuration}
                higherIsBetter={false}
              />
              <MetricComparisonRow
                label="Total"
                valueA={computedDiff.latency.total_ms.a}
                valueB={computedDiff.latency.total_ms.b}
                formatter={formatDuration}
                higherIsBetter={false}
              />
            </div>

            {/* Bar Chart */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                Latency Comparison Chart
              </h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={latencyChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 12 }} tickFormatter={(v) => `${v}ms`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="A" name="Trace A" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="B" name="Trace B" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Results Tab */}
        {activeTab === "results" && computedDiff && (
          <div className="space-y-6">
            {/* Results Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {computedDiff.results.overlap_count}
                </div>
                <div className="text-sm text-gray-500">Overlapping Results</div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {computedDiff.results.only_in_a.length}
                </div>
                <div className="text-sm text-gray-500">Only in Trace A</div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {computedDiff.results.only_in_b.length}
                </div>
                <div className="text-sm text-gray-500">Only in Trace B</div>
              </div>
            </div>

            {/* Ranking Changes */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-gray-900 dark:text-white">
                  Ranking Changes
                </h4>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-600 dark:text-green-400">
                    <CheckIcon className="w-4 h-4 inline mr-1" />
                    {computedDiff.summary.results_improved} improved
                  </span>
                  <span className="text-red-600 dark:text-red-400">
                    <ArrowDownIcon className="w-4 h-4 inline mr-1" />
                    {computedDiff.summary.results_degraded} degraded
                  </span>
                </div>
              </div>
              <RankingChangeList changes={computedDiff.results.ranking_changes} />
            </div>

            {/* Unique Results */}
            {(computedDiff.results.only_in_a.length > 0 || computedDiff.results.only_in_b.length > 0) && (
              <div className="grid grid-cols-2 gap-4">
                {/* Only in A */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                  <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-3">
                    Only in Trace A ({computedDiff.results.only_in_a.length})
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {computedDiff.results.only_in_a.slice(0, 10).map((id) => (
                      <div
                        key={id}
                        className="text-xs font-mono text-blue-700 dark:text-blue-400 truncate"
                      >
                        {id}
                      </div>
                    ))}
                    {computedDiff.results.only_in_a.length > 10 && (
                      <div className="text-xs text-gray-500">
                        +{computedDiff.results.only_in_a.length - 10} more
                      </div>
                    )}
                  </div>
                </div>

                {/* Only in B */}
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
                  <h4 className="font-medium text-purple-900 dark:text-purple-300 mb-3">
                    Only in Trace B ({computedDiff.results.only_in_b.length})
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {computedDiff.results.only_in_b.slice(0, 10).map((id) => (
                      <div
                        key={id}
                        className="text-xs font-mono text-purple-700 dark:text-purple-400 truncate"
                      >
                        {id}
                      </div>
                    ))}
                    {computedDiff.results.only_in_b.length > 10 && (
                      <div className="text-xs text-gray-500">
                        +{computedDiff.results.only_in_b.length - 10} more
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pipeline Tab */}
        {activeTab === "pipeline" && (
          <div className="space-y-6">
            {traceA?.stages && traceB?.stages ? (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                  Pipeline Stage Comparison
                </h4>
                <StageComparison stagesA={traceA.stages} stagesB={traceB.stages} />
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <BoltIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Pipeline stage data not available for these traces</p>
                <p className="text-sm mt-2">
                  Enable detailed tracing to capture pipeline stages
                </p>
              </div>
            )}
          </div>
        )}

        {/* Config Tab */}
        {activeTab === "config" && computedDiff && (
          <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                Configuration Differences
              </h4>
              <ConfigDiff config={computedDiff.config} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CompareView;
