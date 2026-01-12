"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

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

export default function DashboardOverviewClient({ user }: { user: User }) {
  const { t, locale } = useDashboardTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentMemories, setRecentMemories] = useState<RecentMemory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, memoriesRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/memories?limit=5"),
      ]);

      const statsData = await statsRes.json();
      const memoriesData = await memoriesRes.json();

      if (statsData.success) {
        setStats(statsData.stats);
      }

      if (memoriesData.success) {
        setRecentMemories(memoriesData.memories || []);
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
      {/* Welcome Section */}
      <div className="glass-card rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-pink-200/30 to-purple-200/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {greeting}, {user.name || user.email?.split("@")[0]}
          </h1>
          <p className="text-gray-600">
            {t("dashboard.overviewPage.subtitle")}
          </p>
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
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
              {stats?.planDisplay || "Free"}
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-1">{t("dashboard.overviewPage.totalMemories")}</p>
          <p className="text-3xl font-bold text-gray-900">
            {isLoading ? (
              <span className="inline-block w-16 h-8 bg-gray-200 rounded animate-pulse" />
            ) : (
              stats?.memories.count.toLocaleString() || "0"
            )}
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{t("dashboard.overviewPage.usage")}</span>
              <span>
                {stats?.memories.limit === -1
                  ? t("dashboard.stats.unlimited")
                  : `${stats?.memories.percentage || 0}%`}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
              {t("dashboard.overviewPage.today")}
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-1">{t("dashboard.overviewPage.apiCalls")}</p>
          <p className="text-3xl font-bold text-gray-900">
            {isLoading ? (
              <span className="inline-block w-16 h-8 bg-gray-200 rounded animate-pulse" />
            ) : (
              stats?.apiCalls.today.toLocaleString() || "0"
            )}
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{t("dashboard.overviewPage.dailyLimit")}</span>
              <span>
                {stats?.apiCalls.limit === -1
                  ? t("dashboard.stats.unlimited")
                  : stats?.apiCalls.limit.toLocaleString()}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
          <p className="text-sm text-gray-500 mb-1">{t("dashboard.overviewPage.activeKeys")}</p>
          <p className="text-3xl font-bold text-gray-900">
            {isLoading ? (
              <span className="inline-block w-8 h-8 bg-gray-200 rounded animate-pulse" />
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
          <p className="text-sm text-gray-500 mb-1">{t("dashboard.overviewPage.currentPlan")}</p>
          <p className="text-3xl font-bold theme-gradient-text">
            {isLoading ? (
              <span className="inline-block w-16 h-8 bg-gray-200 rounded animate-pulse" />
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

      {/* Recent Memories & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Memories */}
        <div className="lg:col-span-2 glass-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b theme-border flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{t("dashboard.overviewPage.recentMemories")}</h2>
            <Link href="/dashboard/memories" className="text-sm theme-primary hover:underline">
              {t("dashboard.overviewPage.viewAll")}
            </Link>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-start gap-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-lg" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentMemories.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
                <BrainIcon className="w-6 h-6 text-gray-400" />
              </div>
              <p>{t("dashboard.overviewPage.noMemories")}</p>
              <p className="text-sm mt-1">{t("dashboard.overviewPage.noMemoriesHint")}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentMemories.map((memory) => (
                <div key={memory.id} className="p-4 hover:bg-white/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{getMemoryTypeIcon(memory.memory_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 text-sm line-clamp-2">{memory.content}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(memory.created_at).toLocaleDateString(locale, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
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
          <h2 className="font-semibold text-gray-900 mb-4">{t("dashboard.overviewPage.quickStart")}</h2>
          <div className="space-y-3">
            <Link
              href="/dashboard/keys"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <KeyIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{t("dashboard.overviewPage.createApiKey")}</p>
                <p className="text-xs text-gray-500">{t("dashboard.overviewPage.getStartedApi")}</p>
              </div>
            </Link>
            <Link
              href="/docs"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <BookIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{t("dashboard.overviewPage.viewDocumentation")}</p>
                <p className="text-xs text-gray-500">{t("dashboard.overviewPage.learnSeizn")}</p>
              </div>
            </Link>
            <Link
              href="/dashboard/organizations"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <UsersIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{t("dashboard.overviewPage.createOrganization")}</p>
                <p className="text-xs text-gray-500">{t("dashboard.overviewPage.collaborateTeam")}</p>
              </div>
            </Link>
          </div>

          {/* Code Example */}
          <div className="mt-6 pt-6 border-t theme-border">
            <p className="text-sm font-medium text-gray-700 mb-3">{t("dashboard.overviewPage.quickExample")}</p>
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
