"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { QualityMetrics, QualityTrendPoint } from "@/lib/summer/retops/types";
import { formatDate } from "@/lib/format-date";

// ============================================
// Types
// ============================================

export interface QualityTrendProps {
  quality: QualityMetrics | null;
  trend: QualityTrendPoint[];
  loading?: boolean;
}

// ============================================
// Component
// ============================================

export function QualityTrend({ quality, trend, loading }: QualityTrendProps) {
  // Transform trend data for chart
  const chartData = trend.map((point) => ({
    date: formatDate(point.timestamp, "compact"),
    mrr: point.mrr * 100,
    ndcg: point.ndcg * 100,
    groundedness: (point.groundedness || 0) * 100,
  }));

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-5 w-36 bg-gray-200 rounded mb-4" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Search Quality Trend</h3>

        {/* Quality Metrics Summary */}
        <div className="flex items-center gap-6">
          <QualityIndicator
            label="MRR"
            value={(quality?.mrr || 0) * 100}
            target={75}
          />
          <QualityIndicator
            label="nDCG"
            value={(quality?.ndcg || 0) * 100}
            target={70}
          />
          <QualityIndicator
            label="Groundedness"
            value={(quality?.groundedness || 0) * 100}
            target={85}
          />
        </div>
      </div>

      {/* Area Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--szn-accent-2)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--szn-accent-2)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ndcgGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--szn-success)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--szn-success)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="groundednessGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--szn-warning)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--szn-warning)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--szn-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: "var(--szn-text-3)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--szn-border)" }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: "var(--szn-text-3)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--szn-border)" }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid var(--szn-border)",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              }}
              formatter={(value) => [`${((value as number) ?? 0).toFixed(1)}%`]}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="mrr"
              stroke="var(--szn-accent-2)"
              strokeWidth={2}
              fill="url(#mrrGradient)"
              name="MRR"
            />
            <Area
              type="monotone"
              dataKey="ndcg"
              stroke="var(--szn-success)"
              strokeWidth={2}
              fill="url(#ndcgGradient)"
              name="nDCG"
            />
            <Area
              type="monotone"
              dataKey="groundedness"
              stroke="var(--szn-warning)"
              strokeWidth={2}
              fill="url(#groundednessGradient)"
              name="Groundedness"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Precision/Recall at K */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="grid grid-cols-2 gap-6">
          {/* Precision at K */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Precision @ K</h4>
            <div className="space-y-2">
              {quality?.precisionAtK && (
                <>
                  <ProgressBar label="P@1" value={quality.precisionAtK.p1 * 100} />
                  <ProgressBar label="P@3" value={quality.precisionAtK.p3 * 100} />
                  <ProgressBar label="P@5" value={quality.precisionAtK.p5 * 100} />
                  <ProgressBar label="P@10" value={quality.precisionAtK.p10 * 100} />
                </>
              )}
            </div>
          </div>

          {/* Recall at K */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Recall @ K</h4>
            <div className="space-y-2">
              {quality?.recallAtK && (
                <>
                  <ProgressBar label="R@1" value={quality.recallAtK.r1 * 100} color="green" />
                  <ProgressBar label="R@3" value={quality.recallAtK.r3 * 100} color="green" />
                  <ProgressBar label="R@5" value={quality.recallAtK.r5 * 100} color="green" />
                  <ProgressBar label="R@10" value={quality.recallAtK.r10 * 100} color="green" />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Rerank Improvement */}
      {quality?.rerankImprovement && quality.rerankImprovement > 0 && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2">
            <RerankIcon className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-blue-800">
              Reranking improved results by{" "}
              <span className="font-semibold">
                {(quality.rerankImprovement * 100).toFixed(1)}%
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Quality Indicator Component
// ============================================

function QualityIndicator({
  label,
  value,
  target,
}: {
  label: string;
  value: number;
  target: number;
}) {
  const isAboveTarget = value >= target;

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-3 h-3 rounded-full ${
          isAboveTarget ? "bg-green-500" : "bg-yellow-500"
        }`}
      />
      <span className="text-sm text-gray-600">{label}:</span>
      <span
        className={`text-sm font-semibold ${
          isAboveTarget ? "text-green-600" : "text-yellow-600"
        }`}
      >
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

// ============================================
// Progress Bar Component
// ============================================

function ProgressBar({
  label,
  value,
  color = "indigo",
}: {
  label: string;
  value: number;
  color?: "indigo" | "green";
}) {
  const colorClasses = {
    indigo: "bg-indigo-500",
    green: "bg-green-500",
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-8">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClasses[color]}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 w-12 text-right">
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

// ============================================
// Icons
// ============================================

function RerankIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
      />
    </svg>
  );
}

export default QualityTrend;
