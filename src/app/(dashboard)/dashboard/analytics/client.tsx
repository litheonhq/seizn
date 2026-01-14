"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from "recharts";

// Types
interface DailyMetrics {
  date: string;
  activeUsers: number;
  apiCalls: number;
  memoryStores: number;
  memorySearches: number;
  avgLatency: number;
  errors: number;
  errorRate: number;
}

interface HourlyDistribution {
  hour: number;
  calls: number;
}

interface TopQuery {
  query: string;
  count: number;
  avgLatency: number;
}

interface EndpointBreakdown {
  endpoint: string;
  calls: number;
  percentage: number;
  [key: string]: string | number;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface AnalyticsData {
  daily: DailyMetrics[];
  hourlyDistribution: HourlyDistribution[];
  topQueries: TopQuery[];
  endpointBreakdown: EndpointBreakdown[];
  summary: {
    totalDAU: number;
    dauChange: number;
    totalApiCalls: number;
    apiCallsChange: number;
    totalMemoryOps: number;
    memoryOpsChange: number;
    avgLatency: number;
    latencyChange: number;
    errorRate: number;
    errorRateChange: number;
    peakHour: number;
  };
}

const CHART_COLORS = {
  primary: "#14b8a6",
  secondary: "#06b6d4",
  tertiary: "#3b82f6",
  quaternary: "#8b5cf6",
  error: "#ef4444",
  success: "#22c55e",
  warning: "#f59e0b",
};

const PIE_COLORS = ["#14b8a6", "#06b6d4", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899"];

export function AnalyticsClient() {
  const { t } = useDashboardTranslation();
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [selectedOrg, setSelectedOrg] = useState<string>("all");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch organizations
  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/organizations");
      const data = await res.json();
      if (data.success && data.organizations) {
        setOrganizations(data.organizations);
      }
    } catch (err) {
      console.error("Failed to fetch organizations:", err);
    }
  }, []);

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      const orgParam = selectedOrg !== "all" ? `&orgId=${selectedOrg}` : "";
      const res = await fetch(`/api/dashboard/analytics?period=${period}${orgParam}`);
      const data = await res.json();
      if (data.success) {
        setAnalytics(data.analytics);
      }
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setIsLoading(false);
    }
  }, [period, selectedOrg]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Export to CSV
  const handleExportCSV = useCallback(() => {
    if (!analytics) return;

    const headers = ["Date", "Active Users", "API Calls", "Memory Stores", "Memory Searches", "Avg Latency (ms)", "Errors", "Error Rate (%)"];
    const rows = analytics.daily.map((d) => [
      d.date,
      d.activeUsers,
      d.apiCalls,
      d.memoryStores,
      d.memorySearches,
      d.avgLatency,
      d.errors,
      d.errorRate,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `seizn-analytics-${period}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  }, [analytics, period]);

  // Format number with K/M suffix
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card bg-white/95 dark:bg-gray-800/95 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {entry.name}: {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t("dashboard.analyticsPage.title")}
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            {t("dashboard.analyticsPage.subtitle")}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Organization Filter */}
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="all">{t("dashboard.analyticsPage.allOrganizations")}</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          {/* Period Selector */}
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  period === p
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {p === "7d"
                  ? t("dashboard.analyticsPage.days7")
                  : p === "30d"
                  ? t("dashboard.analyticsPage.days30")
                  : t("dashboard.analyticsPage.days90")}
              </button>
            ))}
          </div>

          {/* Export Button */}
          <button
            onClick={handleExportCSV}
            disabled={!analytics}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <DownloadIcon className="w-4 h-4" />
            {t("dashboard.analyticsPage.exportCSV")}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
        </div>
      ) : analytics ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard
              title={t("dashboard.analyticsPage.dailyActiveUsers")}
              value={formatNumber(analytics.summary.totalDAU)}
              change={analytics.summary.dauChange}
              icon={<UsersIcon className="w-5 h-5" />}
            />
            <KpiCard
              title={t("dashboard.analyticsPage.apiCalls")}
              value={formatNumber(analytics.summary.totalApiCalls)}
              change={analytics.summary.apiCallsChange}
              icon={<ApiIcon className="w-5 h-5" />}
            />
            <KpiCard
              title={t("dashboard.analyticsPage.memoryOperations")}
              value={formatNumber(analytics.summary.totalMemoryOps)}
              change={analytics.summary.memoryOpsChange}
              icon={<DatabaseIcon className="w-5 h-5" />}
            />
            <KpiCard
              title={t("dashboard.analyticsPage.avgLatency")}
              value={`${analytics.summary.avgLatency}ms`}
              change={-analytics.summary.latencyChange}
              icon={<ClockIcon className="w-5 h-5" />}
              invertChange
            />
            <KpiCard
              title={t("dashboard.analyticsPage.errorRate")}
              value={`${analytics.summary.errorRate}%`}
              change={-analytics.summary.errorRateChange}
              icon={<AlertIcon className="w-5 h-5" />}
              invertChange
              isError={analytics.summary.errorRate > 5}
            />
          </div>

          {/* Main Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Active Users Chart */}
            <div className="glass-card border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t("dashboard.analyticsPage.dailyActiveUsers")}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.daily}>
                    <defs>
                      <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      stroke="#9ca3af"
                      fontSize={12}
                    />
                    <YAxis stroke="#9ca3af" fontSize={12} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="activeUsers"
                      name={t("dashboard.analyticsPage.activeUsers")}
                      stroke={CHART_COLORS.primary}
                      fill="url(#colorUsers)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* API Calls Over Time */}
            <div className="glass-card border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t("dashboard.analyticsPage.apiCallsOverTime")}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      stroke="#9ca3af"
                      fontSize={12}
                    />
                    <YAxis stroke="#9ca3af" fontSize={12} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="apiCalls"
                      name={t("dashboard.analyticsPage.apiCalls")}
                      stroke={CHART_COLORS.secondary}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="errors"
                      name={t("dashboard.analyticsPage.errors")}
                      stroke={CHART_COLORS.error}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Memory Usage Chart */}
            <div className="glass-card border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t("dashboard.analyticsPage.memoryUsage")}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      stroke="#9ca3af"
                      fontSize={12}
                    />
                    <YAxis stroke="#9ca3af" fontSize={12} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar
                      dataKey="memoryStores"
                      name={t("dashboard.analyticsPage.stores")}
                      fill={CHART_COLORS.tertiary}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="memorySearches"
                      name={t("dashboard.analyticsPage.searches")}
                      fill={CHART_COLORS.quaternary}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Latency Trend */}
            <div className="glass-card border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t("dashboard.analyticsPage.latencyTrend")}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      stroke="#9ca3af"
                      fontSize={12}
                    />
                    <YAxis stroke="#9ca3af" fontSize={12} unit="ms" />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="avgLatency"
                      name={t("dashboard.analyticsPage.avgLatency")}
                      stroke={CHART_COLORS.warning}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Hourly Distribution */}
            <div className="glass-card border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t("dashboard.analyticsPage.hourlyDistribution")}
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.hourlyDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(value) => `${value}:00`}
                      stroke="#9ca3af"
                      fontSize={10}
                    />
                    <YAxis stroke="#9ca3af" fontSize={10} />
                    <Tooltip
                      formatter={(value) => [typeof value === 'number' ? value.toLocaleString() : String(value), t("dashboard.analyticsPage.calls")]}
                      labelFormatter={(label) => `${label}:00 - ${label}:59`}
                    />
                    <Bar dataKey="calls" fill={CHART_COLORS.primary} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                {t("dashboard.analyticsPage.peakHour")}: {analytics.summary.peakHour}:00
              </p>
            </div>

            {/* Endpoint Breakdown */}
            <div className="glass-card border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t("dashboard.analyticsPage.endpointBreakdown")}
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.endpointBreakdown}
                      dataKey="calls"
                      nameKey="endpoint"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      {analytics.endpointBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => typeof value === 'number' ? value.toLocaleString() : String(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 mt-2">
                {analytics.endpointBreakdown.slice(0, 4).map((ep, index) => (
                  <div key={ep.endpoint} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="text-gray-600 dark:text-gray-400 truncate max-w-[100px]">
                        {ep.endpoint}
                      </span>
                    </div>
                    <span className="text-gray-900 dark:text-white font-medium">{ep.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Queries */}
            <div className="glass-card border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t("dashboard.analyticsPage.topQueries")}
              </h3>
              <div className="space-y-3">
                {analytics.topQueries.slice(0, 5).map((query, index) => (
                  <div key={index} className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white truncate" title={query.query}>
                        {query.query}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {query.avgLatency}ms avg
                      </p>
                    </div>
                    <span className="text-sm font-medium text-teal-600 dark:text-teal-400 whitespace-nowrap">
                      {query.count.toLocaleString()}
                    </span>
                  </div>
                ))}
                {analytics.topQueries.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    {t("dashboard.analyticsPage.noQueries")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="glass-card border border-gray-200 dark:border-gray-700 rounded-2xl p-12">
          <div className="max-w-md mx-auto text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 flex items-center justify-center">
              <ChartIcon className="w-10 h-10 text-teal-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {t("dashboard.analyticsPage.noData")}
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              {t("dashboard.analyticsPage.noDataDescription")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// KPI Card Component
function KpiCard({
  title,
  value,
  change,
  icon,
  invertChange = false,
  isError = false,
}: {
  title: string;
  value: string;
  change: number;
  icon: React.ReactNode;
  invertChange?: boolean;
  isError?: boolean;
}) {
  const isPositive = invertChange ? change <= 0 : change >= 0;
  const changeColor = isError
    ? "text-red-500"
    : isPositive
    ? "text-green-500"
    : "text-red-500";

  return (
    <div className="glass-card border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 dark:text-gray-500">{icon}</span>
        {change !== 0 && (
          <span className={`text-xs font-medium ${changeColor}`}>
            {change > 0 ? "+" : ""}
            {change.toFixed(1)}%
          </span>
        )}
      </div>
      <p className={`text-2xl font-bold ${isError ? "text-red-500" : "text-gray-900 dark:text-white"}`}>
        {value}
      </p>
      <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{title}</p>
    </div>
  );
}

// Icons
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}

function ApiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
      />
    </svg>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  );
}
