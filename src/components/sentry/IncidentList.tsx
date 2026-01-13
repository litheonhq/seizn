"use client";

import { useState } from "react";
import type {
  Incident,
  IncidentStatus,
  IncidentSeverity,
  ErrorType,
  IncidentSummary,
} from "@/lib/sentry/types";

// ============================================
// Types
// ============================================

export interface IncidentListProps {
  incidents: Incident[];
  summary?: IncidentSummary;
  loading?: boolean;
  onSelectIncident?: (incident: Incident) => void;
  onResolve?: (incidentId: string) => void;
  onIgnore?: (incidentId: string) => void;
}

type FilterStatus = IncidentStatus | "all";

// ============================================
// Constants
// ============================================

const SEVERITY_CONFIG: Record<
  IncidentSeverity,
  { bgColor: string; textColor: string; borderColor: string; dotColor: string }
> = {
  critical: {
    bgColor: "bg-red-50",
    textColor: "text-red-800",
    borderColor: "border-red-200",
    dotColor: "bg-red-500",
  },
  high: {
    bgColor: "bg-orange-50",
    textColor: "text-orange-800",
    borderColor: "border-orange-200",
    dotColor: "bg-orange-500",
  },
  medium: {
    bgColor: "bg-yellow-50",
    textColor: "text-yellow-800",
    borderColor: "border-yellow-200",
    dotColor: "bg-yellow-500",
  },
  low: {
    bgColor: "bg-blue-50",
    textColor: "text-blue-800",
    borderColor: "border-blue-200",
    dotColor: "bg-blue-500",
  },
};

const STATUS_BADGE: Record<IncidentStatus, { bgColor: string; textColor: string }> = {
  open: { bgColor: "bg-red-100", textColor: "text-red-700" },
  investigating: { bgColor: "bg-yellow-100", textColor: "text-yellow-700" },
  resolved: { bgColor: "bg-green-100", textColor: "text-green-700" },
  ignored: { bgColor: "bg-gray-100", textColor: "text-gray-500" },
};

const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  missing_context: "Missing Context",
  low_faithfulness: "Low Faithfulness",
  timeout: "Timeout",
  policy_blocked: "Policy Blocked",
  embedding_mismatch: "Embedding Issue",
  rerank_failure: "Rerank Failure",
  hallucination: "Hallucination",
  stale_context: "Stale Context",
  query_mismatch: "Query Mismatch",
  empty_results: "Empty Results",
  unknown: "Unknown",
};

// ============================================
// Component
// ============================================

export function IncidentList({
  incidents,
  summary,
  loading,
  onSelectIncident,
  onResolve,
  onIgnore,
}: IncidentListProps) {
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | "all">("all");

  const filteredIncidents = incidents.filter((i) => {
    if (filter !== "all" && i.status !== filter) return false;
    if (severityFilter !== "all" && i.severity !== severityFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header with Summary */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900">Incidents</h3>
            {summary && summary.openIncidents > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                {summary.openIncidents} open
              </span>
            )}
          </div>

          {/* Summary Stats */}
          {summary && (
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {summary.criticalIncidents > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  {summary.criticalIncidents} critical
                </span>
              )}
              {summary.highIncidents > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  {summary.highIncidents} high
                </span>
              )}
              <span>
                {summary.resolvedToday} resolved today
              </span>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          {/* Status Filter */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
            {(["all", "open", "investigating", "resolved", "ignored"] as const).map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    filter === status
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              )
            )}
          </div>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) =>
              setSeverityFilter(e.target.value as IncidentSeverity | "all")
            }
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Incidents List */}
      <div className="divide-y divide-gray-100">
        {filteredIncidents.length === 0 ? (
          <div className="p-8 text-center">
            <SentryIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No incidents found</p>
            <p className="text-xs text-gray-400 mt-1">
              {filter !== "all" || severityFilter !== "all"
                ? "Try adjusting your filters"
                : "All systems operating normally"}
            </p>
          </div>
        ) : (
          filteredIncidents.map((incident) => (
            <IncidentRow
              key={incident.id}
              incident={incident}
              onClick={() => onSelectIncident?.(incident)}
              onResolve={() => onResolve?.(incident.id)}
              onIgnore={() => onIgnore?.(incident.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================
// Incident Row Component
// ============================================

function IncidentRow({
  incident,
  onClick,
  onResolve,
  onIgnore,
}: {
  incident: Incident;
  onClick?: () => void;
  onResolve?: () => void;
  onIgnore?: () => void;
}) {
  const severityConfig = SEVERITY_CONFIG[incident.severity];
  const statusBadge = STATUS_BADGE[incident.status];

  return (
    <div
      className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
        incident.status === "ignored" ? "opacity-60" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        {/* Severity Indicator */}
        <div className="flex-shrink-0 mt-1">
          <span
            className={`block w-3 h-3 rounded-full ${severityConfig.dotColor}`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title Row */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-900 truncate">
              {incident.title}
            </span>
            <span
              className={`px-1.5 py-0.5 text-xs font-medium rounded ${statusBadge.bgColor} ${statusBadge.textColor}`}
            >
              {incident.status}
            </span>
            {incident.errorType && (
              <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">
                {ERROR_TYPE_LABELS[incident.errorType] ?? incident.errorType}
              </span>
            )}
          </div>

          {/* Description */}
          {incident.description && (
            <p className="text-xs text-gray-500 line-clamp-1 mb-2">
              {incident.description}
            </p>
          )}

          {/* Meta Row */}
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <CountIcon className="w-3.5 h-3.5" />
              {incident.occurrenceCount} occurrences
            </span>
            <span>
              First seen: {formatRelativeTime(incident.firstSeenAt)}
            </span>
            <span>
              Last: {formatRelativeTime(incident.lastSeenAt)}
            </span>
          </div>
        </div>

        {/* Actions */}
        {incident.status === "open" && (
          <div
            className="flex-shrink-0 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onResolve}
              className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
            >
              Resolve
            </button>
            <button
              onClick={onIgnore}
              className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Ignore
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Utility Functions
// ============================================

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ============================================
// Icons
// ============================================

function SentryIcon({ className }: { className?: string }) {
  return (
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
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}

function CountIcon({ className }: { className?: string }) {
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
        d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
      />
    </svg>
  );
}

export default IncidentList;
