"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold text-white">
              Seizn<span className="text-emerald-400">.</span>
            </Link>
            <nav className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-zinc-400 hover:text-white text-sm"
              >
                Dashboard
              </Link>
              <Link href="/dashboard/usage" className="text-white text-sm">
                Usage
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Usage Analytics
            </h2>
            <p className="text-zinc-400">
              Monitor your API usage and costs.
            </p>
          </div>

          {/* Period Selector */}
          <div className="flex gap-2">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "90 Days"}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-zinc-400 text-center py-12">Loading...</div>
        ) : usage ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-sm">Total API Calls</p>
                <p className="text-2xl font-bold text-white">
                  {usage.summary.totalCalls.toLocaleString()}
                </p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-sm">Total Tokens</p>
                <p className="text-2xl font-bold text-white">
                  {usage.summary.totalTokens.toLocaleString()}
                </p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-sm">Estimated Cost</p>
                <p className="text-2xl font-bold text-emerald-400">
                  ${usage.summary.totalCostDollars}
                </p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-zinc-400 text-sm">Avg Latency</p>
                <p className="text-2xl font-bold text-white">
                  {usage.summary.avgLatency}ms
                </p>
              </div>
            </div>

            {/* Daily Usage Chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
              <h3 className="text-lg font-semibold text-white mb-6">
                Daily API Calls
              </h3>
              <div className="h-48 flex items-end gap-1">
                {usage.daily.map((day, i) => (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center group"
                  >
                    <div className="relative w-full">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800 px-2 py-1 rounded text-xs text-white whitespace-nowrap z-10">
                        {day.calls} calls
                        <br />
                        {day.date}
                      </div>
                      {/* Bar */}
                      <div
                        className="w-full bg-emerald-500/80 hover:bg-emerald-400 rounded-t transition-colors"
                        style={{
                          height: `${Math.max((day.calls / maxCalls) * 160, 4)}px`,
                        }}
                      />
                    </div>
                    {/* Date label (show every few days) */}
                    {(i === 0 ||
                      i === usage.daily.length - 1 ||
                      i % Math.ceil(usage.daily.length / 7) === 0) && (
                      <span className="text-zinc-500 text-xs mt-2 transform -rotate-45 origin-left">
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
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Endpoint Usage
                </h3>
                {usage.endpoints.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No data yet</p>
                ) : (
                  <div className="space-y-3">
                    {usage.endpoints.slice(0, 5).map((ep) => (
                      <div key={ep.endpoint}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-zinc-300 font-mono truncate max-w-[200px]">
                            {ep.endpoint}
                          </span>
                          <span className="text-zinc-400">
                            {ep.calls.toLocaleString()} calls
                          </span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{
                              width: `${(ep.calls / usage.endpoints[0].calls) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-zinc-500 mt-1">
                          <span>{ep.avgLatency}ms avg</span>
                          {ep.errors > 0 && (
                            <span className="text-red-400">
                              {ep.errorRate}% errors
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* API Key Breakdown */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Usage by API Key
                </h3>
                {usage.apiKeys.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No data yet</p>
                ) : (
                  <div className="space-y-3">
                    {usage.apiKeys.slice(0, 5).map((key) => (
                      <div key={key.keyId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-zinc-300">
                            {key.name || key.prefix + "..."}
                          </span>
                          <span className="text-zinc-400">
                            {key.calls.toLocaleString()} calls
                          </span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
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
              <div className="mt-8 bg-red-500/10 border border-red-500/20 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-red-400 mb-2">
                  Errors
                </h3>
                <p className="text-zinc-300">
                  {usage.summary.totalErrors} errors (
                  {usage.summary.errorRate}% error rate) in the selected period.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="text-zinc-400 text-center py-12">
            No usage data available
          </div>
        )}
      </main>
    </div>
  );
}
