"use client";

import { useState } from "react";
import type { DriftAlert, DriftRecommendation } from "@/lib/drift/types";

// ============================================
// Types
// ============================================

export interface DriftAlertCardProps {
  alert: DriftAlert;
  onAcknowledge?: (alertId: string) => void;
  onResolve?: (alertId: string, notes?: string) => void;
  compact?: boolean;
}

// ============================================
// Severity Badge Colors
// ============================================

const severityColors = {
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    badge: "bg-blue-100 text-blue-800",
  },
  warning: {
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    text: "text-yellow-700",
    badge: "bg-yellow-100 text-yellow-800",
  },
  critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    badge: "bg-red-100 text-red-800",
  },
};

const statusColors = {
  active: "bg-red-100 text-red-800",
  acknowledged: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  ignored: "bg-gray-100 text-gray-800",
};

// ============================================
// Icons
// ============================================

function AlertIcon({ severity }: { severity: DriftAlert["severity"] }) {
  const colors = {
    info: "text-blue-500",
    warning: "text-yellow-500",
    critical: "text-red-500",
  };

  return (
    <svg
      className={`w-5 h-5 ${colors[severity]}`}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

// ============================================
// Component
// ============================================

export function DriftAlertCard({
  alert,
  onAcknowledge,
  onResolve,
  compact = false,
}: DriftAlertCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [showResolveForm, setShowResolveForm] = useState(false);

  const colors = severityColors[alert.severity];
  const timeAgo = getTimeAgo(alert.createdAt);

  const handleAcknowledge = () => {
    if (onAcknowledge) {
      onAcknowledge(alert.id);
    }
  };

  const handleResolve = () => {
    if (onResolve) {
      onResolve(alert.id, resolutionNotes || undefined);
      setShowResolveForm(false);
      setResolutionNotes("");
    }
  };

  if (compact) {
    return (
      <div
        className={`p-3 rounded-lg border ${colors.bg} ${colors.border} cursor-pointer hover:shadow-sm transition-shadow`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-2">
          <AlertIcon severity={alert.severity} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${colors.text} truncate`}>
              {alert.title}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{timeAgo}</p>
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[alert.status]}`}
          >
            {alert.status}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border ${colors.bg} ${colors.border} overflow-hidden`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <AlertIcon severity={alert.severity} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-sm font-semibold ${colors.text}`}>
                {alert.title}
              </h3>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors.badge}`}>
                {alert.severity}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[alert.status]}`}
              >
                {alert.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
            <p className="text-xs text-gray-500 mt-2">{timeAgo}</p>
          </div>
        </div>

        {/* Metrics */}
        {(alert.currentValue !== undefined || alert.threshold !== undefined) && (
          <div className="flex gap-4 mt-3 text-xs">
            {alert.currentValue !== undefined && (
              <div>
                <span className="text-gray-500">Current: </span>
                <span className="font-medium text-gray-700">
                  {formatValue(alert.currentValue, alert.alertType)}
                </span>
              </div>
            )}
            {alert.threshold !== undefined && (
              <div>
                <span className="text-gray-500">Threshold: </span>
                <span className="font-medium text-gray-700">
                  {formatValue(alert.threshold, alert.alertType)}
                </span>
              </div>
            )}
            {alert.deviationPct !== undefined && (
              <div>
                <span className="text-gray-500">Deviation: </span>
                <span className="font-medium text-gray-700">
                  {alert.deviationPct.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recommendations */}
      {alert.recommendations && alert.recommendations.length > 0 && (
        <div className="border-t border-gray-200 px-4 py-3 bg-white/50">
          <button
            className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            Recommendations ({alert.recommendations.length})
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-2">
              {alert.recommendations.map((rec, idx) => (
                <RecommendationItem key={idx} recommendation={rec} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {alert.status === "active" && (onAcknowledge || onResolve) && (
        <div className="border-t border-gray-200 px-4 py-3 bg-white/50 flex gap-2">
          {onAcknowledge && (
            <button
              onClick={handleAcknowledge}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition-colors"
            >
              <CheckIcon />
              Acknowledge
            </button>
          )}
          {onResolve && !showResolveForm && (
            <button
              onClick={() => setShowResolveForm(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
            >
              <CheckIcon />
              Resolve
            </button>
          )}
        </div>
      )}

      {/* Resolve Form */}
      {showResolveForm && (
        <div className="border-t border-gray-200 px-4 py-3 bg-white/50">
          <textarea
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            placeholder="Resolution notes (optional)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleResolve}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              <CheckIcon />
              Confirm Resolve
            </button>
            <button
              onClick={() => setShowResolveForm(false)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <XIcon />
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Recommendation Item
// ============================================

function RecommendationItem({ recommendation }: { recommendation: DriftRecommendation }) {
  const impactColors = {
    low: "bg-gray-100 text-gray-700",
    medium: "bg-yellow-100 text-yellow-700",
    high: "bg-red-100 text-red-700",
  };

  return (
    <div className="flex items-start gap-2 p-2 bg-white rounded border border-gray-100">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-900 capitalize">
            {recommendation.action.replace(/_/g, " ")}
          </span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${impactColors[recommendation.impact]}`}
          >
            {recommendation.impact} impact
          </span>
          {recommendation.autoApplicable && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
              Auto-applicable
            </span>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-1">{recommendation.description}</p>
      </div>
    </div>
  );
}

// ============================================
// Helpers
// ============================================

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function formatValue(value: number, alertType: string): string {
  if (alertType === "centroid_shift") {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (alertType === "score_drop" || alertType === "entropy_change") {
    return `${value.toFixed(1)}%`;
  }
  return value.toFixed(3);
}

export default DriftAlertCard;
