'use client';

/**
 * SimulationResults Component
 *
 * Displays detailed simulation results with diff visualization.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ImpactChart } from './ImpactChart';

// ============================================
// Types
// ============================================

interface SimulationResultsProps {
  /** API key for authentication */
  apiKey: string;
  /** Simulation ID to display */
  simulationId: string;
}

interface SimulationData {
  simulation: {
    id: string;
    status: string;
    basePolicyId?: string;
    testPolicyId?: string;
    totalQueries: number;
    affectedQueries: number;
    blockedChunksCount: number;
    unblockedChunksCount: number;
    resultsSummary?: {
      topAffectedQueries?: Array<{
        queryId: string;
        queryText: string;
        impactScore: number;
      }>;
      ruleActivationCounts?: Record<string, number>;
    };
    errorMessage?: string;
    startedAt?: string;
    completedAt?: string;
  };
  results?: QueryResult[];
  statistics?: {
    totalQueries: number;
    queriesWithImpact: number;
    averageImpact: number;
    medianImpact: number;
    maxImpact: number;
    totalChunksAffected: number;
    chunksByChangeType: {
      blocked: number;
      allowed: number;
      maskingChanged: number;
    };
  };
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface QueryResult {
  id: string;
  queryId?: string;
  queryText: string;
  impactScore: number;
  newlyBlockedCount: number;
  newlyAllowedCount: number;
  maskingChangedCount: number;
  baseChunksCount: number;
  testChunksCount: number;
  newlyBlocked: ChunkPreview[];
  newlyAllowed: ChunkPreview[];
  maskingChanged: ChunkPreview[];
}

interface ChunkPreview {
  id: string;
  contentPreview: string;
  matchedRules: string[];
  reason?: string;
}

// ============================================
// Component
// ============================================

export function SimulationResults({ apiKey, simulationId }: SimulationResultsProps) {
  const [data, setData] = useState<SimulationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 20;

  // Fetch simulation data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        include_details: 'true',
        limit: limit.toString(),
        offset: (page * limit).toString(),
      });

      const response = await fetch(
        `/api/policies/simulations/${simulationId}?${params.toString()}`,
        {
          headers: { 'x-api-key': apiKey },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch simulation results');
      }

      const json = await response.json();

      // Map API response to component data format
      setData({
        simulation: {
          id: json.simulation.id,
          status: json.simulation.status,
          basePolicyId: json.simulation.base_policy_id,
          testPolicyId: json.simulation.test_policy_id,
          totalQueries: json.simulation.total_queries,
          affectedQueries: json.simulation.affected_queries,
          blockedChunksCount: json.simulation.blocked_chunks_count,
          unblockedChunksCount: json.simulation.unblocked_chunks_count,
          resultsSummary: json.simulation.results_summary,
          errorMessage: json.simulation.error_message,
          startedAt: json.simulation.started_at,
          completedAt: json.simulation.completed_at,
        },
        results: json.results?.map((r: Record<string, unknown>) => ({
          id: r.id,
          queryId: r.query_id,
          queryText: r.query_text,
          impactScore: r.impact_score,
          newlyBlockedCount: r.newly_blocked_count,
          newlyAllowedCount: r.newly_allowed_count,
          maskingChangedCount: r.masking_changed_count,
          baseChunksCount: r.base_chunks_count,
          testChunksCount: r.test_chunks_count,
          newlyBlocked: (r.newly_blocked as Array<Record<string, unknown>>)?.map(mapChunk) || [],
          newlyAllowed: (r.newly_allowed as Array<Record<string, unknown>>)?.map(mapChunk) || [],
          maskingChanged: (r.masking_changed as Array<Record<string, unknown>>)?.map(mapChunk) || [],
        })),
        statistics: json.statistics,
        pagination: json.pagination,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [apiKey, simulationId, page, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Helper to map chunk from API
  function mapChunk(c: Record<string, unknown>): ChunkPreview {
    return {
      id: c.id as string,
      contentPreview: c.content_preview as string,
      matchedRules: c.matched_rules as string[],
      reason: c.reason as string | undefined,
    };
  }

  // Toggle query expansion
  const toggleQuery = (queryId: string) => {
    setExpandedQuery(expandedQuery === queryId ? null : queryId);
  };

  // Get impact badge color
  const getImpactColor = (score: number): string => {
    if (score >= 0.6) return 'bg-red-100 text-red-800';
    if (score >= 0.3) return 'bg-orange-100 text-orange-800';
    if (score >= 0.1) return 'bg-yellow-100 text-yellow-800';
    if (score > 0) return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 rounded-lg">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchData}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No simulation data available</p>
      </div>
    );
  }

  const { simulation, results, statistics, pagination } = data;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {simulation.status === 'failed' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 font-medium">Simulation Failed</p>
          <p className="text-red-500 text-sm mt-1">{simulation.errorMessage}</p>
        </div>
      )}

      {simulation.status === 'running' && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-600 font-medium flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Simulation in progress...
          </p>
        </div>
      )}

      {/* Summary Statistics */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Queries Tested"
            value={statistics.totalQueries}
          />
          <StatCard
            label="Queries Affected"
            value={statistics.queriesWithImpact}
            subtext={`${((statistics.queriesWithImpact / statistics.totalQueries) * 100).toFixed(1)}%`}
          />
          <StatCard
            label="Average Impact"
            value={`${(statistics.averageImpact * 100).toFixed(1)}%`}
          />
          <StatCard
            label="Chunks Affected"
            value={statistics.totalChunksAffected}
          />
        </div>
      )}

      {/* Impact Chart */}
      {statistics && (
        <ImpactChart
          blocked={statistics.chunksByChangeType.blocked}
          allowed={statistics.chunksByChangeType.allowed}
          maskingChanged={statistics.chunksByChangeType.maskingChanged}
          averageImpact={statistics.averageImpact}
          maxImpact={statistics.maxImpact}
        />
      )}

      {/* Query Results List */}
      {results && results.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h3 className="text-sm font-medium text-gray-700">
              Query Results ({pagination?.total || results.length} queries)
            </h3>
          </div>

          <div className="divide-y">
            {results.map((result) => (
              <div key={result.id} className="bg-white">
                {/* Query Header */}
                <div
                  className="px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleQuery(result.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">
                        {result.queryText}
                      </p>
                      <div className="mt-1 flex items-center gap-4 text-xs">
                        {result.newlyBlockedCount > 0 && (
                          <span className="text-red-600">
                            +{result.newlyBlockedCount} blocked
                          </span>
                        )}
                        {result.newlyAllowedCount > 0 && (
                          <span className="text-green-600">
                            +{result.newlyAllowedCount} allowed
                          </span>
                        )}
                        {result.maskingChangedCount > 0 && (
                          <span className="text-yellow-600">
                            {result.maskingChangedCount} masking changed
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span
                        className={`px-2 py-1 text-xs rounded ${getImpactColor(
                          result.impactScore
                        )}`}
                      >
                        {(result.impactScore * 100).toFixed(0)}% impact
                      </span>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          expandedQuery === result.id ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedQuery === result.id && (
                  <div className="px-4 py-3 bg-gray-50 border-t space-y-4">
                    {/* Newly Blocked */}
                    {result.newlyBlocked.length > 0 && (
                      <ChunkSection
                        title="Newly Blocked Chunks"
                        chunks={result.newlyBlocked}
                        color="red"
                      />
                    )}

                    {/* Newly Allowed */}
                    {result.newlyAllowed.length > 0 && (
                      <ChunkSection
                        title="Newly Allowed Chunks"
                        chunks={result.newlyAllowed}
                        color="green"
                      />
                    )}

                    {/* Masking Changed */}
                    {result.maskingChanged.length > 0 && (
                      <ChunkSection
                        title="Masking Changed"
                        chunks={result.maskingChanged}
                        color="yellow"
                      />
                    )}

                    {result.newlyBlocked.length === 0 &&
                      result.newlyAllowed.length === 0 &&
                      result.maskingChanged.length === 0 && (
                        <p className="text-sm text-gray-500">
                          No changes for this query
                        </p>
                      )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.hasMore && (
            <div className="px-4 py-3 bg-gray-50 border-t flex justify-between items-center">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page + 1} of {Math.ceil(pagination.total / limit)}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={!pagination.hasMore}
                className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="bg-white p-4 rounded-lg border">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      {subtext && <p className="text-xs text-gray-400">{subtext}</p>}
    </div>
  );
}

function ChunkSection({
  title,
  chunks,
  color,
}: {
  title: string;
  chunks: ChunkPreview[];
  color: 'red' | 'green' | 'yellow';
}) {
  const colorClasses = {
    red: 'bg-red-50 border-red-200',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
  };

  const textClasses = {
    red: 'text-red-800',
    green: 'text-green-800',
    yellow: 'text-yellow-800',
  };

  return (
    <div>
      <h4 className={`text-sm font-medium ${textClasses[color]} mb-2`}>
        {title} ({chunks.length})
      </h4>
      <div className="space-y-2">
        {chunks.slice(0, 5).map((chunk) => (
          <div
            key={chunk.id}
            className={`p-2 rounded border ${colorClasses[color]}`}
          >
            <p className="text-xs text-gray-700">{chunk.contentPreview}</p>
            {chunk.matchedRules.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Rules: {chunk.matchedRules.join(', ')}
              </p>
            )}
            {chunk.reason && (
              <p className="text-xs text-gray-500 mt-1">{chunk.reason}</p>
            )}
          </div>
        ))}
        {chunks.length > 5 && (
          <p className="text-xs text-gray-500">
            +{chunks.length - 5} more chunks
          </p>
        )}
      </div>
    </div>
  );
}

export default SimulationResults;
