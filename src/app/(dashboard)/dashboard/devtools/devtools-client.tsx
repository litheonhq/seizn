"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import {
  TraceExplorer,
  TraceTimeline,
  CandidateList,
  RerankDiff,
  WhatIfLab,
} from "@/components/devtools";
import type { TimelineStage, Candidate, WhatIfResult } from "@/components/devtools";

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
  };
  latency: {
    total_ms: number;
    by_stage: Record<string, number>;
  };
  status: { error: string | null; has_error: boolean };
  timestamps: {
    started_at: string;
    ended_at: string | null;
    created_at: string;
  };
}

type TabId = "timeline" | "candidates" | "rerank" | "whatif" | "raw";

// ============================================
// Icons
// ============================================

const TerminalIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
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

const AlertIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

// ============================================
// Component
// ============================================

export function DevToolsClient() {
  const _router = useRouter();
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("timeline");
  const { t } = useDashboardTranslation();

  // Fetch trace detail when selected
  const fetchTraceDetail = useCallback(async (traceId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/retrieval/traces/${traceId}`);
      const data = await response.json();

      if (data.success) {
        setTraceDetail(data.trace);
      }
    } catch (err) {
      console.error("Failed to fetch trace:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle trace selection
  const handleSelectTrace = useCallback(
    (traceId: string) => {
      setSelectedTraceId(traceId);
      fetchTraceDetail(traceId);
    },
    [fetchTraceDetail]
  );

  // Handle what-if replay complete
  const handleReplayComplete = useCallback((result: WhatIfResult) => {
    // Optionally navigate to compare view
    console.log("Replay completed:", result.trace_id);
  }, []);

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

  // Tabs config
  const tabs: Array<{ id: TabId; label: string; icon: typeof ClockIcon }> = [
    { id: "timeline", label: t("dashboard.devtoolsPage.tabs.timeline"), icon: ClockIcon },
    { id: "candidates", label: t("dashboard.devtoolsPage.tabs.candidates"), icon: DocumentIcon },
    { id: "rerank", label: t("dashboard.devtoolsPage.tabs.rerank"), icon: ChevronRightIcon },
    { id: "whatif", label: t("dashboard.devtoolsPage.tabs.whatIf"), icon: TerminalIcon },
    { id: "raw", label: t("dashboard.devtoolsPage.tabs.raw"), icon: DocumentIcon },
  ];

  return (
    <div className="flex h-screen">
      {/* Left Panel - Trace Explorer */}
      <div className="w-96 flex-shrink-0 border-r border-gray-800 overflow-hidden">
        <TraceExplorer
          onSelectTrace={handleSelectTrace}
          selectedTraceId={selectedTraceId || undefined}
          className="h-full rounded-none border-0"
        />
      </div>

      {/* Right Panel - Trace Detail */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-gray-800 bg-gray-900">
          <div className="flex items-center gap-3">
            <TerminalIcon className="w-6 h-6 text-blue-400" />
            <div>
              <h1 className="text-xl font-bold text-white">{t("dashboard.devtoolsPage.title")}</h1>
              <p className="text-sm text-gray-400">
                {t("dashboard.devtoolsPage.subtitle")}
              </p>
            </div>
          </div>
        </div>

        {selectedTraceId && traceDetail ? (
          <>
            {/* Trace Summary Bar */}
            <div className="flex-shrink-0 p-4 border-b border-gray-800 bg-gray-900/50">
              {/* Query */}
              <div className="mb-3">
                <span className="text-xs text-gray-500 uppercase tracking-wider">{t("dashboard.devtoolsPage.query")}</span>
                <p className="text-white mt-1 line-clamp-2">
                  {traceDetail.query.text || (
                    <span className="text-gray-500 italic">{t("dashboard.devtoolsPage.noQueryText")}</span>
                  )}
                </p>
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-6 text-sm">
                {/* Latency */}
                <div className="flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-gray-500" />
                  <span
                    className={`font-medium ${
                      traceDetail.latency.total_ms > 500
                        ? "text-yellow-400"
                        : traceDetail.latency.total_ms > 1000
                          ? "text-red-400"
                          : "text-green-400"
                    }`}
                  >
                    {formatLatency(traceDetail.latency.total_ms)}
                  </span>
                </div>

                {/* Cost */}
                <div className="flex items-center gap-2">
                  <CurrencyIcon className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-white">
                    {formatCost(traceDetail.cost.total)}
                  </span>
                </div>

                {/* Results */}
                <div className="flex items-center gap-2">
                  <DocumentIcon className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-white">
                    {traceDetail.results.count} {t("dashboard.devtoolsPage.results")}
                  </span>
                </div>

                {/* Error indicator */}
                {traceDetail.status.has_error && (
                  <div className="flex items-center gap-2">
                    <AlertIcon className="w-4 h-4 text-red-400" />
                    <span className="text-red-400">{t("dashboard.devtoolsPage.error")}</span>
                  </div>
                )}

                {/* Config badges */}
                <div className="flex items-center gap-2 ml-auto">
                  <span className="px-2 py-1 text-xs bg-gray-800 text-gray-300 rounded">
                    {String(traceDetail.config.effective.searchType || "hybrid")}
                  </span>
                  {Boolean(traceDetail.config.effective.rerankEnabled) && (
                    <span className="px-2 py-1 text-xs bg-purple-900/50 text-purple-300 rounded">
                      {t("dashboard.devtoolsPage.rerank")}
                    </span>
                  )}
                  <span className="px-2 py-1 text-xs bg-gray-800 text-gray-300 rounded">
                    topK: {String(traceDetail.config.effective.topK || 10)}
                  </span>
                </div>
              </div>

              {/* Optimization Hints */}
              {traceDetail.config.analysis.optimization_hints.length > 0 && (
                <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                  <div className="text-xs text-yellow-400 font-medium mb-1">
                    {t("dashboard.devtoolsPage.optimizationHints")}
                  </div>
                  {traceDetail.config.analysis.optimization_hints.map((hint, i) => (
                    <div key={i} className="text-xs text-yellow-300">
                      - {hint}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/50">
              <div className="flex">
                {tabs.map((tab) => {
                  // Hide rerank tab if not applied
                  if (tab.id === "rerank" && !traceDetail.candidates.rerank_applied) {
                    return null;
                  }

                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-950">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : (
                <>
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
                        title={t("dashboard.devtoolsPage.finalResults")}
                        showRankDelta={traceDetail.candidates.rerank_applied}
                      />
                      {traceDetail.candidates.before_rerank.length > 0 && (
                        <CandidateList
                          candidates={traceDetail.candidates.before_rerank}
                          title={t("dashboard.devtoolsPage.initialCandidates")}
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

                  {activeTab === "raw" && (
                    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
                      <h3 className="text-lg font-semibold text-white mb-4">{t("dashboard.devtoolsPage.rawTraceData")}</h3>
                      <pre className="text-xs text-gray-300 overflow-x-auto bg-gray-800 p-4 rounded-lg">
                        {JSON.stringify(traceDetail, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center bg-gray-950">
            <div className="text-center">
              <TerminalIcon className="w-16 h-16 text-gray-700 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-400 mb-2">
                {t("dashboard.devtoolsPage.emptyTitle")}
              </h2>
              <p className="text-gray-500 max-w-md">
                {t("dashboard.devtoolsPage.emptyDesc")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DevToolsClient;
