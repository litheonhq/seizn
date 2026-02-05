"use client";

import { memo } from "react";
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
} from "@xyflow/react";
import type { EdgeType } from "@/lib/spring/memory-v3/types";
import type { MindMapEdgeData } from "./MindMapCanvas";

// ============================================
// Edge Type Styles
// ============================================

interface EdgeStyle {
  stroke: string;
  strokeDasharray?: string;
  markerEnd?: string;
  animated: boolean;
  labelBg: string;
  labelText: string;
}

const edgeStyles: Record<EdgeType | "belongs_to", EdgeStyle> = {
  similar: {
    stroke: "#9CA3AF", // gray
    strokeDasharray: "5,5",
    animated: false,
    labelBg: "bg-gray-100 dark:bg-gray-700",
    labelText: "text-gray-600 dark:text-gray-300",
  },
  supersedes: {
    stroke: "#3B82F6", // blue
    markerEnd: "url(#arrow-blue)",
    animated: true,
    labelBg: "bg-blue-100 dark:bg-blue-900/50",
    labelText: "text-blue-600 dark:text-blue-300",
  },
  contradicts: {
    stroke: "#EF4444", // red
    animated: true,
    labelBg: "bg-red-100 dark:bg-red-900/50",
    labelText: "text-red-600 dark:text-red-300",
  },
  derived_from: {
    stroke: "#10B981", // green
    strokeDasharray: "8,4",
    markerEnd: "url(#arrow-green)",
    animated: false,
    labelBg: "bg-green-100 dark:bg-green-900/50",
    labelText: "text-green-600 dark:text-green-300",
  },
  mentions_entity: {
    stroke: "#8B5CF6", // purple
    strokeDasharray: "3,3",
    animated: false,
    labelBg: "bg-purple-100 dark:bg-purple-900/50",
    labelText: "text-purple-600 dark:text-purple-300",
  },
  part_of_cluster: {
    stroke: "#F59E0B", // amber
    strokeDasharray: "10,5",
    animated: false,
    labelBg: "bg-amber-100 dark:bg-amber-900/50",
    labelText: "text-amber-600 dark:text-amber-300",
  },
  belongs_to: {
    stroke: "#06B6D4", // cyan
    strokeDasharray: "4,4",
    animated: false,
    labelBg: "bg-cyan-100 dark:bg-cyan-900/50",
    labelText: "text-cyan-600 dark:text-cyan-300",
  },
};

// ============================================
// Edge Type Labels
// ============================================

const edgeTypeLabels: Record<EdgeType | "belongs_to", string> = {
  similar: "Similar",
  supersedes: "Supersedes",
  contradicts: "Contradicts",
  derived_from: "Derived",
  mentions_entity: "Mentions",
  part_of_cluster: "Cluster",
  belongs_to: "Belongs",
};

// ============================================
// Weight to Stroke Width
// ============================================

function getStrokeWidth(weight: number): number {
  // Weight is 0-1, map to stroke width 1-4
  return 1 + weight * 3;
}

// ============================================
// Edge Component
// ============================================

function MindMapEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const edgeData = data as MindMapEdgeData | undefined;
  const edgeType = edgeData?.type || "similar";
  const weight = edgeData?.weight || 0.5;
  const style = edgeStyles[edgeType];

  // Calculate bezier path
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Determine stroke width based on weight
  const strokeWidth = getStrokeWidth(weight);

  // Display label (custom label or type label)
  const displayLabel = edgeData?.label || edgeTypeLabels[edgeType];

  return (
    <>
      {/* SVG Definitions for markers */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <marker
            id="arrow-blue"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
          </marker>
          <marker
            id="arrow-green"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#10B981" />
          </marker>
          <marker
            id="arrow-red"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#EF4444" />
          </marker>
        </defs>
      </svg>

      {/* Main Edge Path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? "#14B8A6" : style.stroke,
          strokeWidth: selected ? strokeWidth + 1 : strokeWidth,
          strokeDasharray: style.strokeDasharray,
        }}
        markerEnd={style.markerEnd}
      />

      {/* Animated Overlay for animated edges */}
      {style.animated && (
        <path
          d={edgePath}
          fill="none"
          stroke={style.stroke}
          strokeWidth={strokeWidth}
          strokeDasharray="5,5"
          className="animate-dash"
          style={{
            opacity: 0.5,
          }}
        />
      )}

      {/* Edge Label */}
      <EdgeLabelRenderer>
        <div
          className={`
            absolute transform -translate-x-1/2 -translate-y-1/2
            pointer-events-auto nodrag nopan
            ${selected ? "z-10" : ""}
          `}
          style={{
            left: labelX,
            top: labelY,
          }}
        >
          <div
            className={`
              px-2 py-1 rounded-md text-xs font-medium
              border shadow-sm transition-all duration-200
              ${style.labelBg} ${style.labelText}
              border-gray-200 dark:border-gray-600
              ${selected ? "scale-110 ring-2 ring-teal-400" : ""}
            `}
          >
            {displayLabel}
            {/* Weight indicator */}
            {weight > 0 && weight < 1 && (
              <span className="ml-1 opacity-60">
                ({Math.round(weight * 100)}%)
              </span>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const MindMapEdge = memo(MindMapEdgeComponent);
export default MindMapEdge;

// ============================================
// Global Styles for Edge Animation
// ============================================

// Add this to your global CSS or a style tag:
// @keyframes dash {
//   to {
//     stroke-dashoffset: -20;
//   }
// }
// .animate-dash {
//   animation: dash 1s linear infinite;
// }
