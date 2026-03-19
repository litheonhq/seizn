"use client";

import { memo, useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import type { NoteType, NoteStatus, PrivacyClass } from "@/lib/spring/memory-v3/types";
import type { MindMapNodeData } from "./MindMapCanvas";

// ============================================
// Type Colors
// ============================================

const typeColors: Record<NoteType, { bg: string; border: string; text: string; darkBg: string; darkBorder: string }> = {
  fact: {
    bg: "bg-blue-50",
    border: "border-blue-400",
    text: "text-blue-700",
    darkBg: "dark:bg-blue-900/30",
    darkBorder: "dark:border-blue-500",
  },
  preference: {
    bg: "bg-purple-50",
    border: "border-purple-400",
    text: "text-purple-700",
    darkBg: "dark:bg-purple-900/30",
    darkBorder: "dark:border-purple-500",
  },
  instruction: {
    bg: "bg-orange-50",
    border: "border-orange-400",
    text: "text-orange-700",
    darkBg: "dark:bg-orange-900/30",
    darkBorder: "dark:border-orange-500",
  },
  episode: {
    bg: "bg-green-50",
    border: "border-green-400",
    text: "text-green-700",
    darkBg: "dark:bg-green-900/30",
    darkBorder: "dark:border-green-500",
  },
  procedure: {
    bg: "bg-sky-50",
    border: "border-sky-400",
    text: "text-sky-700",
    darkBg: "dark:bg-sky-900/30",
    darkBorder: "dark:border-sky-500",
  },
  relationship: {
    bg: "bg-cyan-50",
    border: "border-cyan-400",
    text: "text-cyan-700",
    darkBg: "dark:bg-cyan-900/30",
    darkBorder: "dark:border-cyan-500",
  },
};

// ============================================
// Status Styles
// ============================================

const statusStyles: Record<NoteStatus, { borderStyle: string; opacity: string; indicator: string }> = {
  candidate: {
    borderStyle: "border-dotted",
    opacity: "opacity-70",
    indicator: "bg-yellow-400",
  },
  active: {
    borderStyle: "border-solid",
    opacity: "opacity-100",
    indicator: "bg-green-400",
  },
  superseded: {
    borderStyle: "border-dashed",
    opacity: "opacity-60",
    indicator: "bg-gray-400",
  },
  contradicted: {
    borderStyle: "border-solid border-red-500",
    opacity: "opacity-70",
    indicator: "bg-red-500",
  },
  deleted: {
    borderStyle: "border-dashed",
    opacity: "opacity-40",
    indicator: "bg-gray-300",
  },
};

// ============================================
// Icons
// ============================================

const LockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
    />
  </svg>
);

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
    />
  </svg>
);

const TypeIcons: Record<NoteType, React.FC<{ className?: string }>> = {
  fact: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  preference: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
      />
    </svg>
  ),
  instruction: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5"
      />
    </svg>
  ),
  episode: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  procedure: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
      />
    </svg>
  ),
  relationship: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  ),
};

// ============================================
// Privacy Icons
// ============================================

const PrivacyIndicator = ({ privacyClass }: { privacyClass: PrivacyClass }) => {
  if (privacyClass === "public" || privacyClass === "internal") return null;

  return (
    <div
      className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${
        privacyClass === "restricted"
          ? "bg-red-500 text-white"
          : "bg-yellow-500 text-white"
      }`}
      title={privacyClass === "restricted" ? "Restricted access" : "Confidential"}
    >
      {privacyClass === "restricted" ? (
        <LockIcon className="w-3 h-3" />
      ) : (
        <ShieldIcon className="w-3 h-3" />
      )}
    </div>
  );
};

// ============================================
// Size Mapping based on Importance
// ============================================

function getNodeSize(importance: number): { width: string; padding: string; fontSize: string } {
  if (importance >= 0.8) {
    return { width: "w-56", padding: "p-4", fontSize: "text-sm" };
  }
  if (importance >= 0.5) {
    return { width: "w-48", padding: "p-3", fontSize: "text-sm" };
  }
  return { width: "w-40", padding: "p-2", fontSize: "text-xs" };
}

// ============================================
// Node Component
// ============================================

function MindMapNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as MindMapNodeData;
  const [isHovered, setIsHovered] = useState(false);

  const colors = typeColors[nodeData.type];
  const status = statusStyles[nodeData.status];
  const size = getNodeSize(nodeData.importance);
  const TypeIcon = TypeIcons[nodeData.type];

  // Truncate content for display
  const truncatedContent =
    nodeData.content.length > 80
      ? nodeData.content.substring(0, 80) + "..."
      : nodeData.content;

  return (
    <div
      className={`
        ${size.width} ${size.padding}
        ${colors.bg} ${colors.darkBg}
        border-2 ${nodeData.status === "contradicted" ? "border-red-500 dark:border-red-400" : colors.border}
        ${colors.darkBorder}
        ${status.borderStyle} ${status.opacity}
        rounded-xl shadow-md
        transition-all duration-200
        ${selected ? "ring-2 ring-szn-accent ring-offset-2 dark:ring-offset-gray-900" : ""}
        ${isHovered ? "shadow-lg scale-105" : ""}
        relative cursor-pointer
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-szn-text-3 !border-2 !border-szn-card !w-3 !h-3"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-szn-text-3 !border-2 !border-szn-card !w-3 !h-3"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!bg-szn-text-3 !border-2 !border-szn-card !w-3 !h-3"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-szn-text-3 !border-2 !border-szn-card !w-3 !h-3"
      />

      {/* Privacy Indicator */}
      <PrivacyIndicator privacyClass={nodeData.privacyClass} />

      {/* Status Indicator */}
      <div className="absolute -bottom-1 -left-1">
        <div
          className={`w-3 h-3 rounded-full ${status.indicator} border-2 border-szn-card`}
          title={`Status: ${nodeData.status}`}
        />
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center ${colors.bg} ${colors.darkBg}`}
        >
          <TypeIcon className={`w-4 h-4 ${colors.text} dark:text-white`} />
        </div>
        <span
          className={`${size.fontSize} font-medium ${colors.text} dark:text-gray-200 capitalize truncate flex-1`}
        >
          {nodeData.type}
        </span>
      </div>

      {/* Content */}
      <p className={`${size.fontSize} text-szn-text-1 line-clamp-3`}>
        {truncatedContent}
      </p>

      {/* Importance Bar */}
      <div className="mt-2 h-1 bg-szn-surface rounded-full overflow-hidden">
        <div
          className={`h-full ${colors.border.replace("border-", "bg-")} dark:bg-opacity-70 rounded-full transition-all`}
          style={{ width: `${nodeData.importance * 100}%` }}
        />
      </div>

      {/* Hover Preview */}
      {isHovered && nodeData.content.length > 80 && (
        <div className="absolute z-50 left-full ml-2 top-0 w-72 p-3 bg-szn-card border border-szn-border rounded-lg shadow-xl">
          <p className="text-sm text-szn-text-1 whitespace-pre-wrap">
            {nodeData.content}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-szn-text-2">
            <span className={`px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
              {nodeData.type}
            </span>
            <span>{nodeData.status}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export const MindMapNode = memo(MindMapNodeComponent);
export default MindMapNode;
