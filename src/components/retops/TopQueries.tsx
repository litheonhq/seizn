"use client";

import type { TopQuery } from "@/lib/summer/retops/types";

// ============================================
// Types
// ============================================

export interface TopQueriesProps {
  queries: TopQuery[];
  loading?: boolean;
}

// ============================================
// Component
// ============================================

export function TopQueries({ queries, loading }: TopQueriesProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Top Queries</h3>
        <span className="text-sm text-gray-500">
          {queries.length} unique queries
        </span>
      </div>

      {queries.length === 0 ? (
        <div className="text-center py-8">
          <SearchIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No queries recorded yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {queries.map((query, index) => (
            <QueryRow key={query.queryHash} query={query} rank={index + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Query Row Component
// ============================================

function QueryRow({ query, rank }: { query: TopQuery; rank: number }) {
  const latencyStatus =
    query.avgLatencyMs <= 200
      ? "good"
      : query.avgLatencyMs <= 500
      ? "warn"
      : "bad";

  const latencyStatusColors = {
    good: "text-green-600 bg-green-50",
    warn: "text-yellow-600 bg-yellow-50",
    bad: "text-red-600 bg-red-50",
  };

  const cacheStatus =
    query.cacheHitRate >= 0.7
      ? "good"
      : query.cacheHitRate >= 0.4
      ? "warn"
      : "bad";

  const cacheStatusColors = {
    good: "text-green-600",
    warn: "text-yellow-600",
    bad: "text-red-600",
  };

  return (
    <div className="p-4 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Rank */}
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-xs font-medium text-gray-600">#{rank}</span>
        </div>

        {/* Query Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-sm font-mono text-gray-700 truncate">
              {query.queryPreview || `query_${query.queryHash.slice(0, 8)}`}
            </code>
          </div>

          {/* Metrics */}
          <div className="flex items-center gap-4 mt-2 text-xs">
            {/* Count */}
            <div className="flex items-center gap-1">
              <CountIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600">
                {query.count.toLocaleString()} calls
              </span>
            </div>

            {/* Latency */}
            <div className="flex items-center gap-1">
              <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className={`px-1.5 py-0.5 rounded ${latencyStatusColors[latencyStatus]}`}>
                {query.avgLatencyMs}ms
              </span>
            </div>

            {/* Cache */}
            <div className="flex items-center gap-1">
              <CacheIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className={cacheStatusColors[cacheStatus]}>
                {(query.cacheHitRate * 100).toFixed(0)}% cache
              </span>
            </div>

            {/* Results */}
            <div className="flex items-center gap-1">
              <ResultIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600">
                ~{query.avgResultCount} results
              </span>
            </div>
          </div>
        </div>

        {/* Last Executed */}
        <div className="flex-shrink-0 text-right">
          <span className="text-xs text-gray-400">Last run</span>
          <p className="text-xs text-gray-600">
            {formatRelativeTime(query.lastExecuted)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Utility Functions
// ============================================

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// ============================================
// Icons
// ============================================

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function CountIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CacheIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
      />
    </svg>
  );
}

function ResultIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

export default TopQueries;
