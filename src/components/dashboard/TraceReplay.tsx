"use client";

import { useState } from "react";

interface TraceReplayProps {
  traceId: string;
  originalConfig: {
    search_type?: string;
    hybrid_alpha?: number;
    rerank?: boolean;
    rerank_model?: string;
    top_k?: number;
  };
  onReplayComplete?: (newTraceId: string) => void;
}

export function TraceReplay({
  traceId,
  originalConfig,
  onReplayComplete,
}: TraceReplayProps) {
  const [config, setConfig] = useState(originalConfig);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    trace_id: string;
    latency: { total_ms: number };
    cost_usd: number;
    compare_url: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReplay = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/traces/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trace_id: traceId,
          config_overrides: config,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setResult({
          trace_id: data.replay.trace_id,
          latency: data.replay.latency,
          cost_usd: data.replay.cost_usd,
          compare_url: data.compare_url,
        });
        onReplayComplete?.(data.replay.trace_id);
      } else {
        setError(data.error?.message || "Replay failed");
      }
    } catch {
      setError("Replay failed");
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  return (
    <div className="bg-white rounded-lg border shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-orange-500/10 to-red-500/10 border-b">
        <h3 className="font-semibold text-gray-900">Replay Trace</h3>
        <p className="text-sm text-gray-500">
          Re-run with same or modified config
        </p>
      </div>

      {/* Config Editor */}
      <div className="p-4 space-y-4">
        {/* Search Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search Type
          </label>
          <select
            value={config.search_type || "hybrid"}
            onChange={(e) =>
              setConfig({ ...config, search_type: e.target.value })
            }
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="semantic">Semantic</option>
            <option value="keyword">Keyword</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>

        {/* Hybrid Alpha */}
        {config.search_type === "hybrid" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hybrid Alpha (semantic weight)
            </label>
            <div className="flex items-center gap-3">
              <input aria-label="Hybrid Alpha slider"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.hybrid_alpha || 0.7}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    hybrid_alpha: parseFloat(e.target.value),
                  })
                }
                className="flex-1"
              />
              <span className="text-sm font-mono text-gray-600 w-12">
                {(config.hybrid_alpha || 0.7).toFixed(1)}
              </span>
            </div>
          </div>
        )}

        {/* Rerank */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="rerank"
            checked={config.rerank || false}
            onChange={(e) => setConfig({ ...config, rerank: e.target.checked })}
            className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
          />
          <label htmlFor="rerank" className="text-sm font-medium text-gray-700">
            Enable Reranking
          </label>
        </div>

        {/* Rerank Model */}
        {config.rerank && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rerank Model
            </label>
            <select
              value={config.rerank_model || "cohere-rerank-v3"}
              onChange={(e) =>
                setConfig({ ...config, rerank_model: e.target.value })
              }
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="cohere-rerank-v3">Cohere Rerank v3</option>
              <option value="cohere-rerank-v2">Cohere Rerank v2</option>
              <option value="jina-reranker-v2">Jina Reranker v2</option>
            </select>
          </div>
        )}

        {/* Top K */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Top K Results
          </label>
          <input aria-label="Top K"
            type="number"
            min="1"
            max="100"
            value={config.top_k || 5}
            onChange={(e) =>
              setConfig({ ...config, top_k: parseInt(e.target.value) })
            }
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
        </div>

        {/* Changes indicator */}
        {hasChanges && (
          <div className="p-3 bg-[var(--signal-pending-soft)] border border-[var(--signal-pending)] rounded-lg">
            <p className="text-sm text-[var(--signal-pending-ink)]">
              <span className="font-medium">Config changed.</span> The replay
              will use modified settings.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t bg-gray-50">
        <button
          onClick={handleReplay}
          disabled={loading}
          className="w-full py-2 px-4 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <LoadingIcon className="w-4 h-4 animate-spin" />
              Replaying...
            </>
          ) : (
            <>
              <ReplayIcon className="w-4 h-4" />
              {hasChanges ? "Replay with Changes" : "Replay"}
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="p-4 border-t bg-[var(--signal-canon-soft)]">
          <div className="flex items-center gap-2 mb-2">
            <CheckIcon className="w-5 h-5 text-[var(--signal-canon-ink)]" />
            <span className="font-medium text-[var(--signal-canon-ink)]">Replay Complete</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">New Trace:</span>
              <span className="font-mono text-gray-700 ml-1">
                {result.trace_id.slice(0, 8)}...
              </span>
            </div>
            <div>
              <span className="text-gray-500">Latency:</span>
              <span className="font-mono text-gray-700 ml-1">
                {result.latency.total_ms}ms
              </span>
            </div>
            <div>
              <span className="text-gray-500">Cost:</span>
              <span className="font-mono text-gray-700 ml-1">
                ${result.cost_usd.toFixed(6)}
              </span>
            </div>
            <div>
              <a
                href={result.compare_url}
                className="text-orange-600 hover:underline"
              >
                Compare Traces →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 border-t bg-[var(--signal-conflict-soft)]">
          <p className="text-[var(--signal-conflict-ink)] text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}

function ReplayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
