"use client";

import type { RetOpsMetrics } from "@/lib/summer/retops/types";

// ============================================
// Types
// ============================================

export interface MetricsOverviewProps {
  metrics: RetOpsMetrics | null;
  loading?: boolean;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; isPositive: boolean };
  icon: React.ReactNode;
  colorClass: string;
  loading?: boolean;
}

// ============================================
// Components
// ============================================

function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  colorClass,
  loading,
}: MetricCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-8 w-32 bg-gray-200 rounded" />
            <div className="h-3 w-20 bg-gray-200 rounded" />
          </div>
          <div className="w-12 h-12 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center mt-2">
              <span
                className={`text-sm font-medium ${
                  trend.isPositive ? "text-green-600" : "text-red-600"
                }`}
              >
                {trend.isPositive ? "+" : ""}
                {trend.value.toFixed(1)}%
              </span>
              <span className="text-xs text-gray-500 ml-2">vs last period</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl ${colorClass}`}>{icon}</div>
      </div>
    </div>
  );
}

export function MetricsOverview({ metrics, loading }: MetricsOverviewProps) {
  // Calculate values
  const qps = metrics?.qps ?? 0;
  const totalQueries = metrics?.totalQueries ?? 0;
  const p99Latency = metrics?.latency?.p99 ?? 0;
  const p50Latency = metrics?.latency?.p50 ?? 0;
  const cacheHitRate = (metrics?.cache?.hitRate ?? 0) * 100;
  const errorRate = (metrics?.errors?.rate ?? 0) * 100;
  const mrr = (metrics?.quality?.mrr ?? 0) * 100;
  const ndcg = (metrics?.quality?.ndcg ?? 0) * 100;

  const cards: MetricCardProps[] = [
    {
      title: "Queries Per Second",
      value: qps.toFixed(2),
      subtitle: `${totalQueries.toLocaleString()} total queries`,
      icon: <QueryIcon className="w-6 h-6 text-blue-600" />,
      colorClass: "bg-blue-100",
      loading,
    },
    {
      title: "P99 Latency",
      value: `${p99Latency}ms`,
      subtitle: `P50: ${p50Latency}ms`,
      trend: p99Latency > 500 ? { value: -10, isPositive: false } : undefined,
      icon: <ClockIcon className="w-6 h-6 text-purple-600" />,
      colorClass: "bg-purple-100",
      loading,
    },
    {
      title: "Cache Hit Rate",
      value: `${cacheHitRate.toFixed(1)}%`,
      subtitle: `${metrics?.cache?.hits ?? 0} hits`,
      trend: cacheHitRate > 0 ? { value: cacheHitRate > 70 ? 5 : -3, isPositive: cacheHitRate > 70 } : undefined,
      icon: <CacheIcon className="w-6 h-6 text-green-600" />,
      colorClass: "bg-green-100",
      loading,
    },
    {
      title: "Error Rate",
      value: `${errorRate.toFixed(2)}%`,
      subtitle: `${metrics?.errors?.total ?? 0} errors`,
      trend: errorRate > 0 ? { value: -errorRate, isPositive: errorRate < 1 } : undefined,
      icon: <ErrorIcon className="w-6 h-6 text-red-600" />,
      colorClass: errorRate > 5 ? "bg-red-100" : "bg-gray-100",
      loading,
    },
    {
      title: "Search Quality (MRR)",
      value: `${mrr.toFixed(1)}%`,
      subtitle: `nDCG: ${ndcg.toFixed(1)}%`,
      icon: <QualityIcon className="w-6 h-6 text-amber-600" />,
      colorClass: "bg-amber-100",
      loading,
    },
    {
      title: "Groundedness",
      value: `${((metrics?.quality?.groundedness ?? 0) * 100).toFixed(1)}%`,
      subtitle: "RAG response quality",
      icon: <ShieldIcon className="w-6 h-6 text-teal-600" />,
      colorClass: "bg-teal-100",
      loading,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card, index) => (
        <MetricCard key={index} {...card} />
      ))}
    </div>
  );
}

// ============================================
// Icons
// ============================================

function QueryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CacheIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
      />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function QualityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

export default MetricsOverview;
