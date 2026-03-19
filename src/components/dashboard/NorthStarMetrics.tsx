"use client";

import { useState, useEffect, useCallback } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { getErrorMessage } from "@/lib/ui-error";
import { formatDate } from "@/lib/format-date";

interface TTFTMetric {
  p75Minutes: number | null;
  p50Minutes: number | null;
  sampleSize: number;
  trend: "improving" | "stable" | "declining" | "insufficient_data";
  target: number;
}

interface TTDMetric {
  averageMinutes: number | null;
  medianMinutes: number | null;
  sampleSize: number;
  trend: "improving" | "stable" | "declining" | "insufficient_data";
  target: number;
}

interface CostPredictabilityMetric {
  overrunsBlocked: number;
  totalBudgetChecks: number;
  blockRate: number;
  savingsEstimate: number;
  trend: "improving" | "stable" | "declining" | "insufficient_data";
}

interface RegressionRateMetric {
  detectionsThisPeriod: number;
  rollbacksThisPeriod: number;
  totalEvals: number;
  detectionRate: number;
  trend: "improving" | "stable" | "declining" | "insufficient_data";
}

interface NorthStarMetrics {
  ttft: TTFTMetric;
  ttd: TTDMetric;
  costPredictability: CostPredictabilityMetric;
  regressionRate: RegressionRateMetric;
  lastUpdated: string;
}

interface Props {
  organizationId?: string;
  compact?: boolean;
}

export function NorthStarMetrics({ organizationId, compact = false }: Props) {
  const { t, locale } = useDashboardTranslation();
  const [metrics, setMetrics] = useState<NorthStarMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (organizationId) {
        params.append("organizationId", organizationId);
      }

      const response = await fetch(`/api/dashboard/north-star?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setMetrics(data.metrics);
      } else {
        setError(getErrorMessage(data.error, "Failed to load metrics"));
      }
    } catch (err) {
      console.error("Failed to fetch North Star metrics:", err);
      setError(getErrorMessage(err, "Failed to load metrics"));
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "improving":
        return <TrendUpIcon className="w-4 h-4 text-green-500" />;
      case "declining":
        return <TrendDownIcon className="w-4 h-4 text-red-500" />;
      case "stable":
        return <TrendFlatIcon className="w-4 h-4 text-blue-500" />;
      default:
        return <QuestionIcon className="w-4 h-4 text-szn-text-3" />;
    }
  };

  const getTrendLabel = (trend: string) => {
    switch (trend) {
      case "improving":
        return t("dashboard.northStar.improving") || "Improving";
      case "declining":
        return t("dashboard.northStar.declining") || "Declining";
      case "stable":
        return t("dashboard.northStar.stable") || "Stable";
      default:
        return t("dashboard.northStar.insufficientData") || "Insufficient data";
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "improving":
        return "text-green-600 bg-green-50";
      case "declining":
        return "text-red-600 bg-red-50";
      case "stable":
        return "text-blue-600 bg-blue-50";
      default:
        return "text-szn-text-2 bg-szn-bg";
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (minutes === null) return "-";
    if (minutes < 1) return `${Math.round(minutes * 60)}s`;
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  };

  if (isLoading) {
    return (
      <div className={`szn-card rounded-lg overflow-hidden ${compact ? "p-4" : "p-6"}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-szn-surface rounded w-48 mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-szn-surface rounded w-24" />
                <div className="h-8 bg-szn-surface rounded w-16" />
                <div className="h-3 bg-szn-surface rounded w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`szn-card rounded-lg overflow-hidden ${compact ? "p-4" : "p-6"}`}>
        <div className="flex items-center gap-3 text-amber-600">
          <WarningIcon className="w-5 h-5" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  if (compact) {
    return (
      <div className="szn-card rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-szn-text-1 text-sm">
            {t("dashboard.northStar.title") || "North Star Metrics"}
          </h3>
          <span className="text-xs text-szn-text-3">
            {formatDate(metrics.lastUpdated)}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <MetricMini
            label="TTFT"
            value={formatDuration(metrics.ttft.p75Minutes)}
            trend={metrics.ttft.trend}
          />
          <MetricMini
            label="TTD"
            value={formatDuration(metrics.ttd.medianMinutes)}
            trend={metrics.ttd.trend}
          />
          <MetricMini
            label={t("dashboard.northStar.blocked") || "Blocked"}
            value={metrics.costPredictability.overrunsBlocked.toString()}
            trend={metrics.costPredictability.trend}
          />
          <MetricMini
            label={t("dashboard.northStar.regressions") || "Regressions"}
            value={metrics.regressionRate.detectionsThisPeriod.toString()}
            trend={metrics.regressionRate.trend}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="szn-card rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b theme-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-szn-surface flex items-center justify-center">
            <ChartIcon className="w-5 h-5 text-szn-text-2" />
          </div>
          <div>
            <h2 className="font-semibold text-szn-text-1">
              {t("dashboard.northStar.title") || "North Star Metrics"}
            </h2>
            <p className="text-xs text-szn-text-2">
              {t("dashboard.northStar.subtitle") || "Key performance indicators"}
            </p>
          </div>
        </div>
        <button
          onClick={fetchMetrics}
          className="p-2 hover:bg-szn-surface-1 rounded-lg transition-colors"
          title={t("dashboard.northStar.refresh") || "Refresh"}
        >
          <RefreshIcon className="w-4 h-4 text-szn-text-2" />
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* TTFT - Time to First Trace */}
        <MetricCard
          title={t("dashboard.northStar.ttft.title") || "Time to First Trace"}
          subtitle={t("dashboard.northStar.ttft.subtitle") || "Signup to first trace (p75)"}
          value={formatDuration(metrics.ttft.p75Minutes)}
          secondaryValue={
            metrics.ttft.p50Minutes !== null
              ? `p50: ${formatDuration(metrics.ttft.p50Minutes)}`
              : undefined
          }
          target={`${t("dashboard.northStar.target") || "Target"}: ${formatDuration(metrics.ttft.target)}`}
          trend={metrics.ttft.trend}
          trendLabel={getTrendLabel(metrics.ttft.trend)}
          trendColor={getTrendColor(metrics.ttft.trend)}
          trendIcon={getTrendIcon(metrics.ttft.trend)}
          sampleSize={metrics.ttft.sampleSize}
          icon={<ClockIcon className="w-4 h-4 text-cyan-500" />}
          gradient=""
        />

        {/* TTD - Time to Debug */}
        <MetricCard
          title={t("dashboard.northStar.ttd.title") || "Time to Debug"}
          subtitle={t("dashboard.northStar.ttd.subtitle") || "Incident to root cause"}
          value={formatDuration(metrics.ttd.medianMinutes)}
          secondaryValue={
            metrics.ttd.averageMinutes !== null
              ? `${t("dashboard.northStar.average") || "Avg"}: ${formatDuration(metrics.ttd.averageMinutes)}`
              : undefined
          }
          target={`${t("dashboard.northStar.target") || "Target"}: ${formatDuration(metrics.ttd.target)}`}
          trend={metrics.ttd.trend}
          trendLabel={getTrendLabel(metrics.ttd.trend)}
          trendColor={getTrendColor(metrics.ttd.trend)}
          trendIcon={getTrendIcon(metrics.ttd.trend)}
          sampleSize={metrics.ttd.sampleSize}
          icon={<BugIcon className="w-4 h-4 text-amber-500" />}
          gradient=""
        />

        {/* Cost Predictability */}
        <MetricCard
          title={t("dashboard.northStar.cost.title") || "Cost Predictability"}
          subtitle={t("dashboard.northStar.cost.subtitle") || "Budget overruns blocked"}
          value={metrics.costPredictability.overrunsBlocked.toString()}
          secondaryValue={
            metrics.costPredictability.savingsEstimate > 0
              ? `${t("dashboard.northStar.saved") || "Saved"}: ${formatCurrency(metrics.costPredictability.savingsEstimate)}`
              : undefined
          }
          target={`${metrics.costPredictability.blockRate}% ${t("dashboard.northStar.blockRate") || "block rate"}`}
          trend={metrics.costPredictability.trend}
          trendLabel={getTrendLabel(metrics.costPredictability.trend)}
          trendColor={getTrendColor(metrics.costPredictability.trend)}
          trendIcon={getTrendIcon(metrics.costPredictability.trend)}
          sampleSize={metrics.costPredictability.totalBudgetChecks}
          icon={<ShieldIcon className="w-4 h-4 text-green-500" />}
          gradient=""
        />

        {/* Regression Rate */}
        <MetricCard
          title={t("dashboard.northStar.regression.title") || "Regression Rate"}
          subtitle={t("dashboard.northStar.regression.subtitle") || "Eval drops detected"}
          value={metrics.regressionRate.detectionsThisPeriod.toString()}
          secondaryValue={
            metrics.regressionRate.rollbacksThisPeriod > 0
              ? `${metrics.regressionRate.rollbacksThisPeriod} ${t("dashboard.northStar.rolledBack") || "rolled back"}`
              : undefined
          }
          target={`${metrics.regressionRate.detectionRate}% ${t("dashboard.northStar.detectionRate") || "detection rate"}`}
          trend={metrics.regressionRate.trend}
          trendLabel={getTrendLabel(metrics.regressionRate.trend)}
          trendColor={getTrendColor(metrics.regressionRate.trend)}
          trendIcon={getTrendIcon(metrics.regressionRate.trend)}
          sampleSize={metrics.regressionRate.totalEvals}
          icon={<AlertIcon className="w-4 h-4 text-rose-500" />}
          gradient=""
        />
      </div>

      {/* Footer */}
      <div className="px-6 pb-4 flex items-center justify-between text-xs text-szn-text-3">
        <span>
          {t("dashboard.northStar.lastUpdated") || "Last updated"}:{" "}
          {new Date(metrics.lastUpdated).toLocaleString(locale)}
        </span>
        <span>{t("dashboard.northStar.last30Days") || "Last 30 days"}</span>
      </div>
    </div>
  );
}

// Sub-components

interface MetricCardProps {
  title: string;
  subtitle: string;
  value: string;
  secondaryValue?: string;
  target: string;
  trend: string;
  trendLabel: string;
  trendColor: string;
  trendIcon: React.ReactNode;
  sampleSize: number;
  icon: React.ReactNode;
  gradient?: string;
}

function MetricCard({
  title,
  subtitle,
  value,
  secondaryValue,
  target,
  trendLabel,
  trendColor,
  trendIcon,
  sampleSize,
  icon,
  gradient: _gradient,
}: MetricCardProps) {
  return (
    <div className="bg-szn-surface-1 rounded-lg p-4 border border-szn-border hover:border-szn-text-3/20 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-szn-card border border-szn-border flex items-center justify-center">
          {icon}
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${trendColor}`}>
          {trendIcon}
          <span>{trendLabel}</span>
        </div>
      </div>
      <h3 className="font-semibold text-szn-text-1 text-sm">{title}</h3>
      <p className="text-xs text-szn-text-2 mb-2">{subtitle}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-szn-text-1">{value}</span>
        {secondaryValue && (
          <span className="text-xs text-szn-text-2">{secondaryValue}</span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-szn-text-3">{target}</span>
        <span className="text-xs text-szn-text-3">n={sampleSize}</span>
      </div>
    </div>
  );
}

interface MetricMiniProps {
  label: string;
  value: string;
  trend: string;
}

function MetricMini({ label, value, trend }: MetricMiniProps) {
  const trendColorClass =
    trend === "improving"
      ? "border-green-200 bg-green-50"
      : trend === "declining"
      ? "border-red-200 bg-red-50"
      : trend === "stable"
      ? "border-blue-200 bg-blue-50"
      : "border-szn-border bg-szn-bg";

  return (
    <div className={`p-2 rounded-lg border ${trendColorClass}`}>
      <p className="text-xs text-szn-text-2 truncate">{label}</p>
      <p className="text-lg font-bold text-szn-text-1">{value}</p>
    </div>
  );
}

// Icons

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function BugIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 002.248-2.354M12 12.75a2.25 2.25 0 01-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 00-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 01.4-2.253M12 8.25a2.25 2.25 0 00-2.248 2.146M12 8.25a2.25 2.25 0 012.248 2.146M8.683 5a6.032 6.032 0 01-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0115.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 00-.575-1.752M4.921 6a24.048 24.048 0 00-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 01-5.223 1.082" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function TrendUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function TrendDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
    </svg>
  );
}

function TrendFlatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
    </svg>
  );
}

function QuestionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

export default NorthStarMetrics;
