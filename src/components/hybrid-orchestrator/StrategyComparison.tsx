'use client';

/**
 * StrategyComparison - Side-by-side comparison of retrieval strategies
 */

import { useState } from 'react';
import type { StrategyType, StrategyResult } from '@/lib/hybrid-orchestrator';

interface StrategyComparisonProps {
  apiKey: string;
  collectionId: string;
}

interface ComparisonResult {
  strategy_results: Record<StrategyType, StrategyResult[]>;
  strategy_latencies: Record<StrategyType, number>;
  overlap_analysis: {
    total_unique: number;
    overlapping: number;
    overlap_percentage: string;
    overlap_matrix: Record<StrategyType, Record<StrategyType, number>>;
  };
}

export function StrategyComparison({
  apiKey,
  collectionId,
}: StrategyComparisonProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComparisonResult | null>(null);

  // Strategy configurations for comparison
  const [strategies] = useState([
    { type: 'vector', weight: 0.5, params: { top_k: 20, threshold: 0.5 } },
    { type: 'keyword', weight: 0.5, params: { top_k: 20 } },
  ]);

  const handleCompare = async () => {
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/hybrid/compare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          collection_id: collectionId,
          query,
          strategies,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Comparison failed');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Query Input */}
      <div className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter a query to compare strategies..."
          className="flex-1 px-4 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-50)] text-[var(--ink-900)]"
          onKeyDown={(e) => e.key === 'Enter' && handleCompare()}
        />
        <button
          onClick={handleCompare}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Comparing...' : 'Compare'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict)]/20 border border-[var(--signal-conflict)] dark:border-[var(--signal-conflict)] rounded-lg">
          <p className="text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)] text-sm">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Overlap Analysis */}
          <div className="p-4 bg-[var(--ink-50)] rounded-lg">
            <h3 className="text-lg font-medium text-[var(--ink-900)] mb-3">
              Overlap Analysis
            </h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {result.overlap_analysis.total_unique}
                </div>
                <div className="text-sm text-[var(--ink-600)]">
                  Total Unique Results
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-[var(--signal-canon-ink)]">
                  {result.overlap_analysis.overlapping}
                </div>
                <div className="text-sm text-[var(--ink-600)]">
                  Overlapping
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-[var(--ink-900)] underline">
                  {result.overlap_analysis.overlap_percentage}%
                </div>
                <div className="text-sm text-[var(--ink-600)]">
                  Overlap Rate
                </div>
              </div>
            </div>
          </div>

          {/* Latency Comparison */}
          <div className="p-4 bg-[var(--ink-50)] rounded-lg">
            <h3 className="text-lg font-medium text-[var(--ink-900)] mb-3">
              Latency Comparison
            </h3>
            <div className="space-y-2">
              {Object.entries(result.strategy_latencies).map(([strategy, latency]) => (
                <div key={strategy} className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium text-[var(--ink-600)] capitalize">
                    {strategy}
                  </span>
                  <div className="flex-1 h-4 bg-[var(--ink-50)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{
                        width: `${Math.min(100, (latency / 500) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm text-[var(--ink-600)] w-16 text-right">
                    {Math.round(latency)}ms
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Side-by-Side Results */}
          <div>
            <h3 className="text-lg font-medium text-[var(--ink-900)] mb-3">
              Results Comparison
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(result.strategy_results).map(([strategy, results]) => (
                <div
                  key={strategy}
                  className="border border-[var(--ink-200)] rounded-lg overflow-hidden"
                >
                  <div className="px-4 py-2 bg-[var(--ink-50)] border-b border-[var(--ink-200)]">
                    <span className="font-medium text-[var(--ink-900)] capitalize">
                      {strategy}
                    </span>
                    <span className="ml-2 text-sm text-[var(--ink-600)]">
                      ({results.length} results)
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
                    {results.slice(0, 10).map((result, index) => (
                      <div
                        key={result.id}
                        className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-[var(--ink-800)]/50"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-[var(--ink-600)]">
                            #{index + 1}
                          </span>
                          <span className="text-xs text-blue-600 dark:text-blue-400">
                            {result.score.toFixed(4)}
                          </span>
                        </div>
                        <p className="text-sm text-[var(--ink-600)] line-clamp-2">
                          {result.data?.text ?? result.id}
                        </p>
                      </div>
                    ))}
                    {results.length === 0 && (
                      <div className="px-4 py-8 text-center text-gray-400">
                        No results
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Overlap Matrix */}
          <div className="p-4 bg-[var(--ink-50)] rounded-lg">
            <h3 className="text-lg font-medium text-[var(--ink-900)] mb-3">
              Overlap Matrix
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-[var(--ink-600)]" />
                    {Object.keys(result.overlap_analysis.overlap_matrix).map(
                      (strategy) => (
                        <th
                          key={strategy}
                          className="px-3 py-2 text-center text-[var(--ink-600)] capitalize"
                        >
                          {strategy}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.overlap_analysis.overlap_matrix).map(
                    ([rowStrategy, overlaps]) => (
                      <tr key={rowStrategy}>
                        <td className="px-3 py-2 font-medium text-[var(--ink-600)] capitalize">
                          {rowStrategy}
                        </td>
                        {Object.entries(overlaps).map(([colStrategy, count]) => (
                          <td
                            key={colStrategy}
                            className={`px-3 py-2 text-center ${
                              rowStrategy === colStrategy
                                ? 'bg-[var(--ink-50)]'
                                : count > 0
                                ? 'bg-[var(--signal-canon-soft)] dark:bg-[var(--signal-canon-ink)]/20 text-[var(--signal-canon-ink)] dark:text-[var(--signal-canon-soft)]'
                                : ''
                            }`}
                          >
                            {count}
                          </td>
                        ))}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StrategyComparison;
