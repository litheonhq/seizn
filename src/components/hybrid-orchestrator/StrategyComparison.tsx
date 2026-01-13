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
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Overlap Analysis */}
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
              Overlap Analysis
            </h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {result.overlap_analysis.total_unique}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Total Unique Results
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {result.overlap_analysis.overlapping}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Overlapping
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {result.overlap_analysis.overlap_percentage}%
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Overlap Rate
                </div>
              </div>
            </div>
          </div>

          {/* Latency Comparison */}
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
              Latency Comparison
            </h3>
            <div className="space-y-2">
              {Object.entries(result.strategy_latencies).map(([strategy, latency]) => (
                <div key={strategy} className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                    {strategy}
                  </span>
                  <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{
                        width: `${Math.min(100, (latency / 500) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400 w-16 text-right">
                    {Math.round(latency)}ms
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Side-by-Side Results */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
              Results Comparison
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(result.strategy_results).map(([strategy, results]) => (
                <div
                  key={strategy}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <span className="font-medium text-gray-900 dark:text-gray-100 capitalize">
                      {strategy}
                    </span>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                      ({results.length} results)
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
                    {results.slice(0, 10).map((result, index) => (
                      <div
                        key={result.id}
                        className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            #{index + 1}
                          </span>
                          <span className="text-xs text-blue-600 dark:text-blue-400">
                            {result.score.toFixed(4)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
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
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
              Overlap Matrix
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400" />
                    {Object.keys(result.overlap_analysis.overlap_matrix).map(
                      (strategy) => (
                        <th
                          key={strategy}
                          className="px-3 py-2 text-center text-gray-500 dark:text-gray-400 capitalize"
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
                        <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300 capitalize">
                          {rowStrategy}
                        </td>
                        {Object.entries(overlaps).map(([colStrategy, count]) => (
                          <td
                            key={colStrategy}
                            className={`px-3 py-2 text-center ${
                              rowStrategy === colStrategy
                                ? 'bg-gray-100 dark:bg-gray-800'
                                : count > 0
                                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
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
