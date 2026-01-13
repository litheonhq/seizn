"use client";

import { useState, useEffect, useCallback } from "react";
import { MetricsOverview } from "./MetricsOverview";
import { QueryVolumeChart } from "./QueryVolumeChart";
import { LatencyDistribution } from "./LatencyDistribution";
import { QualityTrend } from "./QualityTrend";
import { TopQueries } from "./TopQueries";
import { AlertsPanel } from "./AlertsPanel";
import { DriftDashboard } from "@/components/drift";
import type {
  RetOpsMetrics,
  RetrievalStats,
  QualityMetrics,
  QualityTrendPoint,
  TimeSeriesData,
  RetOpsAlert,
  TimePeriod,
} from "@/lib/summer/retops/types";

// ============================================
// Types
// ============================================

type DashboardTab = "overview" | "drift";

export interface RetOpsDashboardProps {
  /** Collection ID to filter by (optional) */
  collectionId?: string;
  /** Custom class name */
  className?: string;
  /** Auto-refresh interval in seconds (default: 30) */
  refreshInterval?: number;
}

interface DashboardData {
  metrics: RetOpsMetrics | null;
  stats: RetrievalStats | null;
  quality: QualityMetrics | null;
  qualityTrend: QualityTrendPoint[];
  timeSeries: TimeSeriesData | null;
  alerts: RetOpsAlert[];
  loading: boolean;
  error: string | null;
}

// ============================================
// Component
// ============================================

export function RetOpsDashboard({
  collectionId,
  className = "",
  refreshInterval = 30,
}: RetOpsDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [period, setPeriod] = useState<TimePeriod>("24h");
  const [data, setData] = useState<DashboardData>({
    metrics: null,
    stats: null,
    quality: null,
    qualityTrend: [],
    timeSeries: null,
    alerts: [],
    loading: true,
    error: null,
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    try {
      setData(prev => ({ ...prev, loading: true, error: null }));

      const params = new URLSearchParams({ period });
      if (collectionId) {
        params.append("collectionId", collectionId);
      }

      // Fetch all data in parallel
      const [metricsRes, statsRes, qualityRes, alertsRes] = await Promise.all([
        fetch(`/api/summer/retops/metrics?${params}`),
        fetch(`/api/summer/retops/stats?${params}`),
        fetch(`/api/summer/retops/quality?${params}&includeTrend=true`),
        fetch(`/api/summer/retops/alerts?limit=10`),
      ]);

      const [metricsData, statsData, qualityData, alertsData] = await Promise.all([
        metricsRes.json(),
        statsRes.json(),
        qualityRes.json(),
        alertsRes.json(),
      ]);

      setData({
        metrics: metricsData.success ? metricsData.metrics : null,
        stats: statsData.success ? statsData.stats : null,
        quality: qualityData.success ? qualityData.quality : null,
        qualityTrend: qualityData.success ? qualityData.trend || [] : [],
        timeSeries: metricsData.success ? metricsData.timeSeries : null,
        alerts: alertsData.success ? alertsData.alerts : [],
        loading: false,
        error: null,
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch RetOps data:", err);
      setData(prev => ({
        ...prev,
        loading: false,
        error: "Failed to load dashboard data",
      }));
    }
  }, [period, collectionId]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const interval = setInterval(fetchData, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [refreshInterval, fetchData]);

  // Handle alert acknowledge
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const res = await fetch(`/api/summer/retops/alerts/${alertId}/acknowledge`, {
        method: "POST",
      });
      if (res.ok) {
        // Refresh alerts
        const alertsRes = await fetch("/api/summer/retops/alerts?limit=10");
        const alertsData = await alertsRes.json();
        if (alertsData.success) {
          setData(prev => ({ ...prev, alerts: alertsData.alerts }));
        }
      }
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
    }
  };

  // Period selector options
  const periodOptions: { value: TimePeriod; label: string }[] = [
    { value: "1h", label: "Last Hour" },
    { value: "6h", label: "Last 6 Hours" },
    { value: "24h", label: "Last 24 Hours" },
    { value: "7d", label: "Last 7 Days" },
    { value: "30d", label: "Last 30 Days" },
  ];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">RetOps Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Retrieval Operations Monitoring
            {lastUpdated && activeTab === "overview" && (
              <span className="ml-2">
                - Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab Selector */}
          <div className="flex rounded-lg border border-gray-300 bg-white overflow-hidden">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "overview"
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("drift")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "drift"
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              Drift Radar
            </button>
          </div>

          {/* Period Selector (only for overview) */}
          {activeTab === "overview" && (
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as TimePeriod)}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {periodOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {/* Refresh Button (only for overview) */}
          {activeTab === "overview" && (
            <button
              onClick={fetchData}
              disabled={data.loading}
              className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <RefreshIcon className={`w-5 h-5 ${data.loading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" ? (
        <>
          {/* Error Message */}
          {data.error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">{data.error}</p>
            </div>
          )}

          {/* Metrics Overview */}
          <MetricsOverview metrics={data.metrics} loading={data.loading} />

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Query Volume Chart */}
            <QueryVolumeChart
              stats={data.stats}
              timeSeries={data.timeSeries}
              loading={data.loading}
            />

            {/* Latency Distribution */}
            <LatencyDistribution
              metrics={data.metrics}
              timeSeries={data.timeSeries}
              loading={data.loading}
            />
          </div>

          {/* Quality Trend */}
          <QualityTrend
            quality={data.quality}
            trend={data.qualityTrend}
            loading={data.loading}
          />

          {/* Bottom Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Queries */}
            <TopQueries
              queries={data.stats?.topQueries || []}
              loading={data.loading}
            />

            {/* Alerts Panel */}
            <AlertsPanel
              alerts={data.alerts}
              loading={data.loading}
              onAcknowledge={handleAcknowledgeAlert}
            />
          </div>
        </>
      ) : (
        /* Drift Radar Dashboard */
        <DriftDashboard collectionId={collectionId} />
      )}
    </div>
  );
}

// ============================================
// Icons
// ============================================

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

export default RetOpsDashboard;
