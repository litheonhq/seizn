"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import { getErrorMessage } from "@/lib/ui-error";

interface TraceDiffProps {
  traceIdA: string;
  traceIdB: string;
  onClose?: () => void;
}

interface DiffData {
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

export function TraceDiff({ traceIdA, traceIdB, onClose }: TraceDiffProps) {
  const requestGuardRef = useRef(createLatestRequestGuard());
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDiff = useCallback(async () => {
    const request = requestGuardRef.current.begin();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/traces/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trace_id_a: traceIdA,
          trace_id_b: traceIdB,
        }),
        signal: request.signal,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(data?.error, "Failed to load diff"));
      }
      if (!requestGuardRef.current.isCurrent(request.id)) {
        return;
      }
      if (data.success) {
        setDiff(data.diff);
      } else {
        setError(getErrorMessage(data.error, "Failed to load diff"));
      }
    } catch (error) {
      if (isAbortError(error) || !requestGuardRef.current.isCurrent(request.id)) {
        return;
      }
      setError(getErrorMessage(error, "Failed to load diff"));
    } finally {
      if (requestGuardRef.current.isCurrent(request.id)) {
        setLoading(false);
      }
      requestGuardRef.current.finish(request.id);
    }
  }, [traceIdA, traceIdB]);

  // Load diff on mount
  useEffect(() => {
    void loadDiff();
  }, [loadDiff]);

  useEffect(() => () => requestGuardRef.current.cancel(), []);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-szn-accent border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-szn-text-2">Comparing traces...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">{error}</p>
        <button
          onClick={loadDiff}
          className="mt-4 px-4 py-2 bg-szn-surface rounded-lg hover:bg-szn-surface-1"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!diff) {
    return null;
  }

  return (
    <div className="bg-szn-card rounded-lg border border-szn-border shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-b border-szn-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-szn-text-1">Trace Comparison</h3>
          <p className="text-sm text-szn-text-2">
            {traceIdA.slice(0, 8)}... vs {traceIdB.slice(0, 8)}...
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-szn-surface-1 rounded-lg"
          >
            <XIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="p-4 border-b border-szn-border bg-szn-bg">
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            label="Results Overlap"
            value={`${diff.results.overlap_percent.toFixed(0)}%`}
            detail={`${diff.results.overlap_count} shared`}
            positive={diff.results.overlap_percent >= 70}
          />
          <SummaryCard
            label="Latency"
            value={`${diff.latency.total_ms.delta > 0 ? "+" : ""}${diff.latency.total_ms.delta}ms`}
            detail={`${diff.latency.total_ms.a}ms → ${diff.latency.total_ms.b}ms`}
            positive={diff.summary.latency_improved}
          />
          <SummaryCard
            label="Cost"
            value={`${diff.cost.delta > 0 ? "+" : ""}$${diff.cost.delta.toFixed(6)}`}
            detail={`$${diff.cost.a.toFixed(6)} → $${diff.cost.b.toFixed(6)}`}
            positive={diff.summary.cost_improved}
          />
          <SummaryCard
            label="Ranking Changes"
            value={`↑${diff.summary.results_improved} ↓${diff.summary.results_degraded}`}
            detail="improved / degraded"
            positive={diff.summary.results_improved > diff.summary.results_degraded}
          />
        </div>
      </div>

      {/* Ranking Changes */}
      <div className="p-4 border-b border-szn-border">
        <h4 className="font-medium text-szn-text-1 mb-3">Ranking Changes</h4>
        <div className="space-y-2">
          {diff.results.ranking_changes.map((change) => (
            <div
              key={change.id}
              className="flex items-center gap-3 p-2 bg-szn-bg rounded-lg"
            >
              <span className="text-sm font-mono text-szn-text-2 w-24 truncate">
                {change.id}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-szn-text-2">#{change.rank_a}</span>
                <ArrowIcon
                  className={`w-4 h-4 ${
                    change.delta > 0
                      ? "text-green-500"
                      : change.delta < 0
                      ? "text-red-500"
                      : "text-szn-text-3"
                  }`}
                />
                <span className="text-sm text-szn-text-2">#{change.rank_b}</span>
              </div>
              {change.delta !== 0 && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                    change.delta > 0
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {change.delta > 0 ? "↑" : "↓"} {Math.abs(change.delta)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Latency Breakdown */}
      <div className="p-4 border-b border-szn-border">
        <h4 className="font-medium text-szn-text-1 mb-3">Latency Breakdown</h4>
        <div className="space-y-3">
          <LatencyBar
            label="Embedding"
            valueA={diff.latency.embedding_ms.a}
            valueB={diff.latency.embedding_ms.b}
          />
          <LatencyBar
            label="Search"
            valueA={diff.latency.search_ms.a}
            valueB={diff.latency.search_ms.b}
          />
          {(diff.latency.rerank_ms.a > 0 || diff.latency.rerank_ms.b > 0) && (
            <LatencyBar
              label="Rerank"
              valueA={diff.latency.rerank_ms.a}
              valueB={diff.latency.rerank_ms.b}
            />
          )}
        </div>
      </div>

      {/* Config Changes */}
      <div className="p-4">
        <h4 className="font-medium text-szn-text-1 mb-3">Config Changes</h4>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(diff.config).map(([key, value]) => (
            <div
              key={key}
              className={`p-2 rounded-lg text-sm ${
                value.changed ? "bg-yellow-50 border border-yellow-200" : "bg-szn-bg"
              }`}
            >
              <span className="font-medium text-szn-text-1">{key}:</span>{" "}
              <span className="text-szn-text-2">
                {String(value.a)} → {String(value.b)}
              </span>
              {value.changed && (
                <span className="ml-2 text-xs text-yellow-600">changed</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  positive,
}: {
  label: string;
  value: string;
  detail: string;
  positive: boolean;
}) {
  return (
    <div className="text-center">
      <p className="text-xs text-szn-text-2 uppercase tracking-wide">{label}</p>
      <p
        className={`text-lg font-bold ${
          positive ? "text-green-600" : "text-red-600"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-szn-text-3">{detail}</p>
    </div>
  );
}

function LatencyBar({
  label,
  valueA,
  valueB,
}: {
  label: string;
  valueA: number;
  valueB: number;
}) {
  const max = Math.max(valueA, valueB, 1);
  const widthA = (valueA / max) * 100;
  const widthB = (valueB / max) * 100;

  return (
    <div>
      <div className="flex justify-between text-xs text-szn-text-2 mb-1">
        <span>{label}</span>
        <span>
          {valueA}ms vs {valueB}ms
        </span>
      </div>
      <div className="flex gap-1">
        <div className="flex-1 bg-szn-surface rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full"
            style={{ width: `${widthA}%` }}
          />
        </div>
        <div className="flex-1 bg-szn-surface rounded-full h-2">
          <div
            className="bg-purple-500 h-2 rounded-full"
            style={{ width: `${widthB}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 8l4 4m0 0l-4 4m4-4H3"
      />
    </svg>
  );
}
