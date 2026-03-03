"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { RetrievalStats, TimeSeriesData } from "@/lib/summer/retops/types";

// ============================================
// Types
// ============================================

export interface QueryVolumeChartProps {
  stats: RetrievalStats | null;
  timeSeries: TimeSeriesData | null;
  loading?: boolean;
}

interface ChartDataPoint {
  timestamp: string;
  time: string;
  qps: number;
  errorRate: number;
}

// ============================================
// Component
// ============================================

export function QueryVolumeChart({
  stats,
  timeSeries,
  loading,
}: QueryVolumeChartProps) {
  // Transform time series data for the chart
  const chartData: ChartDataPoint[] = timeSeries
    ? timeSeries.timestamps.map((ts, i) => ({
        timestamp: ts,
        time: new Date(ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        qps: timeSeries.qps[i] || 0,
        errorRate: (timeSeries.errorRate[i] || 0) * 100,
      }))
    : [];

  // Search type distribution data
  const searchTypeData = stats?.searchTypes
    ? [
        { name: "Hybrid", value: stats.searchTypes.hybrid, color: "var(--szn-accent-2)" },
        { name: "Vector", value: stats.searchTypes.vector, color: "var(--szn-success)" },
        { name: "Keyword", value: stats.searchTypes.keyword, color: "var(--szn-warning)" },
        { name: "Federated", value: stats.searchTypes.federated, color: "var(--szn-chart-5)" },
      ]
    : [];

  const totalSearches =
    searchTypeData.reduce((sum, item) => sum + item.value, 0) || 1;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Query Volume</h3>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>Peak: {stats?.queryVolume?.peakQps?.toFixed(2) || 0} QPS</span>
          <span>Avg: {stats?.queryVolume?.avgQps?.toFixed(2) || 0} QPS</span>
        </div>
      </div>

      {/* Line Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--szn-border)" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 12, fill: "var(--szn-text-3)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--szn-border)" }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12, fill: "var(--szn-text-3)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--szn-border)" }}
              label={{
                value: "QPS",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "var(--szn-text-3)" },
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12, fill: "var(--szn-text-3)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--szn-border)" }}
              label={{
                value: "Error %",
                angle: 90,
                position: "insideRight",
                style: { fontSize: 12, fill: "var(--szn-text-3)" },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid var(--szn-border)",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              }}
              labelStyle={{ color: "#111827", fontWeight: 600 }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="qps"
              stroke="var(--szn-accent-2)"
              strokeWidth={2}
              dot={false}
              name="QPS"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="errorRate"
              stroke="var(--szn-danger)"
              strokeWidth={2}
              dot={false}
              name="Error Rate (%)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Search Type Distribution */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <h4 className="text-sm font-medium text-gray-700 mb-3">
          Search Type Distribution
        </h4>
        <div className="flex items-center gap-4">
          {searchTypeData.map((item) => (
            <div key={item.name} className="flex-1">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">{item.name}</span>
                <span className="font-medium text-gray-900">
                  {((item.value / totalSearches) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(item.value / totalSearches) * 100}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default QueryVolumeChart;
