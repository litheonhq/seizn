"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, CircleDashed, RefreshCw } from "lucide-react";
import { readApiJson } from "@/lib/client/api-json";
import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import {
  buildDashboardOverviewState,
  type DashboardOverviewState,
  type DashboardOverviewStatus,
} from "@/lib/dashboard-overview";
import { getErrorMessage } from "@/lib/ui-error";
import type {
  DailyUsage,
  DashboardStats,
  DashboardUser,
  RecentActivity,
  RecentMemory,
} from "@/types/dashboard";

type StatsResponse = {
  success?: boolean;
  stats?: DashboardStats;
  error?: unknown;
};

type MemoriesResponse = {
  success?: boolean;
  memories?: RecentMemory[];
  results?: RecentMemory[];
  error?: unknown;
};

type UsageResponse = {
  success?: boolean;
  usage?: {
    daily?: DailyUsage[];
  };
  error?: unknown;
};

type ActivityResponse = {
  success?: boolean;
  activity?: RecentActivity[];
  error?: unknown;
};

export default function DashboardOverviewClient({
  user,
  track2Enabled,
}: {
  user: DashboardUser;
  track2Enabled: boolean;
}) {
  const requestGuardRef = useRef(createLatestRequestGuard());
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentMemories, setRecentMemories] = useState<RecentMemory[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const request = requestGuardRef.current.begin();
    setIsRefreshing(true);
    try {
      const [statsResult, memoriesResult, usageResult, activityResult] = await Promise.allSettled([
        fetch("/api/dashboard/stats", { signal: request.signal }).then((response) =>
          readApiJson<StatsResponse>(response, "Dashboard stats could not be loaded")
        ),
        fetch("/api/memories?limit=5", { signal: request.signal }).then((response) =>
          readApiJson<MemoriesResponse>(response, "Recent memories could not be loaded")
        ),
        fetch("/api/dashboard/usage?period=7d", { signal: request.signal }).then((response) =>
          readApiJson<UsageResponse>(response, "Usage could not be loaded")
        ),
        fetch("/api/dashboard/activity?limit=10", { signal: request.signal }).then((response) =>
          readApiJson<ActivityResponse>(response, "Recent activity could not be loaded")
        ),
      ]);

      if (!requestGuardRef.current.isCurrent(request.id)) return;

      let failedCount = 0;

      if (statsResult.status === "fulfilled" && statsResult.value.success && statsResult.value.stats) {
        setStats(statsResult.value.stats);
      } else if (statsResult.status === "rejected" && !isAbortError(statsResult.reason)) {
        failedCount += 1;
      } else if (statsResult.status === "fulfilled" && !statsResult.value.success) {
        failedCount += 1;
      }

      if (memoriesResult.status === "fulfilled" && memoriesResult.value.success) {
        setRecentMemories(memoriesResult.value.results ?? memoriesResult.value.memories ?? []);
      } else if (memoriesResult.status === "rejected" && !isAbortError(memoriesResult.reason)) {
        failedCount += 1;
      } else if (memoriesResult.status === "fulfilled" && !memoriesResult.value.success) {
        failedCount += 1;
      }

      if (usageResult.status === "fulfilled" && usageResult.value.success) {
        setDailyUsage(usageResult.value.usage?.daily ?? []);
      } else if (usageResult.status === "rejected" && !isAbortError(usageResult.reason)) {
        failedCount += 1;
      } else if (usageResult.status === "fulfilled" && !usageResult.value.success) {
        failedCount += 1;
      }

      if (activityResult.status === "fulfilled" && activityResult.value.success) {
        setRecentActivity(activityResult.value.activity ?? []);
      } else if (activityResult.status === "rejected" && !isAbortError(activityResult.reason)) {
        failedCount += 1;
      } else if (activityResult.status === "fulfilled" && !activityResult.value.success) {
        failedCount += 1;
      }

      setError(failedCount > 0 ? "Some dashboard panels could not refresh. The available data is still shown." : null);
    } catch (loadError) {
      if (!isAbortError(loadError) && requestGuardRef.current.isCurrent(request.id)) {
        setError(getErrorMessage(loadError, "Dashboard overview could not be loaded."));
      }
    } finally {
      if (requestGuardRef.current.isCurrent(request.id)) {
        setIsLoading(false);
        setIsRefreshing(false);
        requestGuardRef.current.finish(request.id);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    const requestGuard = requestGuardRef.current;
    const interval = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, 30_000);
    return () => {
      window.clearInterval(interval);
      requestGuard.cancel();
    };
  }, [refresh]);

  const overview = useMemo<DashboardOverviewState>(
    () =>
      buildDashboardOverviewState({
        user,
        stats,
        recentMemories,
        recentActivity,
        dailyUsage,
        track2Enabled,
      }),
    [dailyUsage, recentActivity, recentMemories, stats, track2Enabled, user]
  );

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-app)] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl pb-16">
        <header className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-muted)]">Dashboard</p>
            <h1 className="mt-1 font-serif text-3xl font-medium text-[var(--text-primary)] sm:text-4xl">
              Welcome back, {overview.userLabel}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              One workspace for Author Memory, billing, API keys, MCP readiness, and recent operations.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={isRefreshing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--ink-25)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </button>
        </header>

        {error ? (
          <div className="mt-5 rounded-md border border-[var(--signal-pending)] bg-[var(--signal-pending-soft)] px-4 py-3 text-sm text-[var(--signal-pending-ink)]">
            {error}
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4 sm:grid-cols-2">
            {overview.cards.map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className="group rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 text-[var(--text-primary)] no-underline transition hover:border-[var(--terracotta-300)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      {card.label}
                    </p>
                    <p className="mt-3 text-2xl font-semibold">{isLoading ? "..." : card.value}</p>
                  </div>
                  <StatusIcon status={card.status} />
                </div>
                <p className="mt-3 min-h-10 text-sm leading-5 text-[var(--text-secondary)]">{card.detail}</p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--terracotta-700)]">
                  {card.cta}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>

          <aside className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Setup checklist
            </p>
            <div className="mt-4 grid gap-3">
              {overview.setup.map((step) => (
                <Link
                  key={step.id}
                  href={step.href}
                  className="flex min-h-14 items-start gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3 text-[var(--text-primary)] no-underline hover:bg-[var(--ink-25)]"
                >
                  <StatusIcon status={step.status} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{step.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">{step.detail}</span>
                  </span>
                  <span className="text-xs font-medium text-[var(--terracotta-700)]">{step.cta}</span>
                </Link>
              ))}
            </div>
          </aside>
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Last 7 days
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">API usage</h2>
              </div>
              <Link href="/dashboard/author?tab=usage" className="text-sm font-medium text-[var(--terracotta-700)]">
                Usage
              </Link>
            </div>
            <div className="mt-5 grid h-44 grid-cols-7 items-end gap-2">
              {overview.dailyUsage.length === 0
                ? Array.from({ length: 7 }).map((_, index) => (
                    <div key={index} className="h-8 rounded-md bg-[var(--ink-25)]" />
                  ))
                : overview.dailyUsage.slice(-7).map((day) => {
                    const max = Math.max(...overview.dailyUsage.map((entry) => entry.calls), 1);
                    const height = Math.max(12, Math.round((day.calls / max) * 160));
                    return (
                      <div key={day.date} className="flex h-full flex-col justify-end gap-2">
                        <div
                          className="rounded-md bg-[var(--terracotta-500)]"
                          style={{ height }}
                          title={`${day.calls} calls`}
                        />
                        <span className="truncate text-center text-[10px] text-[var(--text-muted)]">
                          {day.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Recent operations
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Activity</h2>
              </div>
              <Link href="/dashboard/account/api-keys/audit" className="text-sm font-medium text-[var(--terracotta-700)]">
                Audit log
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {overview.recentActivity.slice(0, 5).length === 0 ? (
                <p className="rounded-md border border-dashed border-[var(--border-subtle)] p-5 text-sm text-[var(--text-secondary)]">
                  No recent API activity yet. Create an API key or open the author workspace to start.
                </p>
              ) : (
                overview.recentActivity.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between gap-3 rounded-md bg-[var(--bg-app)] p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {activity.method} {activity.endpoint}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {activity.keyPrefix} - {activity.latencyMs ?? 0}ms
                      </p>
                    </div>
                    <span className="rounded-full bg-[var(--ink-25)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                      {activity.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusIcon({ status }: { status: DashboardOverviewStatus }) {
  if (status === "done") {
    return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--signal-canon)]" aria-hidden="true" />;
  }
  if (status === "attention") {
    return <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--terracotta-500)]" aria-hidden="true" />;
  }
  if (status === "blocked") {
    return <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--signal-conflict)]" aria-hidden="true" />;
  }
  return <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />;
}
