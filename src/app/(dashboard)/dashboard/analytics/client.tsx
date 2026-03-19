"use client";

import { useState, useEffect, useCallback } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { formatDate } from "@/lib/format-date";
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
  primary: "var(--szn-chart-1)",
  primaryLight: "#93c5fd",
  secondary: "var(--szn-chart-3)",
  secondaryLight: "#7dd3fc",
  tertiary: "var(--szn-accent-2)",
  tertiaryLight: "#bfdbfe",
  quaternary: "#60a5fa",
  quaternaryLight: "#dbeafe",
  error: "var(--szn-danger)",
  errorLight: "#fecaca",
  success: "var(--szn-success)",
  warning: "var(--szn-warning)",
  warningLight: "#fde68a",
};

const PIE_COLORS = ["var(--szn-chart-1)", "var(--szn-chart-3)", "var(--szn-accent-2)", "#60a5fa", "#93c5fd", "var(--szn-warning)"];

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

  type TooltipPayload = {
    color?: string;
    name?: string;
    value?: number | string;
  };

  type TooltipProps = {
    active?: boolean;
    payload?: TooltipPayload[];
    label?: string;
  };

  // Enhanced Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-slate-200/80 bg-white px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.08)] dark:border-slate-700/70 dark:bg-slate-900">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">{label}</p>
          <div className="mt-2 space-y-1">
            {payload.map((entry, index) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {entry.name}
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100" style={entry.color ? { color: entry.color } : undefined}>
                  {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative overflow-hidden space-y-6 rounded-3xl border border-slate-200/70 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-slate-700/60 dark:bg-slate-900/70 sm:p-8">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-slate-50/60 to-white dark:from-slate-950 dark:via-slate-900/40 dark:to-slate-950" />
        <div className="absolute top-[-180px] right-[-120px] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.08),transparent_70%)]" />
        <div className="absolute bottom-[-200px] left-[-120px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.06),transparent_70%)]" />
      </div>
      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div className="absolute -z-10 left-0 top-2 h-12 w-full rounded-full bg-slate-50/80 dark:bg-slate-800/40" />
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 flex items-center justify-center dark:bg-slate-900 dark:ring-slate-700">
            <AnalyticsHeaderIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t("dashboard.analyticsPage.title")}
            </h1>
            <p className="text-sm text-slate-600 mt-0.5 dark:text-slate-300">
              {t("dashboard.analyticsPage.subtitle")}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Organization Filter */}
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="all">{t("dashboard.analyticsPage.allOrganizations")}</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          {/* Period Selector */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl dark:bg-slate-800/60">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  period === p
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
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
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-50 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <DownloadIcon className="w-4 h-4" />
            {t("dashboard.analyticsPage.exportCSV")}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 dark:border-blue-400"></div>
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

          {/* Main Charts - with improvements */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Active Users Chart */}
            <div className="relative rounded-lg border border-slate-200/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-6 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition-shadow dark:border-slate-700/60 dark:bg-slate-900/60">
              <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.12),transparent_65%)] -mr-20 -mt-20 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-1 w-12 bg-gradient-to-r from-blue-600 to-sky-400 rounded-full" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t("dashboard.analyticsPage.dailyActiveUsers")}
                  </h3>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.daily}>
                       <defs>
                         <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.4} />
                           <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0.05} />
                         </linearGradient>
                       </defs>
                      <CartesianGrid strokeDasharray="4 4" stroke="var(--szn-border)" opacity={0.7} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => formatDate(value, "compact")}
                        stroke="var(--szn-text-3)"
                        fontSize={12}
                      />
                      <YAxis stroke="var(--szn-text-3)" fontSize={12} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="activeUsers"
                        name={t("dashboard.analyticsPage.activeUsers")}
                        stroke={CHART_COLORS.primary}
                        fill="url(#colorUsers)"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* API Calls Over Time */}
            <div className="relative rounded-lg border border-slate-200/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-6 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition-shadow dark:border-slate-700/60 dark:bg-slate-900/60">
              <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.12),transparent_65%)] -mr-20 -mt-20 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-1 w-12 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t("dashboard.analyticsPage.apiCallsOverTime")}
                  </h3>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.daily}>
                      <CartesianGrid strokeDasharray="4 4" stroke="var(--szn-border)" opacity={0.7} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => formatDate(value, "compact")}
                        stroke="var(--szn-text-3)"
                        fontSize={12}
                      />
                      <YAxis stroke="var(--szn-text-3)" fontSize={12} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="apiCalls"
                        name={t("dashboard.analyticsPage.apiCalls")}
                        stroke={CHART_COLORS.secondary}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="errors"
                        name={t("dashboard.analyticsPage.errors")}
                        stroke={CHART_COLORS.error}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Memory Usage Chart */}
            <div className="relative rounded-lg border border-slate-200/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-6 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition-shadow dark:border-slate-700/60 dark:bg-slate-900/60">
              <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.12),transparent_65%)] -mr-20 -mt-20 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-1 w-12 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t("dashboard.analyticsPage.memoryUsage")}
                  </h3>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.daily}>
                      <defs>
                        <linearGradient id="colorMemoryStores" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.tertiary} stopOpacity={0.9} />
                          <stop offset="95%" stopColor={CHART_COLORS.tertiary} stopOpacity={0.6} />
                        </linearGradient>
                        <linearGradient id="colorMemorySearches" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.quaternary} stopOpacity={0.9} />
                          <stop offset="95%" stopColor={CHART_COLORS.quaternary} stopOpacity={0.6} />
                        </linearGradient>
                      </defs>
                       <CartesianGrid strokeDasharray="4 4" stroke="var(--szn-border)" opacity={0.7} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => formatDate(value, "compact")}
                        stroke="var(--szn-text-3)"
                        fontSize={12}
                      />
                      <YAxis stroke="var(--szn-text-3)" fontSize={12} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar
                        dataKey="memoryStores"
                        name={t("dashboard.analyticsPage.stores")}
                        fill="url(#colorMemoryStores)"
                        radius={[6, 6, 0, 0]}
                      />
                      <Bar
                        dataKey="memorySearches"
                        name={t("dashboard.analyticsPage.searches")}
                        fill="url(#colorMemorySearches)"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Latency Trend */}
            <div className="relative rounded-lg border border-slate-200/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-6 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition-shadow dark:border-slate-700/60 dark:bg-slate-900/60">
              <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.18),transparent_65%)] -mr-20 -mt-20 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-1 w-12 bg-gradient-to-r from-amber-500 to-orange-400 rounded-full" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t("dashboard.analyticsPage.latencyTrend")}
                  </h3>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.daily}>
                      <CartesianGrid strokeDasharray="4 4" stroke="var(--szn-border)" opacity={0.7} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => formatDate(value, "compact")}
                        stroke="var(--szn-text-3)"
                        fontSize={12}
                      />
                      <YAxis stroke="var(--szn-text-3)" fontSize={12} unit="ms" />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="avgLatency"
                        name={t("dashboard.analyticsPage.avgLatency")}
                        stroke={CHART_COLORS.warning}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Hourly Distribution */}
            <div className="relative rounded-lg border border-slate-200/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-6 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition-shadow dark:border-slate-700/60 dark:bg-slate-900/60">
              <div className="absolute top-0 right-0 h-28 w-28 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.1),transparent_70%)] -mr-14 -mt-14 pointer-events-none" />
              <div className="relative">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                  {t("dashboard.analyticsPage.hourlyDistribution")}
                </h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.hourlyDistribution}>
                      <defs>
                        <linearGradient id="colorHourly" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.9} />
                          <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0.6} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" stroke="var(--szn-border)" opacity={0.5} />
                      <XAxis
                        dataKey="hour"
                        tickFormatter={(value) => `${value}:00`}
                        stroke="var(--szn-text-3)"
                        fontSize={10}
                      />
                      <YAxis stroke="var(--szn-text-3)" fontSize={10} />
                      <Tooltip
                        formatter={(value) => [typeof value === 'number' ? value.toLocaleString() : String(value), t("dashboard.analyticsPage.calls")]}
                        labelFormatter={(label) => `${label}:00 - ${label}:59`}
                      />
                      <Bar dataKey="calls" fill="url(#colorHourly)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 p-3 bg-blue-50/80 rounded-xl border border-blue-100 dark:bg-blue-950/30 dark:border-blue-900/40">
                  <p className="text-xs text-blue-700 text-center font-medium dark:text-blue-200">
                    {t("dashboard.analyticsPage.peakHour")}: {analytics.summary.peakHour}:00
                  </p>
                </div>
              </div>
            </div>

            {/* Endpoint Breakdown */}
            <div className="relative rounded-lg border border-slate-200/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-6 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition-shadow dark:border-slate-700/60 dark:bg-slate-900/60">
              <div className="absolute top-0 right-0 h-28 w-28 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.1),transparent_70%)] -mr-14 -mt-14 pointer-events-none" />
              <div className="relative">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
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
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={3}
                      >
                        {analytics.endpointBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => typeof value === 'number' ? value.toLocaleString() : String(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-3">
                  {analytics.endpointBreakdown.slice(0, 4).map((ep, index) => (
                    <div key={ep.endpoint} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                        />
                        <span className="text-slate-700 truncate max-w-[100px] font-medium dark:text-slate-200">
                          {ep.endpoint}
                        </span>
                      </div>
                      <span className="text-slate-900 font-bold dark:text-slate-100">{ep.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Queries */}
            <div className="relative rounded-lg border border-slate-200/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-6 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition-shadow dark:border-slate-700/60 dark:bg-slate-900/60">
              <div className="absolute top-0 right-0 h-28 w-28 rounded-full bg-[radial-gradient(circle_at_center,rgba(96,165,250,0.12),transparent_70%)] -mr-14 -mt-14 pointer-events-none" />
              <div className="relative">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                  {t("dashboard.analyticsPage.topQueries")}
                </h3>
                <div className="space-y-3">
                  {analytics.topQueries.slice(0, 5).map((query, index) => (
                    <div key={index} className="flex items-start justify-between gap-2 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors dark:bg-slate-800/60 dark:hover:bg-slate-800">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900 truncate font-medium dark:text-slate-100" title={query.query}>
                          {query.query}
                        </p>
                        <p className="text-xs text-slate-600 mt-1 dark:text-slate-300">
                          {query.avgLatency}ms avg
                        </p>
                      </div>
                      <span className="text-sm font-bold text-blue-600 whitespace-nowrap dark:text-blue-400">
                        {query.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {analytics.topQueries.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-8 dark:text-slate-400">
                      {t("dashboard.analyticsPage.noQueries")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-slate-200/70 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-12 dark:border-slate-700/60 dark:bg-slate-900/60">
          <div className="max-w-md mx-auto text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center dark:bg-slate-800/60 dark:ring-slate-700">
              <ChartIcon className="w-10 h-10 text-blue-500 dark:text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
              {t("dashboard.analyticsPage.noData")}
            </h3>
            <p className="text-slate-600 dark:text-slate-300">
              {t("dashboard.analyticsPage.noDataDescription")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Enhanced KPI Card Component
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
    ? "text-blue-500"
    : "text-red-500";

  const bgGradient = isError
    ? "from-white via-red-50/30 to-white dark:from-slate-950 dark:via-red-950/25 dark:to-slate-950"
    : "from-white via-slate-50 to-white dark:from-slate-950 dark:via-slate-900/50 dark:to-slate-950";

  const iconBgColor = isError
    ? "bg-red-50 text-red-500 dark:bg-red-950/35 dark:text-red-300"
    : "bg-blue-50 text-blue-600 dark:bg-blue-950/35 dark:text-blue-200";

  return (
    <div className={`relative rounded-lg border border-slate-200/70 bg-gradient-to-br ${bgGradient} p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-all hover:shadow-[0_14px_32px_rgba(15,23,42,0.08)] hover:border-slate-300 dark:border-slate-700/60 dark:hover:border-slate-600`}>
      <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.06),transparent_70%)] -mr-12 -mt-12" />

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl ${iconBgColor} flex items-center justify-center shadow-sm ring-1 ring-white dark:ring-slate-800`}>
            {icon}
          </div>
          {change !== 0 && (
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${changeColor} bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-700/70`}
            >
              {isPositive ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              )}
              {Math.abs(change).toFixed(1)}%
            </div>
          )}
        </div>
        <p className={`text-3xl font-bold mb-1 ${isError ? "text-red-600 dark:text-red-300" : "text-slate-900 dark:text-slate-100"}`}>
          {value}
        </p>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-300">{title}</p>
      </div>
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

function AnalyticsHeaderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    </svg>
  );
}
