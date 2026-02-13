"use client";

import { useState } from "react";

import { getErrorMessage } from "@/lib/ui-error";

// ============================================
// Types
// ============================================

export interface WhatIfConfig {
  top_k?: number;
  search_type?: "semantic" | "keyword" | "hybrid";
  hybrid_alpha?: number;
  rerank_enabled?: boolean;
  rerank_model?: string;
  rerank_top_n?: number;
  embedding_model?: string;
}

export interface WhatIfResult {
  trace_id: string;
  latency: {
    original_ms: number;
    replay_ms: number;
    delta_ms: number;
  };
  cost: {
    original_usd: number;
    replay_usd: number;
    delta_usd: number;
  };
  results_count: number;
  comparison: {
    config_changes: Array<{
      param: string;
      original: unknown;
      replay: unknown;
    }>;
    summary: string;
  };
}

export interface WhatIfLabProps {
  traceId: string;
  originalConfig: WhatIfConfig;
  className?: string;
  onReplayComplete?: (result: WhatIfResult) => void;
}

// ============================================
// Icons
// ============================================

const PlayIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ResetIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

// ============================================
// Component
// ============================================

export function WhatIfLab({
  traceId,
  originalConfig,
  className = "",
  onReplayComplete,
}: WhatIfLabProps) {
  const [config, setConfig] = useState<WhatIfConfig>({
    top_k: originalConfig.top_k || 10,
    search_type: originalConfig.search_type || "hybrid",
    hybrid_alpha: originalConfig.hybrid_alpha || 0.6,
    rerank_enabled: originalConfig.rerank_enabled || false,
    rerank_model: originalConfig.rerank_model || "cohere-rerank-v3",
    rerank_top_n: originalConfig.rerank_top_n || 5,
    embedding_model: originalConfig.embedding_model || "voyage-3",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WhatIfResult | null>(null);

  // Check if config has changed
  const hasChanges = () => {
    return Object.keys(config).some((key) => {
      const k = key as keyof WhatIfConfig;
      return config[k] !== originalConfig[k];
    });
  };

  // Reset to original
  const handleReset = () => {
    setConfig({
      top_k: originalConfig.top_k || 10,
      search_type: originalConfig.search_type || "hybrid",
      hybrid_alpha: originalConfig.hybrid_alpha || 0.6,
      rerank_enabled: originalConfig.rerank_enabled || false,
      rerank_model: originalConfig.rerank_model || "cohere-rerank-v3",
      rerank_top_n: originalConfig.rerank_top_n || 5,
      embedding_model: originalConfig.embedding_model || "voyage-3",
    });
    setResult(null);
    setError(null);
  };

  // Run what-if replay
  const handleReplay = async () => {
    if (!hasChanges()) {
      setError("No changes to test. Modify at least one parameter.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const response = await fetch(`/api/retrieval/replay/${traceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (data.success) {
        const replayResult: WhatIfResult = {
          trace_id: data.replay.trace_id,
          latency: {
            original_ms: data.replay.latency.original_ms,
            replay_ms: data.replay.latency.replay_ms,
            delta_ms: data.replay.latency.replay_ms - data.replay.latency.original_ms,
          },
          cost: {
            original_usd: data.replay.cost.original_usd,
            replay_usd: data.replay.cost.replay_usd,
            delta_usd: data.replay.cost.delta_usd,
          },
          results_count: data.replay.results_count,
          comparison: data.replay.comparison,
        };
        setResult(replayResult);
        onReplayComplete?.(replayResult);
      } else {
        setError(getErrorMessage(data.error, "Replay failed"));
      }
    } catch (err) {
      console.error("Replay error:", err);
      setError(getErrorMessage(err, "Failed to run replay"));
    } finally {
      setLoading(false);
    }
  };

  // Presets
  const applyPreset = (preset: string) => {
    switch (preset) {
      case "fast":
        setConfig((c) => ({
          ...c,
          top_k: 5,
          rerank_enabled: false,
          search_type: "semantic",
        }));
        break;
      case "balanced":
        setConfig((c) => ({
          ...c,
          top_k: 10,
          rerank_enabled: true,
          rerank_top_n: 5,
          search_type: "hybrid",
          hybrid_alpha: 0.6,
        }));
        break;
      case "quality":
        setConfig((c) => ({
          ...c,
          top_k: 20,
          rerank_enabled: true,
          rerank_top_n: 10,
          search_type: "hybrid",
          hybrid_alpha: 0.7,
        }));
        break;
    }
  };

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-800 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">What-If Lab</h3>
            <p className="text-sm text-gray-400 mt-1">
              Experiment with different parameters
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-sm bg-gray-800 text-gray-400 rounded-lg hover:text-white transition-colors"
            >
              <ResetIcon className="w-4 h-4 inline mr-1" />
              Reset
            </button>
            <button
              onClick={handleReplay}
              disabled={loading || !hasChanges()}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Running...
                </>
              ) : (
                <>
                  <PlayIcon className="w-4 h-4 inline mr-1" />
                  Run Replay
                </>
              )}
            </button>
          </div>
        </div>

        {/* Presets */}
        <div className="flex gap-2 mt-3">
          <span className="text-xs text-gray-500 self-center">Presets:</span>
          <button
            onClick={() => applyPreset("fast")}
            className="px-3 py-1 text-xs bg-gray-800 text-gray-400 rounded-full hover:text-white transition-colors"
          >
            Fast
          </button>
          <button
            onClick={() => applyPreset("balanced")}
            className="px-3 py-1 text-xs bg-gray-800 text-gray-400 rounded-full hover:text-white transition-colors"
          >
            Balanced
          </button>
          <button
            onClick={() => applyPreset("quality")}
            className="px-3 py-1 text-xs bg-gray-800 text-gray-400 rounded-full hover:text-white transition-colors"
          >
            Quality
          </button>
        </div>
      </div>

      {/* Configuration */}
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Top K */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Top K
              {config.top_k !== originalConfig.top_k && (
                <span className="ml-2 text-xs text-blue-400">modified</span>
              )}
            </label>
            <input
              type="number"
              value={config.top_k}
              onChange={(e) => setConfig((c) => ({ ...c, top_k: parseInt(e.target.value) }))}
              min={1}
              max={100}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Search Type */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Search Type
              {config.search_type !== originalConfig.search_type && (
                <span className="ml-2 text-xs text-blue-400">modified</span>
              )}
            </label>
            <select
              value={config.search_type}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  search_type: e.target.value as "semantic" | "keyword" | "hybrid",
                }))
              }
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="semantic">Semantic</option>
              <option value="keyword">Keyword</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>

          {/* Hybrid Alpha (only for hybrid) */}
          {config.search_type === "hybrid" && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Hybrid Alpha
                {config.hybrid_alpha !== originalConfig.hybrid_alpha && (
                  <span className="ml-2 text-xs text-blue-400">modified</span>
                )}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  value={config.hybrid_alpha}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, hybrid_alpha: parseFloat(e.target.value) }))
                  }
                  min={0}
                  max={1}
                  step={0.1}
                  className="flex-1"
                />
                <span className="text-sm text-white w-10">{config.hybrid_alpha}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Keyword</span>
                <span>Semantic</span>
              </div>
            </div>
          )}

          {/* Rerank Enabled */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Reranking
              {config.rerank_enabled !== originalConfig.rerank_enabled && (
                <span className="ml-2 text-xs text-blue-400">modified</span>
              )}
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfig((c) => ({ ...c, rerank_enabled: !c.rerank_enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.rerank_enabled ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.rerank_enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-gray-300">
                {config.rerank_enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>

          {/* Rerank Top N (only if rerank enabled) */}
          {config.rerank_enabled && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Rerank Top N
                {config.rerank_top_n !== originalConfig.rerank_top_n && (
                  <span className="ml-2 text-xs text-blue-400">modified</span>
                )}
              </label>
              <input
                type="number"
                value={config.rerank_top_n}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, rerank_top_n: parseInt(e.target.value) }))
                }
                min={1}
                max={50}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 pb-4">
          <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="p-4 border-t border-gray-800">
          <h4 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
            <CheckIcon className="w-4 h-4 text-green-400" />
            Replay Results
          </h4>

          <div className="grid grid-cols-3 gap-4 mb-4">
            {/* Latency */}
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Latency</div>
              <div className="text-lg font-bold text-white">
                {result.latency.replay_ms}ms
              </div>
              <div
                className={`text-xs ${
                  result.latency.delta_ms < 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {result.latency.delta_ms > 0 ? "+" : ""}
                {result.latency.delta_ms}ms vs original
              </div>
            </div>

            {/* Cost */}
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Cost</div>
              <div className="text-lg font-bold text-white">
                ${result.cost.replay_usd.toFixed(6)}
              </div>
              <div
                className={`text-xs ${
                  result.cost.delta_usd < 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {result.cost.delta_usd > 0 ? "+" : ""}
                ${result.cost.delta_usd.toFixed(6)}
              </div>
            </div>

            {/* Results */}
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Results</div>
              <div className="text-lg font-bold text-white">{result.results_count}</div>
              <div className="text-xs text-gray-400">documents returned</div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
            <p className="text-sm text-blue-300">{result.comparison.summary}</p>
          </div>

          {/* Config Changes */}
          {result.comparison.config_changes.length > 0 && (
            <div className="mt-4">
              <h5 className="text-xs font-medium text-gray-500 mb-2">
                Parameters Changed
              </h5>
              <div className="space-y-1">
                {result.comparison.config_changes.map((change) => (
                  <div
                    key={change.param}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-gray-400">{change.param}</span>
                    <span className="text-gray-300">
                      <span className="text-red-400 line-through">
                        {String(change.original)}
                      </span>
                      {" -> "}
                      <span className="text-green-400">{String(change.replay)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default WhatIfLab;
