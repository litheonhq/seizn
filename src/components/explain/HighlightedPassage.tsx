"use client";

import { useMemo } from "react";
import type {
  PassageVisualization,
  AttributionInfo,
  HighlightSpan,
} from "@/lib/summer/explain/types";

// ============================================
// Types
// ============================================

interface HighlightedPassageProps {
  content: string;
  visualization?: PassageVisualization;
  attribution?: AttributionInfo;
  className?: string;
}

interface HighlightConfig {
  type: HighlightSpan["type"];
  bgClass: string;
  borderClass: string;
  label: string;
}

// ============================================
// Highlight Configuration
// ============================================

const HIGHLIGHT_CONFIGS: Record<HighlightSpan["type"], HighlightConfig> = {
  exact_match: {
    type: "exact_match",
    bgClass: "bg-green-200 dark:bg-green-900/50",
    borderClass: "border-green-500",
    label: "Exact Match",
  },
  semantic_match: {
    type: "semantic_match",
    bgClass: "bg-amber-200 dark:bg-amber-900/50",
    borderClass: "border-amber-500",
    label: "Semantic Match",
  },
  keyword: {
    type: "keyword",
    bgClass: "bg-blue-200 dark:bg-blue-900/50",
    borderClass: "border-blue-500",
    label: "Keyword",
  },
  entity: {
    type: "entity",
    bgClass: "bg-purple-200 dark:bg-purple-900/50",
    borderClass: "border-purple-500",
    label: "Entity",
  },
};

// ============================================
// Utility Functions
// ============================================

/**
 * Generate highlight spans from attribution if visualization not provided
 */
function generateHighlightsFromAttribution(
  content: string,
  attribution: AttributionInfo
): HighlightSpan[] {
  const highlights: HighlightSpan[] = [];

  // Add highlights from matched terms
  for (const term of attribution.matchedTerms) {
    for (const pos of term.positions) {
      highlights.push({
        start: pos.start,
        end: pos.end,
        type: term.matchType === "exact" ? "exact_match" : "keyword",
        style: term.matchType === "exact"
          ? HIGHLIGHT_CONFIGS.exact_match.bgClass
          : HIGHLIGHT_CONFIGS.keyword.bgClass,
        tooltip: `${term.matchType} match for "${term.queryTerm || term.term}"`,
        importance: term.contribution,
      });
    }
  }

  // Add highlights from semantic matches
  for (const match of attribution.semanticMatches) {
    highlights.push({
      start: match.position.start,
      end: match.position.end,
      type: "semantic_match",
      style: HIGHLIGHT_CONFIGS.semantic_match.bgClass,
      tooltip: `Semantic match: ${match.reason}`,
      importance: match.similarity,
    });
  }

  // Sort and merge overlapping highlights
  return mergeOverlappingHighlights(highlights);
}

/**
 * Merge overlapping highlight spans (keep higher importance)
 */
function mergeOverlappingHighlights(highlights: HighlightSpan[]): HighlightSpan[] {
  if (highlights.length === 0) return [];

  // Sort by start position
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const merged: HighlightSpan[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    if (next.start <= current.end) {
      // Overlap: keep the one with higher importance
      if (next.importance > current.importance) {
        current = {
          ...next,
          start: Math.min(current.start, next.start),
          end: Math.max(current.end, next.end),
        };
      } else {
        current.end = Math.max(current.end, next.end);
      }
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

// ============================================
// Highlighted Text Renderer
// ============================================

interface TextSegment {
  text: string;
  highlight?: HighlightSpan;
}

function renderHighlightedText(
  content: string,
  highlights: HighlightSpan[]
): TextSegment[] {
  if (highlights.length === 0) {
    return [{ text: content }];
  }

  const segments: TextSegment[] = [];
  let lastEnd = 0;

  for (const highlight of highlights) {
    // Add non-highlighted text before this highlight
    if (highlight.start > lastEnd) {
      segments.push({
        text: content.substring(lastEnd, highlight.start),
      });
    }

    // Add highlighted text
    segments.push({
      text: content.substring(highlight.start, highlight.end),
      highlight,
    });

    lastEnd = highlight.end;
  }

  // Add remaining non-highlighted text
  if (lastEnd < content.length) {
    segments.push({
      text: content.substring(lastEnd),
    });
  }

  return segments;
}

// ============================================
// Main Component
// ============================================

export function HighlightedPassage({
  content,
  visualization,
  attribution,
  className = "",
}: HighlightedPassageProps) {
  // Generate highlights from visualization or attribution
  const highlights = useMemo(() => {
    if (visualization?.highlights) {
      return visualization.highlights;
    }
    if (attribution) {
      return generateHighlightsFromAttribution(content, attribution);
    }
    return [];
  }, [visualization, attribution, content]);

  // Render text segments
  const segments = useMemo(
    () => renderHighlightedText(content, highlights),
    [content, highlights]
  );

  // Calculate match summary
  const matchSummary = useMemo(() => {
    if (visualization?.matchSummary) {
      return visualization.matchSummary;
    }

    const exactMatches = highlights.filter((h) => h.type === "exact_match").length;
    const semanticMatches = highlights.filter((h) => h.type === "semantic_match").length;
    const totalHighlightedChars = highlights.reduce(
      (sum, h) => sum + (h.end - h.start),
      0
    );

    return {
      exactMatches,
      semanticMatches,
      totalCoverage: Math.min(100, (totalHighlightedChars / content.length) * 100),
    };
  }, [visualization, highlights, content.length]);

  // Get unique highlight types used
  const usedHighlightTypes = useMemo(() => {
    const types = new Set(highlights.map((h) => h.type));
    return Array.from(types);
  }, [highlights]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Match Summary */}
      <div className="flex items-center justify-between p-3 bg-szn-surface rounded-lg">
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-szn-text-2">Exact: </span>
            <span className="font-medium text-green-600 dark:text-green-400">
              {matchSummary.exactMatches}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-szn-text-2">Semantic: </span>
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {matchSummary.semanticMatches}
            </span>
          </div>
        </div>
        <div className="text-sm">
          <span className="text-szn-text-2">Coverage: </span>
          <span className="font-medium text-szn-text-1">
            {matchSummary.totalCoverage.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Legend */}
      {usedHighlightTypes.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {usedHighlightTypes.map((type) => {
            const config = HIGHLIGHT_CONFIGS[type];
            return (
              <div key={type} className="flex items-center gap-2">
                <span
                  className={`w-4 h-4 rounded ${config.bgClass} border-2 ${config.borderClass}`}
                />
                <span className="text-xs text-szn-text-2">
                  {config.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Passage Content */}
      <div className="p-4 bg-szn-bg border border-szn-border rounded-lg">
        <p className="text-sm leading-relaxed text-szn-text-1 whitespace-pre-wrap">
          {segments.map((segment, index) => {
            if (segment.highlight) {
              const config = HIGHLIGHT_CONFIGS[segment.highlight.type];
              return (
                <span
                  key={index}
                  className={`${config.bgClass} px-0.5 rounded cursor-help border-b-2 ${config.borderClass}`}
                  title={segment.highlight.tooltip}
                >
                  {segment.text}
                </span>
              );
            }
            return <span key={index}>{segment.text}</span>;
          })}
        </p>
      </div>

      {/* Coverage Bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-szn-text-2 mb-1">
          <span>Text Coverage</span>
          <span>{matchSummary.totalCoverage.toFixed(1)}% highlighted</span>
        </div>
        <div className="h-2 bg-szn-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 via-amber-500 to-blue-500 rounded-full"
            style={{ width: `${Math.min(100, matchSummary.totalCoverage)}%` }}
          />
        </div>
      </div>

      {/* Character Count */}
      <div className="text-xs text-szn-text-3 text-right">
        {content.length} characters | {highlights.length} highlighted regions
      </div>
    </div>
  );
}

export default HighlightedPassage;
