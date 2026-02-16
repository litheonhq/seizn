"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { OnboardingWizard } from "@/components/dashboard/OnboardingWizard";
import { NorthStarMetrics } from "@/components/dashboard/NorthStarMetrics";
import { getReliabilityUpdatesCopy } from "@/lib/i18n/reliability-updates";

interface User {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

interface Stats {
  memories: {
    count: number;
    limit: number;
    percentage: number;
  };
  apiCalls: {
    today: number;
    limit: number;
    percentage: number;
  };
  keys: number;
  plan: string;
  planDisplay: string;
}

interface RecentMemory {
  id: string;
  content: string;
  memory_type: string;
  created_at: string;
}

interface DailyUsage {
  date: string;
  calls: number;
  tokens: number;
  cost: number;
}

interface RecentActivity {
  id: string;
  endpoint: string;
  method: string;
  status: number;
  statusCategory: 'success' | 'redirect' | 'client_error' | 'server_error';
  latencyMs: number | null;
  costCents: number;
  keyPrefix: string;
  timestamp: string;
  tokens: number;
}

const RELIABILITY_CARD_META = [
  {
    href: "/dashboard/enterprise",
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

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, memoriesRes, usageRes, activityRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/memories?limit=5"),
        fetch("/api/dashboard/usage?period=7d"),
        fetch("/api/dashboard/activity?limit=10"),
      ]);

      const statsData = await statsRes.json();
      const memoriesData = await memoriesRes.json();
      const usageData = await usageRes.json();
      const activityData = await activityRes.json();

      if (statsData.success) {
        setStats(statsData.stats);
      }

      if (memoriesData.success) {
        setRecentMemories(memoriesData.memories || []);
      }

      if (usageData.success && usageData.usage?.daily) {
        setDailyUsage(usageData.usage.daily);
      }

      if (activityData.success) {
        setRecentActivity(activityData.activity || []);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("dashboard.greeting.morning");
    if (hour < 18) return t("dashboard.greeting.afternoon");
    return t("dashboard.greeting.evening");
  };

  const greeting = getGreeting();
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
    <div className="space-y-8">
      {/* Onboarding Wizard - Shows until all steps are complete */}
      <OnboardingWizard userId={user.id} />

      {/* Welcome Section */}
      <div className="glass-card rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-pink-200/30 to-purple-200/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {greeting}, {user.name || user.email?.split("@")[0]}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t("dashboard.overviewPage.subtitle")}
          </p>
        </div>
      </div>

      {/* Security & Reliability Updates */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b theme-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {reliabilityCopy.heading}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {reliabilityCopy.subtitle}
            </p>
          </div>
          <Link href={`/${locale}/docs/security`} className="text-sm theme-primary hover:underline">
            {reliabilityCopy.docsCta}
          </Link>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {reliabilityUpdates.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className={`rounded-xl border p-4 bg-gradient-to-br ${item.tone} hover:shadow-md transition-all`}
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Memories Card */}
        <div className="glass-card rounded-2xl p-6 group hover:shadow-lg transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <BrainIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full dark:bg-gray-800 dark:text-gray-300">
              {stats?.planDisplay || "Free"}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("dashboard.overviewPage.totalMemories")}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {isLoading ? (
              <span className="inline-block w-16 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            ) : (
              stats?.memories.count.toLocaleString() || "0"
            )}
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>{t("dashboard.overviewPage.usage")}</span>
              <span>
                {stats?.memories.limit === -1
                  ? t("dashboard.stats.unlimited")
                  : `${stats?.memories.percentage || 0}%`}
              </span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-pink-400 to-rose-500 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(stats?.memories.percentage || 0, 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* API Calls Card */}
        <div className="glass-card rounded-2xl p-6 group hover:shadow-lg transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <ApiIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full dark:bg-gray-800 dark:text-gray-300">
              {t("dashboard.overviewPage.today")}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("dashboard.overviewPage.apiCalls")}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {isLoading ? (
              <span className="inline-block w-16 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            ) : (
              stats?.apiCalls.today.toLocaleString() || "0"
            )}
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>{t("dashboard.overviewPage.dailyLimit")}</span>
              <span>
                {stats?.apiCalls.limit === -1
                  ? t("dashboard.stats.unlimited")
                  : stats?.apiCalls.limit.toLocaleString()}
              </span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(stats?.apiCalls.percentage || 0, 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* API Keys Card */}
        <div className="glass-card rounded-2xl p-6 group hover:shadow-lg transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <KeyIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("dashboard.overviewPage.activeKeys")}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {isLoading ? (
              <span className="inline-block w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
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
        <div className="glass-card rounded-2xl p-6 group hover:shadow-lg transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <SparkleIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t("dashboard.overviewPage.currentPlan")}</p>
          <p className="text-3xl font-bold theme-gradient-text">
            {isLoading ? (
              <span className="inline-block w-16 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
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
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b theme-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <ChartIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">{t("dashboard.overviewPage.apiUsageChart")}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.overviewPage.last7days")}</p>
            </div>
          </div>
          <Link href="/dashboard/usage" className="text-sm theme-primary hover:underline">
            {t("dashboard.overviewPage.viewDetails")}
          </Link>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="animate-pulse w-full h-32 bg-gray-100 dark:bg-gray-800 rounded-lg" />
            </div>
          ) : dailyUsage.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
              <ChartIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-2" />
              <p>{t("dashboard.overviewPage.noUsageData")}</p>
            </div>
          ) : (
            <UsageChart data={dailyUsage} locale={locale} />
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b theme-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <ActivityIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">{t("dashboard.overviewPage.recentActivity")}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.overviewPage.last10Requests")}</p>
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
                    <div className="w-16 h-6 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded" />
                    <div className="w-12 h-4 bg-gray-100 dark:bg-gray-800 rounded" />
                    <div className="w-16 h-4 bg-gray-100 dark:bg-gray-800 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 flex items-center justify-center">
                <ActivityIcon className="w-8 h-8 text-emerald-400 dark:text-emerald-300" />
              </div>
              <h3 className="text-gray-900 dark:text-white font-medium mb-2">{t("dashboard.overviewPage.noActivityYet")}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {t("dashboard.overviewPage.noActivityDescription")}
              </p>
              <Link
                href="/dashboard/keys"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium hover:from-emerald-600 hover:to-teal-600 transition-all"
              >
                <KeyIcon className="w-4 h-4" />
                {t("dashboard.overviewPage.sendFirstRequest")}
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-gray-900/40">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("dashboard.activity.endpoint")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("dashboard.activity.status")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("dashboard.activity.latency")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("dashboard.activity.cost")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("dashboard.activity.key")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("dashboard.activity.time")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recentActivity.map((activity) => (
                  <tr key={activity.id} className="hover:bg-white/50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                          activity.method === 'GET' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' :
                          activity.method === 'POST' ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' :
                          activity.method === 'PUT' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                          activity.method === 'DELETE' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' :
                          'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                        }`}>
                          {activity.method}
                        </span>
                        <span className="text-gray-900 dark:text-gray-100 font-mono text-xs truncate max-w-[200px]">
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
                        'text-gray-600 dark:text-gray-300'
                      }`}>
                        {activity.latencyMs ? `${activity.latencyMs}ms` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        {activity.costCents > 0 ? `$${(activity.costCents / 100).toFixed(4)}` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                        {activity.keyPrefix}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
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
        <div className="lg:col-span-2 glass-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b theme-border flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">{t("dashboard.overviewPage.recentMemories")}</h2>
            <Link href="/dashboard/memories" className="text-sm theme-primary hover:underline">
              {t("dashboard.overviewPage.viewAll")}
            </Link>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-start gap-3">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentMemories.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <BrainIcon className="w-6 h-6 text-gray-400 dark:text-gray-500" />
              </div>
              <p>{t("dashboard.overviewPage.noMemories")}</p>
              <p className="text-sm mt-1">{t("dashboard.overviewPage.noMemoriesHint")}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {recentMemories.map((memory) => (
                <div key={memory.id} className="p-4 hover:bg-white/50 dark:hover:bg-gray-800/40 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{getMemoryTypeIcon(memory.memory_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 dark:text-gray-100 text-sm line-clamp-2">{memory.content}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {new Date(memory.created_at).toLocaleDateString(locale, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full">
                      {memory.memory_type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t("dashboard.overviewPage.quickStart")}</h2>
          <div className="space-y-3">
            <Link
              href="/dashboard/keys"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 dark:hover:bg-gray-800/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <KeyIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t("dashboard.overviewPage.createApiKey")}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.overviewPage.getStartedApi")}</p>
              </div>
            </Link>
            <Link
              href="/docs"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 dark:hover:bg-gray-800/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <BookIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t("dashboard.overviewPage.viewDocumentation")}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.overviewPage.learnSeizn")}</p>
              </div>
            </Link>
            <Link
              href="/dashboard/organizations"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 dark:hover:bg-gray-800/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <UsersIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t("dashboard.overviewPage.createOrganization")}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.overviewPage.collaborateTeam")}</p>
              </div>
            </Link>
          </div>

          {/* Code Example */}
          <div className="mt-6 pt-6 border-t theme-border">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">{t("dashboard.overviewPage.quickExample")}</p>
            <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
              <pre className="text-xs text-gray-300">
                <code>{`curl -X POST \\
  https://seizn.com/api/memories \\
  -H "x-api-key: YOUR_KEY" \\
  -d '{"content": "Hello"}'`}</code>
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

// Usage Chart Component
function UsageChart({ data, locale }: { data: DailyUsage[]; locale: string }) {
  const maxCalls = Math.max(...data.map(d => d.calls), 1);
  const chartHeight = 120;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, { weekday: 'short' });
  };

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {data.reduce((sum, d) => sum + d.calls, 0).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Calls</p>
        </div>
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {Math.round(data.reduce((sum, d) => sum + d.calls, 0) / data.length).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Avg/Day</p>
        </div>
        <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {data[data.length - 1]?.calls.toLocaleString() || 0}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Today</p>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="relative">
        <svg width="100%" height={chartHeight + 40} className="overflow-visible">
          {data.map((day, i) => {
            const barWidth = 100 / data.length;
            const barHeight = (day.calls / maxCalls) * chartHeight;
            const x = i * barWidth + barWidth / 2;

            return (
              <g key={day.date}>
                {/* Bar */}
                <rect
                  x={`${x - barWidth / 3}%`}
                  y={chartHeight - barHeight}
                  width={`${barWidth * 0.6}%`}
                  height={barHeight}
                  rx={4}
                  className="fill-cyan-400 hover:fill-cyan-500 transition-colors cursor-pointer"
                />
                {/* Value on hover area */}
                <title>{`${formatFullDate(day.date)}: ${day.calls.toLocaleString()} calls`}</title>
                {/* Day label */}
                <text
                  x={`${x}%`}
                  y={chartHeight + 20}
                  textAnchor="middle"
                  className="fill-gray-500 dark:fill-gray-400 text-xs"
                  fontSize="11"
                >
                  {formatDate(day.date)}
                </text>
                {/* Call count (only show if > 0) */}
                {day.calls > 0 && (
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
            className="stroke-gray-200 dark:stroke-gray-700"
            strokeWidth={1}
          />
        </svg>
      </div>
    </div>
  );
}
