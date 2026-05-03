"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/format-date";

// =============================================================================
// Types
// =============================================================================

interface TrainingMetrics {
  train_loss: number[];
  validation_loss: number[];
  mrr: number[];
  ndcg: number[];
}

interface TrainingRun {
  id: string;
  status: string;
  metrics: TrainingMetrics;
  final_mrr?: number;
  final_ndcg?: number;
  created_at: string;
}

interface AdapterQualityChartProps {
  adapterId: string;
  currentMrr?: number;
}

type MetricType = "mrr" | "ndcg" | "loss";

// =============================================================================
// Component
// =============================================================================

export function AdapterQualityChart({
  adapterId,
  currentMrr,
}: AdapterQualityChartProps) {
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("mrr");
  const [selectedRun, setSelectedRun] = useState<TrainingRun | null>(null);

  useEffect(() => {
    const fetchRuns = async () => {
      try {
        const response = await fetch(`/api/adapters/${adapterId}/train?limit=10`);
        if (!response.ok) throw new Error("Failed to fetch");

        const data = await response.json();
        setRuns(data.runs);
        if (data.runs.length > 0) {
          setSelectedRun(data.runs[0]);
        }
      } catch (err) {
        console.error("Failed to fetch training runs:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRuns();
  }, [adapterId]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (runs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <EmptyChartIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Training Data</h3>
        <p className="text-gray-500">Train your adapter to see quality metrics here.</p>
      </div>
    );
  }

  const getMetricData = (run: TrainingRun) => {
    switch (selectedMetric) {
      case "mrr":
        return run.metrics.mrr;
      case "ndcg":
        return run.metrics.ndcg;
      case "loss":
        return run.metrics.train_loss;
      default:
        return [];
    }
  };

  const selectedData = selectedRun ? getMetricData(selectedRun) : [];
  const maxValue = Math.max(...selectedData, 0.01);
  const minValue = Math.min(...selectedData, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Quality Over Time</h3>
            <p className="text-sm text-gray-500">Training metrics by epoch</p>
          </div>
          {currentMrr !== undefined && (
            <div className="text-right">
              <p className="text-sm text-gray-500">Current MRR</p>
              <p className="text-xl font-bold text-[var(--signal-canon-ink)]">
                {(currentMrr * 100).toFixed(1)}%
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Metric Selector */}
      <div className="px-6 py-3 border-b border-gray-100 flex gap-2">
        {(["mrr", "ndcg", "loss"] as const).map((metric) => (
          <button
            key={metric}
            onClick={() => setSelectedMetric(metric)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              selectedMetric === metric
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {metric.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="px-6 py-4">
        {selectedData.length > 0 ? (
          <div className="relative h-48">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-xs text-gray-500 w-12">
              <span>{formatMetricValue(maxValue, selectedMetric)}</span>
              <span>{formatMetricValue((maxValue + minValue) / 2, selectedMetric)}</span>
              <span>{formatMetricValue(minValue, selectedMetric)}</span>
            </div>

            {/* Chart area */}
            <div className="ml-14 h-full relative">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* Grid lines */}
                <line x1="0" y1="0" x2="100" y2="0" stroke="#e5e7eb" strokeWidth="0.5" />
                <line x1="0" y1="50" x2="100" y2="50" stroke="#e5e7eb" strokeWidth="0.5" />
                <line x1="0" y1="100" x2="100" y2="100" stroke="#e5e7eb" strokeWidth="0.5" />

                {/* Line chart */}
                <polyline
                  points={selectedData
                    .map((value, index) => {
                      const x = (index / (selectedData.length - 1 || 1)) * 100;
                      const y = 100 - ((value - minValue) / (maxValue - minValue || 1)) * 100;
                      return `${x},${y}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke={selectedMetric === "loss" ? "#ef4444" : "#3b82f6"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data points */}
                {selectedData.map((value, index) => {
                  const x = (index / (selectedData.length - 1 || 1)) * 100;
                  const y = 100 - ((value - minValue) / (maxValue - minValue || 1)) * 100;
                  return (
                    <circle
                      key={index}
                      cx={x}
                      cy={y}
                      r="2"
                      fill={selectedMetric === "loss" ? "#ef4444" : "#3b82f6"}
                    />
                  );
                })}
              </svg>

              {/* X-axis labels */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500 -mb-5">
                <span>1</span>
                <span>{Math.ceil(selectedData.length / 2)}</span>
                <span>{selectedData.length}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-gray-500">
            No data for this metric
          </div>
        )}

        {/* X-axis label */}
        <div className="text-center text-xs text-gray-500 mt-6">Epoch</div>
      </div>

      {/* Run Selector */}
      <div className="px-6 py-3 border-t border-gray-100">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Training Run
        </label>
        <select
          value={selectedRun?.id ?? ""}
          onChange={(e) => {
            const run = runs.find((r) => r.id === e.target.value);
            setSelectedRun(run ?? null);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {formatDate(run.created_at)} -{" "}
              {run.status === "completed"
                ? `MRR: ${((run.final_mrr ?? 0) * 100).toFixed(1)}%`
                : run.status}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Stats */}
      {selectedRun && selectedRun.status === "completed" && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Final MRR</p>
              <p className="text-lg font-bold text-[var(--signal-canon-ink)]">
                {((selectedRun.final_mrr ?? 0) * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Final nDCG</p>
              <p className="text-lg font-bold text-blue-600">
                {((selectedRun.final_ndcg ?? 0) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatMetricValue(value: number, metric: MetricType): string {
  if (metric === "loss") {
    return value.toFixed(3);
  }
  return `${(value * 100).toFixed(0)}%`;
}

// =============================================================================
// Sub-components
// =============================================================================

function LoadingSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="h-5 w-32 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-48 bg-gray-200 rounded" />
      </div>
      <div className="px-6 py-4">
        <div className="h-48 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

function EmptyChartIcon({ className }: { className?: string }) {
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
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  );
}

export default AdapterQualityChart;
