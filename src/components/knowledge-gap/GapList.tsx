"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  KnowledgeGap,
  GapStatus,
  GapType,
  GapStatistics,
} from "@/lib/knowledge-gap/types";
import { formatDate } from "@/lib/format-date";

// =============================================================================
// Types
// =============================================================================

interface GapListProps {
  collectionId?: string;
  onSelect?: (gap: KnowledgeGap) => void;
  onResolve?: (gapId: string) => void;
  showFilters?: boolean;
  showStats?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function GapList({
  collectionId,
  onSelect,
  onResolve,
  showFilters = true,
  showStats = true,
}: GapListProps) {
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [stats, setStats] = useState<GapStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<GapStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<GapType | "">("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchGaps = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: "20",
        include_stats: showStats ? "true" : "false",
      });

      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("gap_type", typeFilter);
      if (collectionId) params.set("collection_id", collectionId);

      const response = await fetch(`/api/knowledge-gaps?${params}`);
      if (!response.ok) throw new Error("Failed to fetch knowledge gaps");

      const data = await response.json();
      setGaps(data.gaps);
      setTotalPages(data.totalPages || 1);
      if (data.statistics) {
        setStats(data.statistics);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, collectionId, page, showStats]);

  useEffect(() => {
    fetchGaps();
  }, [fetchGaps]);

  const handleResolve = async (gapId: string) => {
    if (onResolve) {
      onResolve(gapId);
      return;
    }

    try {
      const response = await fetch(`/api/knowledge-gaps/${gapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });

      if (!response.ok) throw new Error("Failed to resolve gap");
      fetchGaps();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve gap");
    }
  };

  const handleDismiss = async (gapId: string) => {
    try {
      const response = await fetch(`/api/knowledge-gaps/${gapId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to dismiss gap");
      fetchGaps();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss gap");
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)] rounded-lg p-4 text-[var(--signal-conflict-ink)]">
        <p className="font-medium">Error loading knowledge gaps</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={fetchGaps}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      {showStats && stats && <StatsSummary stats={stats} />}

      {/* Filters */}
      {showFilters && (
        <div className="flex gap-4 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as GapStatus | "");
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="wont_fix">Dismissed</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as GapType | "");
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Types</option>
            <option value="missing_entity">Missing Entity</option>
            <option value="missing_table">Missing Table</option>
            <option value="outdated_doc">Outdated Document</option>
            <option value="permission_denied">Permission Denied</option>
            <option value="coverage_gap">Coverage Gap</option>
            <option value="domain_mismatch">Domain Mismatch</option>
          </select>
        </div>
      )}

      {/* Gap List */}
      {gaps.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {gaps.map((gap) => (
            <GapCard
              key={gap.id}
              gap={gap}
              onSelect={onSelect}
              onResolve={handleResolve}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function StatsSummary({ stats }: { stats: GapStatistics }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Total Gaps" value={stats.totalGaps} colorClass="bg-gray-100" />
      <StatCard label="Open" value={stats.openGaps} colorClass="bg-[var(--signal-pending-soft)]" />
      <StatCard label="Resolved" value={stats.resolvedGaps} colorClass="bg-[var(--signal-canon-soft)]" />
      {stats.avgResolutionTimeHours && (
        <StatCard
          label="Avg Resolution"
          value={`${stats.avgResolutionTimeHours.toFixed(1)}h`}
          colorClass="bg-blue-100"
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number | string;
  colorClass: string;
}) {
  return (
    <div className={`${colorClass} rounded-lg p-4`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function GapCard({
  gap,
  onSelect,
  onResolve,
  onDismiss,
}: {
  gap: KnowledgeGap;
  onSelect?: (gap: KnowledgeGap) => void;
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const statusColors: Record<GapStatus, string> = {
    open: "szn-badge szn-badge-warning",
    in_progress: "szn-badge szn-badge-info",
    resolved: "szn-badge szn-badge-success",
    wont_fix: "szn-badge szn-badge-muted",
  };

  const typeIcons: Record<GapType, string> = {
    missing_entity: "?",
    missing_table: "#",
    outdated_doc: "!",
    permission_denied: "X",
    coverage_gap: "~",
    domain_mismatch: "!=",
  };

  const typeLabels: Record<GapType, string> = {
    missing_entity: "Missing Entity",
    missing_table: "Missing Table",
    outdated_doc: "Outdated",
    permission_denied: "Permission",
    coverage_gap: "Coverage Gap",
    domain_mismatch: "Domain Mismatch",
  };

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onSelect?.(gap)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center font-mono text-sm">
            {typeIcons[gap.gapType]}
          </span>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase">
              {typeLabels[gap.gapType]}
            </span>
            <span
              className={`ml-2 ${statusColors[gap.status]}`}
            >
              {gap.status.replace("_", " ")}
            </span>
          </div>
        </div>
        <span className="text-xs text-gray-400">
          {formatDate(gap.createdAt)}
        </span>
      </div>

      <p className="text-gray-800 mb-3 line-clamp-2">{gap.queryText}</p>

      {/* Missing Entities */}
      {gap.missingEntities.length > 0 && (
        <div className="mb-3">
          <span className="text-xs text-gray-500">Missing entities:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {gap.missingEntities.slice(0, 5).map((entity, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)] text-xs rounded"
              >
                {entity.name}
              </span>
            ))}
            {gap.missingEntities.length > 5 && (
              <span className="text-xs text-gray-400">
                +{gap.missingEntities.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Confidence */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500">Confidence:</span>
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full"
            style={{ width: `${gap.confidence * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-600">
          {(gap.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* Actions */}
      {gap.status === "open" && (
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onResolve(gap.id);
            }}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-[var(--signal-canon)] rounded-lg hover:bg-[var(--signal-canon)]"
          >
            Mark Resolved
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(gap.id);
            }}
            className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
      <CheckIcon className="w-12 h-12 text-[var(--signal-canon-ink)] mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">No Knowledge Gaps</h3>
      <p className="text-gray-500">
        Great! Your knowledge base is covering user queries well.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-lg p-4 animate-pulse">
            <div className="h-4 w-16 bg-gray-200 rounded mb-2" />
            <div className="h-8 w-12 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse"
          >
            <div className="h-5 w-32 bg-gray-200 rounded mb-3" />
            <div className="h-4 w-full bg-gray-200 rounded mb-2" />
            <div className="h-4 w-3/4 bg-gray-200 rounded mb-4" />
            <div className="h-10 w-full bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

export default GapList;
