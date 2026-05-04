'use client';

/**
 * Budget Management Page
 *
 * Epic D: Control Tower - Budget caps, alerts, and cost monitoring
 */

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  CreditCard,
  DollarSign,
  RefreshCw,
  Save,
  Settings,
  TrendingUp,
  Zap,
} from 'lucide-react';

interface BudgetStatus {
  orgId: string;
  currentSpend: number;
  budgetLimit: number | null;
  percentUsed: number;
  projectedMonthEnd: number;
  daysRemaining: number;
  alertThreshold: number;
  isOverBudget: boolean;
  isNearLimit: boolean;
}

interface CostBreakdown {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  byModel: ModelCost[];
  byDay: DailyCost[];
  periodStart: string;
  periodEnd: string;
}

interface ModelCost {
  model: string;
  provider: string;
  totalCost: number;
  requestCount: number;
  avgCostPerRequest: number;
}

interface DailyCost {
  date: string;
  totalCost: number;
  requestCount: number;
}

interface CostAlert {
  id: string;
  alertType: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  createdAt: string;
  acknowledged: boolean;
}

export default function BudgetPage() {
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [costs, setCosts] = useState<CostBreakdown | null>(null);
  const [alerts, setAlerts] = useState<CostAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Budget form state
  const [budgetLimit, setBudgetLimit] = useState<string>('');
  const [alertThreshold, setAlertThreshold] = useState<string>('80');

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const [budgetRes, costsRes, alertsRes] = await Promise.all([
        fetch('/api/control-tower/costs?type=budget'),
        fetch('/api/control-tower/costs'),
        fetch('/api/control-tower/costs?type=alerts'),
      ]);

      if (budgetRes.ok) {
        const data = await budgetRes.json();
        setBudget(data.budget);
        if (data.budget?.budgetLimit) {
          setBudgetLimit(data.budget.budgetLimit.toString());
        }
        if (data.budget?.alertThreshold) {
          setAlertThreshold(data.budget.alertThreshold.toString());
        }
      }

      if (costsRes.ok) {
        const data = await costsRes.json();
        setCosts(data.breakdown);
      }

      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAlerts(data.alerts || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveBudget = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/control-tower/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setBudget',
          monthlyLimit: parseFloat(budgetLimit),
          alertThreshold: parseFloat(alertThreshold) / 100,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save budget settings');
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-[var(--ink-500)]" />
      </div>
    );
  }

  const spendPercent = budget?.percentUsed ?? 0;
  const progressColor =
    spendPercent >= 100 ? 'bg-[var(--signal-conflict)]' :
    spendPercent >= 80 ? 'bg-yellow-500' :
    'bg-green-500';

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="w-6 h-6" />
            Budget Management
          </h1>
          <p className="text-[var(--ink-600)] text-sm mt-1">
            Monitor spending and configure budget limits
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-[var(--ink-50)] text-[var(--ink-900)] rounded-lg flex items-center gap-2 hover:bg-[var(--ink-50)]"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-[var(--signal-conflict-soft)] border border-[var(--signal-conflict)] text-[var(--signal-conflict-ink)] px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Budget Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <BudgetCard
          title="Current Spend"
          value={`$${budget?.currentSpend?.toFixed(2) ?? '0.00'}`}
          subtitle="This month"
          icon={DollarSign}
          trend={costs?.byDay && costs.byDay.length > 1 ? calculateTrend(costs.byDay) : undefined}
        />
        <BudgetCard
          title="Budget Limit"
          value={budget?.budgetLimit ? `$${budget.budgetLimit.toFixed(2)}` : 'Not set'}
          subtitle="Monthly limit"
          icon={CreditCard}
        />
        <BudgetCard
          title="Projected"
          value={`$${budget?.projectedMonthEnd?.toFixed(2) ?? '0.00'}`}
          subtitle={`${budget?.daysRemaining ?? 0} days remaining`}
          icon={TrendingUp}
          isWarning={budget?.projectedMonthEnd && budget.budgetLimit ?
            budget.projectedMonthEnd > budget.budgetLimit : false}
        />
        <BudgetCard
          title="Active Alerts"
          value={alerts.filter(a => !a.acknowledged).length.toString()}
          subtitle={alerts.length > 0 ? `${alerts.length} total` : 'No alerts'}
          icon={Bell}
          isWarning={alerts.filter(a => a.severity === 'critical').length > 0}
        />
      </div>

      {/* Budget Progress */}
      {budget?.budgetLimit && (
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Budget Usage</h2>
            <span className={`text-sm font-medium ${
              spendPercent >= 100 ? 'text-[var(--signal-conflict-ink)]' :
              spendPercent >= 80 ? 'text-[var(--signal-pending-ink)]' :
              'text-[var(--signal-canon-ink)]'
            }`}>
              {spendPercent.toFixed(1)}% used
            </span>
          </div>

          <div className="w-full bg-[var(--ink-50)] rounded-full h-4 mb-4">
            <div
              className={`h-4 rounded-full transition-all ${progressColor}`}
              style={{ width: `${Math.min(spendPercent, 100)}%` }}
            />
          </div>

          <div className="flex justify-between text-sm text-[var(--ink-600)]">
            <span>$0</span>
            <span className="flex items-center gap-1">
              Alert threshold: {budget.alertThreshold}%
              {spendPercent >= budget.alertThreshold && (
                <AlertTriangle className="w-4 h-4 text-[var(--signal-pending-ink)]" />
              )}
            </span>
            <span>${budget.budgetLimit?.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget Settings */}
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5" />
            Budget Settings
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--ink-600)] mb-2">
                Monthly Budget Limit ($)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--ink-500)]" />
                <input
                  type="number"
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  placeholder="Enter monthly limit"
                  className="w-full pl-10 pr-4 py-2 border border-[var(--ink-200)] rounded-lg bg-[var(--ink-0)] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <p className="text-xs text-[var(--ink-600)] mt-1">
                Leave empty to disable budget tracking
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--ink-600)] mb-2">
                Alert Threshold (%)
              </label>
              <div className="relative">
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(e.target.value)}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-[var(--ink-600)] mt-1">
                  <span>50%</span>
                  <span className="font-medium">{alertThreshold}%</span>
                  <span>100%</span>
                </div>
              </div>
              <p className="text-xs text-[var(--ink-600)] mt-1">
                Receive alerts when spending reaches this percentage
              </p>
            </div>

            <button
              onClick={handleSaveBudget}
              disabled={saving}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Settings
            </button>
          </div>
        </div>

        {/* Cost Alerts */}
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5" />
            Cost Alerts
          </h2>

          {alerts.length === 0 ? (
            <div className="text-center py-8 text-[var(--ink-600)]">
              <Check className="w-12 h-12 mx-auto mb-2 text-[var(--signal-canon-ink)]" />
              <p>No cost alerts</p>
              <p className="text-sm">Your spending is within normal limits</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Spending Breakdown */}
      {costs && (
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5" />
            Spending Breakdown by Model
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--ink-200)]">
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--ink-600)]">Model</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-[var(--ink-600)]">Provider</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-[var(--ink-600)]">Requests</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-[var(--ink-600)]">Total Cost</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-[var(--ink-600)]">Avg/Request</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-[var(--ink-600)]">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {costs.byModel.map((model) => (
                  <tr key={model.model} className="border-b border-[var(--ink-200)] hover:bg-[var(--ink-50)]">
                    <td className="py-3 px-4 text-sm font-medium">{model.model}</td>
                    <td className="py-3 px-4 text-sm text-[var(--ink-600)]">{model.provider}</td>
                    <td className="py-3 px-4 text-sm text-right">{model.requestCount.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm text-right font-medium">${model.totalCost.toFixed(4)}</td>
                    <td className="py-3 px-4 text-sm text-right text-[var(--ink-600)]">${model.avgCostPerRequest.toFixed(6)}</td>
                    <td className="py-3 px-4 text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-[var(--ink-50)] rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${(model.totalCost / costs.totalCost) * 100}%` }}
                          />
                        </div>
                        <span className="text-[var(--ink-600)]">
                          {((model.totalCost / costs.totalCost) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[var(--ink-50)]">
                  <td colSpan={2} className="py-3 px-4 text-sm font-semibold">Total</td>
                  <td className="py-3 px-4 text-sm text-right font-semibold">{costs.totalRequests.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right font-semibold">${costs.totalCost.toFixed(4)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Daily Spending Chart */}
      {costs?.byDay && costs.byDay.length > 0 && (
        <div className="bg-[var(--ink-0)] rounded-xl border border-[var(--ink-200)] p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5" />
            Daily Spending Trend
          </h2>

          <div className="h-64">
            <SpendingChart data={costs.byDay} />
          </div>
        </div>
      )}
    </div>
  );
}

// Budget Card Component
function BudgetCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  isWarning,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { direction: 'up' | 'down'; percent: number };
  isWarning?: boolean;
}) {
  return (
    <div className={`bg-[var(--ink-0)] rounded-xl border p-4 ${
      isWarning ? 'border-[var(--signal-pending)] dark:border-[var(--signal-pending)]' : 'border-[var(--ink-200)]'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[var(--ink-600)]">{title}</span>
        <Icon className={`w-5 h-5 ${isWarning ? 'text-[var(--signal-pending-ink)]' : 'text-[var(--ink-500)]'}`} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${isWarning ? 'text-[var(--signal-pending-ink)]' : ''}`}>
          {value}
        </span>
        {trend && (
          <span className={`flex items-center text-xs ${
            trend.direction === 'up' ? 'text-[var(--signal-conflict-ink)]' : 'text-[var(--signal-canon-ink)]'
          }`}>
            {trend.direction === 'up' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {trend.percent.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--ink-600)] mt-1">{subtitle}</p>
    </div>
  );
}

// Alert Card Component
function AlertCard({ alert }: { alert: CostAlert }) {
  const severityColors = {
    info: 'bg-blue-50 border-blue-200 text-blue-700',
    warning: 'bg-[var(--signal-pending-soft)] border-[var(--signal-pending)] text-[var(--signal-pending-ink)]',
    critical: 'bg-[var(--signal-conflict-soft)] border-[var(--signal-conflict)] text-[var(--signal-conflict-ink)]',
  };

  const severityIcons = {
    info: <Bell className="w-4 h-4" />,
    warning: <AlertTriangle className="w-4 h-4" />,
    critical: <AlertTriangle className="w-4 h-4" />,
  };

  return (
    <div className={`p-4 rounded-lg border ${severityColors[alert.severity]}`}>
      <div className="flex items-start gap-3">
        {severityIcons[alert.severity]}
        <div className="flex-1">
          <p className="text-sm font-medium">{alert.message}</p>
          <p className="text-xs mt-1 opacity-70">
            {new Date(alert.createdAt).toLocaleString()}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${
          alert.severity === 'critical' ? 'bg-[var(--signal-conflict-soft)]' :
          alert.severity === 'warning' ? 'bg-yellow-200' :
          'bg-blue-200'
        }`}>
          {alert.alertType.replace('_', ' ')}
        </span>
      </div>
    </div>
  );
}

// Simple Bar Chart for Daily Spending
function SpendingChart({ data }: { data: DailyCost[] }) {
  const maxCost = Math.max(...data.map(d => d.totalCost));

  return (
    <div className="flex items-end justify-between h-full gap-1">
      {data.slice(-14).map((day) => {
        const height = maxCost > 0 ? (day.totalCost / maxCost) * 100 : 0;
        const date = new Date(day.date);
        const dayLabel = date.toLocaleDateString('en', { weekday: 'short', day: 'numeric' });

        return (
          <div key={day.date} className="flex-1 flex flex-col items-center">
            <div
              className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer group relative"
              style={{ height: `${Math.max(height, 2)}%` }}
            >
              <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-[var(--ink-800)] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                ${day.totalCost.toFixed(4)}
                <br />
                {day.requestCount} requests
              </div>
            </div>
            <span className="text-xs text-[var(--ink-600)] mt-2 transform -rotate-45 origin-top-left">
              {dayLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Calculate trend from daily data
function calculateTrend(data: DailyCost[]): { direction: 'up' | 'down'; percent: number } | undefined {
  if (data.length < 2) return undefined;

  const recent = data.slice(-7);
  const previous = data.slice(-14, -7);

  if (previous.length === 0) return undefined;

  const recentAvg = recent.reduce((sum, d) => sum + d.totalCost, 0) / recent.length;
  const previousAvg = previous.reduce((sum, d) => sum + d.totalCost, 0) / previous.length;

  if (previousAvg === 0) return undefined;

  const percentChange = ((recentAvg - previousAvg) / previousAvg) * 100;

  return {
    direction: percentChange >= 0 ? 'up' : 'down',
    percent: Math.abs(percentChange),
  };
}
