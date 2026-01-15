"use client";
/* eslint-disable react-hooks/rules-of-hooks */

import { useMemo } from "react";
import type { DriftTimeSeries, DriftTimeSeriesPoint } from "@/lib/drift/types";

// ============================================
// Types
// ============================================

export interface DriftChartProps {
  timeSeries: DriftTimeSeries | null;
  height?: number;
  loading?: boolean;
  showCentroidShift?: boolean;
  showAvgScore?: boolean;
  showQueryCount?: boolean;
}

// ============================================
// Constants
// ============================================

const CHART_COLORS = {
  centroidShift: "#EF4444", // red-500
  avgScore: "#10B981", // emerald-500
  queryCount: "#3B82F6", // blue-500
  grid: "#E5E7EB", // gray-200
  text: "#6B7280", // gray-500
};

// ============================================
// Component
// ============================================

export function DriftChart({
  timeSeries,
  height = 250,
  loading = false,
  showCentroidShift = true,
  showAvgScore = true,
  showQueryCount = false,
}: DriftChartProps) {
  // Process data for chart
  const chartData = useMemo(() => {
    if (!timeSeries || !timeSeries.points.length) {
      return null;
    }

    const points = timeSeries.points;

    // Calculate min/max for scaling
    const centroidValues = points.map((p) => p.centroidShift ?? 0).filter(Boolean);
    const queryValues = points.map((p) => p.queryCount ?? 0);

    const maxCentroid = Math.max(...centroidValues, 0.1);
    const maxScore = 1; // Scores are normalized 0-1
    const maxQuery = Math.max(...queryValues, 1);

    return {
      points,
      maxCentroid,
      maxScore,
      maxQuery,
    };
  }, [timeSeries]);

  if (loading) {
    return (
      <div
        className="animate-pulse bg-gray-100 rounded-lg"
        style={{ height }}
      />
    );
  }

  if (!chartData) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200"
        style={{ height }}
      >
        <p className="text-sm text-gray-500">No drift data available</p>
      </div>
    );
  }

  const { points, maxCentroid, maxQuery } = chartData;
  const chartHeight = height - 40; // Leave room for labels

  // Generate path data
  const generatePath = (
    data: DriftTimeSeriesPoint[],
    getValue: (p: DriftTimeSeriesPoint) => number | undefined,
    maxValue: number
  ): string => {
    const validPoints = data
      .map((p, i) => ({
        x: (i / (data.length - 1)) * 100,
        y: ((getValue(p) ?? 0) / maxValue) * 100,
      }))
      .filter((_, i) => getValue(data[i]) !== undefined);

    if (validPoints.length < 2) return "";

    return validPoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${100 - p.y}`)
      .join(" ");
  };

  const centroidPath = generatePath(points, (p) => p.centroidShift, maxCentroid);
  const scorePath = generatePath(points, (p) => p.avgScore, 1);
  const queryPath = generatePath(points, (p) => p.queryCount, maxQuery);

  // X-axis labels
  const xLabels = useMemo(() => {
    if (points.length <= 1) return [];
    const step = Math.ceil(points.length / 5);
    return points
      .filter((_, i) => i % step === 0 || i === points.length - 1)
      .map((p) => ({
        label: formatDate(p.date),
        x: (points.indexOf(p) / (points.length - 1)) * 100,
      }));
  }, [points]);

  return (
    <div className="w-full" style={{ height }}>
      {/* Legend */}
      <div className="flex gap-4 mb-2 text-xs">
        {showCentroidShift && (
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-0.5 rounded"
              style={{ backgroundColor: CHART_COLORS.centroidShift }}
            />
            <span className="text-gray-600">Centroid Shift</span>
          </div>
        )}
        {showAvgScore && (
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-0.5 rounded"
              style={{ backgroundColor: CHART_COLORS.avgScore }}
            />
            <span className="text-gray-600">Avg Score</span>
          </div>
        )}
        {showQueryCount && (
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-0.5 rounded"
              style={{ backgroundColor: CHART_COLORS.queryCount }}
            />
            <span className="text-gray-600">Query Count</span>
          </div>
        )}
      </div>

      {/* SVG Chart */}
      <svg
        width="100%"
        height={chartHeight}
        viewBox={`0 0 100 100`}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        {/* Grid Lines */}
        <g opacity={0.3}>
          {[0, 25, 50, 75, 100].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke={CHART_COLORS.grid}
              strokeWidth="0.5"
            />
          ))}
        </g>

        {/* Data Lines */}
        {showCentroidShift && centroidPath && (
          <path
            d={centroidPath}
            fill="none"
            stroke={CHART_COLORS.centroidShift}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {showAvgScore && scorePath && (
          <path
            d={scorePath}
            fill="none"
            stroke={CHART_COLORS.avgScore}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {showQueryCount && queryPath && (
          <path
            d={queryPath}
            fill="none"
            stroke={CHART_COLORS.queryCount}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* X-axis Labels */}
      <div className="flex justify-between px-1 text-xs text-gray-500 mt-1">
        {xLabels.map(({ label, x }, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              transform: "translateX(-50%)",
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Helpers
// ============================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default DriftChart;
