"use client";

import { useState } from "react";
import type { RetOpsAlert, AlertSeverity, AlertStatus } from "@/lib/summer/retops/types";

// ============================================
// Types
// ============================================

export interface AlertsPanelProps {
  alerts: RetOpsAlert[];
  loading?: boolean;
  onAcknowledge?: (alertId: string) => void;
}

// ============================================
// Constants
// ============================================

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  { bgColor: string; textColor: string; borderColor: string; icon: React.ReactNode }
> = {
  critical: {
    bgColor: "bg-red-50",
    textColor: "text-red-800",
    borderColor: "border-red-200",
    icon: <CriticalIcon className="w-5 h-5 text-red-600" />,
  },
  warning: {
    bgColor: "bg-yellow-50",
    textColor: "text-yellow-800",
    borderColor: "border-yellow-200",
    icon: <WarningIcon className="w-5 h-5 text-yellow-600" />,
  },
  info: {
    bgColor: "bg-blue-50",
    textColor: "text-blue-800",
    borderColor: "border-blue-200",
    icon: <InfoIcon className="w-5 h-5 text-blue-600" />,
  },
};

const STATUS_BADGE: Record<AlertStatus, { bgColor: string; textColor: string }> = {
  active: { bgColor: "bg-red-100", textColor: "text-red-700" },
  acknowledged: { bgColor: "bg-yellow-100", textColor: "text-yellow-700" },
  resolved: { bgColor: "bg-green-100", textColor: "text-green-700" },
};

// ============================================
// Component
// ============================================

export function AlertsPanel({ alerts, loading, onAcknowledge }: AlertsPanelProps) {
  const [filter, setFilter] = useState<AlertStatus | "all">("all");

  const filteredAlerts = filter === "all"
    ? alerts
    : alerts.filter((a) => a.status === filter);

  const activeCount = alerts.filter((a) => a.status === "active").length;
  const acknowledgedCount = alerts.filter((a) => a.status === "acknowledged").length;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Alerts</h3>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
              {activeCount} active
            </span>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
          {(["all", "active", "acknowledged", "resolved"] as const).map((status) => (
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
          ))}
        </div>
      </div>

      {/* Alerts List */}
      {filteredAlerts.length === 0 ? (
        <div className="text-center py-8">
          <BellIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {filter === "all" ? "No alerts" : `No ${filter} alerts`}
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {filteredAlerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={onAcknowledge}
            />
          ))}
        </div>
      )}

      {/* Summary Footer */}
      {alerts.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
          <span>
            {activeCount} active, {acknowledgedCount} acknowledged
          </span>
          <button className="text-indigo-600 hover:text-indigo-700 font-medium">
            View all alerts
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Alert Card Component
// ============================================

function AlertCard({
  alert,
  onAcknowledge,
}: {
  alert: RetOpsAlert;
  onAcknowledge?: (alertId: string) => void;
}) {
  const config = SEVERITY_CONFIG[alert.severity];
  const statusBadge = STATUS_BADGE[alert.status];

  return (
    <div
      className={`p-4 rounded-lg border ${config.borderColor} ${config.bgColor}`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0">{config.icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-semibold ${config.textColor}`}>
              {alert.title}
            </span>
            <span
              className={`px-1.5 py-0.5 text-xs font-medium rounded ${statusBadge.bgColor} ${statusBadge.textColor}`}
            >
              {alert.status}
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-2">{alert.message}</p>

          {/* Metric Info */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>
              Metric: <span className="font-medium">{alert.metric}</span>
            </span>
            <span>
              Current: <span className="font-medium">{alert.currentValue}</span>
            </span>
            <span>
              Threshold: <span className="font-medium">{alert.threshold}</span>
            </span>
          </div>

          {/* Timestamp */}
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <span>Created: {formatTime(alert.createdAt)}</span>
            {alert.acknowledgedAt && (
              <span>- Ack: {formatTime(alert.acknowledgedAt)}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        {alert.status === "active" && onAcknowledge && (
          <button
            onClick={() => onAcknowledge(alert.id)}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Acknowledge
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// Utility Functions
// ============================================

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================
// Icons
// ============================================

function CriticalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

export default AlertsPanel;
