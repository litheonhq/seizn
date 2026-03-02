"use client";

import { useMemo } from "react";
import type { QueryReceipt } from "@/lib/retrieval/receipt";

// ============================================
// Types
// ============================================

export interface ReceiptDetailProps {
  receipt: QueryReceipt;
  onDownload?: (format: "json" | "pdf") => void;
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * ReceiptDetail - Full detailed view of a query receipt
 * Shows all cost, execution, evidence, and policy information
 */
export function ReceiptDetail({
  receipt,
  onDownload,
  className = "",
}: ReceiptDetailProps) {
  const formatCost = (usd: number) => {
    if (usd < 0.0001) return `$${usd.toFixed(8)}`;
    if (usd < 0.01) return `$${usd.toFixed(6)}`;
    if (usd < 1) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(2)}`;
  };

  const formatLatency = (ms: number | undefined) => {
    if (ms === undefined) return "N/A";
    if (ms < 1) return "<1ms";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const statusColor = useMemo(() => {
    if (receipt.policy.budget_remaining_percent < 10) return "text-red-400 bg-red-900/20";
    if (receipt.policy.budget_remaining_percent < 25) return "text-yellow-400 bg-yellow-900/20";
    return "text-green-400 bg-green-900/20";
  }, [receipt.policy.budget_remaining_percent]);

  const pipelineStages = useMemo(() => {
    return receipt.execution.plan_path.split("->").map((stage) => ({
      name: stage.trim(),
      label: stage.trim().replace(/_/g, " "),
    }));
  }, [receipt.execution.plan_path]);

  return (
    <div className={`bg-gray-900 rounded-lg border border-szn-border ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-szn-border">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <svg
                className="w-6 h-6 text-szn-accent"
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
              <h2 className="text-xl font-bold text-white">Query Receipt</h2>
              {receipt.execution.cache_hit && (
                <span className="px-2 py-1 text-xs bg-yellow-900/50 text-yellow-400 rounded-full">
                  CACHED
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-szn-text-3 font-mono">{receipt.receipt_id}</p>
          </div>

          {/* Download Buttons */}
          {onDownload && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDownload("json")}
                className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-szn-text-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                JSON
              </button>
              <button
                onClick={() => onDownload("pdf")}
                className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-szn-text-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                PDF
              </button>
            </div>
          )}
        </div>

        {/* Query Preview */}
        {receipt.query_preview && (
          <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
            <div className="text-xs text-szn-text-2 uppercase tracking-wide mb-1">Query</div>
            <p className="text-sm text-szn-text-1">&ldquo;{receipt.query_preview}&rdquo;</p>
          </div>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid md:grid-cols-2 divide-x divide-szn-border">
        {/* Cost Section */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-szn-text-3 uppercase tracking-wide mb-4 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Cost Breakdown
          </h3>

          <div className="space-y-4">
            {/* Total Cost */}
            <div className="flex items-center justify-between p-3 bg-szn-accent/10 rounded-lg border border-szn-accent/30">
              <span className="text-szn-accent">Total Cost</span>
              <span className="text-2xl font-bold text-szn-accent">
                {formatCost(receipt.cost.estimated_cost_usd)}
              </span>
            </div>

            {/* Cost Details */}
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 border-b border-szn-border">
                <span className="text-sm text-szn-text-3">Embedding Tokens</span>
                <span className="text-sm text-szn-text-1">
                  {receipt.cost.embedding_tokens.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-szn-border">
                <span className="text-sm text-szn-text-3">Rerank Candidates</span>
                <span className="text-sm text-szn-text-1">{receipt.cost.rerank_candidates}</span>
              </div>
              {receipt.cost.llm_tokens !== undefined && (
                <div className="flex items-center justify-between py-2 border-b border-szn-border">
                  <span className="text-sm text-szn-text-3">LLM Tokens</span>
                  <span className="text-sm text-szn-text-1">
                    {receipt.cost.llm_tokens.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-szn-text-3">Query Units</span>
                <span className="text-sm font-medium text-szn-text-1">
                  {receipt.cost.total_query_units} QU
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Execution Section */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-szn-text-3 uppercase tracking-wide mb-4 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Execution
          </h3>

          <div className="space-y-4">
            {/* Total Latency */}
            <div className="flex items-center justify-between p-3 bg-blue-900/20 rounded-lg border border-blue-800/50">
              <span className="text-blue-400">Total Latency</span>
              <span className="text-2xl font-bold text-blue-400">
                {formatLatency(receipt.execution.latency_ms)}
              </span>
            </div>

            {/* Pipeline Path */}
            <div className="space-y-2">
              <div className="text-sm text-szn-text-3 mb-2">Pipeline Path</div>
              <div className="flex flex-wrap gap-2">
                {pipelineStages.map((stage, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="px-2 py-1 text-xs bg-gray-800 text-szn-text-2 rounded capitalize">
                      {stage.label}
                    </span>
                    {i < pipelineStages.length - 1 && (
                      <svg
                        className="w-3 h-3 text-szn-text-2"
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
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Stage Latencies */}
            {receipt.execution.stage_latencies && (
              <div className="space-y-2">
                <div className="text-sm text-szn-text-3 mb-2">Stage Breakdown</div>
                {receipt.execution.stage_latencies.embedding_ms !== undefined && (
                  <div className="flex items-center justify-between py-2 border-b border-szn-border">
                    <span className="text-sm text-szn-text-3">Embedding</span>
                    <span className="text-sm text-szn-text-1">
                      {formatLatency(receipt.execution.stage_latencies.embedding_ms)}
                    </span>
                  </div>
                )}
                {receipt.execution.stage_latencies.search_ms !== undefined && (
                  <div className="flex items-center justify-between py-2 border-b border-szn-border">
                    <span className="text-sm text-szn-text-3">Search</span>
                    <span className="text-sm text-szn-text-1">
                      {formatLatency(receipt.execution.stage_latencies.search_ms)}
                    </span>
                  </div>
                )}
                {receipt.execution.stage_latencies.rerank_ms !== undefined && (
                  <div className="flex items-center justify-between py-2 border-b border-szn-border">
                    <span className="text-sm text-szn-text-3">Rerank</span>
                    <span className="text-sm text-szn-text-1">
                      {formatLatency(receipt.execution.stage_latencies.rerank_ms)}
                    </span>
                  </div>
                )}
                {receipt.execution.stage_latencies.llm_ms !== undefined && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-szn-text-3">LLM</span>
                    <span className="text-sm text-szn-text-1">
                      {formatLatency(receipt.execution.stage_latencies.llm_ms)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Evidence & Policy */}
      <div className="grid md:grid-cols-2 divide-x divide-szn-border border-t border-szn-border">
        {/* Evidence Section */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-szn-text-3 uppercase tracking-wide mb-4 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Evidence
          </h3>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-purple-900/20 rounded-lg text-center border border-purple-800/50">
                <div className="text-2xl font-bold text-purple-400">
                  {receipt.evidence.candidates_count}
                </div>
                <div className="text-xs text-szn-text-2">Candidates</div>
              </div>
              <div className="p-3 bg-purple-900/20 rounded-lg text-center border border-purple-800/50">
                <div className="text-2xl font-bold text-purple-400">
                  {receipt.evidence.reranked_count}
                </div>
                <div className="text-xs text-szn-text-2">Reranked</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-800 rounded-lg text-center">
                <div className="text-xl font-bold text-szn-text-1">
                  {receipt.evidence.context_chunks}
                </div>
                <div className="text-xs text-szn-text-2">Context Chunks</div>
              </div>
              <div className="p-3 bg-gray-800 rounded-lg text-center">
                <div
                  className={`text-xl font-bold ${receipt.evidence.blocked_chunks > 0 ? "text-red-400" : "text-szn-text-1"}`}
                >
                  {receipt.evidence.blocked_chunks}
                </div>
                <div className="text-xs text-szn-text-2">Blocked</div>
              </div>
            </div>

            {receipt.evidence.score_range && (
              <div className="mt-3 p-3 bg-gray-800/50 rounded-lg">
                <div className="text-xs text-szn-text-2 mb-2">Score Distribution</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-szn-text-3">
                    Min: <span className="text-szn-text-1">{receipt.evidence.score_range.min.toFixed(3)}</span>
                  </span>
                  <span className="text-szn-text-3">
                    Avg: <span className="text-szn-text-1">{receipt.evidence.score_range.avg.toFixed(3)}</span>
                  </span>
                  <span className="text-szn-text-3">
                    Max: <span className="text-szn-text-1">{receipt.evidence.score_range.max.toFixed(3)}</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Policy Section */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-szn-text-3 uppercase tracking-wide mb-4 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            Policy Compliance
          </h3>

          <div className="space-y-3">
            {/* Budget */}
            <div className={`p-3 rounded-lg ${statusColor} border border-current/20`}>
              <div className="flex items-center justify-between">
                <span className="text-sm">Budget Remaining</span>
                <span className="text-2xl font-bold">
                  {receipt.policy.budget_remaining_percent.toFixed(1)}%
                </span>
              </div>
              <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-current rounded-full"
                  style={{ width: `${receipt.policy.budget_remaining_percent}%` }}
                />
              </div>
            </div>

            {/* PII & Redactions */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-800 rounded-lg text-center">
                <div className="mb-1">
                  {receipt.policy.pii_scanned ? (
                    <svg className="w-6 h-6 text-green-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-szn-text-2 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div className="text-xs text-szn-text-2">
                  {receipt.policy.pii_scanned ? "PII Scanned" : "No PII Scan"}
                </div>
              </div>
              <div className="p-3 bg-gray-800 rounded-lg text-center">
                <div
                  className={`text-xl font-bold ${receipt.policy.redactions_applied > 0 ? "text-orange-400" : "text-szn-text-1"}`}
                >
                  {receipt.policy.redactions_applied}
                </div>
                <div className="text-xs text-szn-text-2">Redactions</div>
              </div>
            </div>

            {/* Applied Policies */}
            {receipt.policy.policies_applied && receipt.policy.policies_applied.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-szn-text-2 mb-2">Applied Policies</div>
                <div className="flex flex-wrap gap-2">
                  {receipt.policy.policies_applied.map((policy, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 text-xs bg-blue-900/30 text-blue-400 rounded"
                    >
                      {policy}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-szn-border bg-gray-800/30">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-szn-text-2">
          <div className="flex items-center gap-4">
            <span>Trace ID: {receipt.trace_id}</span>
            {receipt.collections && receipt.collections.length > 0 && (
              <span>
                Collections: {receipt.collections.join(", ")}
              </span>
            )}
          </div>
          <span>Generated: {new Date(receipt.timestamp).toISOString()}</span>
        </div>
      </div>
    </div>
  );
}

export default ReceiptDetail;
