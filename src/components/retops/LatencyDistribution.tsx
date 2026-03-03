"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { RetOpsMetrics, TimeSeriesData } from "@/lib/summer/retops/types";

// ============================================
// Types
// ============================================

export interface LatencyDistributionProps {
  metrics: RetOpsMetrics | null;
  timeSeries: TimeSeriesData | null;
  loading?: boolean;
}

interface PercentileBarData {
  name: string;
  value: number;
  color: string;
}

interface LatencyTrendPoint {
  time: string;
  p50: number;
  p99: number;
}

// ============================================
// Constants
// ============================================

const PERCENTILE_COLORS = {
  p50: "var(--szn-success)",
  p75: "#84cc16",
  p90: "#facc15",
  p95: "#f97316",
  p99: "var(--szn-danger)",
  max: "#991b1b",
};

const SLO_THRESHOLD = 500; // 500ms SLO target

// ============================================
// Component
// ============================================

export function LatencyDistribution({
  metrics,
  timeSeries,
  loading,
}: LatencyDistributionProps) {
  // Percentile bar chart data
  const percentileData: PercentileBarData[] = metrics?.latency
    ? [
        { name: "P50", value: metrics.latency.p50, color: PERCENTILE_COLORS.p50 },
        { name: "P75", value: metrics.latency.p75, color: PERCENTILE_COLORS.p75 },
        { name: "P90", value: metrics.latency.p90, color: PERCENTILE_COLORS.p90 },
        { name: "P95", value: metrics.latency.p95, color: PERCENTILE_COLORS.p95 },
        { name: "P99", value: metrics.latency.p99, color: PERCENTILE_COLORS.p99 },
        { name: "Max", value: metrics.latency.max, color: PERCENTILE_COLORS.max },
      ]
    : [];

  // Latency trend data from time series
  const trendData: LatencyTrendPoint[] = timeSeries
    ? timeSeries.timestamps.map((ts, i) => ({
        time: new Date(ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        p50: timeSeries.latencyP50[i] || 0,
        p99: timeSeries.latencyP99[i] || 0,
      }))
    : [];

  // Calculate SLO compliance
  const sloCompliance = trendData.length > 0
    ? (trendData.filter((d) => d.p99 <= SLO_THRESHOLD).length / trendData.length) * 100
    : 100;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-5 w-44 bg-gray-200 rounded mb-4" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Latency Distribution</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">SLO Compliance:</span>
          <span
            className={`text-sm font-semibold ${
              sloCompliance >= 99
                ? "text-green-600"
                : sloCompliance >= 95
                ? "text-yellow-600"
                : "text-red-600"
            }`}
          >
            {sloCompliance.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Percentile Bar Chart */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-3">
            Latency Percentiles
          </h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={percentileData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--szn-border)" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: "var(--szn-text-3)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--szn-border)" }}
                  unit="ms"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "var(--szn-text-3)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--szn-border)" }}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid var(--szn-border)",
                    borderRadius: "8px",
                  }}
                  formatter={(value) => [`${value ?? 0}ms`, "Latency"]}
                />
                <ReferenceLine
                  x={SLO_THRESHOLD}
                  stroke="var(--szn-danger)"
                  strokeDasharray="3 3"
                  label={{
                    value: "SLO",
                    position: "top",
                    fill: "var(--szn-danger)",
                    fontSize: 10,
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {percentileData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Latency Stats */}
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-3">Statistics</h4>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Average"
              value={`${metrics?.latency?.avg || 0}ms`}
              status={
                (metrics?.latency?.avg || 0) <= 200
                  ? "good"
                  : (metrics?.latency?.avg || 0) <= 500
                  ? "warn"
                  : "bad"
              }
            />
            <StatCard
              label="P50 (Median)"
              value={`${metrics?.latency?.p50 || 0}ms`}
              status={
                (metrics?.latency?.p50 || 0) <= 100
                  ? "good"
                  : (metrics?.latency?.p50 || 0) <= 300
                  ? "warn"
                  : "bad"
              }
            />
            <StatCard
              label="P99"
              value={`${metrics?.latency?.p99 || 0}ms`}
              status={
                (metrics?.latency?.p99 || 0) <= SLO_THRESHOLD
                  ? "good"
                  : (metrics?.latency?.p99 || 0) <= 1000
                  ? "warn"
                  : "bad"
              }
            />
            <StatCard
              label="Max"
              value={`${metrics?.latency?.max || 0}ms`}
              status={
                (metrics?.latency?.max || 0) <= 1000
                  ? "good"
                  : (metrics?.latency?.max || 0) <= 2000
                  ? "warn"
                  : "bad"
              }
            />
          </div>
        </div>
      </div>

      {/* Latency Trend */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <h4 className="text-sm font-medium text-gray-600 mb-3">Latency Trend</h4>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--szn-border)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "var(--szn-text-3)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--szn-border)" }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--szn-text-3)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--szn-border)" }}
                unit="ms"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid var(--szn-border)",
                  borderRadius: "8px",
                }}
              />
              <ReferenceLine
                y={SLO_THRESHOLD}
                stroke="var(--szn-danger)"
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke={PERCENTILE_COLORS.p50}
                strokeWidth={2}
                dot={false}
                name="P50"
              />
              <Line
                type="monotone"
                dataKey="p99"
                stroke={PERCENTILE_COLORS.p99}
                strokeWidth={2}
                dot={false}
                name="P99"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Stat Card Component
// ============================================

function StatCard({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "good" | "warn" | "bad";
}) {
  const statusColors = {
    good: "bg-green-50 border-green-200",
    warn: "bg-yellow-50 border-yellow-200",
    bad: "bg-red-50 border-red-200",
  };

  const indicatorColors = {
    good: "bg-green-500",
    warn: "bg-yellow-500",
    bad: "bg-red-500",
  };

  return (
    <div className={`p-3 rounded-lg border ${statusColors[status]}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${indicatorColors[status]}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <span className="text-lg font-semibold text-gray-900">{value}</span>
    </div>
  );
}

export default LatencyDistribution;
