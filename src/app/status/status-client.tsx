"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500">Unable to load status information</p>
      </div>
    );
  }

  const statusConfig = {
    operational: {
      color: "bg-emerald-500",
      textColor: "text-emerald-700",
      bgColor: "bg-emerald-50",
      label: "All Systems Operational",
      icon: "✓",
    },
    degraded: {
      color: "bg-yellow-500",
      textColor: "text-yellow-700",
      bgColor: "bg-yellow-50",
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
      color: "bg-red-500",
      textColor: "text-red-700",
      bgColor: "bg-red-50",
      label: "Major System Outage",
      icon: "✕",
    },
  };

  const currentStatus = statusConfig[data.status];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="text-2xl font-bold text-gray-900">
          Seizn
        </Link>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
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
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Overall Status Banner */}
      <div
        className={`${currentStatus.bgColor} rounded-2xl p-6 mb-8 border ${
          data.status === "operational" ? "border-emerald-200" : "border-orange-200"
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
            <p className="text-gray-600 text-sm mt-1">
              Last updated: {new Date(data.last_updated).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Active Incidents */}
      {data.incidents.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Incidents</h2>
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
      <div className="bg-white rounded-2xl border mb-8">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-gray-900">Service Status</h2>
        </div>
        <div className="divide-y">
          {data.services.map((service) => (
            <ServiceRow key={service.name} service={service} />
          ))}
        </div>
      </div>

      {/* Status History (30 day grid) */}
      {data.status_history && (
        <div className="bg-white rounded-2xl border mb-8">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">30-Day History</h2>
          </div>
          <div className="p-4">
            <div className="flex gap-1">
              {data.status_history.map((day, _i) => (
                <div
                  key={day.date}
                  className={`flex-1 h-8 rounded ${
                    day.status === "operational" ? "bg-emerald-400" : "bg-yellow-400"
                  }`}
                  title={`${day.date}: ${day.uptime_percent.toFixed(2)}% uptime`}
                />
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>30 days ago</span>
              <span>Today</span>
            </div>
          </div>
        </div>
      )}

      {/* Incident History */}
      {data.incident_history && data.incident_history.length > 0 && (
        <div className="bg-white rounded-2xl border">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">Past Incidents</h2>
          </div>
          <div className="divide-y">
            {data.incident_history.map((incident) => (
              <div key={incident.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{incident.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(incident.started_at).toLocaleDateString()} -{" "}
                      {incident.resolved_at
                        ? new Date(incident.resolved_at).toLocaleDateString()
                        : "Ongoing"}
                    </p>
                  </div>
                  <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">
                    Resolved
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>
          Subscribe to status updates via{" "}
          <a href="#" className="text-emerald-600 hover:underline">
            RSS
          </a>{" "}
          or{" "}
          <a href="#" className="text-emerald-600 hover:underline">
            Email
          </a>
        </p>
      </div>
    </div>
  );
}

function UptimeCard({ period, value }: { period: string; value: number }) {
  const _getColor = (v: number) => {
    if (v >= 99.9) return "text-emerald-600";
    if (v >= 99) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="bg-white rounded-xl border p-4 text-center">
      <p className="text-2xl font-bold text-gray-900">{value.toFixed(2)}%</p>
      <p className="text-sm text-gray-500">{period}</p>
    </div>
  );
}

function ServiceRow({ service }: { service: ServiceStatus }) {
  const statusColors = {
    operational: "bg-emerald-500",
    degraded: "bg-yellow-500",
    down: "bg-red-500",
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
        <span className="font-medium text-gray-900">{service.name}</span>
      </div>
      <div className="flex items-center gap-4">
        {service.latency_ms && (
          <span className="text-sm text-gray-500">{service.latency_ms}ms</span>
        )}
        <span
          className={`text-sm ${
            service.status === "operational" ? "text-emerald-600" : "text-yellow-600"
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
    minor: "bg-yellow-100 text-yellow-700 border-yellow-200",
    major: "bg-orange-100 text-orange-700 border-orange-200",
    critical: "bg-red-100 text-red-700 border-red-200",
  };

  const statusColors = {
    investigating: "bg-red-500",
    identified: "bg-orange-500",
    monitoring: "bg-blue-500",
    resolved: "bg-green-500",
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
