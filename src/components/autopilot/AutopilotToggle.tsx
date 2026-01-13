"use client";

import { useState, useCallback, useEffect } from "react";

// ============================================
// Types
// ============================================

export type AutopilotMode = "conservative" | "balanced" | "aggressive" | "experimental";

export interface AutopilotToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  mode?: AutopilotMode;
  onModeChange?: (mode: AutopilotMode) => void;
  explorationRate?: number;
  onExplorationRateChange?: (rate: number) => void;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
}

// Mode descriptions
const MODE_INFO: Record<AutopilotMode, { label: string; description: string; color: string }> = {
  conservative: {
    label: "Conservative",
    description: "Lower exploration (5%). Prefer proven strategies.",
    color: "text-blue-400",
  },
  balanced: {
    label: "Balanced",
    description: "Standard exploration (10%). Good for general use.",
    color: "text-green-400",
  },
  aggressive: {
    label: "Aggressive",
    description: "Higher exploration (20%). Faster learning.",
    color: "text-amber-400",
  },
  experimental: {
    label: "Experimental",
    description: "Very high exploration (30%). For testing new strategies.",
    color: "text-purple-400",
  },
};

// ============================================
// Component
// ============================================

/**
 * AutopilotToggle - Toggle switch for enabling/disabling autopilot retrieval
 * with mode selection
 */
export function AutopilotToggle({
  enabled,
  onToggle,
  mode = "balanced",
  onModeChange,
  explorationRate,
  onExplorationRateChange,
  className = "",
  disabled = false,
  loading = false,
}: AutopilotToggleProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localMode, setLocalMode] = useState<AutopilotMode>(mode);

  // Sync local mode with prop
  useEffect(() => {
    setLocalMode(mode);
  }, [mode]);

  const handleToggle = useCallback(() => {
    if (!disabled && !loading) {
      onToggle(!enabled);
    }
  }, [enabled, onToggle, disabled, loading]);

  const handleModeChange = useCallback(
    (newMode: AutopilotMode) => {
      setLocalMode(newMode);
      onModeChange?.(newMode);
    },
    [onModeChange]
  );

  const handleExplorationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      onExplorationRateChange?.(value);
    },
    [onExplorationRateChange]
  );

  return (
    <div className={`rounded-lg border border-gray-800 bg-gray-900/50 p-4 ${className}`}>
      {/* Toggle Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Autopilot Icon */}
          <div className={`p-2 rounded-lg ${enabled ? "bg-emerald-500/20" : "bg-gray-800"}`}>
            <svg
              className={`w-5 h-5 ${enabled ? "text-emerald-400" : "text-gray-500"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-white flex items-center gap-2">
              Autopilot Retrieval
              {loading && (
                <span className="inline-block w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              )}
            </p>
            <p className="text-xs text-gray-500">
              Automatically select the best retrieval strategy
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <button
          onClick={handleToggle}
          disabled={disabled || loading}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            disabled || loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          } ${enabled ? "bg-emerald-600" : "bg-gray-700"}`}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle autopilot retrieval"
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Mode Selection (shown when enabled) */}
      {enabled && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400">Autopilot Mode</span>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              {showAdvanced ? "Hide Advanced" : "Show Advanced"}
            </button>
          </div>

          {/* Mode Buttons */}
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(MODE_INFO) as AutopilotMode[]).map((m) => {
              const info = MODE_INFO[m];
              const isSelected = localMode === m;
              return (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  disabled={disabled || loading}
                  className={`p-2 rounded-lg border text-left transition-all ${
                    isSelected
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                  } ${disabled || loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <p className={`text-xs font-medium ${isSelected ? info.color : "text-gray-300"}`}>
                    {info.label}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{info.description}</p>
                </button>
              );
            })}
          </div>

          {/* Advanced Settings */}
          {showAdvanced && (
            <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
              {/* Exploration Rate Slider */}
              {explorationRate !== undefined && onExplorationRateChange && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400">Custom Exploration Rate</span>
                    <span className="text-xs font-mono text-emerald-400">
                      {Math.round(explorationRate * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.01"
                    value={explorationRate}
                    onChange={handleExplorationChange}
                    disabled={disabled || loading}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer
                               [&::-webkit-slider-thumb]:appearance-none
                               [&::-webkit-slider-thumb]:w-3
                               [&::-webkit-slider-thumb]:h-3
                               [&::-webkit-slider-thumb]:rounded-full
                               [&::-webkit-slider-thumb]:bg-emerald-500
                               [&::-webkit-slider-thumb]:cursor-pointer
                               [&::-webkit-slider-thumb]:transition-transform
                               [&::-webkit-slider-thumb]:hover:scale-125"
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-gray-600">0% (Exploit only)</span>
                    <span className="text-[10px] text-gray-600">50% (High exploration)</span>
                  </div>
                </div>
              )}

              {/* Info Box */}
              <div className="p-3 rounded-lg bg-gray-800/50 text-xs text-gray-400">
                <p className="font-medium text-gray-300 mb-1">How Autopilot Works</p>
                <ul className="space-y-1 list-disc list-inside text-[11px]">
                  <li>Uses multi-armed bandit to learn best strategies</li>
                  <li>Balances exploration (trying new) vs exploitation (using best)</li>
                  <li>Adapts based on relevance, latency, and feedback</li>
                  <li>Conservative mode minimizes risk, experimental maximizes learning</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AutopilotToggle;
