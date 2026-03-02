"use client";

import { useMemo } from "react";
import type { QueryReceipt } from "@/lib/retrieval/receipt";

// ============================================
// Types
// ============================================

export interface ReceiptCardProps {
  receipt: QueryReceipt;
  onClick?: () => void;
  compact?: boolean;
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * ReceiptCard - Compact summary card for a query receipt
 * Shows key metrics at a glance: cost, latency, evidence count, policy status
 */
export function ReceiptCard({
  receipt,
  onClick,
  compact = false,
  className = "",
}: ReceiptCardProps) {
  const formatCost = (usd: number) => {
    if (usd < 0.01) return `$${usd.toFixed(6)}`;
    if (usd < 1) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(2)}`;
  };

  const formatLatency = (ms: number) => {
    if (ms < 1) return "<1ms";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const statusColor = useMemo(() => {
    if (receipt.policy.budget_remaining_percent < 10) return "text-red-400";
    if (receipt.policy.budget_remaining_percent < 25) return "text-yellow-400";
    return "text-green-400";
  }, [receipt.policy.budget_remaining_percent]);

  const cacheHitBadge = receipt.execution.cache_hit ? (
    <span className="px-2 py-0.5 text-xs bg-yellow-900/50 text-yellow-400 rounded-full">
      CACHED
    </span>
  ) : null;

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`w-full p-3 bg-gray-900 rounded-lg border border-szn-border hover:border-szn-border transition-colors text-left ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-szn-text-3">
              {receipt.receipt_id.slice(0, 12)}...
            </span>
            {cacheHitBadge}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-szn-accent">{formatCost(receipt.cost.estimated_cost_usd)}</span>
            <span className="text-blue-400">{formatLatency(receipt.execution.latency_ms)}</span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full bg-gray-900 rounded-lg border border-szn-border hover:border-szn-border transition-colors text-left overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-szn-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-szn-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
              />
            </svg>
            <span className="text-sm font-mono text-szn-text-3">{receipt.receipt_id}</span>
            {cacheHitBadge}
          </div>
          <span className="text-xs text-szn-text-2">
            {new Date(receipt.timestamp).toLocaleString()}
          </span>
        </div>
        {receipt.query_preview && (
          <p className="mt-2 text-sm text-szn-text-2 truncate">
            &ldquo;{receipt.query_preview}&rdquo;
          </p>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-szn-border">
        {/* Cost */}
        <div className="p-4">
          <div className="text-xs text-szn-text-2 uppercase tracking-wide mb-1">Cost</div>
          <div className="text-xl font-bold text-szn-accent">
            {formatCost(receipt.cost.estimated_cost_usd)}
          </div>
          <div className="text-xs text-szn-text-2">
            {receipt.cost.total_query_units} QU
          </div>
        </div>

        {/* Latency */}
        <div className="p-4">
          <div className="text-xs text-szn-text-2 uppercase tracking-wide mb-1">Latency</div>
          <div className="text-xl font-bold text-blue-400">
            {formatLatency(receipt.execution.latency_ms)}
          </div>
          <div className="text-xs text-szn-text-2 truncate" title={receipt.execution.plan_path}>
            {receipt.execution.plan_path}
          </div>
        </div>

        {/* Evidence */}
        <div className="p-4">
          <div className="text-xs text-szn-text-2 uppercase tracking-wide mb-1">Evidence</div>
          <div className="text-xl font-bold text-purple-400">
            {receipt.evidence.context_chunks}
          </div>
          <div className="text-xs text-szn-text-2">
            of {receipt.evidence.candidates_count} candidates
          </div>
        </div>

        {/* Policy */}
        <div className="p-4">
          <div className="text-xs text-szn-text-2 uppercase tracking-wide mb-1">Policy</div>
          <div className={`text-xl font-bold ${statusColor}`}>
            {receipt.policy.budget_remaining_percent.toFixed(0)}%
          </div>
          <div className="text-xs text-szn-text-2">
            {receipt.policy.pii_scanned ? "PII Scanned" : "No PII Scan"}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {receipt.plan && (
            <span className="px-2 py-0.5 text-xs bg-blue-900/50 text-blue-400 rounded-full capitalize">
              {receipt.plan}
            </span>
          )}
          {receipt.policy.redactions_applied > 0 && (
            <span className="px-2 py-0.5 text-xs bg-orange-900/50 text-orange-400 rounded-full">
              {receipt.policy.redactions_applied} redacted
            </span>
          )}
        </div>
        <svg
          className="w-4 h-4 text-szn-text-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

export default ReceiptCard;
