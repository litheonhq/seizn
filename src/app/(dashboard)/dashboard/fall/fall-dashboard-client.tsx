"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ShareTraceModal } from "@/components/dashboard/ShareTraceModal";
import { formatDate } from "@/lib/format-date";

type TabType = "traces" | "eval" | "experiments";

// Onboarding Checklist Component
interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

function OnboardingChecklist({
  steps,
  onDismiss,
  onRunSample,
}: {
  steps: OnboardingStep[];
  onDismiss: () => void;
  onRunSample: () => void;
}) {
  const completedCount = steps.filter((s) => s.completed).length;
  const progress = (completedCount / steps.length) * 100;
  const allComplete = completedCount === steps.length;

  if (allComplete) {
    return null;
  }

  return (
    <div className="mb-8 bg-[var(--ink-900)]/10 border border-[var(--ink-900)]/20 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--ink-900)]/10 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--ink-900)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-[var(--ink-900)]">Getting Started</h3>
            <p className="text-sm text-[var(--ink-600)]">{completedCount}/{steps.length} steps completed</p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-[var(--ink-500)] hover:text-[var(--ink-600)]"
          title="Dismiss"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-[var(--ink-900)]/10 rounded-full mb-6">
        <div
          className="h-full bg-[var(--ink-900)] rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`p-4 rounded-lg border transition-all ${
              step.completed
                ? "bg-[var(--ink-900)]/5 border-[var(--ink-900)]/20"
                : "bg-[var(--ink-0)] border-[var(--ink-200)] hover:border-[var(--ink-900)]/30"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step.completed
                    ? "bg-[var(--ink-900)] text-white"
                    : "bg-gray-200 text-[var(--ink-600)]"
                }`}
              >
                {step.completed ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <div className="flex-1">
                <h4 className={`font-medium text-sm ${step.completed ? "text-[var(--signal-canon)]" : "text-[var(--ink-900)]"}`}>
                  {step.title}
                </h4>
                <p className="text-xs text-[var(--ink-600)] mt-0.5">{step.description}</p>
                {!step.completed && step.action && (
                  step.action.href ? (
                    <Link
                      href={step.action.href}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--ink-900)] hover:text-[var(--ink-900)] font-medium"
                    >
                      {step.action.label}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ) : (
                    <button
                      onClick={step.action.onClick}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--ink-900)] hover:text-[var(--ink-900)] font-medium"
                    >
                      {step.action.label}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      </svg>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick action */}
      <div className="mt-4 pt-4 border-t border-[var(--ink-900)]/20">
        <button
          onClick={onRunSample}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--ink-900)] hover:bg-[var(--ink-900)]/90 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Run Sample Retrieve (generates trace instantly)
        </button>
      </div>
    </div>
  );
}

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
  const [shareModalTraceId, setShareModalTraceId] = useState<string | null>(null);

  // Onboarding state
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [runningSample, setRunningSample] = useState(false);

  // Filters
  const [dateRange, setDateRange] = useState("7d");
  const [minLatency, setMinLatency] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // Check if onboarding was previously dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem("seizn_onboarding_dismissed");
    if (dismissed === "true") {
      setOnboardingDismissed(true);
    }
  }, []);

  // Onboarding steps - dynamically computed based on state
  const onboardingSteps: OnboardingStep[] = [
    {
      id: "api-key",
      title: "Get API Key",
      description: "Generate your first API key",
      completed: true, // Assume they have one if they're logged in
      action: { label: "View Keys", href: "/dashboard/settings/api-keys" },
    },
    {
      id: "first-trace",
      title: "Run First Query",
      description: "Execute a retrieve call to generate a trace",
      completed: traces.length > 0,
      action: { label: "Try Demo", href: "/" },
    },
    {
      id: "view-trace",
      title: "Inspect a Trace",
      description: "Click into a trace to see the full timeline",
      completed: traces.length > 0, // Will be marked complete when they view one
      action: traces.length > 0
        ? { label: "View Trace", href: `/trace/${traces[0]?.id}` }
        : undefined,
    },
  ];

  // Handle onboarding dismiss
  const handleDismissOnboarding = useCallback(() => {
    setOnboardingDismissed(true);
    localStorage.setItem("seizn_onboarding_dismissed", "true");
  }, []);

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

  // Run sample trace handler
  const handleRunSample = useCallback(async () => {
    setRunningSample(true);
    try {
      const response = await fetch("/api/summer/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection_id: "tech-docs",
          query: "How to authenticate API requests with Bearer tokens?",
          top_k: 5,
          autopilot: { enabled: true, budget_ms: 500 },
          hybrid: true,
          rerank: true,
        }),
      });

      if (response.ok) {
        // Reload traces to show the new one
        await loadData();
      }
    } catch (error) {
      console.error("Failed to run sample:", error);
    } finally {
      setRunningSample(false);
    }
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--ink-900)]">Fall Dashboard</h1>
        <p className="text-[var(--ink-600)] mt-1">
          Observability for your RAG pipeline
        </p>
      </div>

      {/* Onboarding Checklist */}
      {!onboardingDismissed && !loading && (
        <OnboardingChecklist
          steps={onboardingSteps}
          onDismiss={handleDismissOnboarding}
          onRunSample={handleRunSample}
        />
      )}

      {/* Sample Running Indicator */}
      {runningSample && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
          <span className="text-blue-700 text-sm font-medium">
            Running sample retrieve query... This will generate a trace.
          </span>
        </div>
      )}

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
      <div className="flex gap-1 mb-6 bg-[var(--ink-50)] rounded-lg p-1 w-fit">
        {(["traces", "eval", "experiments"] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-[var(--ink-0)] text-[var(--ink-900)] shadow-sm"
                : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
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
          <div className="animate-spin w-6 h-6 border-2 border-[var(--ink-900)] border-t-transparent rounded-full mx-auto" />
        </div>
      ) : (
        <>
          {activeTab === "traces" && (
            <TracesTable
              traces={traces}
              onShare={(traceId) => setShareModalTraceId(traceId)}
            />
          )}
          {activeTab === "eval" && <EvalTable runs={evalRuns} />}
          {activeTab === "experiments" && <ExperimentsTable experiments={experiments} />}
        </>
      )}

      {/* Share Modal */}
      {shareModalTraceId && (
        <ShareTraceModal
          traceId={shareModalTraceId}
          onClose={() => setShareModalTraceId(null)}
        />
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
    <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-4">
      <p className="text-sm text-[var(--ink-600)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--ink-900)] mt-1">{value}</p>
      <p className={`text-sm mt-1 ${positive ? "text-[var(--signal-canon-ink)]" : "text-[var(--signal-conflict-ink)]"}`}>
        {trend} vs last period
      </p>
    </div>
  );
}

function TracesTable({ traces, onShare }: { traces: Trace[]; onShare: (traceId: string) => void }) {
  if (traces.length === 0) {
    return (
      <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-8 text-center">
        <p className="text-[var(--ink-600)]">No traces found</p>
        <p className="text-sm text-[var(--ink-500)] mt-1">
          Make some API requests to see traces here
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] overflow-hidden">
      <table className="w-full">
        <thead className="bg-[var(--ink-50)] border-b border-[var(--ink-200)]">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              Query
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              Collection
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              Latency
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              Cost
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              Status
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              Time
            </th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ink-200)]">
          {traces.map((trace) => (
            <tr key={trace.id} className="hover:bg-[var(--ink-50)]">
              <td className="px-4 py-3">
                <span className="text-sm text-[var(--ink-900)] truncate block max-w-xs">
                  {trace.query?.slice(0, 50)}...
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-[var(--ink-600)]">{trace.collection}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`text-sm font-mono ${
                  (trace.latency?.total_ms || 0) > 500 ? "text-[var(--signal-conflict-ink)]" : "text-[var(--ink-600)]"
                }`}>
                  {trace.latency?.total_ms || 0}ms
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-mono text-[var(--ink-600)]">
                  ${(trace.cost_usd || 0).toFixed(6)}
                </span>
              </td>
              <td className="px-4 py-3">
                {trace.error ? (
                  <span className="px-2 py-1 bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)] text-xs rounded-full">
                    Error
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-[var(--signal-canon-soft)] text-[var(--signal-canon-ink)] text-xs rounded-full">
                    OK
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-[var(--ink-600)]">
                  {new Date(trace.created_at).toLocaleString()}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/trace/${trace.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => onShare(trace.id)}
                    className="text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)] flex items-center gap-1"
                    title="Share trace"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                      />
                    </svg>
                    Share
                  </button>
                </div>
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
      <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-8 text-center">
        <p className="text-[var(--ink-600)]">No evaluation runs yet</p>
        <p className="text-sm text-[var(--ink-500)] mt-1">
          Create an evaluation to measure your RAG quality
        </p>
        <button className="mt-4 px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90">
          Create Evaluation
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] overflow-hidden">
      <table className="w-full">
        <thead className="bg-[var(--ink-50)] border-b border-[var(--ink-200)]">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              Name
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              Dataset
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              MRR
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              Recall@5
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              NDCG
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              Status
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-[var(--ink-600)] uppercase">
              Time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ink-200)]">
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-[var(--ink-50)]">
              <td className="px-4 py-3">
                <span className="text-sm font-medium text-[var(--ink-900)]">{run.name}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-[var(--ink-600)]">{run.dataset}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-mono text-[var(--ink-900)]">
                  {(run.metrics?.mrr || 0).toFixed(3)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-mono text-[var(--ink-900)]">
                  {(run.metrics?.recall_at_5 || 0).toFixed(3)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-mono text-[var(--ink-900)]">
                  {(run.metrics?.ndcg || 0).toFixed(3)}
                </span>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={run.status} />
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-[var(--ink-600)]">
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
      <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-8 text-center">
        <p className="text-[var(--ink-600)]">No experiments running</p>
        <p className="text-sm text-[var(--ink-500)] mt-1">
          Create an A/B test to compare different configurations
        </p>
        <button className="mt-4 px-4 py-2 bg-[var(--ink-900)] text-white rounded-lg hover:bg-[var(--ink-900)]/90">
          Create Experiment
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {experiments.map((exp) => (
        <div key={exp.id} className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-[var(--ink-900)]">{exp.name}</h3>
              <p className="text-sm text-[var(--ink-600)]">
                {exp.variants.length} variants • Started{" "}
                {formatDate(exp.created_at)}
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
                    ? "border-[var(--signal-canon)] bg-[var(--signal-canon-soft)]"
                    : "border-[var(--ink-200)]"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-[var(--ink-900)]">{variant.name}</span>
                  <span className="text-sm text-[var(--ink-600)]">
                    {variant.traffic_percent}% traffic
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-[var(--ink-600)]">MRR:</span>{" "}
                    <span className="font-mono">{variant.metrics?.mrr?.toFixed(3) || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-[var(--ink-600)]">P50:</span>{" "}
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
    completed: "bg-[var(--signal-canon-soft)] text-[var(--signal-canon-ink)]",
    running: "bg-blue-100 text-blue-700",
    failed: "bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)]",
    paused: "bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)]",
  };

  return (
    <span
      className={`px-2 py-1 text-xs rounded-full ${
        colors[status as keyof typeof colors] || "bg-[var(--ink-50)] text-[var(--ink-900)]"
      }`}
    >
      {status}
    </span>
  );
}
