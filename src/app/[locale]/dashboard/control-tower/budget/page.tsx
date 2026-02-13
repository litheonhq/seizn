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
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const spendPercent = budget?.percentUsed ?? 0;
  const progressColor =
    spendPercent >= 100 ? 'bg-red-500' :
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
          <p className="text-gray-500 text-sm mt-1">
            Monitor spending and configure budget limits
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg flex items-center gap-2 hover:bg-gray-200"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
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
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Budget Usage</h2>
            <span className={`text-sm font-medium ${
              spendPercent >= 100 ? 'text-red-600' :
              spendPercent >= 80 ? 'text-yellow-600' :
              'text-green-600'
            }`}>
              {spendPercent.toFixed(1)}% used
            </span>
          </div>

          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-4">
            <div
              className={`h-4 rounded-full transition-all ${progressColor}`}
              style={{ width: `${Math.min(spendPercent, 100)}%` }}
            />
          </div>

          <div className="flex justify-between text-sm text-gray-500">
            <span>$0</span>
            <span className="flex items-center gap-1">
              Alert threshold: {budget.alertThreshold}%
              {spendPercent >= budget.alertThreshold && (
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
              )}
            </span>
            <span>${budget.budgetLimit?.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5" />
            Budget Settings
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Monthly Budget Limit ($)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  placeholder="Enter monthly limit"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to disable budget tracking
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>50%</span>
                  <span className="font-medium">{alertThreshold}%</span>
                  <span>100%</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
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
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5" />
            Cost Alerts
          </h2>

          {alerts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Check className="w-12 h-12 mx-auto mb-2 text-green-500" />
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
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5" />
            Spending Breakdown by Model
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Model</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Provider</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Requests</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Total Cost</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Avg/Request</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {costs.byModel.map((model) => (
                  <tr key={model.model} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="py-3 px-4 text-sm font-medium">{model.model}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">{model.provider}</td>
                    <td className="py-3 px-4 text-sm text-right">{model.requestCount.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm text-right font-medium">${model.totalCost.toFixed(4)}</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-500">${model.avgCostPerRequest.toFixed(6)}</td>
                    <td className="py-3 px-4 text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${(model.totalCost / costs.totalCost) * 100}%` }}
                          />
                        </div>
                        <span className="text-gray-500">
                          {((model.totalCost / costs.totalCost) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-750">
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
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
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
    <div className={`bg-white dark:bg-gray-800 rounded-xl border p-4 ${
      isWarning ? 'border-yellow-300 dark:border-yellow-600' : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{title}</span>
        <Icon className={`w-5 h-5 ${isWarning ? 'text-yellow-500' : 'text-gray-400'}`} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold ${isWarning ? 'text-yellow-600' : ''}`}>
          {value}
        </span>
        {trend && (
          <span className={`flex items-center text-xs ${
            trend.direction === 'up' ? 'text-red-500' : 'text-green-500'
          }`}>
            {trend.direction === 'up' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {trend.percent.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}

// Alert Card Component
function AlertCard({ alert }: { alert: CostAlert }) {
  const severityColors = {
    info: 'bg-blue-50 border-blue-200 text-blue-700',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    critical: 'bg-red-50 border-red-200 text-red-700',
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
          alert.severity === 'critical' ? 'bg-red-200' :
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
              <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                ${day.totalCost.toFixed(4)}
                <br />
                {day.requestCount} requests
              </div>
            </div>
            <span className="text-xs text-gray-500 mt-2 transform -rotate-45 origin-top-left">
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
