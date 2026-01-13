"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type TabType = "traces" | "eval" | "experiments";

interface Trace {
  id: string;
  query: string;
  collection: string;
  latency: { total_ms: number };
  cost_usd: number;
  error?: string;
  created_at: string;
}

interface EvalRun {
  id: string;
  name: string;
  dataset: string;
  metrics: {
    mrr: number;
    recall_at_5: number;
    ndcg: number;
  };
  status: "completed" | "running" | "failed";
  created_at: string;
}

interface Experiment {
  id: string;
  name: string;
  variants: Array<{
    name: string;
    traffic_percent: number;
    metrics: { mrr: number; latency_p50: number };
  }>;
  status: "running" | "completed" | "paused";
  winner?: string;
  created_at: string;
}

export function FallDashboardClient() {
  const [activeTab, setActiveTab] = useState<TabType>("traces");
  const [traces, setTraces] = useState<Trace[]>([]);
  const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateRange, setDateRange] = useState("7d");
  const [minLatency, setMinLatency] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "traces") {
        const params = new URLSearchParams({ limit: "50" });
        if (minLatency) params.append("min_latency", String(minLatency));
        if (showErrors) params.append("has_error", "true");

        const response = await fetch(`/api/traces?${params}`);
        const data = await response.json();
        if (data.success) {
          setTraces(data.traces || []);
        }
      } else if (activeTab === "eval") {
        const response = await fetch("/api/fall/eval/runs");
        const data = await response.json();
        if (data.success) {
          setEvalRuns(data.runs || []);
        }
      } else if (activeTab === "experiments") {
        const response = await fetch("/api/fall/experiments");
        const data = await response.json();
        if (data.success) {
          setExperiments(data.experiments || []);
        }
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, minLatency, showErrors]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Fall Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Observability for your RAG pipeline
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Traces"
          value={traces.length.toString()}
          trend="+12%"
          positive
        />
        <StatCard
          label="Avg Latency"
          value={`${Math.round(traces.reduce((acc, t) => acc + (t.latency?.total_ms || 0), 0) / Math.max(traces.length, 1))}ms`}
          trend="-8%"
          positive
        />
        <StatCard
          label="Error Rate"
          value={`${((traces.filter(t => t.error).length / Math.max(traces.length, 1)) * 100).toFixed(1)}%`}
          trend="-2%"
          positive
        />
        <StatCard
          label="Total Cost"
          value={`$${traces.reduce((acc, t) => acc + (t.cost_usd || 0), 0).toFixed(4)}`}
          trend="+5%"
          positive={false}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {(["traces", "eval", "experiments"] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab === "traces" && "Traces"}
            {tab === "eval" && "Evaluations"}
            {tab === "experiments" && "Experiments"}
          </button>
        ))}
      </div>

      {/* Filters */}
      {activeTab === "traces" && (
        <div className="flex gap-4 mb-6">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="1h">Last hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>

          <input
            type="number"
            placeholder="Min latency (ms)"
            value={minLatency || ""}
            onChange={(e) => setMinLatency(e.target.value ? parseInt(e.target.value) : null)}
            className="px-3 py-2 border rounded-lg text-sm w-36"
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showErrors}
              onChange={(e) => setShowErrors(e.target.checked)}
              className="rounded"
            />
            Show only errors
          </label>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center">
          <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : (
        <>
          {activeTab === "traces" && <TracesTable traces={traces} />}
          {activeTab === "eval" && <EvalTable runs={evalRuns} />}
          {activeTab === "experiments" && <ExperimentsTable experiments={experiments} />}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  positive,
}: {
  label: string;
  value: string;
  trend: string;
  positive: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      <p className={`text-sm mt-1 ${positive ? "text-green-600" : "text-red-600"}`}>
        {trend} vs last period
      </p>
    </div>
  );
}

function TracesTable({ traces }: { traces: Trace[] }) {
  if (traces.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <p className="text-gray-500">No traces found</p>
        <p className="text-sm text-gray-400 mt-1">
          Make some API requests to see traces here
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Query
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Collection
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Latency
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Cost
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Time
            </th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {traces.map((trace) => (
            <tr key={trace.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <span className="text-sm text-gray-900 truncate block max-w-xs">
                  {trace.query?.slice(0, 50)}...
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-gray-600">{trace.collection}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`text-sm font-mono ${
                  (trace.latency?.total_ms || 0) > 500 ? "text-red-600" : "text-gray-600"
                }`}>
                  {trace.latency?.total_ms || 0}ms
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-mono text-gray-600">
                  ${(trace.cost_usd || 0).toFixed(6)}
                </span>
              </td>
              <td className="px-4 py-3">
                {trace.error ? (
                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                    Error
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                    OK
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-gray-500">
                  {new Date(trace.created_at).toLocaleString()}
                </span>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/trace/${trace.id}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvalTable({ runs }: { runs: EvalRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <p className="text-gray-500">No evaluation runs yet</p>
        <p className="text-sm text-gray-400 mt-1">
          Create an evaluation to measure your RAG quality
        </p>
        <button className="mt-4 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">
          Create Evaluation
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Name
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Dataset
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              MRR
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Recall@5
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              NDCG
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
              Time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <span className="text-sm font-medium text-gray-900">{run.name}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-gray-600">{run.dataset}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-mono text-gray-900">
                  {(run.metrics?.mrr || 0).toFixed(3)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-mono text-gray-900">
                  {(run.metrics?.recall_at_5 || 0).toFixed(3)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-mono text-gray-900">
                  {(run.metrics?.ndcg || 0).toFixed(3)}
                </span>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={run.status} />
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-gray-500">
                  {new Date(run.created_at).toLocaleString()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExperimentsTable({ experiments }: { experiments: Experiment[] }) {
  if (experiments.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <p className="text-gray-500">No experiments running</p>
        <p className="text-sm text-gray-400 mt-1">
          Create an A/B test to compare different configurations
        </p>
        <button className="mt-4 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">
          Create Experiment
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {experiments.map((exp) => (
        <div key={exp.id} className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">{exp.name}</h3>
              <p className="text-sm text-gray-500">
                {exp.variants.length} variants • Started{" "}
                {new Date(exp.created_at).toLocaleDateString()}
              </p>
            </div>
            <StatusBadge status={exp.status} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {exp.variants.map((variant) => (
              <div
                key={variant.name}
                className={`p-4 rounded-lg border ${
                  exp.winner === variant.name
                    ? "border-green-500 bg-green-50"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">{variant.name}</span>
                  <span className="text-sm text-gray-500">
                    {variant.traffic_percent}% traffic
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">MRR:</span>{" "}
                    <span className="font-mono">{variant.metrics?.mrr?.toFixed(3) || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">P50:</span>{" "}
                    <span className="font-mono">{variant.metrics?.latency_p50 || "N/A"}ms</span>
                  </div>
                </div>
                {exp.winner === variant.name && (
                  <span className="mt-2 inline-block px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
                    Winner
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    completed: "bg-green-100 text-green-700",
    running: "bg-blue-100 text-blue-700",
    failed: "bg-red-100 text-red-700",
    paused: "bg-yellow-100 text-yellow-700",
  };

  return (
    <span
      className={`px-2 py-1 text-xs rounded-full ${
        colors[status as keyof typeof colors] || "bg-gray-100 text-gray-700"
      }`}
    >
      {status}
    </span>
  );
}
