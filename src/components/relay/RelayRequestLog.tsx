'use client';

/**
 * RelayRequestLog - View recent relay requests
 */

import { useState, useEffect, useCallback } from 'react';

import type { RelayRequestLog as RelayRequestLogType } from '@/lib/relay/types';

interface RelayRequestLogProps {
  apiKey: string;
  relayId: string;
  limit?: number;
  autoRefresh?: boolean;
}

export function RelayRequestLog({
  apiKey,
  relayId,
  limit = 50,
  autoRefresh = true,
}: RelayRequestLogProps) {
  const [requests, setRequests] = useState<RelayRequestLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      // Note: This would need a corresponding API endpoint
      // For now, this is a placeholder showing the UI structure
      const response = await fetch(
        `/api/relay/agents/${relayId}/requests?limit=${limit}`,
        {
          headers: {
            'x-api-key': apiKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch request logs');
      }

      const data = await response.json();
      setRequests(data.requests || []);
      setError(null);
    } catch (err) {
      // Don't show error if endpoint doesn't exist yet
      setRequests([]);
      console.warn('Request log fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [apiKey, relayId, limit]);

  useEffect(() => {
    fetchRequests();
    if (autoRefresh) {
      const interval = setInterval(fetchRequests, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchRequests]);


  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-[var(--ink-50)] rounded" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict)]/20 border border-[var(--signal-conflict)] dark:border-[var(--signal-conflict)] rounded-lg">
        <p className="text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">{error}</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--ink-600)]">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="mt-4">No requests yet</p>
        <p className="text-sm">Requests will appear here once the relay processes queries.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-[var(--ink-200)] rounded-lg">
      <table className="min-w-full divide-y divide-[var(--ink-200)]">
        <thead className="bg-[var(--ink-50)]">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
              Request ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
              Collection
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
              Results
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
              Latency
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ink-600)] uppercase tracking-wider">
              Time
            </th>
          </tr>
        </thead>
        <tbody className="bg-[var(--ink-50)] divide-y divide-[var(--ink-200)]">
          {requests.map((request) => (
            <tr
              key={request.id}
              className="hover:bg-[var(--ink-50)] transition-colors"
            >
              <td className="px-4 py-3 whitespace-nowrap">
                <code className="text-xs text-[var(--ink-600)] font-mono">
                  {request.requestId.substring(0, 16)}...
                </code>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-[var(--ink-900)]">
                {request.collectionId || '-'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <RequestStatusBadge status={request.status} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-[var(--ink-600)]">
                {request.resultCount ?? '-'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-[var(--ink-600)]">
                {request.latencyMs ? `${Math.round(request.latencyMs)}ms` : '-'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-[var(--ink-600)]">
                {formatTime(request.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type RequestStatus = 'pending' | 'processing' | 'completed' | 'error' | 'timeout';

function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const styles: Record<RequestStatus, string> = {
    pending: 'bg-[var(--signal-pending-soft)] text-[var(--signal-pending-ink)] dark:bg-[var(--signal-pending-ink)]/30 dark:text-[var(--signal-pending-soft)]',
    processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    completed: 'bg-[var(--signal-canon-soft)] text-[var(--signal-canon-ink)] dark:bg-[var(--signal-canon-ink)]/30 dark:text-[var(--signal-canon-soft)]',
    error: 'bg-[var(--signal-conflict-soft)] text-[var(--signal-conflict-ink)] dark:bg-[var(--signal-conflict)]/30 dark:text-[var(--signal-conflict-soft)]',
    timeout: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles[status]}`}>
      {status}
    </span>
  );
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  return date.toLocaleTimeString();
}

export default RelayRequestLog;
