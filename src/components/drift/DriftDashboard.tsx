"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DriftAlertCard } from "./DriftAlertCard";
import { DriftChart } from "./DriftChart";
import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import { getErrorMessage } from "@/lib/ui-error";
import type {
  DriftSnapshot,
  DriftAlert,
  DriftTimeSeries,
  DriftSummary,
} from "@/lib/drift/types";

// ============================================
// Types
// ============================================

export interface DriftDashboardProps {
  /** Collection ID to filter by (optional) */
  collectionId?: string;
  /** Custom class name */
  className?: string;
  /** Auto-refresh interval in seconds (default: 60) */
  refreshInterval?: number;
}

interface DashboardData {
  snapshots: DriftSnapshot[];
  alerts: DriftAlert[];
  timeSeries: DriftTimeSeries | null;
  summary: DriftSummary | null;
  loading: boolean;
  error: string | null;
}

// ============================================
// Component
// ============================================

export function DriftDashboard({
  collectionId,
  className = "",
  refreshInterval = 60,
}: DriftDashboardProps) {
  const requestGuardRef = useRef(createLatestRequestGuard());
  const [data, setData] = useState<DashboardData>({
    snapshots: [],
    alerts: [],
    timeSeries: null,
    summary: null,
    loading: true,
    error: null,
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    const request = requestGuardRef.current.begin();

    try {
      setData((prev) => ({ ...prev, loading: true, error: null }));

      const params = new URLSearchParams();
      if (collectionId) {
        params.append("collectionId", collectionId);
      }
      params.append("limit", "30");

      // Fetch snapshots and alerts in parallel
      const [snapshotsRes, alertsRes] = await Promise.all([
        fetch(`/api/drift/snapshots?${params}`, { signal: request.signal }),
        fetch(`/api/drift/alerts?${params}`, { signal: request.signal }),
      ]);

      const [snapshotsData, alertsData] = await Promise.all([
        snapshotsRes.json(),
        alertsRes.json(),
      ]);

      if (!snapshotsRes.ok || !alertsRes.ok) {
        throw new Error(
          getErrorMessage(
            !snapshotsRes.ok ? snapshotsData?.error : alertsData?.error,
            "Failed to load drift data"
          )
        );
      }

      if (!requestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      // Process snapshots into time series
      const timeSeries: DriftTimeSeries | null =
        snapshotsData.success && snapshotsData.snapshots.length > 0
          ? {
              collectionId: collectionId || "all",
              startDate: snapshotsData.snapshots[snapshotsData.snapshots.length - 1]?.snapshotDate,
              endDate: snapshotsData.snapshots[0]?.snapshotDate,
              points: snapshotsData.snapshots
                .slice()
                .reverse()
                .map((s: DriftSnapshot) => ({
                  date: s.snapshotDate,
                  centroidShift: s.centroidShiftMagnitude,
                  avgScore: s.avgTop1Score,
                  queryEntropy: s.queryEntropy,
                  queryCount: s.queryCount,
                  docCount: s.docCount,
                })),
            }
          : null;

      // Calculate summary from latest snapshot
      let summary: DriftSummary | null = null;
      if (snapshotsData.success && snapshotsData.snapshots.length > 0) {
        const latest = snapshotsData.snapshots[0];
        const prev = snapshotsData.snapshots[1];

        let healthScore = 100;
        if (latest.centroidShiftMagnitude) {
          healthScore -= latest.centroidShiftMagnitude * 200;
        }
        if (latest.scoreChangePct && latest.scoreChangePct < 0) {
          healthScore -= Math.abs(latest.scoreChangePct);
        }
        const criticalCount = (alertsData.alerts || []).filter(
          (a: DriftAlert) => a.severity === "critical" && a.status === "active"
        ).length;
        const warningCount = (alertsData.alerts || []).filter(
          (a: DriftAlert) => a.severity === "warning" && a.status === "active"
        ).length;
        healthScore -= criticalCount * 20;
        healthScore -= warningCount * 10;
        healthScore = Math.max(0, Math.min(100, healthScore));

        let healthStatus: DriftSummary["healthStatus"];
        if (healthScore >= 80) healthStatus = "healthy";
        else if (healthScore >= 60) healthStatus = "warning";
        else if (healthScore >= 40) healthStatus = "degraded";
        else healthStatus = "critical";

        let trend: DriftSummary["trend"] = "stable";
        if (prev?.avgTop1Score && latest.avgTop1Score) {
          const diff = latest.avgTop1Score - prev.avgTop1Score;
          if (diff > 0.02) trend = "improving";
          else if (diff < -0.02) trend = "degrading";
        }

        summary = {
          collectionId: latest.collectionId,
          analysisDate: latest.snapshotDate,
          healthScore,
          healthStatus,
          queryCount: latest.queryCount,
          docCount: latest.docCount,
          avgScore: latest.avgTop1Score || 0,
          centroidShift: latest.centroidShiftMagnitude || 0,
          entropyChange: latest.entropyChangePct || 0,
          scoreChange: latest.scoreChangePct || 0,
          trend,
          activeAlerts: alertsData.activeCount || 0,
        };
      }

      setData({
        snapshots: snapshotsData.success ? snapshotsData.snapshots : [],
        alerts: alertsData.success ? alertsData.alerts : [],
        timeSeries,
        summary,
        loading: false,
        error: null,
      });
      setLastUpdated(new Date());
    } catch (err) {
      if (isAbortError(err) || !requestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      setData((prev) => ({
        ...prev,
        loading: false,
        error: getErrorMessage(err, "Failed to load drift data"),
      }));
    } finally {
      requestGuardRef.current.finish(request.id);
    }
  }, [collectionId]);

  // Trigger manual analysis
  const handleAnalyze = async () => {
    if (!collectionId) {
      return;
    }

    try {
      setAnalyzing(true);
      const res = await fetch("/api/drift/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId }),
      });
      const result = await res.json();
      if (result.success) {
        // Refresh data after analysis
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to analyze drift:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Handle alert acknowledge
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const res = await fetch(`/api/drift/alerts/${alertId}/acknowledge`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
    }
  };

  // Initial load
  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const interval = setInterval(() => {
      void fetchData();
    }, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [refreshInterval, fetchData]);

  useEffect(() => () => requestGuardRef.current.cancel(), []);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Drift Radar</h2>
          <p className="text-sm text-gray-500 mt-1">
            Embedding distribution drift monitoring
            {lastUpdated && (
              <span className="ml-2">
                - Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Analyze Button */}
          {collectionId && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {analyzing ? "Analyzing..." : "Analyze Now"}
            </button>
          )}

          {/* Refresh Button */}
          <button
            onClick={fetchData}
            disabled={data.loading}
            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshIcon className={`w-5 h-5 ${data.loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Error Message */}
      {data.error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-700">{data.error}</p>
        </div>
      )}

      {/* Health Summary */}
      {data.summary && <HealthSummary summary={data.summary} loading={data.loading} />}

      {/* Drift Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Drift Trends</h3>
        <DriftChart timeSeries={data.timeSeries} loading={data.loading} height={200} />
      </div>

      {/* Alerts */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-4">
          Active Alerts ({data.alerts.filter((a) => a.status === "active").length})
        </h3>
        {data.loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-20 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : data.alerts.filter((a) => a.status === "active").length === 0 ? (
          <div className="text-center py-8">
            <HealthyIcon className="w-12 h-12 mx-auto text-green-500" />
            <p className="text-sm text-gray-500 mt-2">No active drift alerts</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.alerts
              .filter((a) => a.status === "active")
              .slice(0, 5)
              .map((alert) => (
                <DriftAlertCard
                  key={alert.id}
                  alert={alert}
                  onAcknowledge={handleAcknowledgeAlert}
                />
              ))}
          </div>
        )}
      </div>

      {/* Recent Snapshots */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Recent Snapshots</h3>
        {data.loading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        ) : data.snapshots.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No snapshots collected yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-500">Date</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-500">Queries</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-500">Docs</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-500">Avg Score</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-500">Drift</th>
                </tr>
              </thead>
              <tbody>
                {data.snapshots.slice(0, 7).map((snapshot) => (
                  <tr key={snapshot.id} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-900">{snapshot.snapshotDate}</td>
                    <td className="py-2 px-2 text-right text-gray-600">
                      {snapshot.queryCount.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-600">
                      {snapshot.docCount.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-600">
                      {snapshot.avgTop1Score?.toFixed(3) ?? "-"}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <DriftBadge value={snapshot.centroidShiftMagnitude} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Health Summary Component
// ============================================

function HealthSummary({
  summary,
  loading,
}: {
  summary: DriftSummary;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse h-24 bg-gray-100 rounded-lg" />
        ))}
      </div>
    );
  }

  const healthColors = {
    healthy: "bg-green-50 border-green-200 text-green-700",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-700",
    degraded: "bg-orange-50 border-orange-200 text-orange-700",
    critical: "bg-red-50 border-red-200 text-red-700",
  };

  const trendIcons = {
    improving: "text-green-500",
    stable: "text-gray-500",
    degrading: "text-red-500",
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Health Score */}
      <div className={`rounded-lg border p-4 ${healthColors[summary.healthStatus]}`}>
        <p className="text-xs font-medium opacity-70">Health Score</p>
        <p className="text-2xl font-bold mt-1">{summary.healthScore.toFixed(0)}</p>
        <p className="text-xs capitalize mt-1">{summary.healthStatus}</p>
      </div>

      {/* Avg Score */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium text-gray-500">Avg Score</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">
          {summary.avgScore.toFixed(3)}
        </p>
        <p className={`text-xs mt-1 flex items-center gap-1 ${trendIcons[summary.trend]}`}>
          <TrendArrow trend={summary.trend} />
          {summary.trend}
        </p>
      </div>

      {/* Centroid Shift */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium text-gray-500">Centroid Shift</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">
          {(summary.centroidShift * 100).toFixed(1)}%
        </p>
        <p className="text-xs text-gray-500 mt-1">From previous</p>
      </div>

      {/* Active Alerts */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs font-medium text-gray-500">Active Alerts</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{summary.activeAlerts}</p>
        <p className="text-xs text-gray-500 mt-1">
          {summary.queryCount.toLocaleString()} queries
        </p>
      </div>
    </div>
  );
}

// ============================================
// Drift Badge Component
// ============================================

function DriftBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) {
    return <span className="text-gray-400">-</span>;
  }

  const pct = value * 100;
  let colorClass = "bg-green-100 text-green-700";
  if (pct >= 10) {
    colorClass = "bg-red-100 text-red-700";
  } else if (pct >= 5) {
    colorClass = "bg-yellow-100 text-yellow-700";
  }

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {pct.toFixed(1)}%
    </span>
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

function HealthyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function TrendArrow({ trend }: { trend: "improving" | "stable" | "degrading" }) {
  if (trend === "improving") {
    return (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    );
  }
  if (trend === "degrading") {
    return (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    );
  }
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
    </svg>
  );
}

export default DriftDashboard;
