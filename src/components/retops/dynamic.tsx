"use client";

import dynamic from "next/dynamic";
import type { QueryVolumeChartProps } from "./QueryVolumeChart";
import type { QualityTrendProps } from "./QualityTrend";
import type { LatencyDistributionProps } from "./LatencyDistribution";

// Loading skeleton for charts
const ChartSkeleton = ({ height = "h-64" }: { height?: string }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-6">
    <div className="animate-pulse">
      <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
      <div className={`${height} bg-gray-100 rounded`} />
    </div>
  </div>
);

// ============================================
// Dynamic Imports with Recharts
// ============================================

/**
 * Dynamically loaded QueryVolumeChart
 * - Lazy loads Recharts library (~200KB)
 * - Shows skeleton while loading
 */
export const DynamicQueryVolumeChart = dynamic<QueryVolumeChartProps>(
  () => import("./QueryVolumeChart").then((mod) => mod.QueryVolumeChart),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);

/**
 * Dynamically loaded QualityTrend
 * - Lazy loads Recharts library
 * - Shows skeleton while loading
 */
export const DynamicQualityTrend = dynamic<QualityTrendProps>(
  () => import("./QualityTrend").then((mod) => mod.QualityTrend),
  {
    loading: () => <ChartSkeleton height="h-80" />,
    ssr: false,
  }
);

/**
 * Dynamically loaded LatencyDistribution
 * - Lazy loads Recharts library
 * - Shows skeleton while loading
 */
export const DynamicLatencyDistribution = dynamic<LatencyDistributionProps>(
  () => import("./LatencyDistribution").then((mod) => mod.LatencyDistribution),
  {
    loading: () => <ChartSkeleton height="h-72" />,
    ssr: false,
  }
);
