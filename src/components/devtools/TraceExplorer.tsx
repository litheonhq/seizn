"use client";

import { useState, useEffect, useCallback } from "react";

import { getErrorMessage } from "@/lib/ui-error";

// ============================================
// Types
// ============================================

export interface TraceListItem {
  id: string;
  request_id: string;
  query: string | null;
  query_hash: string | null;
  collection_id: string | null;
  config: {
    search_type: string;
    embedding_model?: string;
    hybrid_alpha?: number;
    top_k: number;
    rerank_enabled: boolean;
    rerank_model?: string;
    rerank_top_n?: number;
  };
  timings_ms: Record<string, number>;
  total_latency_ms: number;
  cost_usd: number;
  results_count: number;
  error: string | null;
  has_error: boolean;
  autopilot_reason: string | null;
  experiment_id: string | null;
  replay_of: string | null;
  created_at: string;
}

export interface TraceExplorerProps {
  onSelectTrace: (traceId: string) => void;
  selectedTraceId?: string;
  className?: string;
}

interface Filters {
  collectionId: string;
  searchType: string;
  rerankEnabled: string;
  hasError: string;
  minLatency: string;
  maxLatency: string;
  dateRange: "1h" | "24h" | "7d" | "30d" | "all";
  search: string;
}

// ============================================
// Icons
// ============================================

const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const FilterIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const RefreshIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const AlertIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const ReplayIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// ============================================
// Component
// ============================================

export function TraceExplorer({
  onSelectTrace,
  selectedTraceId,
  className = "",
}: TraceExplorerProps) {
  const [traces, setTraces] = useState<TraceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [pagination, setPagination] = useState({
    offset: 0,
    limit: 20,
    total: 0,
    hasMore: false,
  });

  const [filters, setFilters] = useState<Filters>({
    collectionId: "",
    searchType: "",
    rerankEnabled: "",
    hasError: "",
    minLatency: "",
    maxLatency: "",
    dateRange: "24h",
    search: "",
  });

  // Build query params from filters
  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    params.append("limit", pagination.limit.toString());
    params.append("offset", pagination.offset.toString());
    params.append("order_by", "created_at");
    params.append("order_dir", "desc");

    if (filters.collectionId) params.append("collection_id", filters.collectionId);
    if (filters.searchType) params.append("search_type", filters.searchType);
    if (filters.rerankEnabled) params.append("rerank_enabled", filters.rerankEnabled);
    if (filters.hasError) params.append("has_error", filters.hasError);
    if (filters.minLatency) params.append("min_latency", filters.minLatency);
    if (filters.maxLatency) params.append("max_latency", filters.maxLatency);
    if (filters.search) params.append("search", filters.search);

    // Date range
    const now = new Date();
    let startDate: Date | null = null;
    switch (filters.dateRange) {
      case "1h":
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case "24h":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }
    if (startDate) {
      params.append("start_date", startDate.toISOString());
    }

    return params.toString();
  }, [filters, pagination.limit, pagination.offset]);

  // Fetch traces
  const fetchTraces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const queryString = buildQueryParams();
      const response = await fetch(`/api/retrieval/traces?${queryString}`);
      const data = await response.json();

      if (data.success) {
        setTraces(data.traces);
        setPagination((prev) => ({
          ...prev,
          total: data.pagination.total,
          hasMore: data.pagination.has_more,
        }));
      } else {
        setError(getErrorMessage(data.error, "Failed to fetch traces"));
      }
    } catch (err) {
      console.error("Failed to fetch traces:", err);
      setError(getErrorMessage(err, "Failed to fetch traces"));
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams]);

  // Initial load and filter changes
  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  // Reset offset when filters change
  useEffect(() => {
    setPagination((prev) => ({ ...prev, offset: 0 }));
  }, [filters]);

  // Format latency
  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Format cost
  const formatCost = (usd: number) => {
    if (usd < 0.01) return `$${(usd * 1000).toFixed(2)}m`;
    return `$${usd.toFixed(4)}`;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-800 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Trace Explorer</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors ${
                showFilters
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              <FilterIcon className="w-4 h-4" />
            </button>
            <button
              onClick={fetchTraces}
              disabled={loading}
              className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search queries..."
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Date Range Quick Filter */}
        <div className="flex gap-2 mt-3">
          {(["1h", "24h", "7d", "30d", "all"] as const).map((range) => (
            <button
              key={range}
              onClick={() => setFilters((f) => ({ ...f, dateRange: range }))}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                filters.dateRange === range
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {range === "all" ? "All" : range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="p-4 border-b border-gray-800 bg-gray-850">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Search Type */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Search Type</label>
              <select
                value={filters.searchType}
                onChange={(e) => setFilters((f) => ({ ...f, searchType: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="semantic">Semantic</option>
                <option value="keyword">Keyword</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            {/* Rerank */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rerank</label>
              <select
                value={filters.rerankEnabled}
                onChange={(e) => setFilters((f) => ({ ...f, rerankEnabled: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>

            {/* Has Error */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                value={filters.hasError}
                onChange={(e) => setFilters((f) => ({ ...f, hasError: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="false">Success</option>
                <option value="true">Error</option>
              </select>
            </div>

            {/* Latency Range */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max Latency (ms)</label>
              <input
                type="number"
                value={filters.maxLatency}
                onChange={(e) => setFilters((f) => ({ ...f, maxLatency: e.target.value }))}
                placeholder="e.g., 500"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Clear Filters */}
          <button
            onClick={() =>
              setFilters({
                collectionId: "",
                searchType: "",
                rerankEnabled: "",
                hasError: "",
                minLatency: "",
                maxLatency: "",
                dateRange: "24h",
                search: "",
              })
            }
            className="mt-3 text-xs text-gray-500 hover:text-white transition-colors"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 border-b border-gray-800 bg-red-900/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Trace List */}
      <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
        {loading && traces.length === 0 ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : traces.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No traces found
          </div>
        ) : (
          traces.map((trace) => (
            <button
              key={trace.id}
              onClick={() => onSelectTrace(trace.id)}
              className={`w-full p-4 text-left transition-colors ${
                selectedTraceId === trace.id
                  ? "bg-blue-900/30 border-l-2 border-blue-500"
                  : "hover:bg-gray-800/50"
              }`}
            >
              {/* Query */}
              <div className="flex items-start gap-2 mb-2">
                {trace.has_error && (
                  <AlertIcon className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                )}
                {trace.replay_of && (
                  <ReplayIcon className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                )}
                <p className="text-sm text-white line-clamp-2">
                  {trace.query || <span className="text-gray-500 italic">No query text</span>}
                </p>
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {/* Latency */}
                <span
                  className={`flex items-center gap-1 ${
                    trace.total_latency_ms > 500
                      ? "text-yellow-400"
                      : trace.total_latency_ms > 1000
                        ? "text-red-400"
                        : "text-green-400"
                  }`}
                >
                  <ClockIcon className="w-3 h-3" />
                  {formatLatency(trace.total_latency_ms)}
                </span>

                {/* Cost */}
                <span className="text-gray-400">{formatCost(trace.cost_usd)}</span>

                {/* Results */}
                <span className="text-gray-400">{trace.results_count} results</span>

                {/* Config badges */}
                <span className="px-2 py-0.5 bg-gray-800 text-gray-300 rounded-full">
                  {trace.config.search_type}
                </span>
                {trace.config.rerank_enabled && (
                  <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded-full">
                    rerank
                  </span>
                )}

                {/* Time */}
                <span className="text-gray-500 ml-auto">{formatDate(trace.created_at)}</span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {traces.length > 0 && (
        <div className="p-4 border-t border-gray-800 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Showing {pagination.offset + 1}-{Math.min(pagination.offset + traces.length, pagination.total)} of {pagination.total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPagination((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
              disabled={pagination.offset === 0}
              className="px-3 py-1 text-xs bg-gray-800 text-gray-400 rounded hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPagination((p) => ({ ...p, offset: p.offset + p.limit }))}
              disabled={!pagination.hasMore}
              className="px-3 py-1 text-xs bg-gray-800 text-gray-400 rounded hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TraceExplorer;
