'use client';

/**
 * Test Suite List Component
 *
 * Displays a list of retrieval test suites with actions
 */

import { useState, useEffect, useCallback } from 'react';
import { formatDate } from "@/lib/format-date";


interface TestSuite {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  last_run_at?: string;
  last_run_result?: 'passed' | 'failed' | 'partial';
  tags: string[];
  created_at: string;
}

interface TestSuiteListProps {
  apiKey: string;
  collectionId?: string;
  onSelectSuite?: (suiteId: string) => void;
  onRunSuite?: (suiteId: string) => void;
}

export function TestSuiteList({
  apiKey,
  collectionId,
  onSelectSuite,
  onRunSuite,
}: TestSuiteListProps) {
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuites = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (collectionId) {
        params.append('collection_id', collectionId);
      }

      const res = await fetch(`/api/testing/suites?${params}`, {
        headers: { 'x-api-key': apiKey },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch suites');
      }

      setSuites(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [apiKey, collectionId]);

  useEffect(() => {
    fetchSuites();
  }, [fetchSuites]);


  const getStatusColor = (result?: string) => {
    switch (result) {
      case 'passed':
        return 'szn-badge szn-badge-success';
      case 'failed':
        return 'szn-badge szn-badge-error';
      case 'partial':
        return 'szn-badge szn-badge-warning';
      default:
        return 'szn-badge szn-badge-muted';
    }
  };

  const formatDateLocal = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    return formatDate(dateStr, "long");
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
        <button
          onClick={fetchSuites}
          className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (suites.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No test suites</h3>
        <p className="mt-1 text-sm text-gray-500">
          Create a test suite to start regression testing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {suites.map((suite) => (
        <div
          key={suite.id}
          className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium text-gray-900">{suite.name}</h3>
                {!suite.is_active && (
                  <span className="szn-badge szn-badge-muted">
                    Inactive
                  </span>
                )}
              </div>
              {suite.description && (
                <p className="mt-1 text-sm text-gray-600">{suite.description}</p>
              )}
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Last run: {formatDateLocal(suite.last_run_at)}
                </span>
                {suite.last_run_result && (
                  <span className={getStatusColor(suite.last_run_result)}>
                    {suite.last_run_result}
                  </span>
                )}
              </div>
              {suite.tags.length > 0 && (
                <div className="mt-2 flex gap-1">
                  {suite.tags.map((tag) => (
                    <span
                      key={tag}
                      className="szn-badge szn-badge-info"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 ml-4">
              <button
                onClick={() => onSelectSuite?.(suite.id)}
                className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                View
              </button>
              <button
                onClick={() => onRunSuite?.(suite.id)}
                disabled={!suite.is_active}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-md transition-colors"
              >
                Run Tests
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default TestSuiteList;
