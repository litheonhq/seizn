"use client";

import { useState, useCallback } from "react";

// ============================================
// Types
// ============================================

export interface CompressionToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  targetRatio?: number;
  onRatioChange?: (ratio: number) => void;
  className?: string;
  disabled?: boolean;
}

// ============================================
// Component
// ============================================

/**
 * CompressionToggle - Toggle switch for enabling/disabling context compression
 * with optional target ratio slider
 */
export function CompressionToggle({
  enabled,
  onToggle,
  targetRatio = 0.5,
  onRatioChange,
  className = "",
  disabled = false,
}: CompressionToggleProps) {
  const [localRatio, setLocalRatio] = useState(targetRatio);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      onToggle(!enabled);
    }
  }, [enabled, onToggle, disabled]);

  const handleRatioChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      setLocalRatio(value);
      onRatioChange?.(value);
    },
    [onRatioChange]
  );

  return (
    <div className={`rounded-lg border border-gray-800 bg-[var(--ink-900)]/50 p-4 ${className}`}>
      {/* Toggle Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Compression Icon */}
          <div className={`p-2 rounded-lg ${enabled ? "bg-[var(--ink-900)]/20" : "bg-[var(--ink-800)]"}`}>
            <svg
              className={`w-5 h-5 ${enabled ? "text-[var(--ink-900)]" : "text-gray-500"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-white">Context Compression</p>
            <p className="text-xs text-gray-500">
              Reduce context size while preserving key information
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <button
          onClick={handleToggle}
          disabled={disabled}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          } ${enabled ? "bg-[var(--ink-900)]" : "bg-gray-700"}`}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle context compression"
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Ratio Slider (shown when enabled) */}
      {enabled && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Target Compression Ratio</span>
            <span className="text-xs font-mono text-[var(--ink-900)]">
              {Math.round(localRatio * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={localRatio}
            onChange={handleRatioChange}
            disabled={disabled}
            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-3
                       [&::-webkit-slider-thumb]:h-3
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-[var(--ink-900)]
                       [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-webkit-slider-thumb]:transition-transform
                       [&::-webkit-slider-thumb]:hover:scale-125"
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-600">Aggressive (10%)</span>
            <span className="text-[10px] text-gray-600">Full (100%)</span>
          </div>

          {/* Ratio Explanation */}
          <div className="mt-3 p-2 rounded bg-[var(--ink-800)]/50 text-xs text-gray-400">
            {localRatio < 0.3 && (
              <p>
                <span className="text-[var(--signal-pending-soft)]">Aggressive compression:</span> May lose some
                context but significantly reduces tokens.
              </p>
            )}
            {localRatio >= 0.3 && localRatio < 0.6 && (
              <p>
                <span className="text-green-400">Balanced compression:</span> Good balance between
                context retention and token reduction.
              </p>
            )}
            {localRatio >= 0.6 && localRatio < 0.9 && (
              <p>
                <span className="text-blue-400">Light compression:</span> Preserves most context
                with moderate token savings.
              </p>
            )}
            {localRatio >= 0.9 && (
              <p>
                <span className="text-gray-400">Minimal compression:</span> Nearly full context,
                minimal token reduction.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CompressionToggle;
