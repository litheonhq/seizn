'use client';

/**
 * ImpactChart Component
 *
 * Visualizes policy impact with a horizontal bar chart.
 */

import React from 'react';

// ============================================
// Types
// ============================================

interface ImpactChartProps {
  /** Number of newly blocked chunks */
  blocked: number;
  /** Number of newly allowed chunks */
  allowed: number;
  /** Number of chunks with changed masking */
  maskingChanged: number;
  /** Average impact score (0-1) */
  averageImpact: number;
  /** Maximum impact score (0-1) */
  maxImpact: number;
}

// ============================================
// Component
// ============================================

export function ImpactChart({
  blocked,
  allowed,
  maskingChanged,
  averageImpact,
  maxImpact,
}: ImpactChartProps) {
  const total = blocked + allowed + maskingChanged;
  const maxCount = Math.max(blocked, allowed, maskingChanged, 1);

  // Calculate percentages for bar widths
  const blockedWidth = (blocked / maxCount) * 100;
  const allowedWidth = (allowed / maxCount) * 100;
  const maskingWidth = (maskingChanged / maxCount) * 100;

  // Get impact level color
  const getImpactLevelColor = (score: number) => {
    if (score >= 0.6) return 'text-[var(--signal-conflict-ink)]';
    if (score >= 0.3) return 'text-orange-600';
    if (score >= 0.1) return 'text-[var(--signal-pending-ink)]';
    return 'text-[var(--signal-canon-ink)]';
  };

  // Get impact level label
  const getImpactLevel = (score: number) => {
    if (score >= 0.6) return 'Critical';
    if (score >= 0.3) return 'High';
    if (score >= 0.1) return 'Medium';
    if (score > 0) return 'Low';
    return 'None';
  };

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Policy Impact</h3>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-500">Average Impact</p>
            <p className={`text-lg font-semibold ${getImpactLevelColor(averageImpact)}`}>
              {(averageImpact * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Max Impact</p>
            <p className={`text-lg font-semibold ${getImpactLevelColor(maxImpact)}`}>
              {(maxImpact * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Impact Level Indicator */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Impact Level:</span>
        <span
          className={`text-sm font-medium ${getImpactLevelColor(averageImpact)}`}
        >
          {getImpactLevel(averageImpact)}
        </span>
      </div>

      {/* Bar Chart */}
      <div className="space-y-3">
        {/* Blocked */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Newly Blocked</span>
            <span className="text-[var(--signal-conflict-ink)] font-medium">{blocked}</span>
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--signal-conflict)] rounded-full transition-all duration-500"
              style={{ width: `${blockedWidth}%` }}
            />
          </div>
        </div>

        {/* Allowed */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Newly Allowed</span>
            <span className="text-[var(--signal-canon-ink)] font-medium">{allowed}</span>
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--signal-canon)] rounded-full transition-all duration-500"
              style={{ width: `${allowedWidth}%` }}
            />
          </div>
        </div>

        {/* Masking Changed */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Masking Changed</span>
            <span className="text-[var(--signal-pending-ink)] font-medium">{maskingChanged}</span>
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-500 rounded-full transition-all duration-500"
              style={{ width: `${maskingWidth}%` }}
            />
          </div>
        </div>
      </div>

      {/* Total */}
      <div className="pt-2 border-t">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Total Chunks Affected</span>
          <span className="font-semibold text-gray-900">{total}</span>
        </div>
      </div>

      {/* Distribution Pie */}
      {total > 0 && (
        <div className="flex items-center justify-center pt-2">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-[var(--signal-conflict)] rounded-sm" />
              <span className="text-gray-600">
                Blocked ({((blocked / total) * 100).toFixed(0)}%)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-[var(--signal-canon)] rounded-sm" />
              <span className="text-gray-600">
                Allowed ({((allowed / total) * 100).toFixed(0)}%)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-500 rounded-sm" />
              <span className="text-gray-600">
                Masking ({((maskingChanged / total) * 100).toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* No impact message */}
      {total === 0 && (
        <div className="text-center py-4 text-gray-500 text-sm">
          No chunks were affected by this policy change
        </div>
      )}
    </div>
  );
}

export default ImpactChart;
