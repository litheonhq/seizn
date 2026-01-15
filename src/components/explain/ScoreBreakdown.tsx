"use client";

import { useMemo } from "react";
import type {
  ScoreBreakdown,
  ScoreVisualization,
  ScoreComponent,
} from "@/lib/summer/explain/types";

// ============================================
// Types
// ============================================

interface ScoreBreakdownChartProps {
  scoreBreakdown: ScoreBreakdown;
  visualization?: ScoreVisualization;
  className?: string;
}

interface ScoreBarProps {
  component: ScoreComponent;
  maxValue: number;
  color: string;
}

// ============================================
// Color Configuration
// ============================================

const SCORE_COLORS: Record<string, string> = {
  cosine: "#3b82f6", // blue
  bm25: "#22c55e", // green
  hybrid_rrf: "#8b5cf6", // purple
  rerank: "#f59e0b", // amber
  semantic: "#ec4899", // pink
  keyword_match: "#06b6d4", // cyan
};

const SCORE_BG_COLORS: Record<string, string> = {
  cosine: "bg-blue-500",
  bm25: "bg-green-500",
  hybrid_rrf: "bg-purple-500",
  rerank: "bg-amber-500",
  semantic: "bg-pink-500",
  keyword_match: "bg-cyan-500",
};

// ============================================
// Score Bar Component
// ============================================

function ScoreBar({ component, maxValue, color }: ScoreBarProps) {
  const percentage = (component.normalizedValue / maxValue) * 100;
  const weightedPercentage = component.normalizedValue * component.weight * 100;
  const bgColor = SCORE_BG_COLORS[component.type] || "bg-gray-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${bgColor}`}
            style={{ backgroundColor: color }}
          />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {component.label}
          </span>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {(component.normalizedValue * 100).toFixed(1)}%
          {component.weight < 1 && (
            <span className="text-xs ml-1">
              (w: {(component.weight * 100).toFixed(0)}%)
            </span>
          )}
        </div>
      </div>

      {/* Bar */}
      <div className="relative h-6 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
        {/* Base bar (normalized value) */}
        <div
          className="absolute inset-y-0 left-0 bg-opacity-30 rounded-lg"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
            opacity: 0.3,
          }}
        />
        {/* Weighted bar */}
        <div
          className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
          style={{
            width: `${weightedPercentage}%`,
            backgroundColor: color,
          }}
        />
        {/* Value label */}
        <div className="absolute inset-0 flex items-center px-3">
          <span className="text-xs font-medium text-white drop-shadow-sm">
            {weightedPercentage.toFixed(1)}% contribution
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        {component.description}
      </p>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ScoreBreakdownChart({
  scoreBreakdown,
  visualization: _visualization,
  className = "",
}: ScoreBreakdownChartProps) {

  const maxValue = useMemo(() => {
    return Math.max(...scoreBreakdown.components.map((c) => c.normalizedValue), 1);
  }, [scoreBreakdown.components]);


  return (
    <div className={`space-y-6 ${className}`}>
      {/* Final Score Header */}
      <div className="p-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl text-white">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium opacity-90">Final Score</h4>
            <div className="text-3xl font-bold mt-1">
              {(scoreBreakdown.finalScore * 100).toFixed(1)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-90">Rank</div>
            <div className="text-3xl font-bold mt-1">#{scoreBreakdown.rank}</div>
          </div>
        </div>

        {/* Combination Method Badge */}
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-sm">
          <span>Method:</span>
          <span className="font-medium capitalize">
            {scoreBreakdown.combinationMethod.replace(/_/g, " ")}
          </span>
          {scoreBreakdown.rrfK && (
            <span className="text-xs opacity-75">(k={scoreBreakdown.rrfK})</span>
          )}
        </div>
      </div>

      {/* Score Components */}
      <div className="space-y-6">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          Score Components
        </h4>

        {scoreBreakdown.components.map((component) => (
          <ScoreBar
            key={component.type}
            component={component}
            maxValue={maxValue}
            color={SCORE_COLORS[component.type] || "#6b7280"}
          />
        ))}
      </div>

      {/* Relative Score Indicator */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Relative to Best Result
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {(scoreBreakdown.relativeScore * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
            style={{ width: `${scoreBreakdown.relativeScore * 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {scoreBreakdown.rank === 1
            ? "This is the highest-scoring result"
            : `This result scored ${((1 - scoreBreakdown.relativeScore) * 100).toFixed(0)}% lower than the top result`}
        </p>
      </div>

      {/* Legend */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Score Types Legend
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {scoreBreakdown.components.map((component) => (
            <div key={component.type} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: SCORE_COLORS[component.type] || "#6b7280",
                }}
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {component.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ScoreBreakdownChart;
