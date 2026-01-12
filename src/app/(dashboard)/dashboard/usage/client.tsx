"use client";

import { useState, useEffect, useCallback } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";


interface DailyUsage {
  date: string;
  calls: number;
  tokens: number;
  cost: number;
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
}

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

  const maxCalls = usage?.daily
    ? Math.max(...usage.daily.map((d) => d.calls), 1)
    : 1;

  return (
    <div className="space-y-8">
      

      {/* Main Content */}
      
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {t("dashboard.usagePage.title")}
            </h2>
            <p className="text-gray-500">
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
                    ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-gray-900"
                    : "bg-gray-100 text-gray-500 hover:text-gray-900"
                }`}
              >
                {p === "7d" ? t("dashboard.usagePage.days7") : p === "30d" ? t("dashboard.usagePage.days30") : t("dashboard.usagePage.days90")}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-gray-500 text-center py-12">{t("dashboard.usagePage.loading")}</div>
        ) : usage ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="glass-card border border-gray-200 rounded-2xl p-4">
                <p className="text-gray-500 text-sm">{t("dashboard.usagePage.totalApiCalls")}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {usage.summary.totalCalls.toLocaleString()}
                </p>
              </div>
              <div className="glass-card border border-gray-200 rounded-2xl p-4">
                <p className="text-gray-500 text-sm">{t("dashboard.usagePage.totalTokens")}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {usage.summary.totalTokens.toLocaleString()}
                </p>
              </div>
              <div className="glass-card border border-gray-200 rounded-2xl p-4">
                <p className="text-gray-500 text-sm">{t("dashboard.usagePage.estimatedCost")}</p>
                <p className="text-2xl font-bold bg-gradient-to-r from-teal-500 to-emerald-500 bg-clip-text text-transparent">
                  ${usage.summary.totalCostDollars}
                </p>
              </div>
              <div className="glass-card border border-gray-200 rounded-2xl p-4">
                <p className="text-gray-500 text-sm">{t("dashboard.usagePage.avgLatency")}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {usage.summary.avgLatency}ms
                </p>
              </div>
            </div>

            {/* Daily Usage Chart */}
            <div className="glass-card border border-gray-200 rounded-2xl p-6 mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">
                {t("dashboard.usagePage.dailyApiCalls")}
              </h3>
              <div className="h-48 flex items-end gap-1">
                {usage.daily.map((day, i) => (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center group"
                  >
                    <div className="relative w-full">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-100 px-2 py-1 rounded text-xs text-gray-900 whitespace-nowrap z-10">
                        {day.calls} {t("dashboard.usagePage.calls")}
                        <br />
                        {day.date}
                      </div>
                      {/* Bar */}
                      <div
                        className="w-full bg-gradient-to-t from-teal-500 to-cyan-400 hover:from-teal-400 hover:to-cyan-300 rounded-t transition-colors"
                        style={{
                          height: `${Math.max((day.calls / maxCalls) * 160, 4)}px`,
                        }}
                      />
                    </div>
                    {/* Date label (show every few days) */}
                    {(i === 0 ||
                      i === usage.daily.length - 1 ||
                      i % Math.ceil(usage.daily.length / 7) === 0) && (
                      <span className="text-gray-400 text-xs mt-2 transform -rotate-45 origin-left">
                        {new Date(day.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Endpoint Breakdown */}
              <div className="glass-card border border-gray-200 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {t("dashboard.usagePage.endpointUsage")}
                </h3>
                {usage.endpoints.length === 0 ? (
                  <p className="text-gray-400 text-sm">{t("dashboard.usagePage.noData")}</p>
                ) : (
                  <div className="space-y-3">
                    {usage.endpoints.slice(0, 5).map((ep) => (
                      <div key={ep.endpoint}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 font-mono truncate max-w-[200px]">
                            {ep.endpoint}
                          </span>
                          <span className="text-gray-500">
                            {ep.calls.toLocaleString()} {t("dashboard.usagePage.calls")}
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-teal-400 to-cyan-500 rounded-full"
                            style={{
                              width: `${(ep.calls / usage.endpoints[0].calls) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
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
              <div className="glass-card border border-gray-200 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {t("dashboard.usagePage.usageByApiKey")}
                </h3>
                {usage.apiKeys.length === 0 ? (
                  <p className="text-gray-400 text-sm">{t("dashboard.usagePage.noData")}</p>
                ) : (
                  <div className="space-y-3">
                    {usage.apiKeys.slice(0, 5).map((key) => (
                      <div key={key.keyId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">
                            {key.name || key.prefix + "..."}
                          </span>
                          <span className="text-gray-500">
                            {key.calls.toLocaleString()} {t("dashboard.usagePage.calls")}
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
                <p className="text-gray-700">
                  {usage.summary.totalErrors} {t("dashboard.usagePage.errors")} (
                  {usage.summary.errorRate}% {t("dashboard.usagePage.errorRate")})
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-500 text-center py-12">
            {t("dashboard.usagePage.noUsageData")}
          </div>
        )}
      </div>);
}
