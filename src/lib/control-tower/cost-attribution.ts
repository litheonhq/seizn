/**
 * Control Tower - Cost Attribution Service
 *
 * Provides cost breakdown by model, tool, route, user, and organization
 * Uses gateway_cost_ledgers table from Blueprint migration
 */

import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface CostBreakdown {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  byModel: ModelCostBreakdown[];
  byRoute: RouteCostBreakdown[];
  byUser: UserCostBreakdown[];
  byDay: DailyCostBreakdown[];
  periodStart: string;
  periodEnd: string;
}

export interface ModelCostBreakdown {
  model: string;
  provider: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  requestCount: number;
  avgCostPerRequest: number;
  costSavingsFromCache: number;
}

export interface RouteCostBreakdown {
  routeId: string;
  routeName: string;
  totalCost: number;
  requestCount: number;
  avgLatencyMs: number;
  errorRate: number;
}

export interface UserCostBreakdown {
  userId: string;
  displayName?: string;
  totalCost: number;
  requestCount: number;
  topModels: string[];
}

export interface DailyCostBreakdown {
  date: string;
  totalCost: number;
  requestCount: number;
  avgCostPerRequest: number;
}

export interface CostQueryParams {
  orgId: string;
  userId?: string;
  routeId?: string;
  model?: string;
  provider?: string;
  startDate?: string;
  endDate?: string;
  groupBy?: ('model' | 'route' | 'user' | 'day')[];
}

export interface BudgetStatus {
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

// ============================================
// Cost Attribution Functions
// ============================================

/**
 * Get comprehensive cost breakdown for an organization
 */
export async function getCostBreakdown(params: CostQueryParams): Promise<CostBreakdown> {
  const supabase = createServerClient();

  const now = new Date();
  const startDate = params.startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endDate = params.endDate || now.toISOString();

  // Base query for cost ledgers
  let query = supabase
    .from('gateway_cost_ledgers')
    .select('*')
    .eq('org_id', params.orgId)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (params.userId) {
    query = query.eq('user_id', params.userId);
  }
  if (params.routeId) {
    query = query.eq('route_id', params.routeId);
  }
  if (params.model) {
    query = query.eq('model', params.model);
  }
  if (params.provider) {
    query = query.eq('provider', params.provider);
  }

  const { data: ledgers, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch cost ledgers: ${error.message}`);
  }

  const records = ledgers || [];

  // Calculate totals
  const totalCost = records.reduce((sum, r) => sum + (r.total_cost || 0), 0);
  const totalTokens = records.reduce((sum, r) =>
    sum + (r.input_tokens || 0) + (r.output_tokens || 0), 0);
  const totalRequests = records.length;

  // Group by model
  const byModel = aggregateByModel(records);

  // Group by route
  const byRoute = aggregateByRoute(records);

  // Group by user
  const byUser = aggregateByUser(records);

  // Group by day
  const byDay = aggregateByDay(records);

  return {
    totalCost: roundCost(totalCost),
    totalTokens,
    totalRequests,
    byModel,
    byRoute,
    byUser,
    byDay,
    periodStart: startDate,
    periodEnd: endDate,
  };
}

/**
 * Get cost breakdown by model
 */
function aggregateByModel(records: any[]): ModelCostBreakdown[] {
  const modelMap = new Map<string, {
    provider: string;
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    requestCount: number;
    cacheSavings: number;
  }>();

  for (const r of records) {
    const key = r.model || 'unknown';
    const existing = modelMap.get(key) || {
      provider: r.provider || 'unknown',
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      requestCount: 0,
      cacheSavings: 0,
    };

    modelMap.set(key, {
      provider: existing.provider,
      totalCost: existing.totalCost + (r.total_cost || 0),
      inputTokens: existing.inputTokens + (r.input_tokens || 0),
      outputTokens: existing.outputTokens + (r.output_tokens || 0),
      cachedTokens: existing.cachedTokens + (r.cached_tokens || 0),
      requestCount: existing.requestCount + 1,
      cacheSavings: existing.cacheSavings + (r.cache_savings || 0),
    });
  }

  return Array.from(modelMap.entries())
    .map(([model, data]) => ({
      model,
      provider: data.provider,
      totalCost: roundCost(data.totalCost),
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cachedTokens: data.cachedTokens,
      requestCount: data.requestCount,
      avgCostPerRequest: roundCost(data.requestCount > 0 ? data.totalCost / data.requestCount : 0),
      costSavingsFromCache: roundCost(data.cacheSavings),
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/**
 * Get cost breakdown by route
 */
function aggregateByRoute(records: any[]): RouteCostBreakdown[] {
  const routeMap = new Map<string, {
    routeName: string;
    totalCost: number;
    requestCount: number;
    totalLatency: number;
    errorCount: number;
  }>();

  for (const r of records) {
    const key = r.route_id || 'direct';
    const existing = routeMap.get(key) || {
      routeName: r.route_name || 'Direct API',
      totalCost: 0,
      requestCount: 0,
      totalLatency: 0,
      errorCount: 0,
    };

    routeMap.set(key, {
      routeName: existing.routeName,
      totalCost: existing.totalCost + (r.total_cost || 0),
      requestCount: existing.requestCount + 1,
      totalLatency: existing.totalLatency + (r.latency_ms || 0),
      errorCount: existing.errorCount + (r.is_error ? 1 : 0),
    });
  }

  return Array.from(routeMap.entries())
    .map(([routeId, data]) => ({
      routeId,
      routeName: data.routeName,
      totalCost: roundCost(data.totalCost),
      requestCount: data.requestCount,
      avgLatencyMs: Math.round(data.requestCount > 0 ? data.totalLatency / data.requestCount : 0),
      errorRate: roundCost(data.requestCount > 0 ? (data.errorCount / data.requestCount) * 100 : 0),
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

/**
 * Get cost breakdown by user
 */
function aggregateByUser(records: any[]): UserCostBreakdown[] {
  const userMap = new Map<string, {
    totalCost: number;
    requestCount: number;
    models: Map<string, number>;
  }>();

  for (const r of records) {
    const key = r.user_id || 'anonymous';
    const existing = userMap.get(key) || {
      totalCost: 0,
      requestCount: 0,
      models: new Map(),
    };

    const modelCount = existing.models.get(r.model) || 0;
    existing.models.set(r.model, modelCount + 1);

    userMap.set(key, {
      totalCost: existing.totalCost + (r.total_cost || 0),
      requestCount: existing.requestCount + 1,
      models: existing.models,
    });
  }

  return Array.from(userMap.entries())
    .map(([userId, data]) => ({
      userId,
      totalCost: roundCost(data.totalCost),
      requestCount: data.requestCount,
      topModels: Array.from(data.models.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([model]) => model),
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 20); // Top 20 users
}

/**
 * Get cost breakdown by day
 */
function aggregateByDay(records: any[]): DailyCostBreakdown[] {
  const dayMap = new Map<string, { totalCost: number; requestCount: number }>();

  for (const r of records) {
    const date = r.created_at?.split('T')[0] || 'unknown';
    const existing = dayMap.get(date) || { totalCost: 0, requestCount: 0 };

    dayMap.set(date, {
      totalCost: existing.totalCost + (r.total_cost || 0),
      requestCount: existing.requestCount + 1,
    });
  }

  return Array.from(dayMap.entries())
    .map(([date, data]) => ({
      date,
      totalCost: roundCost(data.totalCost),
      requestCount: data.requestCount,
      avgCostPerRequest: roundCost(data.requestCount > 0 ? data.totalCost / data.requestCount : 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================
// Budget Management
// ============================================

/**
 * Get budget status for an organization
 */
export async function getBudgetStatus(orgId: string): Promise<BudgetStatus> {
  const supabase = createServerClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  // Get current month's spend
  const { data: costData, error: costError } = await supabase
    .from('gateway_cost_ledgers')
    .select('total_cost')
    .eq('org_id', orgId)
    .gte('created_at', monthStart.toISOString())
    .lte('created_at', now.toISOString());

  if (costError) {
    throw new Error(`Failed to fetch cost data: ${costError.message}`);
  }

  const currentSpend = (costData || []).reduce((sum, r) => sum + (r.total_cost || 0), 0);

  // Get budget limit from organization settings or gateway policies
  const { data: policyData } = await supabase
    .from('gateway_policies')
    .select('config')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .single();

  const budgetLimit = policyData?.config?.budget_limit_monthly || null;
  const alertThreshold = policyData?.config?.budget_alert_threshold || 0.8;

  // Calculate projections
  const dailyAvg = dayOfMonth > 0 ? currentSpend / dayOfMonth : 0;
  const projectedMonthEnd = dailyAvg * daysInMonth;
  const percentUsed = budgetLimit ? (currentSpend / budgetLimit) * 100 : 0;

  return {
    orgId,
    currentSpend: roundCost(currentSpend),
    budgetLimit: budgetLimit ? roundCost(budgetLimit) : null,
    percentUsed: roundCost(percentUsed),
    projectedMonthEnd: roundCost(projectedMonthEnd),
    daysRemaining,
    alertThreshold: alertThreshold * 100,
    isOverBudget: budgetLimit !== null && currentSpend > budgetLimit,
    isNearLimit: budgetLimit !== null && percentUsed >= alertThreshold * 100,
  };
}

/**
 * Set budget limit for an organization
 */
export async function setBudgetLimit(
  orgId: string,
  monthlyLimit: number,
  alertThreshold: number = 0.8
): Promise<void> {
  const supabase = createServerClient();

  // Update or create budget policy
  const { error } = await supabase
    .from('gateway_policies')
    .upsert({
      org_id: orgId,
      name: 'budget_policy',
      policy_type: 'budget',
      config: {
        budget_limit_monthly: monthlyLimit,
        budget_alert_threshold: alertThreshold,
      },
      is_active: true,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'org_id,name',
    });

  if (error) {
    throw new Error(`Failed to set budget limit: ${error.message}`);
  }
}

// ============================================
// Cost Alerts
// ============================================

export interface CostAlert {
  id: string;
  orgId: string;
  alertType: 'budget_threshold' | 'spend_spike' | 'unusual_model' | 'rate_limit';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  acknowledged: boolean;
}

/**
 * Check for cost anomalies and generate alerts
 */
export async function checkCostAlerts(orgId: string): Promise<CostAlert[]> {
  const alerts: CostAlert[] = [];

  // Check budget status
  const budgetStatus = await getBudgetStatus(orgId);

  if (budgetStatus.isOverBudget) {
    alerts.push({
      id: crypto.randomUUID(),
      orgId,
      alertType: 'budget_threshold',
      severity: 'critical',
      message: `Budget exceeded: $${budgetStatus.currentSpend.toFixed(2)} / $${budgetStatus.budgetLimit?.toFixed(2)}`,
      metadata: { ...budgetStatus },
      createdAt: new Date().toISOString(),
      acknowledged: false,
    });
  } else if (budgetStatus.isNearLimit) {
    alerts.push({
      id: crypto.randomUUID(),
      orgId,
      alertType: 'budget_threshold',
      severity: 'warning',
      message: `Approaching budget limit: ${budgetStatus.percentUsed.toFixed(1)}% used`,
      metadata: { ...budgetStatus },
      createdAt: new Date().toISOString(),
      acknowledged: false,
    });
  }

  // Check for spend spikes (compare today vs 7-day average)
  const spikeAlert = await checkSpendSpike(orgId);
  if (spikeAlert) {
    alerts.push(spikeAlert);
  }

  return alerts;
}

/**
 * Check for unusual spend spikes
 */
async function checkSpendSpike(orgId: string): Promise<CostAlert | null> {
  const supabase = createServerClient();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get today's spend
  const { data: todayData } = await supabase
    .from('gateway_cost_ledgers')
    .select('total_cost')
    .eq('org_id', orgId)
    .gte('created_at', today.toISOString());

  const todaySpend = (todayData || []).reduce((sum, r) => sum + (r.total_cost || 0), 0);

  // Get 7-day average
  const { data: weekData } = await supabase
    .from('gateway_cost_ledgers')
    .select('total_cost, created_at')
    .eq('org_id', orgId)
    .gte('created_at', weekAgo.toISOString())
    .lt('created_at', today.toISOString());

  const weekTotal = (weekData || []).reduce((sum, r) => sum + (r.total_cost || 0), 0);
  const dailyAvg = weekTotal / 7;

  // Alert if today's spend is 2x the average
  if (dailyAvg > 0 && todaySpend > dailyAvg * 2) {
    return {
      id: crypto.randomUUID(),
      orgId,
      alertType: 'spend_spike',
      severity: 'warning',
      message: `Unusual spend spike: $${todaySpend.toFixed(2)} today vs $${dailyAvg.toFixed(2)} daily average`,
      metadata: {
        todaySpend: roundCost(todaySpend),
        dailyAvg: roundCost(dailyAvg),
        spikeRatio: roundCost(todaySpend / dailyAvg),
      },
      createdAt: new Date().toISOString(),
      acknowledged: false,
    };
  }

  return null;
}

// ============================================
// Utilities
// ============================================

function roundCost(value: number): number {
  return Math.round(value * 10000) / 10000; // 4 decimal places for costs
}

/**
 * Export cost data to CSV format
 */
export function exportCostBreakdownToCSV(breakdown: CostBreakdown): string {
  const lines: string[] = [];

  // Summary
  lines.push('Cost Summary');
  lines.push(`Total Cost,$${breakdown.totalCost}`);
  lines.push(`Total Tokens,${breakdown.totalTokens}`);
  lines.push(`Total Requests,${breakdown.totalRequests}`);
  lines.push(`Period,${breakdown.periodStart} to ${breakdown.periodEnd}`);
  lines.push('');

  // By Model
  lines.push('Cost by Model');
  lines.push('Model,Provider,Total Cost,Input Tokens,Output Tokens,Cached Tokens,Requests,Avg Cost/Request,Cache Savings');
  for (const m of breakdown.byModel) {
    lines.push(`${m.model},${m.provider},$${m.totalCost},${m.inputTokens},${m.outputTokens},${m.cachedTokens},${m.requestCount},$${m.avgCostPerRequest},$${m.costSavingsFromCache}`);
  }
  lines.push('');

  // By Route
  lines.push('Cost by Route');
  lines.push('Route ID,Route Name,Total Cost,Requests,Avg Latency (ms),Error Rate (%)');
  for (const r of breakdown.byRoute) {
    lines.push(`${r.routeId},${r.routeName},$${r.totalCost},${r.requestCount},${r.avgLatencyMs},${r.errorRate}`);
  }
  lines.push('');

  // By Day
  lines.push('Cost by Day');
  lines.push('Date,Total Cost,Requests,Avg Cost/Request');
  for (const d of breakdown.byDay) {
    lines.push(`${d.date},$${d.totalCost},${d.requestCount},$${d.avgCostPerRequest}`);
  }

  return lines.join('\n');
}
