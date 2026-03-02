'use client';

/**
 * Control Tower - Alerts Page
 *
 * Full alerts management with history
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  Filter,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type { Alert, AlertSeverity, AlertStatus } from '@/lib/control-tower/types';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{
    severity?: AlertSeverity;
    status?: AlertStatus;
    activeOnly: boolean;
  }>({ activeOnly: false });

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter.activeOnly) params.set('active', 'true');
      else params.set('active', 'false');
      if (filter.severity) params.set('severity', filter.severity);
      if (filter.status) params.set('status', filter.status);

      const res = await fetch(`/api/control-tower/alerts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleAction = async (alertId: string, action: 'acknowledge' | 'resolve') => {
    await fetch(`/api/control-tower/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    fetchAlerts();
  };

  const severityColors: Record<AlertSeverity, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    error: 'bg-orange-100 text-orange-700 border-orange-200',
    warning: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    info: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  const statusIcons: Record<AlertStatus, React.ComponentType<{ className?: string }>> = {
    firing: AlertTriangle,
    acknowledged: Clock,
    resolved: CheckCircle,
    silenced: XCircle,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6" />
            Alerts
          </h1>
          <p className="text-szn-text-2 text-sm mt-1">
            Manage and review system alerts
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/control-tower/alerts/rules"
            className="px-4 py-2 border border-szn-border rounded-lg hover:bg-szn-surface-1"
          >
            Manage Rules
          </Link>
          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-szn-text-3" />
          <span className="text-sm text-szn-text-2">Filters:</span>
        </div>

        <button
          onClick={() => setFilter((f) => ({ ...f, activeOnly: !f.activeOnly }))}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            filter.activeOnly
              ? 'bg-blue-100 text-blue-700'
              : 'bg-szn-surface text-szn-text-2'
          }`}
        >
          Active Only
        </button>

        <select
          value={filter.severity || ''}
          onChange={(e) =>
            setFilter((f) => ({
              ...f,
              severity: (e.target.value as AlertSeverity) || undefined,
            }))
          }
          className="px-3 py-1.5 rounded-lg border border-szn-border text-sm"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>

        <select
          value={filter.status || ''}
          onChange={(e) =>
            setFilter((f) => ({
              ...f,
              status: (e.target.value as AlertStatus) || undefined,
            }))
          }
          className="px-3 py-1.5 rounded-lg border border-szn-border text-sm"
        >
          <option value="">All Statuses</option>
          <option value="firing">Firing</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="silenced">Silenced</option>
        </select>

        {(filter.severity || filter.status || filter.activeOnly) && (
          <button
            onClick={() => setFilter({ activeOnly: false })}
            className="text-sm text-szn-text-2 hover:text-szn-text-1"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Alerts List */}
      <div className="bg-szn-card rounded-xl border border-szn-border">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-szn-text-3" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 text-szn-text-2">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
            <p>No alerts found</p>
          </div>
        ) : (
          <div className="divide-y divide-szn-border">
            {alerts.map((alert) => {
              const StatusIcon = statusIcons[alert.status];
              return (
                <div
                  key={alert.id}
                  className={`p-4 ${alert.status === 'firing' ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <StatusIcon
                        className={`w-5 h-5 mt-0.5 ${
                          alert.status === 'firing'
                            ? 'text-red-500'
                            : alert.status === 'acknowledged'
                              ? 'text-yellow-500'
                              : 'text-green-500'
                        }`}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{alert.name}</span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${severityColors[alert.severity]}`}
                          >
                            {alert.severity}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-szn-surface">
                            {alert.status}
                          </span>
                        </div>
                        <p className="text-sm text-szn-text-2 mt-1">
                          {alert.description}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-szn-text-2">
                          <span>Source: {alert.source}</span>
                          <span>
                            Created: {new Date(alert.createdAt).toLocaleString()}
                          </span>
                          {alert.resolvedAt && (
                            <span>
                              Resolved: {new Date(alert.resolvedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {alert.status === 'firing' && (
                        <>
                          <button
                            onClick={() => handleAction(alert.id, 'acknowledge')}
                            className="px-3 py-1.5 text-sm border border-szn-border rounded hover:bg-szn-surface-1"
                          >
                            Acknowledge
                          </button>
                          <button
                            onClick={() => handleAction(alert.id, 'resolve')}
                            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            Resolve
                          </button>
                        </>
                      )}
                      {alert.status === 'acknowledged' && (
                        <button
                          onClick={() => handleAction(alert.id, 'resolve')}
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
