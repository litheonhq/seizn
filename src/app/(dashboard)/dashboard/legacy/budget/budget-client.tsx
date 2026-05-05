"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BudgetSettings } from "@/components/budget-planner/BudgetSettings";
import type { BudgetSettings as BudgetSettingsType } from "@/lib/budget-planner/types";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import { getErrorMessage } from "@/lib/ui-error";

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
  const { t } = useDashboardTranslation();
  const requestGuardRef = useRef(createLatestRequestGuard());

  // Fetch current settings and usage stats
  const fetchData = useCallback(async () => {
    const request = requestGuardRef.current.begin();
    try {
      setLoading(true);
      setError(null);

      const [settingsResult, statsResult, eventsResult] = await Promise.allSettled([
        fetch("/api/budget/settings", { signal: request.signal }).then(async (res) => ({
          ok: res.ok,
          data: res.ok ? await res.json() : null,
        })),
        fetch("/api/budget/stats", { signal: request.signal }).then(async (res) => ({
          ok: res.ok,
          data: res.ok ? await res.json() : null,
        })),
        fetch("/api/budget/degrade-events?limit=10", { signal: request.signal }).then(async (res) => ({
          ok: res.ok,
          data: res.ok ? await res.json() : null,
        })),
      ]);

      if (!requestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      let failedCount = 0;

      if (settingsResult.status === "fulfilled" && settingsResult.value.ok && settingsResult.value.data?.success) {
        setSettings(settingsResult.value.data.settings);
      } else if (
        (settingsResult.status === "fulfilled" &&
          (!settingsResult.value.ok || !settingsResult.value.data?.success)) ||
        (settingsResult.status === "rejected" && !isAbortError(settingsResult.reason))
      ) {
        failedCount += 1;
      }

      if (statsResult.status === "fulfilled" && statsResult.value.ok && statsResult.value.data?.success) {
        setStats(statsResult.value.data.stats);
      } else if (
        (statsResult.status === "fulfilled" && (!statsResult.value.ok || !statsResult.value.data?.success)) ||
        (statsResult.status === "rejected" && !isAbortError(statsResult.reason))
      ) {
        failedCount += 1;
      }

      if (eventsResult.status === "fulfilled" && eventsResult.value.ok && eventsResult.value.data?.success) {
        setDegradeEvents(eventsResult.value.data.events || []);
      } else if (
        (eventsResult.status === "fulfilled" &&
          (!eventsResult.value.ok || !eventsResult.value.data?.success)) ||
        (eventsResult.status === "rejected" && !isAbortError(eventsResult.reason))
      ) {
        failedCount += 1;
      }

      if (failedCount > 0) {
        setError("Some budget data could not be refreshed.");
      }
    } catch (err) {
      if (!isAbortError(err) && requestGuardRef.current.isCurrent(request.id)) {
        setError(getErrorMessage(err, "Failed to load budget data."));
      }
    } finally {
      if (requestGuardRef.current.isCurrent(request.id)) {
        setLoading(false);
        requestGuardRef.current.finish(request.id);
      }
    }
  }, []);

  useEffect(() => {
    const requestGuard = requestGuardRef.current;
    fetchData();
    return () => requestGuard.cancel();
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
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--signal-canon)] dark:border-[var(--signal-canon)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--ink-900)]">{t("dashboard.budgetPage.title")}</h1>
        <p className="text-[var(--ink-600)] mt-1">
          {t("dashboard.budgetPage.subtitle")}
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict)]/30 border border-[var(--signal-conflict)] dark:border-[var(--signal-conflict)]/50 rounded-lg">
          <p className="text-sm text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">{error}</p>
        </div>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Daily Usage */}
          <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-950/40 rounded-lg">
                <DollarIcon className="w-5 h-5 text-blue-600 dark:text-blue-300" />
              </div>
              <span className="text-sm font-medium text-[var(--ink-600)]">{t("dashboard.budgetPage.todaysSpend")}</span>
            </div>
            <div className="text-2xl font-bold text-[var(--ink-900)]">
              {formatCurrency(stats.dailyUsedUsd)}
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-xs text-[var(--ink-600)] mb-1">
                <span>{dailyPercent.toFixed(1)}% {t("dashboard.budgetPage.ofDailyLimit")}</span>
                <span>{formatCurrency(stats.dailyBudgetUsd)}</span>
              </div>
              <div className="h-2 bg-[var(--ink-50)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    dailyPercent > 90 ? "bg-[var(--signal-conflict)]" : dailyPercent > 70 ? "bg-yellow-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${dailyPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Monthly Usage */}
          <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-[var(--signal-canon-soft)] dark:bg-[var(--signal-canon)]/35 rounded-lg">
                <ChartIcon className="w-5 h-5 text-[var(--signal-canon-ink)] dark:text-[var(--signal-canon-soft)]" />
              </div>
              <span className="text-sm font-medium text-[var(--ink-600)]">{t("dashboard.budgetPage.monthlySpend")}</span>
            </div>
            <div className="text-2xl font-bold text-[var(--ink-900)]">
              {formatCurrency(stats.monthlyUsedUsd)}
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-xs text-[var(--ink-600)] mb-1">
                <span>{monthlyPercent.toFixed(1)}% {t("dashboard.budgetPage.ofMonthlyLimit")}</span>
                <span>{formatCurrency(stats.monthlyBudgetUsd)}</span>
              </div>
              <div className="h-2 bg-[var(--ink-50)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    monthlyPercent > 90 ? "bg-[var(--signal-conflict)]" : monthlyPercent > 70 ? "bg-yellow-500" : "bg-[var(--signal-canon)]"
                  }`}
                  style={{ width: `${monthlyPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Query Count */}
          <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-[var(--ink-100)] dark:bg-[var(--ink-900)]/35 rounded-lg">
                <ChartIcon className="w-5 h-5 text-[var(--ink-900)] underline dark:text-[var(--ink-500)]" />
              </div>
              <span className="text-sm font-medium text-[var(--ink-600)]">{t("dashboard.budgetPage.apiCalls")}</span>
            </div>
            <div className="text-2xl font-bold text-[var(--ink-900)]">
              {stats.todayQueries.toLocaleString()}
            </div>
            <p className="text-sm text-[var(--ink-600)] mt-1">
              {stats.monthQueries.toLocaleString()} {t("dashboard.budgetPage.thisMonth")}
            </p>
          </div>

          {/* Degrade Events */}
          <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${stats.degradeEvents > 0 ? "bg-[var(--signal-pending-soft)] dark:bg-yellow-950/40" : "bg-[var(--signal-canon-soft)] dark:bg-green-950/35"}`}>
                <ShieldIcon className={`w-5 h-5 ${stats.degradeEvents > 0 ? "text-[var(--signal-pending-ink)] dark:text-yellow-300" : "text-[var(--signal-canon-ink)] dark:text-green-300"}`} />
              </div>
              <span className="text-sm font-medium text-[var(--ink-600)]">{t("dashboard.budgetPage.autoDegrades")}</span>
            </div>
            <div className="text-2xl font-bold text-[var(--ink-900)]">
              {stats.degradeEvents}
            </div>
            <p className="text-sm text-[var(--ink-600)] mt-1">
              {stats.lastDegradeReason || t("dashboard.budgetPage.noRecentDegrades")}
            </p>
          </div>
        </div>
      )}

      {/* Degrade Warning Banner */}
      {stats && stats.degradeEvents > 0 && (
        <div className="bg-[var(--signal-pending-soft)] dark:bg-yellow-950/20 border border-[var(--signal-pending)] dark:border-[var(--signal-pending)]/40 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangleIcon className="w-5 h-5 text-[var(--signal-pending-ink)] dark:text-yellow-300 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-[var(--signal-pending-ink)] dark:text-yellow-200">{t("dashboard.budgetPage.protectionActive")}</h3>
            <p className="text-sm text-[var(--signal-pending-ink)] dark:text-yellow-300 mt-1">
              {t("dashboard.budgetPage.protectionDesc")}
            </p>
          </div>
        </div>
      )}

      {/* Settings Form */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-4">{t("dashboard.budgetPage.settings")}</h2>
        <BudgetSettings
          initialSettings={settings || undefined}
          onSave={handleSaveSettings}
        />
      </div>

      {/* Recent Degrade Events */}
      {degradeEvents.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-4">{t("dashboard.budgetPage.recentEvents")}</h2>
          <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] overflow-hidden">
            <table className="min-w-full divide-y divide-[var(--ink-200)]">
              <thead className="bg-[var(--ink-50)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
                    {t("dashboard.budgetPage.time")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
                    {t("dashboard.budgetPage.reason")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
                    {t("dashboard.budgetPage.changes")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
                    {t("dashboard.budgetPage.saved")}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[var(--ink-0)] divide-y divide-[var(--ink-200)]">
                {degradeEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ink-600)]">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--ink-900)]">
                      {event.reason}
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--ink-600)]">
                      <code className="text-xs bg-[var(--ink-50)] text-[var(--ink-900)] px-2 py-1 rounded">
                        {JSON.stringify(event.degradedConfig)}
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--signal-canon-ink)] dark:text-green-300 font-medium">
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
      <div className="bg-[var(--ink-50)] border border-[var(--ink-200)] rounded-xl p-6">
        <h3 className="font-medium text-[var(--ink-900)] mb-2">{t("dashboard.budgetPage.howItWorks")}</h3>
        <ul className="text-sm text-[var(--ink-600)] space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-[var(--signal-canon-ink)] dark:text-[var(--signal-canon-soft)] font-bold">1.</span>
            <span>{t("dashboard.budgetPage.step1")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--signal-canon-ink)] dark:text-[var(--signal-canon-soft)] font-bold">2.</span>
            <span>{t("dashboard.budgetPage.step2")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--signal-canon-ink)] dark:text-[var(--signal-canon-soft)] font-bold">3.</span>
            <span>{t("dashboard.budgetPage.step3")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--signal-canon-ink)] dark:text-[var(--signal-canon-soft)] font-bold">4.</span>
            <span>{t("dashboard.budgetPage.step4")}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
