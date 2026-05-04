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
  semantic: "#f43f5e", // rose
  keyword_match: "#06b6d4", // cyan
};

const SCORE_BG_COLORS: Record<string, string> = {
  cosine: "bg-blue-500",
  bm25: "bg-[var(--signal-canon)]",
  hybrid_rrf: "bg-[var(--ink-900)]",
  rerank: "bg-[var(--signal-pending)]",
  semantic: "bg-rose-500",
  keyword_match: "bg-[var(--ink-900)]",
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
          <span className="text-sm font-medium text-[var(--ink-600)]">
            {component.label}
          </span>
        </div>
        <div className="text-sm text-[var(--ink-600)]">
          {(component.normalizedValue * 100).toFixed(1)}%
          {component.weight < 1 && (
            <span className="text-xs ml-1">
              (w: {(component.weight * 100).toFixed(0)}%)
            </span>
          )}
        </div>
      </div>

      {/* Bar */}
      <div className="relative h-6 bg-[var(--ink-50)] rounded-lg overflow-hidden">
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
      <p className="text-xs text-[var(--ink-600)] leading-relaxed">
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
      <div className="p-4 bg-[var(--ink-50)] border border-[var(--ink-200)] rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-[var(--ink-600)]">Final Score</h4>
            <div className="text-3xl font-bold text-[var(--ink-900)] mt-1">
              {(scoreBreakdown.finalScore * 100).toFixed(1)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-[var(--ink-600)]">Rank</div>
            <div className="text-3xl font-bold text-[var(--ink-900)] mt-1">#{scoreBreakdown.rank}</div>
          </div>
        </div>

        {/* Combination Method Badge */}
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-[var(--ink-50)] border border-[var(--ink-200)] rounded-full text-sm text-[var(--ink-600)]">
          <span>Method:</span>
          <span className="font-medium capitalize">
            {scoreBreakdown.combinationMethod.replace(/_/g, " ")}
          </span>
          {scoreBreakdown.rrfK && (
            <span className="text-xs text-[var(--ink-500)]">(k={scoreBreakdown.rrfK})</span>
          )}
        </div>
      </div>

      {/* Score Components */}
      <div className="space-y-6">
        <h4 className="text-sm font-semibold text-[var(--ink-900)]">
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
      <div className="p-4 bg-[var(--ink-50)] rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[var(--ink-600)]">
            Relative to Best Result
          </span>
          <span className="text-sm font-medium text-[var(--ink-900)]">
            {(scoreBreakdown.relativeScore * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-2 bg-[var(--ink-50)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--ink-900)] rounded-full"
            style={{ width: `${scoreBreakdown.relativeScore * 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--ink-600)]">
          {scoreBreakdown.rank === 1
            ? "This is the highest-scoring result"
            : `This result scored ${((1 - scoreBreakdown.relativeScore) * 100).toFixed(0)}% lower than the top result`}
        </p>
      </div>

      {/* Legend */}
      <div className="pt-4 border-t border-[var(--ink-200)]">
        <h4 className="text-xs font-semibold text-[var(--ink-600)] uppercase tracking-wide mb-3">
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
              <span className="text-xs text-[var(--ink-600)]">
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
