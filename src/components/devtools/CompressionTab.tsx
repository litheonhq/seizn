"use client";

import { useState, useEffect, useCallback } from "react";
import { CompressedView } from "@/components/compression/CompressedView";
import type { CompressedChunk, CompressionTraceStats } from "@/lib/compression";
import { getErrorMessage } from "@/lib/ui-error";

// ============================================
// Types
// ============================================

export interface CompressionTabProps {
  traceId: string;
  className?: string;
}

interface CompressionData {
  compressed: CompressedChunk[];
  stats: CompressionTraceStats;
}

// ============================================
// Component
// ============================================

/**
 * CompressionTab - DevTools tab component for viewing compression results
 */
export function CompressionTab({ traceId, className = "" }: CompressionTabProps) {
  const [data, setData] = useState<CompressionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch compression data
  const fetchCompressionData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/retrieval/traces/${traceId}`);
      const result = await response.json();

      if (result.success && result.trace) {
        // Check if compression was enabled for this trace
        if (result.trace.compressed && result.trace.compressionStats) {
          setData({
            compressed: result.trace.compressed,
            stats: result.trace.compressionStats,
          });
        } else {
          setData(null);
        }
      } else {
        setError(getErrorMessage(result.error, "Failed to fetch trace data"));
      }
    } catch (err) {
      console.error("Failed to fetch compression data:", err);
      setError("Failed to fetch compression data");
    } finally {
      setLoading(false);
    }
  }, [traceId]);

  useEffect(() => {
    fetchCompressionData();
  }, [fetchCompressionData]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-12 ${className}`}>
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[var(--ink-900)] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-gray-400">Loading compression data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-[var(--signal-conflict)]/20 border border-[var(--signal-conflict)]/50 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-[var(--signal-conflict-soft)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-[var(--signal-conflict-soft)]">{error}</span>
          </div>
          <button
            onClick={fetchCompressionData}
            className="mt-3 text-sm text-[var(--signal-conflict-soft)] hover:text-[var(--signal-conflict-soft)] underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="bg-[var(--ink-800)]/50 rounded-lg p-6 text-center">
          <svg
            className="w-12 h-12 text-gray-600 mx-auto mb-3"
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
          <p className="text-gray-400">Compression was not enabled for this query</p>
          <p className="text-gray-500 text-sm mt-1">
            Enable compression in the query settings to see compression results
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Stats Overview */}
      <div className="px-4 pt-4 pb-2">
        <div className="grid grid-cols-4 gap-4 mb-4">
          {/* Total Original Tokens */}
          <div className="bg-[var(--ink-800)]/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Original Tokens</p>
            <p className="text-lg font-mono text-white">{data.stats.original_tokens}</p>
          </div>

          {/* Total Compressed Tokens */}
          <div className="bg-[var(--ink-800)]/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Compressed Tokens</p>
            <p className="text-lg font-mono text-[var(--ink-900)]">{data.stats.compressed_tokens}</p>
          </div>

          {/* Tokens Saved */}
          <div className="bg-[var(--ink-800)]/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Tokens Saved</p>
            <p className="text-lg font-mono text-green-400">
              {data.stats.original_tokens - data.stats.compressed_tokens}
            </p>
          </div>

          {/* Overall Ratio */}
          <div className="bg-[var(--ink-800)]/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Compression Ratio</p>
            <p className="text-lg font-mono text-white">
              {(data.stats.ratio * 100).toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Processing Time */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Processed {data.stats.chunks_compressed} chunks in{" "}
            <span className="text-white font-mono">{data.stats.time_ms}ms</span>
          </span>
          <span>
            Est. cost savings:{" "}
            <span className="text-green-400 font-mono">
              $
              {(
                ((data.stats.original_tokens - data.stats.compressed_tokens) *
                  0.00001)
              ).toFixed(4)}
            </span>
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-800 my-2" />

      {/* Compressed Chunks View */}
      <CompressedView chunks={data.compressed} />
    </div>
  );
}

export default CompressionTab;
