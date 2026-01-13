"use client";

import { useMemo } from "react";

// ============================================
// Types
// ============================================

export interface TimelineStage {
  name: string;
  label: string;
  start_offset_ms: number;
  duration_ms: number;
  status: "success" | "error" | "running";
  metadata?: Record<string, unknown>;
}

export interface TraceTimelineProps {
  stages: TimelineStage[];
  totalDurationMs: number;
  className?: string;
  onStageClick?: (stage: TimelineStage) => void;
}

// ============================================
// Constants
// ============================================

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  embedding: { bg: "bg-blue-500/20", border: "border-blue-500", text: "text-blue-400" },
  vector_search: { bg: "bg-green-500/20", border: "border-green-500", text: "text-green-400" },
  keyword_search: { bg: "bg-teal-500/20", border: "border-teal-500", text: "text-teal-400" },
  rerank: { bg: "bg-purple-500/20", border: "border-purple-500", text: "text-purple-400" },
  llm_generation: { bg: "bg-orange-500/20", border: "border-orange-500", text: "text-orange-400" },
  postprocess: { bg: "bg-gray-500/20", border: "border-gray-500", text: "text-gray-400" },
  cache_lookup: { bg: "bg-yellow-500/20", border: "border-yellow-500", text: "text-yellow-400" },
  default: { bg: "bg-gray-500/20", border: "border-gray-500", text: "text-gray-400" },
};

const STAGE_ICONS: Record<string, JSX.Element> = {
  embedding: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  vector_search: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  keyword_search: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  rerank: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
    </svg>
  ),
  llm_generation: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  cache_lookup: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  ),
};

// ============================================
// Component
// ============================================

export function TraceTimeline({
  stages,
  totalDurationMs,
  className = "",
  onStageClick,
}: TraceTimelineProps) {
  // Calculate positions
  const stagesWithPosition = useMemo(() => {
    return stages.map((stage) => ({
      ...stage,
      leftPercent: (stage.start_offset_ms / totalDurationMs) * 100,
      widthPercent: (stage.duration_ms / totalDurationMs) * 100,
    }));
  }, [stages, totalDurationMs]);

  // Time scale markers
  const timeMarkers = useMemo(() => {
    const markers: number[] = [];
    const step = totalDurationMs > 1000 ? 250 : totalDurationMs > 500 ? 100 : 50;
    for (let i = 0; i <= totalDurationMs; i += step) {
      markers.push(i);
    }
    return markers;
  }, [totalDurationMs]);

  const formatDuration = (ms: number) => {
    if (ms < 1) return "<1ms";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (stages.length === 0) {
    return (
      <div className={`bg-gray-900 rounded-lg border border-gray-800 p-6 ${className}`}>
        <p className="text-center text-gray-500">No timeline data available</p>
      </div>
    );
  }

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-800 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Pipeline Timeline</h3>
          <span className="text-sm text-gray-400">
            Total: {formatDuration(totalDurationMs)}
          </span>
        </div>
      </div>

      {/* Timeline Visualization */}
      <div className="p-4">
        {/* Time Scale */}
        <div className="relative h-6 mb-2">
          {timeMarkers.map((ms) => (
            <div
              key={ms}
              className="absolute transform -translate-x-1/2 text-xs text-gray-500"
              style={{ left: `${(ms / totalDurationMs) * 100}%` }}
            >
              {formatDuration(ms)}
            </div>
          ))}
        </div>

        {/* Timeline Bar */}
        <div className="relative h-16 bg-gray-800 rounded-lg overflow-hidden">
          {/* Grid lines */}
          {timeMarkers.map((ms) => (
            <div
              key={ms}
              className="absolute top-0 bottom-0 w-px bg-gray-700"
              style={{ left: `${(ms / totalDurationMs) * 100}%` }}
            />
          ))}

          {/* Stage bars */}
          {stagesWithPosition.map((stage, index) => {
            const colors = STAGE_COLORS[stage.name] || STAGE_COLORS.default;
            return (
              <button
                key={`${stage.name}-${index}`}
                onClick={() => onStageClick?.(stage)}
                className={`absolute top-2 bottom-2 rounded ${colors.bg} ${colors.border} border transition-all hover:brightness-125 cursor-pointer`}
                style={{
                  left: `${stage.leftPercent}%`,
                  width: `${Math.max(stage.widthPercent, 1)}%`,
                }}
                title={`${stage.label}: ${formatDuration(stage.duration_ms)}`}
              >
                {stage.widthPercent > 8 && (
                  <span className={`absolute inset-0 flex items-center justify-center text-xs font-medium ${colors.text} truncate px-1`}>
                    {stage.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage Details */}
      <div className="p-4 border-t border-gray-800">
        <h4 className="text-sm font-medium text-gray-400 mb-3">Stage Breakdown</h4>
        <div className="space-y-2">
          {stagesWithPosition.map((stage, index) => {
            const colors = STAGE_COLORS[stage.name] || STAGE_COLORS.default;
            const icon = STAGE_ICONS[stage.name];

            return (
              <button
                key={`detail-${stage.name}-${index}`}
                onClick={() => onStageClick?.(stage)}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors"
              >
                {/* Icon */}
                <div className={`p-2 rounded ${colors.bg} ${colors.text}`}>
                  {icon || (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )}
                </div>

                {/* Label & Duration */}
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{stage.label}</span>
                    {stage.status === "error" && (
                      <span className="px-2 py-0.5 text-xs bg-red-900/50 text-red-400 rounded-full">
                        error
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    Started at {formatDuration(stage.start_offset_ms)}
                  </span>
                </div>

                {/* Duration Bar */}
                <div className="w-32">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className={colors.text}>{formatDuration(stage.duration_ms)}</span>
                    <span className="text-gray-500">{stage.widthPercent.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colors.bg.replace("/20", "/60")}`}
                      style={{ width: `${stage.widthPercent}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Waterfall Legend */}
      <div className="p-4 border-t border-gray-800">
        <h4 className="text-sm font-medium text-gray-400 mb-3">Legend</h4>
        <div className="flex flex-wrap gap-3">
          {Object.entries(STAGE_COLORS)
            .filter(([key]) => key !== "default")
            .map(([name, colors]) => (
              <div key={name} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded ${colors.bg} ${colors.border} border`} />
                <span className="text-xs text-gray-400 capitalize">
                  {name.replace(/_/g, " ")}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default TraceTimeline;
