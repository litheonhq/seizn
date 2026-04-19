"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { OnboardingWizard } from "@/components/dashboard/OnboardingWizard";
import { NorthStarMetrics } from "@/components/dashboard/NorthStarMetrics";
import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import { getReliabilityUpdatesCopy } from "@/lib/i18n/reliability-updates";
import { formatDate } from "@/lib/format-date";
import { getErrorMessage } from "@/lib/ui-error";
import type {
  DashboardUser as User,
  DashboardStats as Stats,
  RecentMemory,
  DailyUsage,
  RecentActivity,
} from "@/types/dashboard";

const RELIABILITY_CARD_META = [
  {
    href: "/dashboard/organizations",
    tone: "from-violet-500/15 to-indigo-500/15 border-violet-200/60 dark:border-violet-900/60",
  },
  {
    href: "/dashboard/webhooks",
    tone: "from-blue-500/15 to-cyan-500/15 border-blue-200/60 dark:border-blue-900/60",
  },
  {
    href: (locale: string) => `/${locale}/docs/security`,
    tone: "from-emerald-500/15 to-teal-500/15 border-emerald-200/60 dark:border-emerald-900/60",
  },
  {
    href: (locale: string) => `/${locale}/docs/security`,
    tone: "from-amber-500/15 to-orange-500/15 border-amber-200/60 dark:border-amber-900/60",
  },
] as const;

export default function DashboardOverviewClient({ user }: { user: User }) {
  const { t, locale } = useDashboardTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentMemories, setRecentMemories] = useState<RecentMemory[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestGuardRef = useRef(createLatestRequestGuard());

  const fetchData = useCallback(async () => {
    const request = requestGuardRef.current.begin();
    try {
      const results = await Promise.allSettled([
        fetch("/api/dashboard/stats", { signal: request.signal }).then((res) => res.json()),
        fetch("/api/memories?limit=5", { signal: request.signal }).then((res) => res.json()),
        fetch("/api/dashboard/usage?period=7d", { signal: request.signal }).then((res) => res.json()),
        fetch("/api/dashboard/activity?limit=10", { signal: request.signal }).then((res) => res.json()),
      ]);

      if (!requestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      const [statsResult, memoriesResult, usageResult, activityResult] = results;
      let failedCount = 0;

      if (statsResult.status === "fulfilled" && statsResult.value.success) {
        const statsData = statsResult.value;
        setStats(statsData.stats);
      } else if (
        (statsResult.status === "fulfilled" && !statsResult.value.success) ||
        (statsResult.status === "rejected" && !isAbortError(statsResult.reason))
      ) {
        failedCount += 1;
      }

      if (memoriesResult.status === "fulfilled" && memoriesResult.value.success) {
        const memoriesData = memoriesResult.value;
        setRecentMemories(memoriesData.memories || []);
      } else if (
        (memoriesResult.status === "fulfilled" && !memoriesResult.value.success) ||
        (memoriesResult.status === "rejected" && !isAbortError(memoriesResult.reason))
      ) {
        failedCount += 1;
      }

      if (usageResult.status === "fulfilled" && usageResult.value.success && usageResult.value.usage?.daily) {
        const usageData = usageResult.value;
        setDailyUsage(usageData.usage.daily);
      } else if (
        (usageResult.status === "fulfilled" && !usageResult.value.success) ||
        (usageResult.status === "rejected" && !isAbortError(usageResult.reason))
      ) {
        failedCount += 1;
      }

      if (activityResult.status === "fulfilled" && activityResult.value.success) {
        const activityData = activityResult.value;
        setRecentActivity(activityData.activity || []);
      } else if (
        (activityResult.status === "fulfilled" && !activityResult.value.success) ||
        (activityResult.status === "rejected" && !isAbortError(activityResult.reason))
      ) {
        failedCount += 1;
      }

      setError(failedCount > 0 ? "Some dashboard sections failed to refresh." : null);
    } catch (err) {
      if (!isAbortError(err) && requestGuardRef.current.isCurrent(request.id)) {
        setError(getErrorMessage(err, "Failed to load dashboard overview."));
      }
    } finally {
      if (requestGuardRef.current.isCurrent(request.id)) {
        setIsLoading(false);
        requestGuardRef.current.finish(request.id);
      }
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds when tab is visible
    const interval = setInterval(() => {
      if (!document.hidden) fetchData();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => () => requestGuardRef.current.cancel(), []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("dashboard.greeting.morning");
    if (hour < 18) return t("dashboard.greeting.afternoon");
    return t("dashboard.greeting.evening");
  };

  const greeting = getGreeting();
  const hasApiKeys = (stats?.keys || 0) > 0;
  const reliabilityCopy = getReliabilityUpdatesCopy(locale).dashboard;
  const reliabilityUpdates = reliabilityCopy.cards.map((card, index) => {
    const meta = RELIABILITY_CARD_META[index] ?? RELIABILITY_CARD_META[0];
    const href = typeof meta.href === "function" ? meta.href(locale) : meta.href;
    return {
      ...card,
      href,
      tone: meta.tone,
    };
  });

  const getMemoryTypeIcon = (type: string) => {
    switch (type) {
      case "fact":
        return "📝";
      case "preference":
        return "⭐";
      case "experience":
        return "🎯";
      case "relationship":
        return "🤝";
      case "instruction":
        return "📋";
      default:
        return "💭";
    }
  };

  return (
    <div className="space-y-6">
      {/* Onboarding Wizard - Shows until all steps are complete */}
      <OnboardingWizard userId={user.id} />

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {error}
        </div>
      )}

      {/* Welcome Section */}
      <div className="szn-card rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-40" style={{ background: "linear-gradient(135deg, var(--theme-primary), var(--theme-secondary))" }} />
        <div className="relative">
          <h1 className="text-3xl font-bold text-szn-text-1 mb-2">
            {greeting}, {user.name || user.email?.split("@")[0]}
          </h1>
          <p className="text-szn-text-2">
            {t("dashboard.overviewPage.subtitle")}
          </p>
        </div>
      </div>

      {/* Security & Reliability Updates - Collapsible */}
      <ReliabilitySection
        reliabilityCopy={reliabilityCopy}
        reliabilityUpdates={reliabilityUpdates}
        locale={locale}
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Memories Card */}
        <div className="szn-card rounded-lg p-6 group hover:shadow-lg transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl theme-gradient-btn flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <BrainIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs text-szn-text-2 bg-szn-surface px-2 py-1 rounded-full">
              {stats?.planDisplay || "Free"}
            </span>
          </div>
          <p className="text-sm text-szn-text-2 mb-1">{t("dashboard.overviewPage.totalMemories")}</p>
          <p className="text-3xl font-bold text-szn-text-1">
            {isLoading ? (
              <span className="inline-block w-16 h-8 bg-szn-surface rounded animate-pulse" />
            ) : (
              stats?.memories.count.toLocaleString() || "0"
            )}
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-szn-text-2 mb-1">
              <span>{t("dashboard.overviewPage.usage")}</span>
              <span>
                {stats?.memories.limit === -1
                  ? t("dashboard.stats.unlimited")
                  : `${stats?.memories.percentage || 0}%`}
              </span>
            </div>
            <div className="h-2 bg-szn-surface rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 theme-gradient-btn"
                style={{
                  width: `${Math.min(stats?.memories.percentage || 0, 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* API Calls Card */}
        <div className="szn-card rounded-lg p-6 group hover:shadow-lg transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl theme-gradient-btn flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform" style={{ opacity: 0.85 }}>
              <ApiIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs text-szn-text-2 bg-szn-surface px-2 py-1 rounded-full">
              {t("dashboard.overviewPage.today")}
            </span>
          </div>
          <p className="text-sm text-szn-text-2 mb-1">{t("dashboard.overviewPage.apiCalls")}</p>
          <p className="text-3xl font-bold text-szn-text-1">
            {isLoading ? (
              <span className="inline-block w-16 h-8 bg-szn-surface rounded animate-pulse" />
            ) : (
              stats?.apiCalls.today.toLocaleString() || "0"
            )}
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-szn-text-2 mb-1">
              <span>{t("dashboard.overviewPage.dailyLimit")}</span>
              <span>
                {stats?.apiCalls.limit === -1
                  ? t("dashboard.stats.unlimited")
                  : stats?.apiCalls.limit.toLocaleString()}
              </span>
            </div>
            <div className="h-2 bg-szn-surface rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 theme-gradient-btn"
                style={{
                  width: `${Math.min(stats?.apiCalls.percentage || 0, 100)}%`,
                  opacity: 0.85,
                }}
              />
            </div>
          </div>
        </div>

        {/* API Keys Card */}
        <div className="szn-card rounded-lg p-6 group hover:shadow-lg transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl theme-gradient-btn flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform" style={{ opacity: 0.7 }}>
              <KeyIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-sm text-szn-text-2 mb-1">{t("dashboard.overviewPage.activeKeys")}</p>
          <p className="text-3xl font-bold text-szn-text-1">
            {isLoading ? (
              <span className="inline-block w-8 h-8 bg-szn-surface rounded animate-pulse" />
            ) : (
              stats?.keys || 0
            )}
          </p>
          <Link
            href="/dashboard/keys"
            className="mt-3 inline-flex items-center text-sm theme-primary hover:underline"
          >
            {t("dashboard.overviewPage.manageKeys")}
            <ArrowIcon className="w-4 h-4 ml-1" />
          </Link>
        </div>

        {/* Plan Card */}
        <div className="szn-card rounded-lg p-6 group hover:shadow-lg transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl theme-gradient-btn flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform" style={{ opacity: 0.55 }}>
              <SparkleIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-sm text-szn-text-2 mb-1">{t("dashboard.overviewPage.currentPlan")}</p>
          <p className="text-3xl font-bold theme-gradient-text">
            {isLoading ? (
              <span className="inline-block w-16 h-8 bg-szn-surface rounded animate-pulse" />
            ) : (
              stats?.planDisplay || "Free"
            )}
          </p>
          <Link
            href="/pricing"
            className="mt-3 inline-flex items-center text-sm theme-primary hover:underline"
          >
            {t("dashboard.overviewPage.upgradePlan")}
            <ArrowIcon className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </div>


      {/* North Star Metrics */}
      <NorthStarMetrics />

      {/* 7-Day API Usage Chart */}
      <div className="szn-card rounded-lg overflow-hidden">
        <div className="p-4 border-b theme-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl theme-gradient-btn flex items-center justify-center" style={{ opacity: 0.8 }}>
              <ChartIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-szn-text-1">{t("dashboard.overviewPage.apiUsageChart")}</h2>
              <p className="text-xs text-szn-text-2">{t("dashboard.overviewPage.last7days")}</p>
            </div>
          </div>
          <Link href="/dashboard/usage" className="text-sm theme-primary hover:underline">
            {t("dashboard.overviewPage.viewDetails")}
          </Link>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="animate-pulse w-full h-32 bg-szn-surface rounded-lg" />
            </div>
          ) : dailyUsage.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-szn-text-2">
              <ChartIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-2" />
              <p>{t("dashboard.overviewPage.noUsageData")}</p>
            </div>
          ) : (
            <UsageChart data={dailyUsage} locale={locale} />
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="szn-card rounded-lg overflow-hidden">
        <div className="p-4 border-b theme-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl theme-gradient-btn flex items-center justify-center" style={{ opacity: 0.65 }}>
              <ActivityIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-szn-text-1">{t("dashboard.overviewPage.recentActivity")}</h2>
              <p className="text-xs text-szn-text-2">{t("dashboard.overviewPage.last10Requests")}</p>
            </div>
          </div>
          <Link href="/dashboard/usage" className="text-sm theme-primary hover:underline">
            {t("dashboard.overviewPage.viewAllActivity")}
          </Link>
        </div>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6">
              <div className="animate-pulse space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-16 h-6 bg-szn-surface rounded" />
                    <div className="flex-1 h-4 bg-szn-surface rounded" />
                    <div className="w-12 h-4 bg-szn-surface rounded" />
                    <div className="w-16 h-4 bg-szn-surface rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--theme-primary) 10%, transparent)" }}>
                <ActivityIcon className="w-8 h-8 theme-primary" />
              </div>
              <h3 className="text-szn-text-1 font-medium mb-2">{t("dashboard.overviewPage.noActivityYet")}</h3>
              <p className="text-sm text-szn-text-2 mb-4">
                {t("dashboard.overviewPage.noActivityDescription")}
              </p>
              <Link
                href={hasApiKeys ? "/dashboard/playground" : "/dashboard/keys"}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium theme-gradient-btn"
              >
                <KeyIcon className="w-4 h-4" />
                {hasApiKeys
                  ? t("dashboard.overviewPage.sendFirstRequest")
                  : t("dashboard.overviewPage.createApiKey")}
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-szn-bg">
                  <th className="px-4 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    {t("dashboard.activity.endpoint")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    {t("dashboard.activity.status")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    {t("dashboard.activity.latency")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    {t("dashboard.activity.cost")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    {t("dashboard.activity.key")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-szn-text-2 uppercase tracking-wider">
                    {t("dashboard.activity.time")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-szn-border">
                {recentActivity.map((activity) => (
                  <tr key={activity.id} className="hover:bg-white/50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                          activity.method === 'GET' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' :
                          activity.method === 'POST' ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' :
                          activity.method === 'PUT' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                          activity.method === 'DELETE' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' :
                          'bg-szn-surface text-szn-text-1'
                        }`}>
                          {activity.method}
                        </span>
                        <span className="text-szn-text-1 font-mono text-xs truncate max-w-[200px]">
                          {activity.endpoint}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                        activity.statusCategory === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' :
                        activity.statusCategory === 'redirect' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' :
                        activity.statusCategory === 'client_error' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                        'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                      }`}>
                        {activity.statusCategory === 'success' && <SuccessIcon className="w-3 h-3" />}
                        {activity.statusCategory === 'client_error' && <WarningIcon className="w-3 h-3" />}
                        {activity.statusCategory === 'server_error' && <ErrorIcon className="w-3 h-3" />}
                        {activity.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-mono ${
                        (activity.latencyMs || 0) > 1000 ? 'text-red-600 dark:text-red-400' :
                        (activity.latencyMs || 0) > 500 ? 'text-amber-600 dark:text-amber-400' :
                        'text-szn-text-2'
                      }`}>
                        {activity.latencyMs ? `${activity.latencyMs}ms` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-szn-text-2">
                        {activity.costCents > 0 ? `$${(activity.costCents / 100).toFixed(4)}` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-szn-text-2 bg-szn-surface px-1.5 py-0.5 rounded">
                        {activity.keyPrefix}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-szn-text-2">
                      {new Date(activity.timestamp).toLocaleString(locale, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent Memories & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Memories */}
        <div className="lg:col-span-2 szn-card rounded-lg overflow-hidden">
          <div className="p-4 border-b theme-border flex items-center justify-between">
            <h2 className="font-semibold text-szn-text-1">{t("dashboard.overviewPage.recentMemories")}</h2>
            <Link href="/dashboard/memories" className="text-sm theme-primary hover:underline">
              {t("dashboard.overviewPage.viewAll")}
            </Link>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-start gap-3">
                  <div className="w-8 h-8 bg-szn-surface rounded-lg" />
                  <div className="flex-1">
                    <div className="h-4 bg-szn-surface rounded w-3/4 mb-2" />
                    <div className="h-3 bg-szn-surface rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentMemories.length === 0 ? (
            <div className="p-8 text-center text-szn-text-2">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-szn-surface flex items-center justify-center">
                <BrainIcon className="w-6 h-6 text-szn-text-3" />
              </div>
              <p>{t("dashboard.overviewPage.noMemories")}</p>
              <p className="text-sm mt-1">{t("dashboard.overviewPage.noMemoriesHint")}</p>
            </div>
          ) : (
            <div className="divide-y divide-szn-border">
              {recentMemories.map((memory) => (
                <div key={memory.id} className="p-4 hover:bg-white/50 dark:hover:bg-gray-800/40 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{getMemoryTypeIcon(memory.memory_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-szn-text-1 text-sm line-clamp-2">{memory.content}</p>
                      <p className="text-xs text-szn-text-3 mt-1">
                        {formatDate(memory.created_at, "long")}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-szn-surface text-szn-text-2 rounded-full">
                      {memory.memory_type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="szn-card rounded-lg p-6">
          <h2 className="font-semibold text-szn-text-1 mb-4">{t("dashboard.overviewPage.quickStart")}</h2>
          <div className="space-y-3">
            <Link
              href={hasApiKeys ? "/dashboard/playground" : "/dashboard/keys"}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 dark:hover:bg-gray-800/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg theme-gradient-btn flex items-center justify-center group-hover:scale-110 transition-transform">
                <KeyIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-szn-text-1 text-sm">
                  {hasApiKeys
                    ? t("dashboard.overviewPage.sendFirstRequest")
                    : t("dashboard.overviewPage.createApiKey")}
                </p>
                <p className="text-xs text-szn-text-2">
                  {hasApiKeys
                    ? t("dashboard.onboarding.steps.firstQuery.description")
                    : t("dashboard.overviewPage.getStartedApi")}
                </p>
              </div>
            </Link>
            <Link
              href="/docs"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 dark:hover:bg-gray-800/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg theme-gradient-btn flex items-center justify-center group-hover:scale-110 transition-transform" style={{ opacity: 0.85 }}>
                <BookIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-szn-text-1 text-sm">{t("dashboard.overviewPage.viewDocumentation")}</p>
                <p className="text-xs text-szn-text-2">{t("dashboard.overviewPage.learnSeizn")}</p>
              </div>
            </Link>
            <Link
              href="/dashboard/organizations"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 dark:hover:bg-gray-800/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg theme-gradient-btn flex items-center justify-center group-hover:scale-110 transition-transform" style={{ opacity: 0.7 }}>
                <UsersIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-szn-text-1 text-sm">{t("dashboard.overviewPage.createOrganization")}</p>
                <p className="text-xs text-szn-text-2">{t("dashboard.overviewPage.collaborateTeam")}</p>
              </div>
            </Link>
          </div>

          {/* Code Example */}
          <div className="mt-6 pt-6 border-t theme-border">
            <p className="text-sm font-medium text-szn-text-1 mb-3">{t("dashboard.overviewPage.quickExample")}</p>
            <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
              <pre className="text-xs text-gray-300">
                <code>{`curl -X POST \\
  https://seizn.com/api/memories \\
  -H "x-api-key: YOUR_KEY" \\
  -d '{"content": "Mira remembers the flood at the river shrine"}'`}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Icons
function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function ApiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function SuccessIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

// Collapsible Reliability Section
function ReliabilitySection({
  reliabilityCopy,
  reliabilityUpdates,
  locale,
}: {
  reliabilityCopy: { heading: string; subtitle: string; docsCta: string };
  reliabilityUpdates: { title: string; description: string; cta: string; href: string; tone: string }[];
  locale: string;
}) {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("seizn:reliability-collapsed") !== "true";
  });

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    localStorage.setItem("seizn:reliability-collapsed", next ? "false" : "true");
  };

  return (
    <div className="szn-card rounded-lg overflow-hidden">
      <button
        onClick={toggle}
        className="w-full p-4 border-b theme-border flex items-center justify-between text-left hover:bg-white/30 dark:hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg theme-gradient-btn flex items-center justify-center" style={{ opacity: 0.7 }}>
            <ShieldSmallIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-szn-text-1 text-sm">
              {reliabilityCopy.heading}
            </h2>
            <p className="text-xs text-szn-text-2 mt-0.5">
              {reliabilityCopy.subtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/docs/security`}
            className="text-xs theme-primary hover:underline hidden sm:inline"
            onClick={(e) => e.stopPropagation()}
          >
            {reliabilityCopy.docsCta}
          </Link>
          <ChevronIcon className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          maxHeight: isOpen ? "1000px" : "0px",
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {reliabilityUpdates.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className={`rounded-xl border p-4 bg-gradient-to-br ${item.tone} hover:shadow-md transition-all`}
            >
              <p className="text-sm font-semibold text-szn-text-1">{item.title}</p>
              <p className="mt-1 text-xs text-szn-text-2 leading-relaxed">
                {item.description}
              </p>
              <span className="mt-3 inline-flex items-center text-xs font-medium theme-primary">
                {item.cta}
                <ArrowIcon className="w-3.5 h-3.5 ml-1" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShieldSmallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// Usage Chart Component
function UsageChart({ data, locale }: { data: DailyUsage[]; locale: string }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxCalls = Math.max(...data.map(d => d.calls), 1);
  const chartHeight = 120;

  const formatWeekday = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, { weekday: 'short' });
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-szn-bg rounded-xl">
          <p className="text-2xl font-bold text-szn-text-1">
            {data.reduce((sum, d) => sum + d.calls, 0).toLocaleString()}
          </p>
          <p className="text-xs text-szn-text-2">Total Calls</p>
        </div>
        <div className="text-center p-3 bg-szn-bg rounded-xl">
          <p className="text-2xl font-bold text-szn-text-1">
            {Math.round(data.reduce((sum, d) => sum + d.calls, 0) / data.length).toLocaleString()}
          </p>
          <p className="text-xs text-szn-text-2">Avg/Day</p>
        </div>
        <div className="text-center p-3 bg-szn-bg rounded-xl">
          <p className="text-2xl font-bold text-szn-text-1">
            {data[data.length - 1]?.calls.toLocaleString() || 0}
          </p>
          <p className="text-xs text-szn-text-2">Today</p>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="relative" onMouseLeave={() => setHoveredIdx(null)}>
        {/* Hover Tooltip */}
        {hoveredIdx !== null && data[hoveredIdx] && (
          <div
            className="absolute -top-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white shadow-lg pointer-events-none z-10 theme-gradient-btn"
            style={{ left: `${(hoveredIdx / data.length) * 100 + 100 / data.length / 2}%`, transform: "translateX(-50%)" }}
          >
            {formatDate(data[hoveredIdx].date, "compact")}: {data[hoveredIdx].calls.toLocaleString()}
          </div>
        )}
        <svg width="100%" height={chartHeight + 40} className="overflow-visible">
          {data.map((day, i) => {
            const barWidth = 100 / data.length;
            const barHeight = Math.max((day.calls / maxCalls) * chartHeight, 2);
            const x = i * barWidth + barWidth / 2;
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={day.date}
                onMouseEnter={() => setHoveredIdx(i)}
                className="cursor-pointer"
              >
                {/* Hit area */}
                <rect
                  x={`${x - barWidth / 2}%`}
                  y={0}
                  width={`${barWidth}%`}
                  height={chartHeight + 30}
                  fill="transparent"
                />
                {/* Bar */}
                <rect
                  x={`${x - barWidth / 3}%`}
                  y={chartHeight - barHeight}
                  width={`${barWidth * 0.6}%`}
                  height={barHeight}
                  rx={4}
                  fill={isHovered ? "var(--theme-primary)" : "var(--theme-secondary)"}
                  opacity={isHovered ? 1 : 0.6}
                  className="transition-all duration-150"
                />
                {/* Day label */}
                <text
                  x={`${x}%`}
                  y={chartHeight + 20}
                  textAnchor="middle"
                  className="fill-gray-500 dark:fill-gray-400 text-xs"
                  fontSize="11"
                  fontWeight={isHovered ? 600 : 400}
                >
                  {formatWeekday(day.date)}
                </text>
                {/* Call count (only show if > 0) */}
                {day.calls > 0 && !isHovered && (
                  <text
                    x={`${x}%`}
                    y={chartHeight - barHeight - 5}
                    textAnchor="middle"
                    className="fill-gray-700 dark:fill-gray-200 text-xs font-medium"
                    fontSize="10"
                  >
                    {day.calls.toLocaleString()}
                  </text>
                )}
              </g>
            );
          })}
          {/* Baseline */}
          <line
            x1="0"
            y1={chartHeight}
            x2="100%"
            y2={chartHeight}
            className="stroke-szn-border"
            strokeWidth={1}
          />
        </svg>
      </div>
    </div>
  );
}
