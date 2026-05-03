"use client";

import { useState, useCallback, useEffect } from "react";
import { Node } from "@xyflow/react";
import type { MindMapNodeData } from "./MindMapCanvas";
import type { NoteType, NoteStatus, PrivacyClass } from "@/lib/spring/memory-v3/types";
import { useMemoryUsage, calculateHeatLevel, getHeatColor } from "./hooks/useMemoryUsage";
import { formatDate } from "@/lib/format-date";

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
  preference: { bg: "bg-[var(--ink-100)] dark:bg-[var(--ink-900)]/50", text: "text-[var(--ink-900)] underline dark:text-[var(--ink-500)]" },
  instruction: { bg: "bg-orange-100 dark:bg-orange-900/50", text: "text-orange-700 dark:text-orange-300" },
  episode: { bg: "bg-[var(--signal-canon-soft)] dark:bg-green-900/50", text: "text-[var(--signal-canon-ink)] dark:text-green-300" },
  procedure: { bg: "bg-sky-100 dark:bg-sky-900/50", text: "text-sky-700 dark:text-sky-300" },
  relationship: { bg: "bg-[var(--ink-100)] dark:bg-[var(--ink-900)]/50", text: "text-[var(--ink-900)] dark:text-[var(--ink-900)]" },
};

const statusColors: Record<NoteStatus, { bg: string; text: string }> = {
  candidate: { bg: "bg-[var(--signal-pending-soft)] dark:bg-yellow-900/50", text: "text-[var(--signal-pending-ink)] dark:text-yellow-300" },
  active: { bg: "bg-[var(--signal-canon-soft)] dark:bg-green-900/50", text: "text-[var(--signal-canon-ink)] dark:text-green-300" },
  superseded: { bg: "bg-[var(--ink-50)]", text: "text-[var(--ink-600)]" },
  contradicted: { bg: "bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict)]/50", text: "text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]" },
  deleted: { bg: "bg-[var(--ink-50)]", text: "text-[var(--ink-600)]" },
};

const privacyColors: Record<PrivacyClass, { bg: string; text: string }> = {
  public: { bg: "bg-[var(--signal-canon-soft)] dark:bg-green-900/50", text: "text-[var(--signal-canon-ink)] dark:text-green-300" },
  internal: { bg: "bg-blue-100 dark:bg-blue-900/50", text: "text-blue-700 dark:text-blue-300" },
  confidential: { bg: "bg-[var(--signal-pending-soft)] dark:bg-yellow-900/50", text: "text-[var(--signal-pending-ink)] dark:text-yellow-300" },
  restricted: { bg: "bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict)]/50", text: "text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]" },
};

// ============================================
// Format Helpers
// ============================================

// formatDate imported from @/lib/format-date

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )seizn_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getCsrfHeaders(contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }
  return headers;
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
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(data.content);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    setIsEditing(false);
    setEditedContent(data.content);
    setEditError(null);
  }, [note.id, data.content]);

  // Usage data
  const { usage, stats, isLoading: usageLoading } = useMemoryUsage(note.id);
  const heatLevel = calculateHeatLevel(stats);
  const heatColor = getHeatColor(heatLevel);
  const normalizedOriginalContent = data.content.trim();
  const normalizedEditedContent = editedContent.trim();
  const hasContentChanges = normalizedEditedContent !== normalizedOriginalContent;

  // Action handlers
  const handleEdit = useCallback(() => {
    setEditedContent(data.content);
    setEditError(null);
    setIsEditing(true);
  }, [data.content]);

  const handleCancelEdit = useCallback(() => {
    setEditedContent(data.content);
    setEditError(null);
    setIsEditing(false);
  }, [data.content]);

  const handleSaveEdit = useCallback(async () => {
    const nextContent = editedContent.trim();
    if (!nextContent) {
      setEditError("Content cannot be empty.");
      return;
    }

    if (!hasContentChanges) {
      setIsEditing(false);
      setEditError(null);
      return;
    }

    setIsLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/memories/${note.id}`, {
        method: "PATCH",
        headers: getCsrfHeaders("application/json"),
        body: JSON.stringify({ content: nextContent }),
      });

      const payload = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) {
        setEditError(payload?.error || "Failed to update memory.");
        return;
      }

      setEditedContent(nextContent);
      setIsEditing(false);
      onRefresh();
    } catch (error) {
      console.error("Failed to edit note:", error);
      setEditError("Failed to update memory.");
    } finally {
      setIsLoading(false);
    }
  }, [editedContent, hasContentChanges, note.id, onRefresh]);

  const handleDelete = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/memories/${note.id}`, {
        method: "DELETE",
        headers: getCsrfHeaders(),
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
        headers: getCsrfHeaders("application/json"),
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
        headers: getCsrfHeaders("application/json"),
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
        headers: getCsrfHeaders("application/json"),
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
    <div className="h-full bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[var(--ink-200)] flex items-center justify-between">
        <h2 className="font-semibold text-[var(--ink-900)]">Node Inspector</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[var(--ink-50)] rounded-lg transition-colors"
        >
          <XIcon className="w-5 h-5 text-[var(--ink-600)]" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Full Content */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-[var(--ink-600)]">Content</h3>
          <div className="p-3 bg-[var(--ink-50)] rounded-lg">
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editedContent}
                  onChange={(event) => setEditedContent(event.target.value)}
                  className="w-full min-h-28 px-3 py-2 text-sm bg-[var(--ink-0)] border border-[var(--ink-200)] rounded-lg text-[var(--ink-900)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-900)] resize-y"
                  maxLength={10000}
                  placeholder="Edit memory content..."
                />
                <div className="flex items-center justify-between">
                  {editError ? (
                    <p className="text-xs text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">{editError}</p>
                  ) : (
                    <span />
                  )}
                  <p className="text-xs text-[var(--ink-500)]">
                    {normalizedEditedContent.length}/10000
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--ink-900)] whitespace-pre-wrap">
                {editedContent}
              </p>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-[var(--ink-600)]">Metadata</h3>

          {/* Type */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--ink-600)]">Type</span>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${typeColors[data.type].bg} ${typeColors[data.type].text}`}
            >
              {data.type}
            </span>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--ink-600)]">Status</span>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[data.status].bg} ${statusColors[data.status].text}`}
            >
              {data.status}
            </span>
          </div>

          {/* Privacy Class */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--ink-600)]">Privacy</span>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${privacyColors[data.privacyClass].bg} ${privacyColors[data.privacyClass].text}`}
            >
              {data.privacyClass}
            </span>
          </div>

          {/* Importance */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--ink-600)]">Importance</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-2 bg-[var(--ink-50)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--ink-900)] rounded-full"
                  style={{ width: `${data.importance * 100}%` }}
                />
              </div>
              <span className="text-xs text-[var(--ink-600)]">{Math.round(data.importance * 100)}%</span>
            </div>
          </div>

          {/* Created At */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--ink-600)]">Created</span>
            <span className="text-sm text-[var(--ink-600)]">
              {formatDate(note.createdAt, "long")}
            </span>
          </div>

          {/* Updated At */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--ink-600)]">Updated</span>
            <span className="text-sm text-[var(--ink-600)]">
              {formatDate(note.updatedAt, "long")}
            </span>
          </div>

          {/* Scope */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--ink-600)]">Scope</span>
            <span className="text-sm text-[var(--ink-600)]">{note.scope}</span>
          </div>

          {/* Tags */}
          {note.tags && note.tags.length > 0 && (
            <div className="space-y-1">
              <span className="text-sm text-[var(--ink-600)]">Tags</span>
              <div className="flex flex-wrap gap-1">
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs bg-[var(--ink-50)] text-[var(--ink-600)] rounded-full"
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
            <h3 className="text-sm font-medium text-[var(--ink-600)]">Usage</h3>
            <button
              onClick={() => setShowUsageTab(!showUsageTab)}
              className="text-xs text-[var(--ink-900)] hover:underline"
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
            <span className="text-sm text-[var(--ink-600)] capitalize">
              {heatLevel === "unused" ? "Never used" : `${heatLevel} (${stats.totalUsages} uses)`}
            </span>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 bg-[var(--ink-50)] rounded-lg text-center">
              <div className="text-lg font-semibold text-[var(--ink-900)]">
                {stats.recallCount}
              </div>
              <div className="text-xs text-[var(--ink-600)]">Recalls</div>
            </div>
            <div className="p-2 bg-[var(--ink-50)] rounded-lg text-center">
              <div className="text-lg font-semibold text-[var(--ink-900)]">
                {Math.round(stats.successRate * 100)}%
              </div>
              <div className="text-xs text-[var(--ink-600)]">Success</div>
            </div>
            <div className="p-2 bg-[var(--ink-50)] rounded-lg text-center">
              <div className="text-lg font-semibold text-[var(--ink-900)]">
                {Math.round(stats.positiveRate * 100)}%
              </div>
              <div className="text-xs text-[var(--ink-600)]">Positive</div>
            </div>
          </div>

          {/* Usage History */}
          {showUsageTab && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {usageLoading ? (
                <div className="text-sm text-[var(--ink-600)] text-center py-2">Loading...</div>
              ) : usage.length === 0 ? (
                <div className="text-sm text-[var(--ink-600)] text-center py-2">
                  No usage recorded yet
                </div>
              ) : (
                usage.map((u) => (
                  <div
                    key={u.id}
                    className="p-2 bg-[var(--ink-50)] rounded-lg text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--ink-900)] capitalize">
                        {u.usageType}
                      </span>
                      <span className="text-[var(--ink-600)]">
                        {formatDate(u.createdAt)}
                      </span>
                    </div>
                    {u.queryText && (
                      <div className="text-[var(--ink-600)] truncate">
                        Query: {u.queryText}
                      </div>
                    )}
                    {u.traceId && (
                      <a
                        href={`/dashboard/traces/${u.traceId}`}
                        className="text-[var(--ink-900)] hover:underline"
                      >
                        View trace
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
            <h3 className="text-sm font-medium text-[var(--ink-600)]">Provenance</h3>
            <div className="p-3 bg-[var(--ink-50)] rounded-lg space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--ink-600)]">Source Type</span>
                <span className="text-[var(--ink-600)]">
                  {note.provenance.source.type}
                </span>
              </div>
              {note.provenance.source.sourceUrl && (
                <a
                  href={note.provenance.source.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-[var(--ink-900)] hover:underline"
                >
                  <ExternalLinkIcon className="w-4 h-4" />
                  View Source
                </a>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--ink-600)]">Created By</span>
                <span className="text-[var(--ink-600)]">
                  {note.provenance.createdBy}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-[var(--ink-200)] space-y-2">
        {/* Primary Actions */}
        {isEditing ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSaveEdit}
              disabled={isLoading || normalizedEditedContent.length === 0 || !hasContentChanges}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--ink-900)] hover:bg-[var(--ink-900)]/90 rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoading ? "Saving..." : "Save"}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-[var(--ink-900)] bg-[var(--ink-50)] hover:bg-[var(--ink-50)] rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleEdit}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-[var(--ink-900)] bg-[var(--ink-50)] hover:bg-[var(--ink-50)] rounded-lg transition-colors disabled:opacity-50"
            >
              <EditIcon className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={() => setShowConfirmDelete(true)}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)] bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict)]/20 hover:bg-[var(--signal-conflict-soft)] dark:hover:bg-[var(--signal-conflict)]/40 rounded-lg transition-colors disabled:opacity-50"
            >
              <TrashIcon className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}

        {/* Secondary Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleMarkWrong}
            disabled={isLoading || isEditing || data.status === "contradicted"}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded-lg transition-colors disabled:opacity-50"
          >
            <ExclamationIcon className="w-4 h-4" />
            Mark Wrong
          </button>
          <button
            onClick={handleLock}
            disabled={isLoading || isEditing}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-[var(--ink-900)] underline dark:text-[var(--ink-700)] bg-[var(--ink-50)] dark:bg-[var(--ink-900)]/20 hover:bg-[var(--ink-100)] dark:hover:bg-[var(--ink-900)]/40 rounded-lg transition-colors disabled:opacity-50"
          >
            <LockIcon className="w-4 h-4" />
            {data.privacyClass === "restricted" ? "Unlock" : "Lock"}
          </button>
        </div>

        {/* Move to Sensitive */}
        {data.privacyClass !== "confidential" && data.privacyClass !== "restricted" && (
          <button
            onClick={handleMoveToSensitive}
            disabled={isLoading || isEditing}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-[var(--signal-pending-ink)] dark:text-yellow-400 bg-[var(--signal-pending-soft)] dark:bg-yellow-900/20 hover:bg-[var(--signal-pending-soft)] dark:hover:bg-yellow-900/40 rounded-lg transition-colors disabled:opacity-50"
          >
            <ShieldIcon className="w-4 h-4" />
            Move to Sensitive
          </button>
        )}

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isLoading || isEditing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-[var(--ink-600)] bg-[var(--ink-50)] hover:bg-[var(--ink-50)] rounded-lg transition-colors disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showConfirmDelete && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--ink-0)] rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--ink-900)] mb-2">
              Delete Memory?
            </h3>
            <p className="text-sm text-[var(--ink-600)] mb-4">
              This action cannot be undone. The memory will be permanently removed.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-[var(--ink-900)] bg-[var(--ink-50)] hover:bg-[var(--ink-50)] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isLoading}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[var(--signal-conflict)] hover:bg-[var(--signal-conflict)] rounded-lg transition-colors disabled:opacity-50"
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
