"use client";

import { useState, useEffect } from "react";
import type { GapStatistics, GapType } from "@/lib/knowledge-gap/types";

// =============================================================================
// Types
// =============================================================================

interface GapTrendChartProps {
  className?: string;
}

interface TrendData {
  date: string;
  newGaps: number;
  resolvedGaps: number;
  occurrences: number;
}

// =============================================================================
// Component
// =============================================================================

export function GapTrendChart({ className }: GapTrendChartProps) {
  const [stats, setStats] = useState<GapStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simulated trend data - in production, this would come from an API
  const [trendData] = useState<TrendData[]>([
    { date: "Mon", newGaps: 5, resolvedGaps: 3, occurrences: 12 },
    { date: "Tue", newGaps: 8, resolvedGaps: 4, occurrences: 20 },
    { date: "Wed", newGaps: 3, resolvedGaps: 6, occurrences: 15 },
    { date: "Thu", newGaps: 6, resolvedGaps: 5, occurrences: 18 },
    { date: "Fri", newGaps: 4, resolvedGaps: 7, occurrences: 10 },
    { date: "Sat", newGaps: 2, resolvedGaps: 2, occurrences: 5 },
    { date: "Sun", newGaps: 1, resolvedGaps: 3, occurrences: 8 },
  ]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/knowledge-gaps?include_stats=true&page_size=1");
        if (!response.ok) throw new Error("Failed to fetch stats");
        const data = await response.json();
        setStats(data.statistics);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return <LoadingSkeleton className={className} />;
  }

  if (error) {
    return (
      <div className={`bg-red-50 rounded-xl p-4 text-red-700 ${className}`}>
        Error loading trend data: {error}
      </div>
    );
  }

  const maxValue = Math.max(
    ...trendData.map((d) => Math.max(d.newGaps, d.resolvedGaps, d.occurrences))
  );

  return (
    <div className={`bg-white rounded-xl border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-5 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Knowledge Gap Trends</h3>
        <p className="text-sm text-gray-500">Weekly overview of gap detection and resolution</p>
      </div>

      {/* Chart Area */}
      <div className="p-5">
        {/* Legend */}
        <div className="flex gap-6 mb-6">
          <LegendItem color="bg-red-500" label="New Gaps" />
          <LegendItem color="bg-green-500" label="Resolved" />
          <LegendItem color="bg-blue-500" label="Occurrences" />
        </div>

        {/* Simple Bar Chart */}
        <div className="flex items-end gap-2 h-48">
          {trendData.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex gap-0.5 items-end h-40 w-full">
                <Bar
                  value={day.newGaps}
                  maxValue={maxValue}
                  color="bg-red-500"
                  label={day.newGaps}
                />
                <Bar
                  value={day.resolvedGaps}
                  maxValue={maxValue}
                  color="bg-green-500"
                  label={day.resolvedGaps}
                />
                <Bar
                  value={day.occurrences}
                  maxValue={maxValue}
                  color="bg-blue-500"
                  label={day.occurrences}
                />
              </div>
              <span className="text-xs text-gray-500">{day.date}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Gap Type Distribution */}
      {stats && stats.gapTypeCounts && Object.keys(stats.gapTypeCounts).length > 0 && (
        <div className="p-5 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Gap Type Distribution</h4>
          <GapTypeDistribution counts={stats.gapTypeCounts as Record<GapType, number>} />
        </div>
      )}

      {/* Common Entities */}
      {stats && stats.mostCommonEntities && stats.mostCommonEntities.length > 0 && (
        <div className="p-5 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Most Common Missing Entities</h4>
          <div className="flex flex-wrap gap-2">
            {stats.mostCommonEntities.slice(0, 8).map((entity, i) => (
              <span
                key={i}
                className="px-3 py-1.5 bg-gray-100 rounded-full text-sm"
              >
                {entity.name}
                <span className="ml-1 text-gray-400">({entity.count})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-3 h-3 rounded ${color}`} />
      <span className="text-sm text-gray-600">{label}</span>
    </div>
  );
}

function Bar({
  value,
  maxValue,
  color,
  label,
}: {
  value: number;
  maxValue: number;
  color: string;
  label: number;
}) {
  const height = maxValue > 0 ? (value / maxValue) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col items-center group">
      <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
        {label}
      </span>
      <div
        className={`w-full rounded-t ${color} transition-all duration-300`}
        style={{ height: `${height}%`, minHeight: value > 0 ? "4px" : "0" }}
      />
    </div>
  );
}

function GapTypeDistribution({ counts }: { counts: Record<GapType, number> }) {
  const total = Object.values(counts).reduce((sum, v) => sum + v, 0);
  if (total === 0) return null;

  const typeColors: Record<GapType, string> = {
    missing_entity: "bg-orange-500",
    missing_table: "bg-purple-500",
    outdated_doc: "bg-yellow-500",
    permission_denied: "bg-red-500",
    coverage_gap: "bg-blue-500",
    domain_mismatch: "bg-gray-500",
  };

  const typeLabels: Record<GapType, string> = {
    missing_entity: "Missing Entity",
    missing_table: "Missing Table",
    outdated_doc: "Outdated",
    permission_denied: "Permission",
    coverage_gap: "Coverage",
    domain_mismatch: "Domain",
  };

  const sortedTypes = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a) as [GapType, number][];

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="h-4 rounded-full overflow-hidden flex">
        {sortedTypes.map(([type, count]) => (
          <div
            key={type}
            className={`${typeColors[type]} transition-all duration-300`}
            style={{ width: `${(count / total) * 100}%` }}
            title={`${typeLabels[type]}: ${count}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {sortedTypes.map(([type, count]) => (
          <div key={type} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded ${typeColors[type]}`} />
            <span className="text-gray-600">
              {typeLabels[type]}: {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 animate-pulse ${className}`}>
      <div className="p-5 border-b border-gray-200">
        <div className="h-6 w-48 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-64 bg-gray-200 rounded" />
      </div>
      <div className="p-5">
        <div className="flex gap-6 mb-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-4 w-24 bg-gray-200 rounded" />
          ))}
        </div>
        <div className="flex items-end gap-2 h-48">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex gap-0.5 items-end h-40 w-full">
                <div className="flex-1 bg-gray-200 rounded-t" style={{ height: "60%" }} />
                <div className="flex-1 bg-gray-200 rounded-t" style={{ height: "40%" }} />
                <div className="flex-1 bg-gray-200 rounded-t" style={{ height: "80%" }} />
              </div>
              <div className="h-4 w-8 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GapTrendChart;
