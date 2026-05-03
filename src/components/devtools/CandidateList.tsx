"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ============================================
// Types
// ============================================

export interface Candidate {
  id: string;
  score: number;
  rank: number;
  original_rank?: number;
  rank_delta?: number;
  score_delta?: number;
}

export interface CandidateListProps {
  candidates: Candidate[];
  title?: string;
  showRankDelta?: boolean;
  maxDisplay?: number;
  className?: string;
}

// ============================================
// Component
// ============================================

export function CandidateList({
  candidates,
  title = "Candidates",
  showRankDelta = false,
  maxDisplay = 20,
  className = "",
}: CandidateListProps) {
  const [viewMode, setViewMode] = useState<"list" | "chart">("list");
  const [sortBy, setSortBy] = useState<"rank" | "score">("rank");

  // Sort candidates
  const sortedCandidates = useMemo(() => {
    const sorted = [...candidates].sort((a, b) => {
      if (sortBy === "rank") return a.rank - b.rank;
      return b.score - a.score;
    });
    return sorted.slice(0, maxDisplay);
  }, [candidates, sortBy, maxDisplay]);

  // Chart data
  const chartData = useMemo(() => {
    return sortedCandidates.map((c) => ({
      name: c.id.slice(0, 8),
      score: c.score,
      rank: c.rank,
    }));
  }, [sortedCandidates]);

  // Score distribution stats
  const stats = useMemo(() => {
    if (candidates.length === 0) return null;
    const scores = candidates.map((c) => c.score);
    return {
      min: Math.min(...scores),
      max: Math.max(...scores),
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      count: candidates.length,
    };
  }, [candidates]);

  // Color based on score
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "#22c55e"; // green
    if (score >= 0.6) return "#84cc16"; // lime
    if (score >= 0.4) return "#facc15"; // yellow
    if (score >= 0.2) return "#f97316"; // orange
    return "#ef4444"; // red
  };

  if (candidates.length === 0) {
    return (
      <div className={`bg-[var(--ink-900)] rounded-lg border border-gray-800 p-6 ${className}`}>
        <p className="text-center text-gray-500">No candidates available</p>
      </div>
    );
  }

  return (
    <div className={`bg-[var(--ink-900)] rounded-lg border border-gray-800 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex bg-[var(--ink-800)] rounded-lg p-1">
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  viewMode === "list"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode("chart")}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  viewMode === "chart"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Chart
              </button>
            </div>

            {/* Sort Toggle */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "rank" | "score")}
              className="px-3 py-1 bg-[var(--ink-800)] border border-gray-700 rounded-lg text-xs text-white focus:outline-none"
            >
              <option value="rank">By Rank</option>
              <option value="score">By Score</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="flex gap-6 mt-3 text-xs">
            <div>
              <span className="text-gray-500">Count:</span>
              <span className="ml-1 text-white font-medium">{stats.count}</span>
            </div>
            <div>
              <span className="text-gray-500">Score Range:</span>
              <span className="ml-1 text-white font-medium">
                {stats.min.toFixed(3)} - {stats.max.toFixed(3)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Average:</span>
              <span className="ml-1 text-white font-medium">{stats.avg.toFixed(3)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {viewMode === "chart" ? (
          /* Chart View */
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "#374151" }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "#374151" }}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#fff" }}
                  formatter={(value: number | undefined) => [
                    value !== undefined ? value.toFixed(4) : "N/A",
                    "Score",
                  ]}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={getScoreColor(entry.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          /* List View */
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {sortedCandidates.map((candidate) => (
              <div
                key={candidate.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-[var(--ink-800)]/50 hover:bg-[var(--ink-800)] transition-colors"
              >
                {/* Rank */}
                <div className="w-10 text-center">
                  <span className="text-lg font-bold text-white">#{candidate.rank}</span>
                  {showRankDelta && candidate.rank_delta !== undefined && candidate.rank_delta !== 0 && (
                    <div
                      className={`text-xs ${
                        candidate.rank_delta > 0 ? "text-green-400" : "text-[var(--signal-conflict-soft)]"
                      }`}
                    >
                      {candidate.rank_delta > 0 ? "+" : ""}
                      {candidate.rank_delta}
                    </div>
                  )}
                </div>

                {/* ID & Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-gray-300 truncate">
                    {candidate.id}
                  </div>
                  {candidate.original_rank && (
                    <div className="text-xs text-gray-500">
                      Original rank: #{candidate.original_rank}
                    </div>
                  )}
                </div>

                {/* Score */}
                <div className="text-right">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getScoreColor(candidate.score) }}
                    />
                    <span className="text-sm font-medium text-white">
                      {candidate.score.toFixed(4)}
                    </span>
                  </div>
                  {showRankDelta && candidate.score_delta !== undefined && (
                    <div
                      className={`text-xs ${
                        candidate.score_delta > 0 ? "text-green-400" : "text-[var(--signal-conflict-soft)]"
                      }`}
                    >
                      {candidate.score_delta > 0 ? "+" : ""}
                      {candidate.score_delta.toFixed(4)}
                    </div>
                  )}
                </div>

                {/* Score Bar */}
                <div className="w-24">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${candidate.score * 100}%`,
                        backgroundColor: getScoreColor(candidate.score),
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {candidates.length > maxDisplay && (
        <div className="p-4 border-t border-gray-800 text-center">
          <span className="text-xs text-gray-500">
            Showing {maxDisplay} of {candidates.length} candidates
          </span>
        </div>
      )}
    </div>
  );
}

export default CandidateList;
