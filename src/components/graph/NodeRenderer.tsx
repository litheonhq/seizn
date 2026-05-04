"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import type {
  GraphNodeType,
  NodeStatus,
  Permission,
  GraphNodeStyle,
} from "@/lib/winter/graph/types";

// ============================================
// Node Data Type
// ============================================

interface GraphNodeData {
  label: string;
  description?: string;
  type: GraphNodeType;
  status: NodeStatus;
  permissions: Permission[];
  metadata: Record<string, unknown>;
  style?: GraphNodeStyle;
  expanded?: boolean;
}

// ============================================
// Node Icons
// ============================================

const NodeIcons: Record<GraphNodeType, React.FC<{ className?: string }>> = {
  user: ({ className }) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
      />
    </svg>
  ),
  role: ({ className }) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  ),
  group: ({ className }) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
      />
    </svg>
  ),
  collection: ({ className }) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
      />
    </svg>
  ),
  document: ({ className }) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  ),
  chunk: ({ className }) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
      />
    </svg>
  ),
  source: ({ className }) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
      />
    </svg>
  ),
  policy: ({ className }) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
      />
    </svg>
  ),
  organization: ({ className }) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
      />
    </svg>
  ),
  service: ({ className }) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
      />
    </svg>
  ),
  custom: ({ className }) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

// ============================================
// Status Colors
// ============================================

const statusColors: Record<NodeStatus, string> = {
  active: "bg-[var(--signal-canon)]",
  inactive: "bg-gray-400",
  pending: "bg-yellow-500",
  error: "bg-[var(--signal-conflict)]",
  syncing: "bg-blue-500",
};

// ============================================
// Size Mapping
// ============================================

const sizeMap: Record<NonNullable<GraphNodeStyle["size"]>, string> = {
  small: "w-40",
  medium: "w-48",
  large: "w-56",
};

// ============================================
// Node Renderer Component
// ============================================

function GraphNodeRendererComponent({ data: rawData, selected }: NodeProps) {
  const data = rawData as unknown as GraphNodeData;
  const Icon = NodeIcons[data.type];
  const size = data.style?.size || "medium";

  return (
    <div
      className={`
        ${sizeMap[size]}
        rounded-xl shadow-md border-2 transition-all duration-200
        ${selected ? "ring-2 ring-blue-400 ring-offset-2" : ""}
      `}
      style={{
        backgroundColor: data.style?.backgroundColor || "#FFFFFF",
        borderColor: data.style?.borderColor || "#E5E7EB",
        borderWidth: data.style?.borderWidth || 2,
        borderStyle: data.style?.borderStyle || "solid",
        opacity: data.style?.opacity || 1,
      }}
    >
      {/* Top Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-gray-400 !border-2 !border-white !w-3 !h-3"
      />

      {/* Node Content */}
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          {/* Icon */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: data.style?.borderColor || "#E5E7EB" }}
          >
            <Icon
              className="w-5 h-5 text-white"
            />
          </div>

          {/* Label and Status */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {data.label}
            </h3>
            <div className="flex items-center gap-1">
              <span
                className={`w-2 h-2 rounded-full ${statusColors[data.status]}`}
              />
              <span className="text-xs text-gray-500 capitalize">
                {data.status}
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        {data.description && (
          <p className="text-xs text-gray-600 line-clamp-2 mb-2">
            {data.description}
          </p>
        )}

        {/* Type Badge */}
        <div className="flex items-center justify-between">
          <span
            className="text-xs px-2 py-0.5 rounded-full capitalize"
            style={{
              backgroundColor: `${data.style?.borderColor}20` || "#E5E7EB",
              color: data.style?.borderColor || "#6B7280",
            }}
          >
            {data.type}
          </span>

          {/* Permission Count */}
          {data.permissions.length > 0 && (
            <span className="text-xs text-gray-500">
              {data.permissions.length} permission
              {data.permissions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Bottom Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-400 !border-2 !border-white !w-3 !h-3"
      />

      {/* Left Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!bg-gray-400 !border-2 !border-white !w-3 !h-3"
      />

      {/* Right Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-gray-400 !border-2 !border-white !w-3 !h-3"
      />
    </div>
  );
}

export const GraphNodeRenderer = memo(GraphNodeRendererComponent);
export default GraphNodeRenderer;
