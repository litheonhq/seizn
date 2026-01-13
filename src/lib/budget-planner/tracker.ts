/**
 * Seizn Budget-aware Planning - Tracker
 *
 * Tracks spending, enforces limits, and manages budget alerts.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  BudgetSettings,
  BudgetStatus,
  BudgetCheckResult,
  QueryCost,
  QueryType,
  DailyCostSummary,
  BudgetAlert,
  BudgetAlertType,
  RetrievalPlanConfig,
} from './types';
import { optimizeForBudget } from './optimizer';
import { estimatePlanCost, type EstimationParams } from './estimator';

// ============================================
// Budget Status
// ============================================

/**
 * Get current budget status for a user
 */
export async function checkBudget(userId: string): Promise<BudgetStatus> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('check_budget_status', {
    p_user_id: userId,
  });

  if (error) {
    console.error('Error checking budget:', error);
    // Return defaults on error
    return {
      hasBudget: false,
      dailyBudget: 10.0,
      monthlyBudget: 100.0,
      perQueryMax: 0.05,
      dailySpent: 0,
      monthlySpent: 0,
      dailyRemaining: 10.0,
      monthlyRemaining: 100.0,
      dailyUsagePct: 0,
      monthlyUsagePct: 0,
      mode: 'soft',
      fallbackStrategy: 'degrade',
      isOverDaily: false,
      isOverMonthly: false,
      alertAtPercent: 80,
    };
  }

  return {
    hasBudget: data.has_budget,
    dailyBudget: data.daily_budget,
    monthlyBudget: data.monthly_budget,
    perQueryMax: data.per_query_max,
    dailySpent: data.daily_spent,
    monthlySpent: data.monthly_spent,
    dailyRemaining: data.daily_remaining,
    monthlyRemaining: data.monthly_remaining,
    dailyUsagePct: data.daily_usage_pct,
    monthlyUsagePct: data.monthly_usage_pct,
    mode: data.mode,
    fallbackStrategy: data.fallback_strategy,
    isOverDaily: data.is_over_daily,
    isOverMonthly: data.is_over_monthly,
    alertAtPercent: data.alert_at_percent,
  };
}

/**
 * Update budget settings for a user
 */
export async function updateBudgetSettings(
  userId: string,
  settings: Partial<BudgetSettings>
): Promise<BudgetStatus> {
  const supabase = createServerClient();

  // Upsert budget settings
  const { error } = await supabase
    .from('retrieval_budgets')
    .upsert({
      user_id: userId,
      daily_budget_usd: settings.dailyBudgetUsd,
      monthly_budget_usd: settings.monthlyBudgetUsd,
      per_query_max_usd: settings.perQueryMaxUsd,
      alert_at_percent: settings.alertAtPercent,
      mode: settings.mode,
      fallback_strategy: settings.fallbackStrategy,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  if (error) {
    console.error('Error updating budget:', error);
    throw new Error('Failed to update budget settings');
  }

  // Return updated status
  return checkBudget(userId);
}

// ============================================
// Budget Enforcement
// ============================================

/**
 * Check if a query can proceed given budget constraints
 */
export async function enforceBudgetLimit(
  userId: string,
  estimatedCost: number,
  plan?: RetrievalPlanConfig,
  estimationParams?: EstimationParams
): Promise<BudgetCheckResult> {
  const status = await checkBudget(userId);

  // Check per-query limit
  if (estimatedCost > status.perQueryMax) {
    if (status.mode === 'hard') {
      return {
        allowed: false,
        reason: `Query cost $${estimatedCost.toFixed(4)} exceeds per-query limit $${status.perQueryMax.toFixed(2)}`,
        useFallback: false,
        remainingDaily: status.dailyRemaining,
        remainingMonthly: status.monthlyRemaining,
        estimatedCost,
      };
    }

    // Soft mode - create fallback plan
    if (plan && estimationParams) {
      const fallbackPlan = optimizeForBudget(
        status.perQueryMax,
        { maxCostPerQuery: status.perQueryMax },
        estimationParams
      );

      return {
        allowed: true,
        reason: `Using degraded plan to fit per-query limit`,
        useFallback: true,
        fallbackPlan: fallbackPlan.plan,
        remainingDaily: status.dailyRemaining,
        remainingMonthly: status.monthlyRemaining,
        estimatedCost: fallbackPlan.estimatedCost,
      };
    }
  }

  // Check daily limit
  if (status.dailySpent + estimatedCost > status.dailyBudget) {
    if (status.mode === 'hard') {
      return {
        allowed: false,
        reason: `Daily budget exceeded ($${status.dailySpent.toFixed(2)} of $${status.dailyBudget.toFixed(2)})`,
        useFallback: false,
        remainingDaily: status.dailyRemaining,
        remainingMonthly: status.monthlyRemaining,
        estimatedCost,
      };
    }

    // Soft mode with fallback
    if (status.fallbackStrategy === 'reject') {
      return {
        allowed: false,
        reason: `Daily budget exceeded`,
        useFallback: false,
        remainingDaily: status.dailyRemaining,
        remainingMonthly: status.monthlyRemaining,
        estimatedCost,
      };
    }

    if (status.fallbackStrategy === 'degrade' && plan && estimationParams) {
      const fallbackPlan = optimizeForBudget(
        status.dailyRemaining,
        { maxCostPerQuery: status.dailyRemaining },
        estimationParams
      );

      return {
        allowed: true,
        reason: `Using degraded plan due to daily budget limit`,
        useFallback: true,
        fallbackPlan: fallbackPlan.plan,
        remainingDaily: status.dailyRemaining,
        remainingMonthly: status.monthlyRemaining,
        estimatedCost: fallbackPlan.estimatedCost,
      };
    }
  }

  // Check monthly limit
  if (status.monthlySpent + estimatedCost > status.monthlyBudget) {
    if (status.mode === 'hard') {
      return {
        allowed: false,
        reason: `Monthly budget exceeded ($${status.monthlySpent.toFixed(2)} of $${status.monthlyBudget.toFixed(2)})`,
        useFallback: false,
        remainingDaily: status.dailyRemaining,
        remainingMonthly: status.monthlyRemaining,
        estimatedCost,
      };
    }
  }

  // Query is allowed
  return {
    allowed: true,
    useFallback: false,
    remainingDaily: status.dailyRemaining - estimatedCost,
    remainingMonthly: status.monthlyRemaining - estimatedCost,
    estimatedCost,
  };
}

// ============================================
// Cost Recording
// ============================================

/**
 * Record query cost
 */
export async function recordSpend(
  userId: string,
  cost: Omit<QueryCost, 'id' | 'userId' | 'createdAt'>
): Promise<{
  costId: string;
  totalCost: number;
  dailySpent: number;
  monthlySpent: number;
  wasOverBudget: boolean;
  alertTriggered?: string;
}> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('record_query_cost', {
    p_user_id: userId,
    p_trace_id: cost.traceId ?? null,
    p_embedding_cost: cost.embeddingCost,
    p_rerank_cost: cost.rerankCost,
    p_llm_cost: cost.llmCost,
    p_storage_cost: cost.storageCost,
    p_embedding_model: cost.embeddingModel ?? null,
    p_embedding_tokens: cost.embeddingTokens ?? 0,
    p_rerank_model: cost.rerankModel ?? null,
    p_rerank_pairs: cost.rerankPairs ?? 0,
    p_llm_model: cost.llmModel ?? null,
    p_llm_tokens_in: cost.llmTokensIn ?? 0,
    p_llm_tokens_out: cost.llmTokensOut ?? 0,
    p_query_type: cost.queryType ?? 'search',
    p_result_count: cost.resultCount ?? 0,
    p_latency_ms: cost.latencyMs ?? null,
  });

  if (error) {
    console.error('Error recording cost:', error);
    throw new Error('Failed to record query cost');
  }

  return {
    costId: data.cost_id,
    totalCost: data.total_cost,
    dailySpent: data.daily_spent,
    monthlySpent: data.monthly_spent,
    wasOverBudget: data.was_over_budget,
    alertTriggered: data.alert_triggered,
  };
}

// ============================================
// Usage History
// ============================================

/**
 * Get daily usage summaries
 */
export async function getUsageSummaries(
  userId: string,
  options: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {}
): Promise<DailyCostSummary[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('daily_cost_summary')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (options.startDate) {
    query = query.gte('date', options.startDate);
  }
  if (options.endDate) {
    query = query.lte('date', options.endDate);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching usage:', error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    date: row.date as string,
    totalQueries: row.total_queries as number,
    totalCostUsd: row.total_cost_usd as number,
    embeddingCostUsd: row.embedding_cost_usd as number,
    rerankCostUsd: row.rerank_cost_usd as number,
    llmCostUsd: row.llm_cost_usd as number,
    storageCostUsd: row.storage_cost_usd as number,
    totalEmbeddingTokens: row.total_embedding_tokens as number,
    totalLlmTokensIn: row.total_llm_tokens_in as number,
    totalLlmTokensOut: row.total_llm_tokens_out as number,
    avgCostPerQuery: row.avg_cost_per_query as number,
    avgLatencyMs: row.avg_latency_ms as number,
    budgetUtilizationPct: row.budget_utilization_pct as number,
    overBudgetQueries: row.over_budget_queries as number,
    fallbackQueries: row.fallback_queries as number,
  }));
}

/**
 * Get query cost history
 */
export async function getQueryCostHistory(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    traceId?: string;
  } = {}
): Promise<QueryCost[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('query_costs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options.traceId) {
    query = query.eq('trace_id', options.traceId);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching query costs:', error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string | undefined,
    userId: row.user_id as string,
    traceId: row.trace_id as string | undefined,
    embeddingCost: row.embedding_cost as number,
    rerankCost: row.rerank_cost as number,
    llmCost: row.llm_cost as number,
    storageCost: row.storage_cost as number,
    totalCost: row.total_cost as number,
    embeddingModel: row.embedding_model as string | undefined,
    embeddingTokens: row.embedding_tokens as number | undefined,
    embeddingDimensions: row.embedding_dimensions as number | undefined,
    rerankModel: row.rerank_model as string | undefined,
    rerankPairs: row.rerank_pairs as number | undefined,
    llmModel: row.llm_model as string | undefined,
    llmTokensIn: row.llm_tokens_in as number | undefined,
    llmTokensOut: row.llm_tokens_out as number | undefined,
    queryType: row.query_type as QueryType | undefined,
    resultCount: row.result_count as number | undefined,
    latencyMs: row.latency_ms as number | undefined,
    wasOverBudget: row.was_over_budget as boolean | undefined,
    usedFallback: row.used_fallback as boolean | undefined,
    createdAt: row.created_at as string,
  }));
}

// ============================================
// Alerts
// ============================================

/**
 * Get budget alerts
 */
export async function getAlerts(
  userId: string,
  options: {
    unacknowledgedOnly?: boolean;
    limit?: number;
  } = {}
): Promise<BudgetAlert[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('budget_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options.unacknowledgedOnly) {
    query = query.eq('acknowledged', false);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching alerts:', error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    userId: row.user_id as string,
    alertType: row.alert_type as BudgetAlertType,
    thresholdPct: row.threshold_pct as number,
    currentSpent: row.current_spent as number,
    budgetLimit: row.budget_limit as number,
    title: row.title as string,
    message: row.message as string,
    acknowledged: row.acknowledged as boolean,
    acknowledgedAt: row.acknowledged_at as string | undefined,
    createdAt: row.created_at as string,
  }));
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(alertId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('budget_alerts')
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', alertId);

  if (error) {
    console.error('Error acknowledging alert:', error);
    throw new Error('Failed to acknowledge alert');
  }
}

/**
 * Acknowledge all alerts for a user
 */
export async function acknowledgeAllAlerts(userId: string): Promise<number> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('budget_alerts')
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('acknowledged', false)
    .select('id');

  if (error) {
    console.error('Error acknowledging alerts:', error);
    throw new Error('Failed to acknowledge alerts');
  }

  return data?.length ?? 0;
}

// ============================================
// Plan Cache
// ============================================

/**
 * Get cached optimized plan
 */
export async function getCachedPlan(
  userId: string,
  maxCost: number
): Promise<RetrievalPlanConfig | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('cost_optimized_plans')
    .select('plan_config')
    .eq('user_id', userId)
    .eq('max_cost', maxCost)
    .gt('valid_until', new Date().toISOString())
    .single();

  if (error || !data) {
    return null;
  }

  return data.plan_config as RetrievalPlanConfig;
}

/**
 * Cache an optimized plan
 */
export async function cachePlan(
  userId: string,
  maxCost: number,
  plan: RetrievalPlanConfig,
  estimates: {
    cost: number;
    quality: number;
    latencyMs: number;
  },
  tradeoffs: string[] = []
): Promise<void> {
  const supabase = createServerClient();

  const validUntil = new Date();
  validUntil.setHours(validUntil.getHours() + 24); // Cache for 24 hours

  const { error } = await supabase
    .from('cost_optimized_plans')
    .upsert({
      user_id: userId,
      max_cost: maxCost,
      plan_config: plan,
      estimated_cost: estimates.cost,
      estimated_quality: estimates.quality,
      estimated_latency_ms: estimates.latencyMs,
      tradeoffs,
      valid_until: validUntil.toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,max_cost',
    });

  if (error) {
    console.error('Error caching plan:', error);
    // Don't throw - caching is optional
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate total spending for a period
 */
export async function getTotalSpending(
  userId: string,
  period: 'day' | 'week' | 'month' | 'year'
): Promise<{
  totalCost: number;
  totalQueries: number;
  avgCostPerQuery: number;
}> {
  const supabase = createServerClient();

  // Calculate start date
  const now = new Date();
  const startDate = new Date();

  switch (period) {
    case 'day':
      startDate.setDate(now.getDate() - 1);
      break;
    case 'week':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(now.getMonth() - 1);
      break;
    case 'year':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
  }

  const { data, error } = await supabase
    .from('daily_cost_summary')
    .select('total_cost_usd, total_queries')
    .eq('user_id', userId)
    .gte('date', startDate.toISOString().split('T')[0]);

  if (error) {
    console.error('Error calculating spending:', error);
    return { totalCost: 0, totalQueries: 0, avgCostPerQuery: 0 };
  }

  const totalCost = (data ?? []).reduce((sum: number, row: Record<string, unknown>) => sum + (row.total_cost_usd as number), 0);
  const totalQueries = (data ?? []).reduce((sum: number, row: Record<string, unknown>) => sum + (row.total_queries as number), 0);
  const avgCostPerQuery = totalQueries > 0 ? totalCost / totalQueries : 0;

  return { totalCost, totalQueries, avgCostPerQuery };
}

/**
 * Get spending trend (daily averages)
 */
export async function getSpendingTrend(
  userId: string,
  days: number = 30
): Promise<Array<{
  date: string;
  cost: number;
  queries: number;
}>> {
  const summaries = await getUsageSummaries(userId, { limit: days });

  return summaries.map(s => ({
    date: s.date,
    cost: s.totalCostUsd,
    queries: s.totalQueries,
  }));
}
