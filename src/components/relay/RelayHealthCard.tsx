'use client';

/**
 * RelayHealthCard - Display relay agent health and metrics
 */

import { useState, useEffect, useCallback } from 'react';
import type { RelayHealthStatus } from '@/lib/relay/health';


interface RelayHealthCardProps {
  apiKey: string;
  relayId?: string;  // If provided, shows single relay health
  refreshInterval?: number;  // Auto-refresh interval in ms
}

interface AggregateHealth {
  total: number;
  active: number;
  inactive: number;
  error: number;
  maintenance: number;
  overallHealthy: boolean;
  relays: RelayHealthStatus[];
}

export function RelayHealthCard({
  apiKey,
  relayId,
  refreshInterval = 30000,
}: RelayHealthCardProps) {
  const [health, setHealth] = useState<AggregateHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const url = relayId
        ? `/api/relay/agents/${relayId}`
        : '/api/relay/health?detailed=true';

      const response = await fetch(url, {
        headers: {
          'x-api-key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch health status');
      }

      const data = await response.json();
      setHealth(data.health || data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [apiKey, relayId]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchHealth, refreshInterval]);


  if (loading) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!health) {
    return null;
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Relay Health
        </h2>
        <OverallStatus healthy={health.overallHealthy} />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total"
          value={health.total}
          color="gray"
        />
        <StatCard
          label="Active"
          value={health.active}
          color="green"
        />
        <StatCard
          label="Inactive"
          value={health.inactive}
          color="gray"
        />
        <StatCard
          label="Error"
          value={health.error}
          color="red"
        />
      </div>

      {/* Individual relay health */}
      {health.relays && health.relays.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Relay Details
          </h3>
          {health.relays.map((relay) => (
            <RelayHealthRow key={relay.relayId} relay={relay} />
          ))}
        </div>
      )}
    </div>
  );
}

function OverallStatus({ healthy }: { healthy: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
      healthy
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    }`}>
      <div className={`w-2 h-2 rounded-full ${healthy ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-sm font-medium">
        {healthy ? 'Healthy' : 'Issues Detected'}
      </span>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  color: 'gray' | 'green' | 'red' | 'yellow';
}

function StatCard({ label, value, color }: StatCardProps) {
  const colors = {
    gray: 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  };

  const textColors = {
    gray: 'text-gray-900 dark:text-gray-100',
    green: 'text-green-700 dark:text-green-400',
    red: 'text-red-700 dark:text-red-400',
    yellow: 'text-yellow-700 dark:text-yellow-400',
  };

  return (
    <div className={`p-4 rounded-lg border ${colors[color]}`}>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-semibold ${textColors[color]}`}>{value}</p>
    </div>
  );
}

interface RelayHealthRowProps {
  relay: RelayHealthStatus;
}

function RelayHealthRow({ relay }: RelayHealthRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <StatusIndicator healthy={relay.healthy} status={relay.status} />
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {relay.name}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span>{relay.metrics.successRate.toFixed(1)}% success</span>
          <span>{Math.round(relay.metrics.avgLatencyMs)}ms</span>
          <ChevronIcon expanded={expanded} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700">
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricItem
              label="Total Requests"
              value={relay.metrics.totalRequests.toString()}
            />
            <MetricItem
              label="Successful"
              value={relay.metrics.successfulRequests.toString()}
            />
            <MetricItem
              label="Failed"
              value={relay.metrics.failedRequests.toString()}
            />
            <MetricItem
              label="Avg Latency"
              value={`${Math.round(relay.metrics.avgLatencyMs)}ms`}
            />
          </div>

          {relay.details && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Diagnostics
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {relay.details.version && (
                  <MetricItem label="Version" value={relay.details.version} />
                )}
                {relay.details.uptimeSeconds !== undefined && (
                  <MetricItem
                    label="Uptime"
                    value={formatUptime(relay.details.uptimeSeconds)}
                  />
                )}
                {relay.details.vectorDbStatus && (
                  <MetricItem
                    label="Vector DB"
                    value={relay.details.vectorDbStatus}
                  />
                )}
                {relay.details.memoryUsageMb !== undefined && (
                  <MetricItem
                    label="Memory"
                    value={`${relay.details.memoryUsageMb}MB`}
                  />
                )}
              </div>
            </div>
          )}

          {relay.lastError && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">
                <span className="font-medium">Last Error:</span> {relay.lastError}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIndicator({ healthy, status }: { healthy: boolean; status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-500',
    inactive: 'bg-gray-400',
    error: 'bg-red-500',
    maintenance: 'bg-yellow-500',
  };

  return (
    <div className="relative">
      <div className={`w-3 h-3 rounded-full ${colors[status] || colors.inactive}`} />
      {healthy && status === 'active' && (
        <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-500 animate-ping" />
      )}
    </div>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="font-medium text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default RelayHealthCard;
