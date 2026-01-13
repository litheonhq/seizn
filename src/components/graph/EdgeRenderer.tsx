"use client";

import { memo } from "react";
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
} from "@xyflow/react";
import type { GraphEdgeType, PermissionLevel, GraphEdgeStyle } from "@/lib/winter/graph/types";

// ============================================
// Edge Data Type
// ============================================

interface GraphEdgeData {
  type: GraphEdgeType;
  direction: "directed" | "undirected" | "bidirectional";
  weight?: number;
  permissionLevel?: PermissionLevel;
  metadata: Record<string, unknown>;
  style?: GraphEdgeStyle;
}

// ============================================
// Permission Level Colors
// ============================================

const permissionColors: Record<PermissionLevel, string> = {
  none: "#9CA3AF",
  read: "#059669",
  write: "#3B82F6",
  admin: "#F59E0B",
  owner: "#DC2626",
};

// ============================================
// Edge Type Icons
// ============================================

const edgeTypeLabels: Record<GraphEdgeType, string> = {
  permission: "Permission",
  membership: "Member",
  inheritance: "Inherits",
  reference: "Ref",
  dependency: "Depends",
  federation: "Federated",
  data_flow: "Data",
  custom: "Custom",
};

// ============================================
// Edge Renderer Component
// ============================================

function GraphEdgeRendererComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  style,
  markerEnd,
  markerStart,
  selected,
}: EdgeProps) {
  // Cast data to our custom type
  const edgeData = data as GraphEdgeData | undefined;
  // Calculate bezier path
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Determine edge color based on permission level or style
  const edgeColor = edgeData?.permissionLevel
    ? permissionColors[edgeData.permissionLevel]
    : edgeData?.style?.strokeColor || style?.stroke || "#6B7280";

  // Edge label content
  const displayLabel =
    label || (edgeData?.permissionLevel ? edgeData.permissionLevel : edgeTypeLabels[edgeData?.type || "custom"]);

  return (
    <>
      {/* Edge Path */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          ...style,
          stroke: selected ? "#3B82F6" : edgeColor,
          strokeWidth: selected ? (edgeData?.style?.strokeWidth || 2) + 1 : edgeData?.style?.strokeWidth || 2,
        }}
      />

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
              ${selected ? "scale-110" : ""}
            `}
            style={{
              backgroundColor: "white",
              borderColor: edgeColor,
              color: edgeColor,
            }}
          >
            {displayLabel}

            {/* Weight indicator */}
            {edgeData?.weight !== undefined && edgeData.weight > 0 && (
              <span className="ml-1 text-gray-400">
                ({Math.round(edgeData.weight * 100)}%)
              </span>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>

      {/* Animation overlay for animated edges */}
      {edgeData?.style?.animated && (
        <path
          d={edgePath}
          fill="none"
          stroke={edgeColor}
          strokeWidth={2}
          strokeDasharray="5,5"
          className="animate-flow"
          style={{
            opacity: 0.5,
          }}
        />
      )}
    </>
  );
}

export const GraphEdgeRenderer = memo(GraphEdgeRendererComponent);
export default GraphEdgeRenderer;
