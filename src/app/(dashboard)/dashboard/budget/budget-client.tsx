"use client";

import { useState, useEffect, useCallback } from "react";
import { BudgetSettings } from "@/components/budget-planner/BudgetSettings";
import type { BudgetSettings as BudgetSettingsType } from "@/lib/budget-planner/types";

// ============================================
// Types
// ============================================

interface UsageStats {
  dailyUsedUsd: number;
  monthlyUsedUsd: number;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  todayQueries: number;
  monthQueries: number;
  degradeEvents: number;
  lastDegradeReason: string | null;
}

interface DegradeEvent {
  id: string;
  timestamp: string;
  reason: string;
  originalConfig: Record<string, unknown>;
  degradedConfig: Record<string, unknown>;
  costSaved: number;
}

// ============================================
// Icons
// ============================================

const DollarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ChartIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const AlertTriangleIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

// ============================================
// Component
// ============================================

export function BudgetDashboardClient() {
  const [settings, setSettings] = useState<BudgetSettingsType | null>(null);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [degradeEvents, setDegradeEvents] = useState<DegradeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current settings and usage stats
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [settingsRes, statsRes, eventsRes] = await Promise.all([
        fetch("/api/budget/settings"),
        fetch("/api/budget/stats"),
        fetch("/api/budget/degrade-events?limit=10"),
      ]);

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (settingsData.success) {
          setSettings(settingsData.settings);
        }
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.success) {
          setStats(statsData.stats);
        }
      }

      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        if (eventsData.success) {
          setDegradeEvents(eventsData.events || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch budget data:", err);
      setError("Failed to load budget data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveSettings = async (newSettings: BudgetSettingsType) => {
    const response = await fetch("/api/budget/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSettings),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to save settings");
    }

    setSettings(newSettings);
    fetchData(); // Refresh stats
  };

  // Calculate percentages
  const dailyPercent = stats
    ? Math.min(100, (stats.dailyUsedUsd / stats.dailyBudgetUsd) * 100)
    : 0;
  const monthlyPercent = stats
    ? Math.min(100, (stats.monthlyUsedUsd / stats.monthlyBudgetUsd) * 100)
    : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Budget & Cost Controls</h1>
        <p className="text-gray-500 mt-1">
          Manage spending limits, alerts, and automatic cost optimization
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Daily Usage */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <DollarIcon className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-600">Today&apos;s Spend</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(stats.dailyUsedUsd)}
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{dailyPercent.toFixed(1)}% of daily limit</span>
                <span>{formatCurrency(stats.dailyBudgetUsd)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    dailyPercent > 90 ? "bg-red-500" : dailyPercent > 70 ? "bg-yellow-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${dailyPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Monthly Usage */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <ChartIcon className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-gray-600">Monthly Spend</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(stats.monthlyUsedUsd)}
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{monthlyPercent.toFixed(1)}% of monthly limit</span>
                <span>{formatCurrency(stats.monthlyBudgetUsd)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    monthlyPercent > 90 ? "bg-red-500" : monthlyPercent > 70 ? "bg-yellow-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${monthlyPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Query Count */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <ChartIcon className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-gray-600">API Calls</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.todayQueries.toLocaleString()}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {stats.monthQueries.toLocaleString()} this month
            </p>
          </div>

          {/* Degrade Events */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${stats.degradeEvents > 0 ? "bg-yellow-100" : "bg-green-100"}`}>
                <ShieldIcon className={`w-5 h-5 ${stats.degradeEvents > 0 ? "text-yellow-600" : "text-green-600"}`} />
              </div>
              <span className="text-sm font-medium text-gray-600">Auto-Degrades</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.degradeEvents}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {stats.lastDegradeReason || "No recent degrades"}
            </p>
          </div>
        </div>
      )}

      {/* Degrade Warning Banner */}
      {stats && stats.degradeEvents > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-yellow-800">Budget Protection Active</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Your queries are being automatically optimized to stay within budget.
              This may reduce result quality. Consider increasing your budget limits.
            </p>
          </div>
        </div>
      )}

      {/* Settings Form */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Budget Settings</h2>
        <BudgetSettings
          initialSettings={settings || undefined}
          onSave={handleSaveSettings}
        />
      </div>

      {/* Recent Degrade Events */}
      {degradeEvents.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Degrade Events</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Changes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Saved
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {degradeEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {event.reason}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {JSON.stringify(event.degradedConfig)}
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                      {formatCurrency(event.costSaved)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
        <h3 className="font-medium text-gray-900 mb-2">How Budget-Aware Retrieval Works</h3>
        <ul className="text-sm text-gray-600 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold">1.</span>
            <span>When approaching budget limits, Seizn automatically optimizes your queries</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold">2.</span>
            <span>Optimizations include: disabling rerank, reducing topK, using cache-first</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold">3.</span>
            <span>In &quot;hard&quot; mode, queries exceeding budget are rejected entirely</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold">4.</span>
            <span>All degrade events are logged with cost savings for transparency</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
