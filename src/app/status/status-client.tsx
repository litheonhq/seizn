"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format-date";

interface ServiceStatus {
  name: string;
  status: "operational" | "degraded" | "down";
  latency_ms?: number;
  message?: string;
  last_check: string;
}

interface Incident {
  id: string;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  severity: "minor" | "major" | "critical";
  affected_services: string[];
  started_at: string;
  resolved_at?: string;
  updates: Array<{
    message: string;
    timestamp: string;
  }>;
}

interface StatusData {
  status: "operational" | "degraded" | "partial_outage" | "major_outage";
  services: ServiceStatus[];
  incidents: Incident[];
  uptime: {
    last_24h: number;
    last_7d: number;
    last_30d: number;
    last_90d: number;
  };
  incident_history?: Incident[];
  status_history?: Array<{
    date: string;
    status: string;
    uptime_percent: number;
  }>;
  last_updated: string;
}

interface StatusClientProps {
  initialData?: StatusData | null;
}

/**
 * Compute overall status from services (defensive - ensures consistency)
 * Even if API returns inconsistent data, UI will show correct status
 */
function computeOverallStatus(
  services: ServiceStatus[]
): StatusData['status'] {
  const downCount = services.filter((s) => s.status === 'down').length;
  const degradedCount = services.filter((s) => s.status === 'degraded').length;

  if (downCount >= 3) return 'major_outage';
  if (downCount >= 1) return 'partial_outage';
  if (degradedCount >= 1) return 'degraded';
  return 'operational';
}

export function StatusClient({ initialData }: StatusClientProps) {
  const [data, setData] = useState<StatusData | null>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/status?history=true");
      const statusData = await response.json();
      if (statusData.success) {
        setData(statusData);
      }
    } catch (error) {
      console.error("Failed to load status:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();

    // Auto-refresh every 60 seconds
    const interval = setInterval(() => {
      if (autoRefresh) {
        loadStatus();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [autoRefresh, loadStatus]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-[var(--ink-50)] rounded w-48" />
          <div className="h-32 bg-[var(--ink-50)] rounded" />
          <div className="h-64 bg-[var(--ink-50)] rounded" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-[var(--ink-600)]">Unable to load status information</p>
      </div>
    );
  }

  const statusConfig = {
    operational: {
      color: "bg-[var(--signal-canon)]",
      textColor: "text-[var(--signal-canon-ink)]",
      bgColor: "bg-[var(--signal-canon-soft)]",
      label: "All Systems Operational",
      icon: "✓",
    },
    degraded: {
      color: "bg-yellow-500",
      textColor: "text-[var(--signal-pending-ink)]",
      bgColor: "bg-[var(--signal-pending-soft)]",
      label: "Degraded Performance",
      icon: "!",
    },
    partial_outage: {
      color: "bg-orange-500",
      textColor: "text-orange-700",
      bgColor: "bg-orange-50",
      label: "Partial System Outage",
      icon: "!",
    },
    major_outage: {
      color: "bg-[var(--signal-conflict)]",
      textColor: "text-[var(--signal-conflict-ink)]",
      bgColor: "bg-[var(--signal-conflict-soft)]",
      label: "Major System Outage",
      icon: "✕",
    },
  };

  // Use computed status from services (ensures consistency)
  const computedStatus = computeOverallStatus(data.services);
  const currentStatus = statusConfig[computedStatus];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="text-2xl font-bold text-[var(--ink-900)]">
          Seizn
        </Link>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--ink-600)]">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={loadStatus}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-[var(--ink-50)]"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Overall Status Banner */}
      <div
        className={`${currentStatus.bgColor} rounded-2xl p-6 mb-8 border ${
          computedStatus === "operational" ? "border-[var(--signal-canon)]" : "border-orange-200"
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 ${currentStatus.color} rounded-full flex items-center justify-center text-white text-xl font-bold`}
          >
            {currentStatus.icon}
          </div>
          <div>
            <h1 className={`text-xl font-bold ${currentStatus.textColor}`}>
              {currentStatus.label}
            </h1>
            <p className="text-[var(--ink-600)] text-sm mt-1">
              Last updated: {new Date(data.last_updated).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Active Incidents */}
      {data.incidents.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-4">Active Incidents</h2>
          <div className="space-y-4">
            {data.incidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
        </div>
      )}

      {/* Uptime Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <UptimeCard period="24 hours" value={data.uptime.last_24h} />
        <UptimeCard period="7 days" value={data.uptime.last_7d} />
        <UptimeCard period="30 days" value={data.uptime.last_30d} />
        <UptimeCard period="90 days" value={data.uptime.last_90d} />
      </div>

      {/* Services Status */}
      <div className="bg-[var(--ink-0)] rounded-2xl border mb-8">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-[var(--ink-900)]">Service Status</h2>
        </div>
        <div className="divide-y">
          {data.services.map((service) => (
            <ServiceRow key={service.name} service={service} />
          ))}
        </div>
      </div>

      {/* Status History (30 day grid) */}
      {data.status_history && (
        <div className="bg-[var(--ink-0)] rounded-2xl border mb-8">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-[var(--ink-900)]">30-Day History</h2>
          </div>
          <div className="p-4">
            <div className="flex gap-1">
              {data.status_history.map((day, _i) => (
                <div
                  key={day.date}
                  className={`flex-1 h-8 rounded ${
                    day.status === "operational" ? "bg-[var(--signal-canon)]" : "bg-yellow-400"
                  }`}
                  title={`${day.date}: ${day.uptime_percent.toFixed(2)}% uptime`}
                />
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-[var(--ink-600)]">
              <span>30 days ago</span>
              <span>Today</span>
            </div>
          </div>
        </div>
      )}

      {/* Incident History - Enhanced */}
      <IncidentHistory incidents={data.incident_history} />

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-[var(--ink-600)]">
        <p>
          Subscribe to status updates via{" "}
          <a href="#" className="text-[var(--ink-900)] hover:underline">
            RSS
          </a>{" "}
          or{" "}
          <a href="#" className="text-[var(--ink-900)] hover:underline">
            Email
          </a>
        </p>
      </div>
    </div>
  );
}

function UptimeCard({ period, value }: { period: string; value: number }) {
  const _getColor = (v: number) => {
    if (v >= 99.9) return "text-[var(--ink-900)]";
    if (v >= 99) return "text-[var(--signal-pending-ink)]";
    return "text-[var(--signal-conflict-ink)]";
  };

  return (
    <div className="bg-[var(--ink-0)] rounded-xl border p-4 text-center">
      <p className="text-2xl font-bold text-[var(--ink-900)]">{value.toFixed(2)}%</p>
      <p className="text-sm text-[var(--ink-600)]">{period}</p>
    </div>
  );
}

function ServiceRow({ service }: { service: ServiceStatus }) {
  const statusColors = {
    operational: "bg-[var(--signal-canon)]",
    degraded: "bg-yellow-500",
    down: "bg-[var(--signal-conflict)]",
  };

  const statusLabels = {
    operational: "Operational",
    degraded: "Degraded",
    down: "Down",
  };

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${statusColors[service.status]}`} />
        <span className="font-medium text-[var(--ink-900)]">{service.name}</span>
      </div>
      <div className="flex items-center gap-4">
        {service.latency_ms && (
          <span className="text-sm text-[var(--ink-600)]">{service.latency_ms}ms</span>
        )}
        <span
          className={`text-sm ${
            service.status === "operational" ? "text-[var(--ink-900)]" :
            service.status === "degraded" ? "text-[var(--signal-pending-ink)]" : "text-[var(--signal-conflict-ink)]"
          }`}
        >
          {statusLabels[service.status]}
        </span>
      </div>
    </div>
  );
}

function IncidentCard({ incident }: { incident: Incident }) {
  const severityColors = {
    minor: "bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)] border-[var(--signal-pending)]",
    major: "bg-orange-100 text-orange-700 border-orange-200",
    critical: "bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)] border-[var(--signal-conflict)]",
  };

  const statusColors = {
    investigating: "bg-[var(--signal-conflict)]",
    identified: "bg-orange-500",
    monitoring: "bg-blue-500",
    resolved: "bg-[var(--signal-canon)]",
  };

  return (
    <div className={`rounded-xl border p-4 ${severityColors[incident.severity]}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold">{incident.title}</h3>
          <p className="text-sm mt-1">
            Affected: {incident.affected_services.join(", ")}
          </p>
        </div>
        <span
          className={`px-2 py-1 text-xs text-white rounded-full ${statusColors[incident.status]}`}
        >
          {incident.status}
        </span>
      </div>

      {incident.updates.length > 0 && (
        <div className="space-y-2 mt-4 pt-4 border-t border-current/20">
          {incident.updates.slice(0, 3).map((update, idx) => (
            <div key={idx} className="text-sm">
              <span className="font-medium">
                {new Date(update.timestamp).toLocaleString()}
              </span>
              <p className="mt-0.5">{update.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Extended Incident interface for history with additional fields
interface HistoryIncident extends Incident {
  impact?: string;
  root_cause?: string;
}

function IncidentHistory({ incidents }: { incidents?: HistoryIncident[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!incidents || incidents.length === 0) {
    return (
      <div className="bg-[var(--ink-0)] rounded-2xl border">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-[var(--ink-900)]">Past Incidents</h2>
        </div>
        <div className="p-8 text-center text-[var(--ink-600)]">
          <p>No past incidents to display.</p>
          <p className="text-sm mt-1">All systems have been running smoothly.</p>
        </div>
      </div>
    );
  }

  const severityBadge = {
    minor: "bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)]",
    major: "bg-orange-100 text-orange-700",
    critical: "bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)]",
  };

  const statusBadge = {
    investigating: "bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)]",
    identified: "bg-orange-100 text-orange-700",
    monitoring: "bg-blue-100 text-blue-700",
    resolved: "bg-[var(--signal-canon-soft)] text-[var(--signal-canon-ink)]",
  };

  const formatDuration = (start: string, end?: string) => {
    if (!end) return "Ongoing";
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    if (diffHours < 24) return `${diffHours}h ${remainingMins}m`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ${diffHours % 24}h`;
  };

  return (
    <div className="bg-[var(--ink-0)] rounded-2xl border">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-[var(--ink-900)]">Past Incidents</h2>
      </div>
      <div className="divide-y">
        {incidents.map((incident) => {
          const isExpanded = expandedId === incident.id;
          return (
            <div key={incident.id} className="p-4">
              {/* Header Row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : incident.id)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-[var(--ink-900)]">{incident.title}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${severityBadge[incident.severity]}`}>
                        {incident.severity}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-[var(--ink-600)]">
                      <span>{formatDate(incident.started_at)}</span>
                      <span>Duration: {formatDuration(incident.started_at, incident.resolved_at)}</span>
                      <span>Affected: {incident.affected_services.join(", ")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${statusBadge[incident.status]}`}>
                      {incident.status}
                    </span>
                    <svg
                      className={`w-5 h-5 text-[var(--ink-500)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-[var(--ink-200)]">
                  {/* Impact */}
                  {incident.impact && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-[var(--ink-900)] mb-1">Impact</h4>
                      <p className="text-sm text-[var(--ink-600)]">{incident.impact}</p>
                    </div>
                  )}

                  {/* Root Cause */}
                  {incident.root_cause && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-[var(--ink-900)] mb-1">Root Cause</h4>
                      <p className="text-sm text-[var(--ink-600)]">{incident.root_cause}</p>
                    </div>
                  )}

                  {/* Timeline */}
                  {incident.updates && incident.updates.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-[var(--ink-900)] mb-2">Timeline</h4>
                      <div className="relative pl-4 border-l-2 border-[var(--ink-200)] space-y-3">
                        {incident.updates.map((update, idx) => (
                          <div key={idx} className="relative">
                            <div className="absolute -left-[21px] w-3 h-3 bg-[var(--ink-0)] border-2 border-[var(--ink-200)] rounded-full" />
                            <div className="text-xs text-[var(--ink-600)]">
                              {new Date(update.timestamp).toLocaleString()}
                            </div>
                            <p className="text-sm text-[var(--ink-900)] mt-0.5">{update.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
