"use client";

import { useState } from "react";
import type {
  Incident,
  IncidentEvent,
  RCACandidate,
  TraceSnapshot,
} from "@/lib/sentry/types";
import RCAPanel from "./RCAPanel";
import { formatDate } from "@/lib/format-date";

// ============================================
// Types
// ============================================

export interface IncidentDetailProps {
  incident: Incident;
  events: IncidentEvent[];
  relatedTraces?: TraceSnapshot[];
  loading?: boolean;
  onResolve?: (notes?: string) => void;
  onIgnore?: (reason?: string) => void;
  onClose?: () => void;
}

// ============================================
// Constants
// ============================================

const STATUS_CONFIG = {
  open: { label: "Open", badge: "szn-badge szn-badge-error" },
  investigating: { label: "Investigating", badge: "szn-badge szn-badge-warning" },
  resolved: { label: "Resolved", badge: "szn-badge szn-badge-success" },
  ignored: { label: "Ignored", badge: "szn-badge szn-badge-muted" },
};

const SEVERITY_CONFIG = {
  critical: { label: "Critical", color: "bg-red-500" },
  high: { label: "High", color: "bg-orange-500" },
  medium: { label: "Medium", color: "bg-yellow-500" },
  low: { label: "Low", color: "bg-blue-500" },
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  created: <PlusIcon className="w-4 h-4 text-green-500" />,
  occurrence: <RefreshIcon className="w-4 h-4 text-blue-500" />,
  status_change: <ArrowRightIcon className="w-4 h-4 text-purple-500" />,
  rca_updated: <BrainIcon className="w-4 h-4 text-indigo-500" />,
  note_added: <NoteIcon className="w-4 h-4 text-gray-500" />,
  merged: <MergeIcon className="w-4 h-4 text-orange-500" />,
};

// ============================================
// Component
// ============================================

export function IncidentDetail({
  incident,
  events,
  relatedTraces,
  loading,
  onResolve,
  onIgnore,
  onClose,
}: IncidentDetailProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "rca" | "timeline" | "traces">("overview");
  const [resolveNotes, setResolveNotes] = useState("");
  const [showResolveModal, setShowResolveModal] = useState(false);

  const statusConfig = STATUS_CONFIG[incident.status];
  const severityConfig = SEVERITY_CONFIG[incident.severity];

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 w-48 bg-gray-200 rounded mb-4" />
          <div className="h-32 bg-gray-100 rounded mb-4" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-3 h-3 rounded-full ${severityConfig.color}`} />
              <span className={statusConfig.badge}>
                {statusConfig.label}
              </span>
              {incident.errorType && (
                <span className="szn-badge szn-badge-muted">
                  {incident.errorType.replace(/_/g, " ")}
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {incident.title}
            </h2>
            {incident.description && (
              <p className="text-sm text-gray-500">{incident.description}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {incident.status === "open" && (
              <>
                <button
                  onClick={() => setShowResolveModal(true)}
                  className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                >
                  Resolve
                </button>
                <button
                  onClick={() => onIgnore?.()}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Ignore
                </button>
              </>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 mt-4 text-sm text-gray-500">
          <div className="flex items-center gap-1.5">
            <CountIcon className="w-4 h-4" />
            <span>{incident.occurrenceCount} occurrences</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ClockIcon className="w-4 h-4" />
            <span>First: {formatDate(incident.firstSeenAt, "long")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ClockIcon className="w-4 h-4" />
            <span>Last: {formatDate(incident.lastSeenAt, "long")}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-100">
        <div className="flex gap-4 px-4">
          {(["overview", "rca", "timeline", "traces"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === "overview" && (
          <OverviewTab incident={incident} />
        )}
        {activeTab === "rca" && (
          <RCAPanel
            candidates={incident.rcaCandidates as RCACandidate[]}
            errorType={incident.errorType}
          />
        )}
        {activeTab === "timeline" && (
          <TimelineTab events={events} />
        )}
        {activeTab === "traces" && (
          <TracesTab traces={relatedTraces ?? []} />
        )}
      </div>

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Resolve Incident
            </h3>
            <textarea
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              placeholder="Add resolution notes (optional)"
              className="w-full p-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows={3}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowResolveModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onResolve?.(resolveNotes || undefined);
                  setShowResolveModal(false);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Tab Components
// ============================================

function OverviewTab({ incident }: { incident: Incident }) {
  return (
    <div className="space-y-6">
      {/* Sample Query */}
      {incident.sampleQuery && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Sample Query</h4>
          <div className="p-3 bg-gray-50 rounded-lg">
            <code className="text-sm text-gray-800">{incident.sampleQuery}</code>
          </div>
        </div>
      )}

      {/* Sample Response */}
      {incident.sampleResponse && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Sample Response</h4>
          <div className="p-3 bg-gray-50 rounded-lg max-h-48 overflow-y-auto">
            <p className="text-sm text-gray-800 whitespace-pre-wrap">
              {incident.sampleResponse}
            </p>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Collection ID</p>
          <p className="text-sm font-mono text-gray-800">
            {incident.collectionId ?? "N/A"}
          </p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Fingerprint</p>
          <p className="text-sm font-mono text-gray-800 truncate">
            {incident.fingerprint}
          </p>
        </div>
      </div>

      {/* Resolution Info */}
      {incident.status === "resolved" && incident.resolvedAt && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <h4 className="text-sm font-medium text-green-800 mb-2">Resolution</h4>
          <p className="text-sm text-green-700">
            Resolved on {formatDate(incident.resolvedAt, "long")}
            {incident.resolvedBy && ` by ${incident.resolvedBy}`}
          </p>
          {incident.resolutionNotes && (
            <p className="text-sm text-green-600 mt-2">
              Notes: {incident.resolutionNotes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineTab({ events }: { events: IncidentEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <ClockIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No events recorded</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <div key={event.id} className="flex gap-3">
          <div className="flex-shrink-0 mt-1">
            {EVENT_ICONS[event.eventType] ?? (
              <div className="w-4 h-4 rounded-full bg-gray-300" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 capitalize">
                {event.eventType.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-gray-400">
                {formatDate(event.createdAt, "long")}
              </span>
            </div>
            {Object.keys(event.metadata).length > 0 && (
              <div className="mt-1 text-xs text-gray-500">
                {JSON.stringify(event.metadata)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TracesTab({ traces }: { traces: TraceSnapshot[] }) {
  if (traces.length === 0) {
    return (
      <div className="text-center py-8">
        <ListIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No related traces</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {traces.map((trace, index) => (
        <div
          key={index}
          className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-gray-600">
              {trace.queryHash?.substring(0, 12) ?? "Unknown"}
            </span>
            {trace.faithfulness !== undefined && (
              <span className={`text-xs font-medium ${
                trace.faithfulness >= 0.7 ? "text-green-600" : "text-red-600"
              }`}>
                {(trace.faithfulness * 100).toFixed(0)}% faithful
              </span>
            )}
          </div>
          {trace.query && (
            <p className="text-sm text-gray-800 line-clamp-1">{trace.query}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            {trace.latencyMs !== undefined && (
              <span>{trace.latencyMs}ms</span>
            )}
            {trace.plannerPath && (
              <span>{trace.plannerPath}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Utility Functions
// ============================================

// formatDate imported from @/lib/format-date

// ============================================
// Icons
// ============================================

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CountIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.417.07a9.05 9.05 0 01-7.436-2.362L12 18m0 0l-.218-.218a9.05 9.05 0 00-7.436-2.362l-.417.07c-1.717.293-2.299 2.38-1.067 3.611L5 20.8" />
    </svg>
  );
}

function NoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function MergeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

export default IncidentDetail;
