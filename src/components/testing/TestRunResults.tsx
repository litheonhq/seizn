'use client';

/**
 * Test Run Results Component
 *
 * Displays test run results with pass/fail chart and details
 */

import { useState, useEffect, useCallback } from 'react';


interface TestRunResult {
  case_id: string;
  result: 'pass' | 'fail' | 'skip' | 'error';
  relevance_score?: number;
  keyword_match_score?: number;
  faithfulness_score?: number;
  latency_ms?: number;
  error_message?: string;
  matched_keywords?: string[];
  missing_keywords?: string[];
}

interface TestRun {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  total_cases: number;
  passed: number;
  failed: number;
  skipped: number;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  triggered_by: string;
  avg_score?: number;
  avg_latency_ms?: number;
  p50_latency_ms?: number;
  p95_latency_ms?: number;
  results?: TestRunResult[];
}

interface TestRunResultsProps {
  apiKey: string;
  suiteId: string;
  runId?: string;
  showDetails?: boolean;
}

export function TestRunResults({
  apiKey,
  suiteId,
  runId,
  showDetails = true,
}: TestRunResultsProps) {
  const [run, setRun] = useState<TestRun | null>(null);
  const [caseResults, setCaseResults] = useState<TestRunResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  const fetchRunDetails = useCallback(async () => {
    if (!runId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/testing/suites/${suiteId}/results?run_id=${runId}&details=${showDetails}`,
        { headers: { 'x-api-key': apiKey } }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch results');
      }

      setRun(data.run);
      setCaseResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch results');
    } finally {
      setLoading(false);
    }
  }, [apiKey, runId, showDetails, suiteId]);

  useEffect(() => {
    if (runId) {
      fetchRunDetails();
    }
  }, [fetchRunDetails, runId]);


  const getResultColor = (result: string) => {
    switch (result) {
      case 'pass':
        return 'szn-badge szn-badge-success';
      case 'fail':
        return 'szn-badge szn-badge-error';
      case 'skip':
        return 'szn-badge szn-badge-muted';
      case 'error':
        return 'szn-badge szn-badge-warning';
      default:
        return 'szn-badge szn-badge-muted';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-gray-200 rounded-lg" />
        <div className="h-64 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No run selected</p>
      </div>
    );
  }

  const passRate = run.total_cases > 0
    ? ((run.passed / run.total_cases) * 100).toFixed(1)
    : '0';

  // Calculate chart percentages
  const passPercent = run.total_cases > 0 ? (run.passed / run.total_cases) * 100 : 0;
  const failPercent = run.total_cases > 0 ? (run.failed / run.total_cases) * 100 : 0;
  const skipPercent = run.total_cases > 0 ? (run.skipped / run.total_cases) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Test Run Summary</h3>
          <span
            className={`szn-badge ${
              run.status === 'completed'
                ? run.failed === 0
                  ? 'szn-badge-success'
                  : 'szn-badge-error'
                : 'szn-badge-muted'
            }`}
          >
            {run.status === 'completed'
              ? run.failed === 0
                ? 'All Passed'
                : 'Has Failures'
              : run.status}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-4 bg-gray-200 rounded-full overflow-hidden mb-4">
          <div className="h-full flex">
            <div
              className="bg-green-500 transition-all"
              style={{ width: `${passPercent}%` }}
            />
            <div
              className="bg-red-500 transition-all"
              style={{ width: `${failPercent}%` }}
            />
            <div
              className="bg-gray-400 transition-all"
              style={{ width: `${skipPercent}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{run.total_cases}</div>
            <div className="text-sm text-gray-500">Total</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{run.passed}</div>
            <div className="text-sm text-green-700">Passed</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{run.failed}</div>
            <div className="text-sm text-red-700">Failed</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-600">{run.skipped}</div>
            <div className="text-sm text-gray-500">Skipped</div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Pass Rate:</span>
            <span className="ml-2 font-medium">{passRate}%</span>
          </div>
          <div>
            <span className="text-gray-500">Avg Score:</span>
            <span className="ml-2 font-medium">
              {run.avg_score ? run.avg_score.toFixed(2) : '-'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Avg Latency:</span>
            <span className="ml-2 font-medium">{formatDuration(run.avg_latency_ms)}</span>
          </div>
          <div>
            <span className="text-gray-500">Duration:</span>
            <span className="ml-2 font-medium">{formatDuration(run.duration_ms)}</span>
          </div>
        </div>

        {/* Latency Percentiles */}
        {run.p50_latency_ms && (
          <div className="mt-3 text-xs text-gray-500">
            Latency: P50 {formatDuration(run.p50_latency_ms)} / P95{' '}
            {formatDuration(run.p95_latency_ms)}
          </div>
        )}
      </div>

      {/* Detailed Results */}
      {showDetails && caseResults.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="font-medium text-gray-900">Test Case Results</h4>
          </div>
          <div className="divide-y divide-gray-100">
            {caseResults.map((result) => (
              <div key={result.case_id} className="px-6 py-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() =>
                    setExpandedCase(expandedCase === result.case_id ? null : result.case_id)
                  }
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={getResultColor(result.result)}
                    >
                      {result.result.toUpperCase()}
                    </span>
                    <span className="text-sm font-mono text-gray-600">
                      {result.case_id.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    {result.relevance_score !== undefined && (
                      <span>Score: {result.relevance_score.toFixed(2)}</span>
                    )}
                    {result.latency_ms !== undefined && (
                      <span>{formatDuration(result.latency_ms)}</span>
                    )}
                    <svg
                      className={`w-4 h-4 transition-transform ${
                        expandedCase === result.case_id ? 'rotate-180' : ''
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

                {/* Expanded Details */}
                {expandedCase === result.case_id && (
                  <div className="mt-4 pl-4 border-l-2 border-gray-200 space-y-2 text-sm">
                    {result.error_message && (
                      <div className="text-red-600">
                        <strong>Error:</strong> {result.error_message}
                      </div>
                    )}
                    {result.keyword_match_score !== undefined && (
                      <div>
                        <strong>Keyword Match:</strong>{' '}
                        {(result.keyword_match_score * 100).toFixed(0)}%
                      </div>
                    )}
                    {result.faithfulness_score !== undefined && (
                      <div>
                        <strong>Faithfulness:</strong>{' '}
                        {(result.faithfulness_score * 100).toFixed(0)}%
                      </div>
                    )}
                    {result.matched_keywords && result.matched_keywords.length > 0 && (
                      <div>
                        <strong>Matched:</strong>{' '}
                        <span className="text-green-600">
                          {result.matched_keywords.join(', ')}
                        </span>
                      </div>
                    )}
                    {result.missing_keywords && result.missing_keywords.length > 0 && (
                      <div>
                        <strong>Missing:</strong>{' '}
                        <span className="text-red-600">
                          {result.missing_keywords.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TestRunResults;
