"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { formatDate } from "@/lib/format-date";


interface DailyUsage {
  date: string;
  calls: number;
  tokens: number;
  cost: number;
  avgLatency: number;
  errors: number;
}

interface EndpointUsage {
  endpoint: string;
  calls: number;
  avgLatency: number;
  errors: number;
  errorRate: number;
}

interface ApiKeyUsage {
  keyId: string;
  name: string;
  prefix: string;
  calls: number;
}

interface UsageSummary {
  totalCalls: number;
  totalTokens: number;
  totalCostCents: number;
  totalCostDollars: string;
  totalErrors: number;
  errorRate: number;
  avgLatency: number;
  p95Latency: number;
}

type ChartTab = "calls" | "cost" | "latency" | "errors";

interface UsageData {
  daily: DailyUsage[];
  endpoints: EndpointUsage[];
  apiKeys: ApiKeyUsage[];
  summary: UsageSummary;
}

export function UsageClient() {
  const { t } = useDashboardTranslation();
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chartTab, setChartTab] = useState<ChartTab>("calls");

  const fetchUsage = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/dashboard/usage?period=${period}`);
      const data = await res.json();
      if (data.success) {
        setUsage(data.usage);
      }
    } catch (err) {
      console.error("Failed to fetch usage:", err);
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  return (
    <div className="space-y-8">
      

      {/* Main Content */}
      
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-szn-text-1 mb-2">
              {t("dashboard.usagePage.title")}
            </h2>
            <p className="text-szn-text-2">
              {t("dashboard.usagePage.subtitle")}
            </p>
          </div>

          {/* Period Selector */}
          <div className="flex gap-2">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-gradient-to-r from-szn-accent to-szn-accent/80 text-szn-text-1"
                    : "bg-szn-surface text-szn-text-2 hover:text-szn-text-1"
                }`}
              >
                {p === "7d" ? t("dashboard.usagePage.days7") : p === "30d" ? t("dashboard.usagePage.days30") : t("dashboard.usagePage.days90")}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-szn-text-2 text-center py-12">{t("dashboard.usagePage.loading")}</div>
        ) : usage ? (
          <>
            {/* Summary Cards - 2 rows of 3 */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              <div className="szn-card border border-szn-border rounded-2xl p-4">
                <p className="text-szn-text-2 text-sm">{t("dashboard.usagePage.totalApiCalls")}</p>
                <p className="text-2xl font-bold text-szn-text-1">
                  {usage.summary.totalCalls.toLocaleString()}
                </p>
              </div>
              <div className="szn-card border border-szn-border rounded-2xl p-4">
                <p className="text-szn-text-2 text-sm">{t("dashboard.usagePage.totalTokens")}</p>
                <p className="text-2xl font-bold text-szn-text-1">
                  {usage.summary.totalTokens.toLocaleString()}
                </p>
              </div>
              <div className="szn-card border border-szn-border rounded-2xl p-4">
                <p className="text-szn-text-2 text-sm">{t("dashboard.usagePage.estimatedCost")}</p>
                <p className="text-2xl font-bold bg-gradient-to-r from-szn-accent to-szn-success bg-clip-text text-transparent">
                  ${usage.summary.totalCostDollars}
                </p>
              </div>
              <div className="szn-card border border-szn-border rounded-2xl p-4">
                <p className="text-szn-text-2 text-sm">{t("dashboard.usagePage.avgLatency")}</p>
                <p className="text-2xl font-bold text-szn-text-1">
                  {usage.summary.avgLatency}ms
                </p>
              </div>
              <div className="szn-card border border-szn-border rounded-2xl p-4">
                <p className="text-szn-text-2 text-sm">{t("dashboard.usagePage.p95Latency")}</p>
                <p className="text-2xl font-bold text-szn-text-1">
                  {usage.summary.p95Latency}ms
                </p>
              </div>
              <div className="szn-card border border-szn-border rounded-2xl p-4">
                <p className="text-szn-text-2 text-sm">{t("dashboard.usagePage.errorRateKpi")}</p>
                <p className={`text-2xl font-bold ${usage.summary.errorRate > 5 ? 'text-red-500' : usage.summary.errorRate > 0 ? 'text-szn-warning' : 'text-szn-success'}`}>
                  {usage.summary.errorRate}%
                </p>
              </div>
            </div>

            {/* Daily Usage Chart with Tabs */}
            <div className="szn-card border border-szn-border rounded-2xl p-6 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h3 className="text-lg font-semibold text-szn-text-1">
                  {t("dashboard.usagePage.dailyTrends")}
                </h3>
                {/* Chart Tabs */}
                <div className="flex gap-1 p-1 bg-szn-surface rounded-lg">
                  {(["calls", "cost", "latency", "errors"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setChartTab(tab)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        chartTab === tab
                          ? "bg-szn-card text-szn-text-1 shadow-sm"
                          : "text-szn-text-2 hover:text-szn-text-1"
                      }`}
                    >
                      {t(`dashboard.usagePage.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-48 flex items-end gap-1">
                {usage.daily.map((day, i) => {
                  const getValue = () => {
                    switch (chartTab) {
                      case "calls": return day.calls;
                      case "cost": return day.cost / 100; // cents to dollars
                      case "latency": return day.avgLatency;
                      case "errors": return day.errors;
                      default: return day.calls;
                    }
                  };
                  const getMax = () => {
                    switch (chartTab) {
                      case "calls": return Math.max(...usage.daily.map(d => d.calls), 1);
                      case "cost": return Math.max(...usage.daily.map(d => d.cost / 100), 0.01);
                      case "latency": return Math.max(...usage.daily.map(d => d.avgLatency), 1);
                      case "errors": return Math.max(...usage.daily.map(d => d.errors), 1);
                      default: return 1;
                    }
                  };
                  const getLabel = () => {
                    switch (chartTab) {
                      case "calls": return `${day.calls} ${t("dashboard.usagePage.calls")}`;
                      case "cost": return `$${(day.cost / 100).toFixed(2)}`;
                      case "latency": return `${day.avgLatency}ms`;
                      case "errors": return `${day.errors} ${t("dashboard.usagePage.errors")}`;
                      default: return "";
                    }
                  };
                  const getColors = () => {
                    switch (chartTab) {
                      case "calls": return "from-szn-accent to-szn-accent/70 hover:from-szn-accent/90 hover:to-szn-accent/60";
                      case "cost": return "from-szn-success to-szn-success/70 hover:from-szn-success/90 hover:to-szn-success/60";
                      case "latency": return "from-blue-500 to-indigo-400 hover:from-blue-400 hover:to-indigo-300";
                      case "errors": return "from-red-500 to-orange-400 hover:from-red-400 hover:to-orange-300";
                      default: return "from-szn-accent to-szn-accent/70";
                    }
                  };
                  const value = getValue();
                  const max = getMax();
                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center group"
                    >
                      <div className="relative w-full">
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-szn-surface px-2 py-1 rounded text-xs text-szn-text-1 whitespace-nowrap z-10">
                          {getLabel()}
                          <br />
                          {day.date}
                        </div>
                        {/* Bar */}
                        <div
                          className={`w-full bg-gradient-to-t ${getColors()} rounded-t transition-colors`}
                          style={{
                            height: `${Math.max((value / max) * 160, 4)}px`,
                          }}
                        />
                      </div>
                      {/* Date label (show every few days) */}
                      {(i === 0 ||
                        i === usage.daily.length - 1 ||
                        i % Math.ceil(usage.daily.length / 7) === 0) && (
                        <span className="text-szn-text-3 text-xs mt-2 transform -rotate-45 origin-left">
                          {formatDate(day.date, "compact")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Endpoint Breakdown */}
              <div className="szn-card border border-szn-border rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-szn-text-1 mb-4">
                  {t("dashboard.usagePage.endpointUsage")}
                </h3>
                {usage.endpoints.length === 0 ? (
                  <EmptyState
                    icon={<EndpointIcon className="w-8 h-8 text-szn-accent" />}
                    title={t("dashboard.usagePage.noEndpointData")}
                    description={t("dashboard.usagePage.noEndpointDescription")}
                    cta={{
                      label: t("dashboard.usagePage.sendTestRequest"),
                      href: "/dashboard/keys",
                    }}
                  />
                ) : (
                  <div className="space-y-3">
                    {usage.endpoints.slice(0, 5).map((ep) => (
                      <div key={ep.endpoint}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-szn-text-1 font-mono truncate max-w-[200px]">
                            {ep.endpoint}
                          </span>
                          <span className="text-szn-text-2">
                            {ep.calls.toLocaleString()} {t("dashboard.usagePage.calls")}
                          </span>
                        </div>
                        <div className="h-2 bg-szn-surface rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-szn-accent to-szn-accent/70 rounded-full"
                            style={{
                              width: `${(ep.calls / usage.endpoints[0].calls) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-szn-text-3 mt-1">
                          <span>{ep.avgLatency}ms {t("dashboard.usagePage.avg")}</span>
                          {ep.errors > 0 && (
                            <span className="text-red-500">
                              {ep.errorRate}% {t("dashboard.usagePage.errors")}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* API Key Breakdown */}
              <div className="szn-card border border-szn-border rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-szn-text-1 mb-4">
                  {t("dashboard.usagePage.usageByApiKey")}
                </h3>
                {usage.apiKeys.length === 0 ? (
                  <EmptyState
                    icon={<KeyIcon className="w-8 h-8 text-blue-400" />}
                    title={t("dashboard.usagePage.noKeyData")}
                    description={t("dashboard.usagePage.noKeyDescription")}
                    cta={{
                      label: t("dashboard.usagePage.createApiKey"),
                      href: "/dashboard/keys",
                    }}
                  />
                ) : (
                  <div className="space-y-3">
                    {usage.apiKeys.slice(0, 5).map((key) => (
                      <div key={key.keyId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-szn-text-1">
                            {key.name || key.prefix + "..."}
                          </span>
                          <span className="text-szn-text-2">
                            {key.calls.toLocaleString()} {t("dashboard.usagePage.calls")}
                          </span>
                        </div>
                        <div className="h-2 bg-szn-surface rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{
                              width: `${(key.calls / usage.apiKeys[0].calls) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Error Rate */}
            {usage.summary.totalErrors > 0 && (
              <div className="mt-8 bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-red-500 mb-2">
                  {t("dashboard.usagePage.errorsTitle")}
                </h3>
                <p className="text-szn-text-1">
                  {usage.summary.totalErrors} {t("dashboard.usagePage.errors")} (
                  {usage.summary.errorRate}% {t("dashboard.usagePage.errorRate")})
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="szn-card border border-szn-border rounded-2xl p-12">
            <div className="max-w-md mx-auto text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-szn-accent/10 to-szn-accent/5 flex items-center justify-center">
                <ChartIcon className="w-10 h-10 text-szn-accent" />
              </div>
              <h3 className="text-xl font-semibold text-szn-text-1 mb-2">
                {t("dashboard.usagePage.noUsageTitle")}
              </h3>
              <p className="text-szn-text-2 mb-6">
                {t("dashboard.usagePage.noUsageDescription")}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/dashboard/keys"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-szn-accent to-szn-accent/80 text-white text-sm font-medium hover:from-szn-accent/90 hover:to-szn-accent/70 transition-all"
                >
                  <KeyIcon className="w-4 h-4" />
                  {t("dashboard.usagePage.getApiKey")}
                </Link>
                <Link
                  href="/docs/quickstart"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-szn-surface text-szn-text-1 text-sm font-medium hover:bg-szn-surface-1 transition-all"
                >
                  <BookIcon className="w-4 h-4" />
                  {t("dashboard.usagePage.viewDocs")}
                </Link>
              </div>
              <p className="mt-6 text-xs text-szn-text-3">
                {t("dashboard.usagePage.noUsageExpected")}
              </p>
            </div>
          </div>
        )}
      </div>);
}

// Reusable Empty State Component
function EmptyState({
  icon,
  title,
  description,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="py-8 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-szn-bg flex items-center justify-center">
        {icon}
      </div>
      <h4 className="text-szn-text-1 font-medium mb-1">{title}</h4>
      <p className="text-sm text-szn-text-2 mb-4">{description}</p>
      {cta && (
        <Link
          href={cta.href}
          className="inline-flex items-center gap-1 text-sm text-szn-accent hover:text-szn-accent/80 font-medium"
        >
          {cta.label}
          <ArrowIcon className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

// Icons
function EndpointIcon({ className }: { className?: string }) {
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

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
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

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}
