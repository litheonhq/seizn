"use client";

import { useState, useCallback, useMemo } from "react";
import type { CompressedChunk } from "@/lib/compression";

// ============================================
// Types
// ============================================

export interface CompressedViewProps {
  chunks: CompressedChunk[];
  className?: string;
  onExpand?: (chunkId: string, pointerIndices: number[]) => Promise<string>;
}

interface ExpandableSegment {
  text: string;
  isExpandable: boolean;
  pointerIndex: number | null;
  sentenceIndex: number | null;
  originalText: string | null;
  chunkId: string;
}

// ============================================
// Helpers
// ============================================

function createAnnotatedSegments(chunk: CompressedChunk): ExpandableSegment[] {
  const result: ExpandableSegment[] = [];
  let lastEnd = 0;

  // Sort pointers by compressed position
  const sortedPointers = chunk.pointers
    .map((p, i) => ({ pointer: p, index: i }))
    .sort((a, b) => a.pointer.compressed_start - b.pointer.compressed_start);

  for (const { pointer, index } of sortedPointers) {
    // Add any text before this pointer (should be minimal, just spaces)
    if (pointer.compressed_start > lastEnd) {
      const betweenText = chunk.compressed_text.substring(lastEnd, pointer.compressed_start);
      if (betweenText.trim().length > 0) {
        result.push({
          text: betweenText,
          isExpandable: false,
          pointerIndex: null,
          sentenceIndex: null,
          originalText: null,
          chunkId: chunk.chunk_id,
        });
      }
    }

    // Add the expandable sentence
    const sentenceText = chunk.compressed_text.substring(
      pointer.compressed_start,
      pointer.compressed_end
    );

    result.push({
      text: sentenceText,
      isExpandable: true,
      pointerIndex: index,
      sentenceIndex: pointer.sentence_index,
      originalText: chunk.original_text.substring(pointer.original_start, pointer.original_end),
      chunkId: chunk.chunk_id,
    });

    lastEnd = pointer.compressed_end;
  }

  // Add any remaining text
  if (lastEnd < chunk.compressed_text.length) {
    const remainingText = chunk.compressed_text.substring(lastEnd);
    if (remainingText.trim().length > 0) {
      result.push({
        text: remainingText,
        isExpandable: false,
        pointerIndex: null,
        sentenceIndex: null,
        originalText: null,
        chunkId: chunk.chunk_id,
      });
    }
  }

  return result;
}

// ============================================
// Sub-components
// ============================================

interface SegmentViewProps {
  segment: ExpandableSegment;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function SegmentView({ segment, isExpanded, onToggleExpand }: SegmentViewProps) {
  if (!segment.isExpandable) {
    return <span className="text-gray-300">{segment.text}</span>;
  }

  const displayText = isExpanded ? segment.originalText : segment.text;

  return (
    <span
      onClick={onToggleExpand}
      className={`cursor-pointer transition-all rounded px-0.5 ${
        isExpanded
          ? "bg-[var(--ink-900)]/20 text-[var(--ink-900)] border-b border-[var(--ink-900)]/50"
          : "hover:bg-gray-700/50 text-gray-200 border-b border-dashed border-gray-600"
      }`}
      title={isExpanded ? "Click to collapse" : "Click to expand to original"}
    >
      {displayText}
      {!isExpanded && (
        <svg
          className="inline-block w-3 h-3 ml-0.5 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
          />
        </svg>
      )}
    </span>
  );
}

interface ChunkViewProps {
  chunk: CompressedChunk;
  index: number;
  expandedSentences: Set<string>;
  onToggleExpand: (key: string) => void;
}

function ChunkView({ chunk, index, expandedSentences, onToggleExpand }: ChunkViewProps) {
  const [showStats, setShowStats] = useState(false);
  const segments = useMemo(() => createAnnotatedSegments(chunk), [chunk]);

  const savedTokens = (chunk.tokens?.original ?? 0) - (chunk.tokens?.compressed ?? 0);
  const savingsPercent = ((1 - chunk.compression_ratio) * 100).toFixed(0);

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      {/* Chunk Header */}
      <div className="px-4 py-2 bg-[var(--ink-800)]/50 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Chunk {index + 1}</span>
          <span className="text-xs text-gray-600">|</span>
          <span className="text-xs font-mono text-gray-500">{chunk.chunk_id.slice(0, 8)}...</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-green-400">
            -{savedTokens} tokens ({savingsPercent}% saved)
          </span>
          <button
            onClick={() => setShowStats(!showStats)}
            className="text-xs text-gray-500 hover:text-white transition-colors"
          >
            {showStats ? "Hide Stats" : "Show Stats"}
          </button>
        </div>
      </div>

      {/* Stats Panel */}
      {showStats && (
        <div className="px-4 py-3 bg-[var(--ink-900)]/50 border-b border-gray-800 grid grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-gray-500 mb-1">Original Tokens</p>
            <p className="font-mono text-white">{(chunk.tokens?.original ?? 0)}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Compressed Tokens</p>
            <p className="font-mono text-[var(--ink-900)]">{(chunk.tokens?.compressed ?? 0)}</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Compression Ratio</p>
            <p className="font-mono text-white">{(chunk.compression_ratio * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Pointer Count</p>
            <p className="font-mono text-white">{chunk.pointers.length}</p>
          </div>
        </div>
      )}

      {/* Compressed Content */}
      <div className="p-4 text-sm leading-relaxed">
        {segments.map((segment, i) => {
          const key = `${chunk.chunk_id}-${segment.pointerIndex ?? i}`;
          const isExpanded = expandedSentences.has(key);

          return (
            <SegmentView
              key={key}
              segment={segment}
              isExpanded={isExpanded}
              onToggleExpand={() => onToggleExpand(key)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

/**
 * CompressedView - Interactive viewer for compressed context chunks
 * with expandable sentences
 */
export function CompressedView({ chunks, className = "" }: CompressedViewProps) {
  const [expandedSentences, setExpandedSentences] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"compressed" | "original">("compressed");

  const handleToggleExpand = useCallback((key: string) => {
    setExpandedSentences((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    const allKeys = new Set<string>();
    chunks.forEach((chunk) => {
      chunk.pointers.forEach((_, i) => {
        allKeys.add(`${chunk.chunk_id}-${i}`);
      });
    });
    setExpandedSentences(allKeys);
  }, [chunks]);

  const handleCollapseAll = useCallback(() => {
    setExpandedSentences(new Set());
  }, []);

  // Calculate totals
  const totalOriginalTokens = chunks.reduce((sum, c) => sum + (c.tokens?.original ?? 0), 0);
  const totalCompressedTokens = chunks.reduce((sum, c) => sum + (c.tokens?.compressed ?? 0), 0);
  const overallRatio = totalOriginalTokens > 0 ? totalCompressedTokens / totalOriginalTokens : 1;
  const savedTokens = totalOriginalTokens - totalCompressedTokens;

  if (chunks.length === 0) {
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
          <p className="text-gray-400">No compressed chunks available</p>
          <p className="text-gray-500 text-sm mt-1">Enable compression to see results</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header with Stats */}
      <div className="flex items-center justify-between mb-4 px-4 pt-4">
        <div className="flex items-center gap-4">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-[var(--ink-800)] rounded-lg p-1">
            <button
              onClick={() => setViewMode("compressed")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === "compressed"
                  ? "bg-[var(--ink-900)] text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Compressed
            </button>
            <button
              onClick={() => setViewMode("original")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === "original"
                  ? "bg-[var(--ink-900)] text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Original
            </button>
          </div>

          {/* Expand/Collapse All */}
          {viewMode === "compressed" && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExpandAll}
                className="text-xs text-gray-500 hover:text-[var(--ink-900)] transition-colors"
              >
                Expand All
              </button>
              <span className="text-gray-700">|</span>
              <button
                onClick={handleCollapseAll}
                className="text-xs text-gray-500 hover:text-[var(--ink-900)] transition-colors"
              >
                Collapse All
              </button>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="flex items-center gap-4 text-xs">
          <div className="text-gray-500">
            <span className="text-white font-mono">{chunks.length}</span> chunks
          </div>
          <div className="text-gray-500">
            <span className="text-green-400 font-mono">{savedTokens}</span> tokens saved
          </div>
          <div className="text-gray-500">
            <span className="text-[var(--ink-900)] font-mono">
              {((1 - overallRatio) * 100).toFixed(0)}%
            </span>{" "}
            reduction
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-4 mb-4">
        <div className="h-2 bg-[var(--ink-800)] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--ink-900)] to-[var(--ink-900)] transition-all duration-500"
            style={{ width: `${overallRatio * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-gray-600">
          <span>{totalCompressedTokens} compressed</span>
          <span>{totalOriginalTokens} original</span>
        </div>
      </div>

      {/* Chunks */}
      <div className="px-4 pb-4 space-y-4">
        {viewMode === "compressed" ? (
          chunks.map((chunk, i) => (
            <ChunkView
              key={chunk.chunk_id}
              chunk={chunk}
              index={i}
              expandedSentences={expandedSentences}
              onToggleExpand={handleToggleExpand}
            />
          ))
        ) : (
          // Original view
          <div className="space-y-4">
            {chunks.map((chunk, i) => (
              <div key={chunk.chunk_id} className="border border-gray-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-[var(--ink-800)]/50 border-b border-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Chunk {i + 1}</span>
                    <span className="text-xs text-gray-600">|</span>
                    <span className="text-xs font-mono text-gray-500">
                      {chunk.chunk_id.slice(0, 8)}...
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {(chunk.tokens?.original ?? 0)} tokens
                  </span>
                </div>
                <div className="p-4 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {chunk.original_text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CompressedView;
