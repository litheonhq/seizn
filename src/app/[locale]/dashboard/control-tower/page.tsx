'use client';

/**
 * Control Tower Dashboard
 *
 * Epic D: Unified monitoring and management dashboard
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Bell,
  Bug,
  CheckCircle,
  Clock,
  Database,
  FlaskConical,
  RefreshCw,
  Server,
  Settings,
  ShieldAlert,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  ControlTowerSignals,
  SystemHealth,
  DashboardMetrics,
  Alert,
  HealthStatus,
} from '@/lib/control-tower/types';

// Health status color mapping
const statusColors: Record<HealthStatus, string> = {
  healthy: 'text-green-500 bg-green-500/10',
  degraded: 'text-yellow-500 bg-yellow-500/10',
  unhealthy: 'text-red-500 bg-red-500/10',
  unknown: 'text-gray-500 bg-gray-500/10',
};

const statusIcons: Record<HealthStatus, React.ComponentType<{ className?: string }>> = {
  healthy: CheckCircle,
  degraded: AlertTriangle,
  unhealthy: XCircle,
  unknown: Clock,
};

export default function ControlTowerPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [signals, setSignals] = useState<ControlTowerSignals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const [healthRes, metricsRes, alertsRes, signalsRes] = await Promise.all([
        fetch('/api/control-tower/health'),
        fetch('/api/control-tower/metrics'),
        fetch('/api/control-tower/alerts'),
        fetch('/api/control-tower/signals?limit=8'),
      ]);

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealth(healthData.data);
      }

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(metricsData.data);
      }

      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData.data);
      }

      if (signalsRes.ok) {
        const signalsData = await signalsRes.json();
        setSignals(signalsData.data);
      }

      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Auto-refresh every 30 seconds
    if (autoRefresh) {
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchData, autoRefresh]);

  const handleRefresh = () => {
    setLoading(true);
    fetchData();
  };

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Control Tower</h1>
          <p className="text-gray-500 text-sm mt-1">
            System monitoring and management dashboard
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 ${
              autoRefresh
                ? 'bg-green-500/10 text-green-600'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto-refresh
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* System Health Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overall Health Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Server className="w-5 h-5" />
              System Health
            </h2>
            {health && (
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  statusColors[health.overall]
                }`}
              >
                {health.overall.toUpperCase()}
              </span>
            )}
          </div>

          {health && (
            <div className="space-y-3">
              {health.services.map((service) => {
                const StatusIcon = statusIcons[service.status];
                return (
                  <div
                    key={service.name}
                    className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <StatusIcon
                        className={`w-5 h-5 ${
                          service.status === 'healthy'
                            ? 'text-green-500'
                            : service.status === 'degraded'
                              ? 'text-yellow-500'
                              : 'text-red-500'
                        }`}
                      />
                      <span className="text-sm">{service.displayName}</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {service.latencyMs ? `${service.latencyMs}ms` : '-'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500">
            Uptime: {health ? formatUptime(health.uptimeSeconds) : '-'}
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Requests"
            value={metrics?.totalRequests ?? 0}
            icon={Activity}
            trend={metrics?.requestsPerSecond ?? 0}
            trendLabel="req/s"
          />
          <MetricCard
            title="Latency (P95)"
            value={metrics?.p95LatencyMs ?? 0}
            unit="ms"
            icon={Zap}
            trend={metrics?.avgLatencyMs ?? 0}
            trendLabel="avg"
          />
          <MetricCard
            title="Error Rate"
            value={metrics?.errorRate ?? 0}
            unit="%"
            icon={AlertTriangle}
            isNegative={true}
          />
          <MetricCard
            title="Active Users"
            value={metrics?.activeUsers ?? 0}
            icon={TrendingUp}
          />
          <MetricCard
            title="Memories"
            value={metrics?.totalMemories ?? 0}
            icon={Database}
          />
          <MetricCard
            title="Queries"
            value={metrics?.totalQueries ?? 0}
            icon={Activity}
          />
          <MetricCard
            title="LLM Tokens"
            value={metrics?.llmTokensUsed ?? 0}
            icon={Zap}
            format="compact"
          />
          <MetricCard
            title="Embeddings"
            value={metrics?.embeddingsGenerated ?? 0}
            icon={Database}
          />
        </div>
      </div>

      {/* Alerts Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Active Alerts
            {alerts.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                {alerts.length}
              </span>
            )}
          </h2>
          <Link
            href="/dashboard/control-tower/alerts"
            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
          >
            View all
            <Settings className="w-4 h-4" />
          </Link>
        </div>

        {alerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
            <p>No active alerts</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert) => (
              <AlertRow key={alert.id} alert={alert} onAction={fetchData} />
            ))}
          </div>
        )}
      </div>

      {/* High-signal Insights */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <SignalCard
          title="Top failing traces"
          icon={Bug}
          emptyLabel="No failing traces in recent window"
          items={(signals?.failingTraces || []).map((trace) => ({
            id: trace.id,
            headline: `${trace.method} ${trace.endpoint}`,
            subline: `status ${trace.statusCode} · ${trace.latencyMs}ms`,
            timestamp: trace.occurredAt,
          }))}
        />
        <SignalCard
          title="Security policy events"
          icon={ShieldAlert}
          emptyLabel="No policy/security events found"
          items={(signals?.securityPolicyEvents || []).map((event) => ({
            id: event.id,
            headline: `${event.action} (${event.status})`,
            subline: event.resourceType,
            timestamp: event.occurredAt,
          }))}
        />
        <SignalCard
          title="Search quality regressions"
          icon={FlaskConical}
          emptyLabel="No regressions detected"
          items={(signals?.searchQualityRegressions || []).map((reg) => ({
            id: reg.id,
            headline: `${reg.metricKey} · ${reg.severity}`,
            subline: `Δ ${reg.delta.toFixed(3)} (baseline ${reg.baselineValue.toFixed(3)} → ${reg.candidateValue.toFixed(3)})`,
            timestamp: reg.occurredAt,
          }))}
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <QuickActionCard
          title="Budget"
          description="Budget caps & cost alerts"
          href="/dashboard/control-tower/budget"
          icon={TrendingUp}
        />
        <QuickActionCard
          title="Alert Rules"
          description="Configure alert thresholds"
          href="/dashboard/control-tower/alerts/rules"
          icon={Bell}
        />
        <QuickActionCard
          title="Metrics History"
          description="View historical data"
          href="/dashboard/control-tower/metrics"
          icon={TrendingUp}
        />
        <QuickActionCard
          title="Audit Logs"
          description="Review system activity"
          href="/dashboard/admin/audit"
          icon={Activity}
        />
        <QuickActionCard
          title="Settings"
          description="System configuration"
          href="/dashboard/settings"
          icon={Settings}
        />
      </div>
    </div>
  );
}

function SignalCard({
  title,
  icon: Icon,
  emptyLabel,
  items,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  emptyLabel: string;
  items: Array<{
    id: string;
    headline: string;
    subline: string;
    timestamp: string;
  }>;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5" />
        {title}
      </h2>

      {items.length === 0 ? (
        <div className="text-sm text-gray-500 py-6">{emptyLabel}</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
              <div className="text-sm font-medium">{item.headline}</div>
              <div className="text-xs text-gray-500 mt-1">{item.subline}</div>
              <div className="text-xs text-gray-400 mt-2">
                {new Date(item.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Metric Card Component
function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  trend,
  trendLabel,
  isNegative,
  format,
}: {
  title: string;
  value: number;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  trendLabel?: string;
  isNegative?: boolean;
  format?: 'compact' | 'normal';
}) {
  const formattedValue =
    format === 'compact'
      ? Intl.NumberFormat('en', { notation: 'compact' }).format(value)
      : value.toLocaleString();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{title}</span>
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={`text-2xl font-bold ${
            isNegative && value > 5 ? 'text-red-500' : ''
          }`}
        >
          {formattedValue}
        </span>
        {unit && <span className="text-sm text-gray-500">{unit}</span>}
      </div>
      {trend !== undefined && (
        <div className="text-xs text-gray-500 mt-1">
          {trend.toFixed(1)} {trendLabel}
        </div>
      )}
    </div>
  );
}

// Alert Row Component
function AlertRow({
  alert,
  onAction,
}: {
  alert: Alert;
  onAction: () => void;
}) {
  const severityColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    error: 'bg-orange-100 text-orange-700 border-orange-200',
    warning: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    info: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  const handleAcknowledge = async () => {
    await fetch(`/api/control-tower/alerts/${alert.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'acknowledge' }),
    });
    onAction();
  };

  const handleResolve = async () => {
    await fetch(`/api/control-tower/alerts/${alert.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve' }),
    });
    onAction();
  };

  return (
    <div
      className={`p-4 rounded-lg border ${severityColors[alert.severity] || 'bg-gray-100'}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">{alert.name}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-white/50">
              {alert.severity}
            </span>
          </div>
          <p className="text-sm mt-1 opacity-80">{alert.description}</p>
          <div className="text-xs mt-2 opacity-60">
            {new Date(alert.createdAt).toLocaleString()} • {alert.source}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {alert.status === 'firing' && (
            <>
              <button
                onClick={handleAcknowledge}
                className="px-3 py-1 text-xs bg-white rounded border hover:bg-gray-50"
              >
                Acknowledge
              </button>
              <button
                onClick={handleResolve}
                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              >
                Resolve
              </button>
            </>
          )}
          {alert.status === 'acknowledged' && (
            <button
              onClick={handleResolve}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Resolve
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Quick Action Card Component
function QuickActionCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <a
      href={href}
      className="block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <Icon className="w-6 h-6 text-blue-600 mb-2" />
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
    </a>
  );
}

// Helper function
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
