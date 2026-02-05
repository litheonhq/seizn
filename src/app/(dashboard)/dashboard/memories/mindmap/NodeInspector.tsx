"use client";

import { useState, useCallback } from "react";
import { Node } from "@xyflow/react";
import type { MindMapNodeData } from "./MindMapCanvas";
import type { NoteType, NoteStatus, PrivacyClass } from "@/lib/spring/memory-v3/types";
import { useMemoryUsage, calculateHeatLevel, getHeatColor } from "./hooks/useMemoryUsage";

// ============================================
// Types
// ============================================

interface NodeInspectorProps {
  node: Node<MindMapNodeData>;
  onClose: () => void;
  onRefresh: () => void;
}

// ============================================
// Icons
// ============================================

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const EditIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
    />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
    />
  </svg>
);

const ExclamationIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
    />
  </svg>
);

const LockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
    />
  </svg>
);

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
    />
  </svg>
);

const ExternalLinkIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
    />
  </svg>
);

const ArrowPathIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
    />
  </svg>
);

// ============================================
// Type Colors
// ============================================

const typeColors: Record<NoteType, { bg: string; text: string }> = {
  fact: { bg: "bg-blue-100 dark:bg-blue-900/50", text: "text-blue-700 dark:text-blue-300" },
  preference: { bg: "bg-purple-100 dark:bg-purple-900/50", text: "text-purple-700 dark:text-purple-300" },
  instruction: { bg: "bg-orange-100 dark:bg-orange-900/50", text: "text-orange-700 dark:text-orange-300" },
  episode: { bg: "bg-green-100 dark:bg-green-900/50", text: "text-green-700 dark:text-green-300" },
  procedure: { bg: "bg-pink-100 dark:bg-pink-900/50", text: "text-pink-700 dark:text-pink-300" },
  relationship: { bg: "bg-cyan-100 dark:bg-cyan-900/50", text: "text-cyan-700 dark:text-cyan-300" },
};

const statusColors: Record<NoteStatus, { bg: string; text: string }> = {
  candidate: { bg: "bg-yellow-100 dark:bg-yellow-900/50", text: "text-yellow-700 dark:text-yellow-300" },
  active: { bg: "bg-green-100 dark:bg-green-900/50", text: "text-green-700 dark:text-green-300" },
  superseded: { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-300" },
  contradicted: { bg: "bg-red-100 dark:bg-red-900/50", text: "text-red-700 dark:text-red-300" },
  deleted: { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-500 dark:text-gray-400" },
};

const privacyColors: Record<PrivacyClass, { bg: string; text: string }> = {
  public: { bg: "bg-green-100 dark:bg-green-900/50", text: "text-green-700 dark:text-green-300" },
  internal: { bg: "bg-blue-100 dark:bg-blue-900/50", text: "text-blue-700 dark:text-blue-300" },
  confidential: { bg: "bg-yellow-100 dark:bg-yellow-900/50", text: "text-yellow-700 dark:text-yellow-300" },
  restricted: { bg: "bg-red-100 dark:bg-red-900/50", text: "text-red-700 dark:text-red-300" },
};

// ============================================
// Format Helpers
// ============================================

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================
// Component
// ============================================

export function NodeInspector({ node, onClose, onRefresh }: NodeInspectorProps) {
  const data = node.data as MindMapNodeData;
  const note = data.note;

  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showUsageTab, setShowUsageTab] = useState(false);

  // Usage data
  const { usage, stats, isLoading: usageLoading } = useMemoryUsage(note.id);
  const heatLevel = calculateHeatLevel(stats);
  const heatColor = getHeatColor(heatLevel);

  // Action handlers
  const handleEdit = useCallback(() => {
    // TODO: Open edit modal or navigate to edit page
    console.log("Edit note:", note.id);
  }, [note.id]);

  const handleDelete = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/memories/${note.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onRefresh();
        onClose();
      }
    } catch (error) {
      console.error("Failed to delete note:", error);
    } finally {
      setIsLoading(false);
      setShowConfirmDelete(false);
    }
  }, [note.id, onRefresh, onClose]);

  const handleMarkWrong = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/memories/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "contradicted" }),
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error("Failed to mark note as wrong:", error);
    } finally {
      setIsLoading(false);
    }
  }, [note.id, onRefresh]);

  const handleLock = useCallback(async () => {
    setIsLoading(true);
    try {
      const newPrivacy: PrivacyClass =
        note.privacyClass === "restricted" ? "internal" : "restricted";
      const res = await fetch(`/api/memories/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privacyClass: newPrivacy }),
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error("Failed to toggle lock:", error);
    } finally {
      setIsLoading(false);
    }
  }, [note.id, note.privacyClass, onRefresh]);

  const handleMoveToSensitive = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/memories/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privacyClass: "confidential" }),
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error("Failed to move to sensitive:", error);
    } finally {
      setIsLoading(false);
    }
  }, [note.id, onRefresh]);

  return (
    <div className="h-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-white">Node Inspector</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <XIcon className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Full Content */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Content</h3>
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
              {data.content}
            </p>
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Metadata</h3>

          {/* Type */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">Type</span>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${typeColors[data.type].bg} ${typeColors[data.type].text}`}
            >
              {data.type}
            </span>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">Status</span>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[data.status].bg} ${statusColors[data.status].text}`}
            >
              {data.status}
            </span>
          </div>

          {/* Privacy Class */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">Privacy</span>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${privacyColors[data.privacyClass].bg} ${privacyColors[data.privacyClass].text}`}
            >
              {data.privacyClass}
            </span>
          </div>

          {/* Importance */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">Importance</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full"
                  style={{ width: `${data.importance * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">{Math.round(data.importance * 100)}%</span>
            </div>
          </div>

          {/* Created At */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">Created</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {formatDate(note.createdAt)}
            </span>
          </div>

          {/* Updated At */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">Updated</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {formatDate(note.updatedAt)}
            </span>
          </div>

          {/* Scope */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">Scope</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">{note.scope}</span>
          </div>

          {/* Tags */}
          {note.tags && note.tags.length > 0 && (
            <div className="space-y-1">
              <span className="text-sm text-gray-600 dark:text-gray-300">Tags</span>
              <div className="flex flex-wrap gap-1">
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Where Used / Usage Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Usage</h3>
            <button
              onClick={() => setShowUsageTab(!showUsageTab)}
              className="text-xs text-teal-600 dark:text-teal-400 hover:underline"
            >
              {showUsageTab ? "Hide details" : "Show details"}
            </button>
          </div>

          {/* Heat Indicator */}
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: heatColor }}
            />
            <span className="text-sm text-gray-600 dark:text-gray-300 capitalize">
              {heatLevel === "unused" ? "Never used" : `${heatLevel} (${stats.totalUsages} uses)`}
            </span>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded-lg text-center">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {stats.recallCount}
              </div>
              <div className="text-xs text-gray-500">Recalls</div>
            </div>
            <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded-lg text-center">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {Math.round(stats.successRate * 100)}%
              </div>
              <div className="text-xs text-gray-500">Success</div>
            </div>
            <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded-lg text-center">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {Math.round(stats.positiveRate * 100)}%
              </div>
              <div className="text-xs text-gray-500">Positive</div>
            </div>
          </div>

          {/* Usage History */}
          {showUsageTab && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {usageLoading ? (
                <div className="text-sm text-gray-500 text-center py-2">Loading...</div>
              ) : usage.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-2">
                  No usage recorded yet
                </div>
              ) : (
                usage.map((u) => (
                  <div
                    key={u.id}
                    className="p-2 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                        {u.usageType}
                      </span>
                      <span className="text-gray-500">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {u.queryText && (
                      <div className="text-gray-600 dark:text-gray-400 truncate">
                        Query: {u.queryText}
                      </div>
                    )}
                    {u.traceId && (
                      <a
                        href={`/dashboard/traces/${u.traceId}`}
                        className="text-teal-600 dark:text-teal-400 hover:underline"
                      >
                        View trace →
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Provenance */}
        {note.provenance && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Provenance</h3>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">Source Type</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {note.provenance.source.type}
                </span>
              </div>
              {note.provenance.source.sourceUrl && (
                <a
                  href={note.provenance.source.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-teal-600 dark:text-teal-400 hover:underline"
                >
                  <ExternalLinkIcon className="w-4 h-4" />
                  View Source
                </a>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">Created By</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {note.provenance.createdBy}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
        {/* Primary Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleEdit}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <EditIcon className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={() => setShowConfirmDelete(true)}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors disabled:opacity-50"
          >
            <TrashIcon className="w-4 h-4" />
            Delete
          </button>
        </div>

        {/* Secondary Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleMarkWrong}
            disabled={isLoading || data.status === "contradicted"}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded-lg transition-colors disabled:opacity-50"
          >
            <ExclamationIcon className="w-4 h-4" />
            Mark Wrong
          </button>
          <button
            onClick={handleLock}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-lg transition-colors disabled:opacity-50"
          >
            <LockIcon className="w-4 h-4" />
            {data.privacyClass === "restricted" ? "Unlock" : "Lock"}
          </button>
        </div>

        {/* Move to Sensitive */}
        {data.privacyClass !== "confidential" && data.privacyClass !== "restricted" && (
          <button
            onClick={handleMoveToSensitive}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 rounded-lg transition-colors disabled:opacity-50"
          >
            <ShieldIcon className="w-4 h-4" />
            Move to Sensitive
          </button>
        )}

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showConfirmDelete && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete Memory?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              This action cannot be undone. The memory will be permanently removed.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isLoading}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NodeInspector;
