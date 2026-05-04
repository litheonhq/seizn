"use client";

import { useMemo } from "react";

// ============================================
// Types
// ============================================

export interface RerankCandidate {
  id: string;
  original_score: number;
  rerank_score: number;
  original_rank: number;
  rerank_rank: number;
}

export interface RerankDiffProps {
  beforeCandidates: Array<{ id: string; score: number; rank: number }>;
  afterCandidates: Array<{ id: string; score: number; rank: number }>;
  className?: string;
}

// ============================================
// Icons
// ============================================

const ArrowUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
  </svg>
);

const ArrowDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
  </svg>
);

const MinusIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
  </svg>
);

// ============================================
// Component
// ============================================

export function RerankDiff({
  beforeCandidates,
  afterCandidates,
  className = "",
}: RerankDiffProps) {
  // Merge before/after data
  const diffData = useMemo(() => {
    const beforeMap = new Map(beforeCandidates.map((c) => [c.id, c]));
    // Get all IDs from after (reranked results)

    const result: RerankCandidate[] = [];
    for (const after of afterCandidates) {
      const before = beforeMap.get(after.id);
      if (before) {
        result.push({
          id: after.id,
          original_score: before.score,
          rerank_score: after.score,
          original_rank: before.rank,
          rerank_rank: after.rank,
        });
      }
    }

    return result;
  }, [beforeCandidates, afterCandidates]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (diffData.length === 0) return null;

    let improved = 0;
    let degraded = 0;
    let unchanged = 0;
    let totalRankDelta = 0;

    for (const item of diffData) {
      const delta = item.original_rank - item.rerank_rank;
      totalRankDelta += Math.abs(delta);
      if (delta > 0) improved++;
      else if (delta < 0) degraded++;
      else unchanged++;
    }

    return {
      improved,
      degraded,
      unchanged,
      avgRankChange: totalRankDelta / diffData.length,
      totalItems: diffData.length,
    };
  }, [diffData]);

  if (diffData.length === 0) {
    return (
      <div className={`bg-[var(--ink-900)] rounded-lg border border-gray-800 p-6 ${className}`}>
        <p className="text-center text-gray-500">
          No reranking data available. Enable reranking to see before/after comparison.
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-[var(--ink-900)] rounded-lg border border-gray-800 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-lg font-semibold text-white">Rerank Comparison</h3>
        <p className="text-sm text-gray-400 mt-1">
          Before vs after reranking
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="p-4 border-b border-gray-800">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[var(--ink-800)]/50 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-400">{stats.improved}</div>
              <div className="text-xs text-gray-500">Improved</div>
            </div>
            <div className="bg-[var(--ink-800)]/50 rounded-lg p-3">
              <div className="text-2xl font-bold text-[var(--signal-conflict-soft)]">{stats.degraded}</div>
              <div className="text-xs text-gray-500">Degraded</div>
            </div>
            <div className="bg-[var(--ink-800)]/50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-400">{stats.unchanged}</div>
              <div className="text-xs text-gray-500">Unchanged</div>
            </div>
            <div className="bg-[var(--ink-800)]/50 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-400">
                {stats.avgRankChange.toFixed(1)}
              </div>
              <div className="text-xs text-gray-500">Avg Rank Change</div>
            </div>
          </div>
        </div>
      )}

      {/* Diff Visualization */}
      <div className="p-4">
        <div className="flex gap-4">
          {/* Before Column */}
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-400 mb-3 text-center">
              Before Rerank
            </div>
            <div className="space-y-1">
              {beforeCandidates.slice(0, 10).map((candidate) => {
                return (

                  <div
                    key={candidate.id}
                    className="flex items-center gap-2 p-2 rounded bg-[var(--ink-800)]/30"
                  >
                    <span className="w-8 text-sm font-bold text-gray-400">
                      #{candidate.rank}
                    </span>
                    <span className="flex-1 font-mono text-xs text-gray-300 truncate">
                      {candidate.id}
                    </span>
                    <span className="text-xs text-gray-500">
                      {candidate.score.toFixed(3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Arrow Column */}
          <div className="flex flex-col items-center justify-center w-12">
            <svg className="w-6 h-6 text-[var(--ink-700)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="text-xs text-[var(--ink-700)] mt-1">Rerank</span>
          </div>

          {/* After Column */}
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-400 mb-3 text-center">
              After Rerank
            </div>
            <div className="space-y-1">
              {afterCandidates.slice(0, 10).map((candidate) => {
                const beforeItem = beforeCandidates.find((c) => c.id === candidate.id);
                const rankDelta = beforeItem
                  ? beforeItem.rank - candidate.rank
                  : 0;

                return (
                  <div
                    key={candidate.id}
                    className={`flex items-center gap-2 p-2 rounded ${
                      rankDelta > 0
                        ? "bg-[var(--signal-canon-ink)]/20 border-l-2 border-[var(--signal-canon)]"
                        : rankDelta < 0
                          ? "bg-[var(--signal-conflict)]/20 border-l-2 border-[var(--signal-conflict)]"
                          : "bg-[var(--ink-800)]/30"
                    }`}
                  >
                    <span className="w-8 text-sm font-bold text-white">
                      #{candidate.rank}
                    </span>
                    <span className="flex-1 font-mono text-xs text-gray-300 truncate">
                      {candidate.id}
                    </span>
                    <span className="text-xs text-gray-500">
                      {candidate.score.toFixed(3)}
                    </span>
                    {rankDelta !== 0 && (
                      <span
                        className={`flex items-center gap-1 text-xs ${
                          rankDelta > 0 ? "text-green-400" : "text-[var(--signal-conflict-soft)]"
                        }`}
                      >
                        {rankDelta > 0 ? (
                          <ArrowUpIcon className="w-3 h-3" />
                        ) : (
                          <ArrowDownIcon className="w-3 h-3" />
                        )}
                        {Math.abs(rankDelta)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Rank Changes */}
      <div className="p-4 border-t border-gray-800">
        <h4 className="text-sm font-medium text-gray-400 mb-3">Rank Changes Detail</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pb-2 font-medium">Document ID</th>
                <th className="pb-2 font-medium text-center">Original Rank</th>
                <th className="pb-2 font-medium text-center">New Rank</th>
                <th className="pb-2 font-medium text-center">Delta</th>
                <th className="pb-2 font-medium text-right">Score Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {diffData.map((item) => {
                const rankDelta = item.original_rank - item.rerank_rank;
                const scoreDelta = item.rerank_score - item.original_score;

                return (
                  <tr key={item.id} className="text-gray-300">
                    <td className="py-2 font-mono text-xs">{item.id}</td>
                    <td className="py-2 text-center">#{item.original_rank}</td>
                    <td className="py-2 text-center">#{item.rerank_rank}</td>
                    <td className="py-2 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          rankDelta > 0
                            ? "bg-[var(--signal-canon-ink)]/50 text-green-400"
                            : rankDelta < 0
                              ? "bg-[var(--signal-conflict)]/50 text-[var(--signal-conflict-soft)]"
                              : "bg-[var(--ink-800)] text-gray-400"
                        }`}
                      >
                        {rankDelta > 0 ? (
                          <>
                            <ArrowUpIcon className="w-3 h-3" />
                            +{rankDelta}
                          </>
                        ) : rankDelta < 0 ? (
                          <>
                            <ArrowDownIcon className="w-3 h-3" />
                            {rankDelta}
                          </>
                        ) : (
                          <>
                            <MinusIcon className="w-3 h-3" />0
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={
                          scoreDelta > 0 ? "text-green-400" : scoreDelta < 0 ? "text-[var(--signal-conflict-soft)]" : "text-gray-400"
                        }
                      >
                        {scoreDelta > 0 ? "+" : ""}
                        {scoreDelta.toFixed(4)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default RerankDiff;
