"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  TraceTimeline,
  CandidateList,
  RerankDiff,
  WhatIfLab,
  WhyNotPanel,
} from "@/components/devtools";
import type { TimelineStage, Candidate, WhatIfResult } from "@/components/devtools";
import { ShareTraceModal, ShareIcon } from "@/components/devtools/ShareTraceModal";
import { getErrorMessage } from "@/lib/ui-error";
import { formatDate } from "@/lib/format-date";

// ============================================
// Types
// ============================================

interface TraceDetail {
  id: string;
  request_id: string;
  query: { text: string | null; hash: string | null };
  collection: { primary: string | null; all: string[] };
  config: {
    effective: Record<string, unknown>;
    analysis: {
      deviations_from_default: Array<{
        key: string;
        value: unknown;
        default_value: unknown;
      }>;
      optimization_hints: string[];
    };
  };
  autopilot: { enabled: boolean; reason: string | null };
  timeline: TimelineStage[];
  candidates: {
    before_rerank: Candidate[];
    after_rerank: Candidate[];
    rerank_applied: boolean;
  };
  results: {
    count: number;
    stats: {
      scores?: { min: number; max: number; avg: number };
      documentIds?: string[];
    };
  };
  cost: {
    total: number;
    breakdown: {
      embedding?: number;
      vectorSearch?: number;
      rerank?: number;
      llm?: number;
    };
    stage_breakdown: Array<{
      name: string;
      label: string;
      cost_usd: number;
      latency_ms: number;
      percentage_cost: number;
      percentage_latency: number;
    }>;
  };
  latency: {
    total_ms: number;
    by_stage: Record<string, number>;
  };
  status: { error: string | null; has_error: boolean; sampled: boolean };
  experiment: { id: string; arm_id: string } | null;
  replay: { is_replay: boolean; original_trace_id: string | null };
  timestamps: {
    started_at: string;
    ended_at: string | null;
    created_at: string;
  };
  raw: {
    spans: unknown[];
    events: unknown[];
  };
}

interface TraceDetailClientProps {
  traceId: string;
}

type TabId = "timeline" | "candidates" | "rerank" | "whatif" | "whynot" | "cost" | "raw";

// ============================================
// Icons
// ============================================

const ArrowLeftIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CurrencyIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const DocumentIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const TerminalIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const ChartIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const ReplayIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const QuestionMarkIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// ============================================
// Component
// ============================================

export function TraceDetailClient({ traceId }: TraceDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const _compareTraceId = searchParams.get("compare");

  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("timeline");
  const [showShareModal, setShowShareModal] = useState(false);

  // Fetch trace detail
  useEffect(() => {
    const fetchTrace = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/retrieval/traces/${traceId}`);
        const data = await response.json();

        if (data.success) {
          setTraceDetail(data.trace);
        } else {
          setError(getErrorMessage(data.error, "Failed to fetch trace"));
        }
      } catch (err) {
        console.error("Failed to fetch trace:", err);
        setError(getErrorMessage(err, "Failed to fetch trace"));
      } finally {
        setLoading(false);
      }
    };

    fetchTrace();
  }, [traceId]);

  // Handle what-if replay complete
  const handleReplayComplete = useCallback((result: WhatIfResult) => {
    router.push(`/dashboard/devtools/${result.trace_id}`);
  }, [router]);

  // Format helpers
  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatCost = (usd: number) => {
    if (usd < 0.001) return `$${(usd * 1000000).toFixed(2)}u`;
    if (usd < 0.01) return `$${(usd * 1000).toFixed(2)}m`;
    return `$${usd.toFixed(4)}`;
  };

  // formatDate imported from @/lib/format-date

  // Tabs config
  const tabs: Array<{ id: TabId; label: string; icon: typeof ClockIcon }> = [
    { id: "timeline", label: "Timeline", icon: ClockIcon },
    { id: "candidates", label: "Candidates", icon: DocumentIcon },
    { id: "rerank", label: "Rerank Diff", icon: ChartIcon },
    { id: "whatif", label: "What-If Lab", icon: TerminalIcon },
    { id: "whynot", label: "Why Not?", icon: QuestionMarkIcon },
    { id: "cost", label: "Cost Analysis", icon: CurrencyIcon },
    { id: "raw", label: "Raw", icon: DocumentIcon },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !traceDetail) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || "Trace not found"}</p>
          <Link
            href="/dashboard/devtools"
            className="text-blue-400 hover:text-blue-300"
          >
            Back to DevTools
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/devtools"
              className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>

            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-white">Trace Detail</h1>
                {traceDetail.replay.is_replay && (
                  <span className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-900/50 text-purple-300 rounded">
                    <ReplayIcon className="w-3 h-3" />
                    Replay
                  </span>
                )}
                {traceDetail.status.has_error && (
                  <span className="px-2 py-1 text-xs bg-red-900/50 text-red-300 rounded">
                    Error
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1 font-mono truncate">
                {traceDetail.id}
              </p>
            </div>

            {/* Quick Stats */}
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="text-xs text-gray-500">Latency</div>
                <div
                  className={`font-bold ${
                    traceDetail.latency.total_ms > 500
                      ? "text-yellow-400"
                      : traceDetail.latency.total_ms > 1000
                        ? "text-red-400"
                        : "text-green-400"
                  }`}
                >
                  {formatLatency(traceDetail.latency.total_ms)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500">Cost</div>
                <div className="font-bold text-white">
                  {formatCost(traceDetail.cost.total)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500">Results</div>
                <div className="font-bold text-white">
                  {traceDetail.results.count}
                </div>
              </div>
            </div>

            {/* Share Button */}
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              title="Share trace"
            >
              <ShareIcon className="w-4 h-4" />
              <span className="text-sm">Share</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => {
              // Hide rerank tab if not applied
              if (tab.id === "rerank" && !traceDetail.candidates.rerank_applied) {
                return null;
              }

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Query Section */}
        <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Query</div>
          <p className="text-white">
            {traceDetail.query.text || (
              <span className="text-gray-500 italic">No query text stored</span>
            )}
          </p>
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span>Created: {formatDate(traceDetail.timestamps.created_at, "long")}</span>
            <span>Collection: {traceDetail.collection.primary || "None"}</span>
            {traceDetail.replay.is_replay && traceDetail.replay.original_trace_id && (
              <Link
                href={`/dashboard/devtools/${traceDetail.replay.original_trace_id}`}
                className="text-purple-400 hover:text-purple-300"
              >
                Original Trace
              </Link>
            )}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "timeline" && (
          <TraceTimeline
            stages={traceDetail.timeline}
            totalDurationMs={traceDetail.latency.total_ms}
          />
        )}

        {activeTab === "candidates" && (
          <div className="space-y-6">
            <CandidateList
              candidates={
                traceDetail.candidates.rerank_applied
                  ? traceDetail.candidates.after_rerank
                  : traceDetail.candidates.before_rerank
              }
              title="Final Results"
              showRankDelta={traceDetail.candidates.rerank_applied}
            />
            {traceDetail.candidates.before_rerank.length > 0 &&
              traceDetail.candidates.rerank_applied && (
                <CandidateList
                  candidates={traceDetail.candidates.before_rerank}
                  title="Initial Candidates"
                  maxDisplay={15}
                />
              )}
          </div>
        )}

        {activeTab === "rerank" && traceDetail.candidates.rerank_applied && (
          <RerankDiff
            beforeCandidates={traceDetail.candidates.before_rerank}
            afterCandidates={traceDetail.candidates.after_rerank}
          />
        )}

        {activeTab === "whatif" && (
          <WhatIfLab
            traceId={traceDetail.id}
            originalConfig={{
              top_k: traceDetail.config.effective.topK as number,
              search_type: traceDetail.config.effective.searchType as
                | "semantic"
                | "keyword"
                | "hybrid",
              hybrid_alpha: traceDetail.config.effective.hybridAlpha as number,
              rerank_enabled: traceDetail.config.effective.rerankEnabled as boolean,
              rerank_model: traceDetail.config.effective.rerankModel as string,
              rerank_top_n: traceDetail.config.effective.rerankTopN as number,
              embedding_model: traceDetail.config.effective.embeddingModel as string,
            }}
            onReplayComplete={handleReplayComplete}
          />
        )}

        {activeTab === "whynot" && (
          <WhyNotPanel traceId={traceDetail.id} />
        )}

        {activeTab === "cost" && (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Cost Analysis</h3>

            {/* Total Cost */}
            <div className="mb-6 p-4 bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-white">
                {formatCost(traceDetail.cost.total)}
              </div>
              <div className="text-sm text-gray-400">Total Cost</div>
            </div>

            {/* Cost Breakdown */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-400">Breakdown by Stage</h4>
              {traceDetail.cost.stage_breakdown?.map((stage) => (
                <div key={stage.name} className="flex items-center gap-4">
                  <div className="w-32 text-sm text-gray-300">{stage.label}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${stage.percentage_cost}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-12">
                        {stage.percentage_cost.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-24 text-right text-sm text-white">
                    {formatCost(stage.cost_usd)}
                  </div>
                </div>
              ))}
            </div>

            {/* Detailed Breakdown */}
            <div className="mt-6 grid grid-cols-4 gap-4">
              <div className="p-3 bg-gray-800 rounded-lg">
                <div className="text-xs text-gray-500">Embedding</div>
                <div className="text-lg font-bold text-white">
                  {formatCost(traceDetail.cost.breakdown.embedding || 0)}
                </div>
              </div>
              <div className="p-3 bg-gray-800 rounded-lg">
                <div className="text-xs text-gray-500">Vector Search</div>
                <div className="text-lg font-bold text-white">
                  {formatCost(traceDetail.cost.breakdown.vectorSearch || 0)}
                </div>
              </div>
              <div className="p-3 bg-gray-800 rounded-lg">
                <div className="text-xs text-gray-500">Rerank</div>
                <div className="text-lg font-bold text-white">
                  {formatCost(traceDetail.cost.breakdown.rerank || 0)}
                </div>
              </div>
              <div className="p-3 bg-gray-800 rounded-lg">
                <div className="text-xs text-gray-500">LLM</div>
                <div className="text-lg font-bold text-white">
                  {formatCost(traceDetail.cost.breakdown.llm || 0)}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "raw" && (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Raw Trace Data</h3>
            <pre className="text-xs text-gray-300 overflow-x-auto bg-gray-800 p-4 rounded-lg max-h-[600px] overflow-y-auto">
              {JSON.stringify(traceDetail, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Share Modal */}
      <ShareTraceModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        traceId={traceId}
      />
    </div>
  );
}

export default TraceDetailClient;
