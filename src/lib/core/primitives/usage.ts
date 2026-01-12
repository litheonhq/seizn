/**
 * Seizn Core - Usage Tracking
 *
 * Common billing/limits format across all seasons
 */

import { createServerClient } from '@/lib/supabase';
import type { UsageUnit, UsageRecord, UsageSummary, UsageLimit } from './types';

// Credit costs per unit
const UNIT_COSTS: Record<UsageUnit, number> = {
  api_call: 0.001,
  embedding_token: 0.00001, // Per token
  search_query: 0.1,
  rerank_document: 0.05,
  storage_mb: 0.5, // Per MB/month
  memory_operation: 0.01,
  eval_run: 1.0,
};

// Default limits by plan
const PLAN_LIMITS: Record<string, Record<UsageUnit, { limit: number; period: 'day' | 'month' }>> = {
  free: {
    api_call: { limit: 1000, period: 'day' },
    embedding_token: { limit: 100000, period: 'day' },
    search_query: { limit: 100, period: 'day' },
    rerank_document: { limit: 500, period: 'day' },
    storage_mb: { limit: 100, period: 'month' },
    memory_operation: { limit: 1000, period: 'day' },
    eval_run: { limit: 10, period: 'month' },
  },
  pro: {
    api_call: { limit: 50000, period: 'day' },
    embedding_token: { limit: 5000000, period: 'day' },
    search_query: { limit: 5000, period: 'day' },
    rerank_document: { limit: 25000, period: 'day' },
    storage_mb: { limit: 10000, period: 'month' },
    memory_operation: { limit: 50000, period: 'day' },
    eval_run: { limit: 500, period: 'month' },
  },
  enterprise: {
    api_call: { limit: 1000000, period: 'day' },
    embedding_token: { limit: 100000000, period: 'day' },
    search_query: { limit: 100000, period: 'day' },
    rerank_document: { limit: 500000, period: 'day' },
    storage_mb: { limit: 1000000, period: 'month' },
    memory_operation: { limit: 1000000, period: 'day' },
    eval_run: { limit: 10000, period: 'month' },
  },
};

/**
 * Record usage for an operation
 */
export async function recordUsage(params: {
  userId: string;
  organizationId?: string;
  projectId?: string;
  environmentId?: string;
  unit: UsageUnit;
  quantity: number;
  season: UsageRecord['season'];
  operation: string;
  traceId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}): Promise<UsageRecord> {
  const costCredits = params.quantity * UNIT_COSTS[params.unit];

  const record: Omit<UsageRecord, 'id'> = {
    userId: params.userId,
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: params.environmentId,
    unit: params.unit,
    quantity: params.quantity,
    costCredits,
    season: params.season,
    operation: params.operation,
    traceId: params.traceId,
    requestId: params.requestId,
    timestamp: new Date().toISOString(),
    metadata: params.metadata,
  };

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('core_usage_records')
    .insert({
      user_id: record.userId,
      organization_id: record.organizationId,
      project_id: record.projectId,
      environment_id: record.environmentId,
      unit: record.unit,
      quantity: record.quantity,
      cost_credits: record.costCredits,
      season: record.season,
      operation: record.operation,
      trace_id: record.traceId,
      request_id: record.requestId,
      metadata: record.metadata,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to record usage:', error);
    // Don't throw - usage recording shouldn't block operations
  }

  return {
    ...record,
    id: data?.id ?? 'unknown',
  };
}

/**
 * Get usage summary for a period
 */
export async function getUsageSummary(params: {
  userId: string;
  organizationId?: string;
  period: UsageSummary['period'];
  startTime?: string;
  endTime?: string;
}): Promise<UsageSummary> {
  const supabase = createServerClient();

  const now = new Date();
  let start: Date;
  const end = new Date(params.endTime ?? now);

  switch (params.period) {
    case 'hour':
      start = new Date(params.startTime ?? new Date(now.getTime() - 60 * 60 * 1000));
      break;
    case 'day':
      start = new Date(params.startTime ?? new Date(now.getTime() - 24 * 60 * 60 * 1000));
      break;
    case 'week':
      start = new Date(params.startTime ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      break;
    case 'month':
      start = new Date(params.startTime ?? new Date(now.getFullYear(), now.getMonth(), 1));
      break;
  }

  const query = supabase
    .from('core_usage_records')
    .select('unit, quantity, cost_credits, season, operation')
    .eq('user_id', params.userId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  if (params.organizationId) {
    query.eq('organization_id', params.organizationId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const records = data ?? [];

  // Aggregate by unit
  const byUnit: UsageSummary['byUnit'] = {} as UsageSummary['byUnit'];
  const bySeason: UsageSummary['bySeason'] = {};
  const byOperation: UsageSummary['byOperation'] = {};

  let totalCalls = 0;
  let totalCredits = 0;

  for (const record of records) {
    totalCalls++;
    totalCredits += record.cost_credits;

    // By unit
    if (!byUnit[record.unit as UsageUnit]) {
      byUnit[record.unit as UsageUnit] = { quantity: 0, credits: 0 };
    }
    byUnit[record.unit as UsageUnit].quantity += record.quantity;
    byUnit[record.unit as UsageUnit].credits += record.cost_credits;

    // By season
    if (!bySeason[record.season]) {
      bySeason[record.season] = { quantity: 0, credits: 0 };
    }
    bySeason[record.season].quantity += record.quantity;
    bySeason[record.season].credits += record.cost_credits;

    // By operation
    if (!byOperation[record.operation]) {
      byOperation[record.operation] = { quantity: 0, credits: 0 };
    }
    byOperation[record.operation].quantity += record.quantity;
    byOperation[record.operation].credits += record.cost_credits;
  }

  return {
    period: params.period,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    totalCalls,
    totalCredits,
    byUnit,
    bySeason,
    byOperation,
  };
}

/**
 * Check usage limits for a user/org
 */
export async function checkUsageLimits(params: {
  userId: string;
  organizationId?: string;
  plan: string;
  unit: UsageUnit;
}): Promise<UsageLimit> {
  const planLimits = PLAN_LIMITS[params.plan] ?? PLAN_LIMITS.free;
  const limitConfig = planLimits[params.unit];

  const supabase = createServerClient();

  const now = new Date();
  let periodStart: Date;
  let resetAt: Date;

  if (limitConfig.period === 'day') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    resetAt = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
  } else {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const query = supabase
    .from('core_usage_records')
    .select('quantity')
    .eq('user_id', params.userId)
    .eq('unit', params.unit)
    .gte('created_at', periodStart.toISOString());

  if (params.organizationId) {
    query.eq('organization_id', params.organizationId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const current = (data ?? []).reduce((sum, r) => sum + r.quantity, 0);

  return {
    unit: params.unit,
    limit: limitConfig.limit,
    period: limitConfig.period === 'day' ? 'day' : 'month',
    current,
    remaining: Math.max(0, limitConfig.limit - current),
    resetAt: resetAt.toISOString(),
  };
}

/**
 * Check if usage is within limits
 */
export async function isWithinLimits(params: {
  userId: string;
  organizationId?: string;
  plan: string;
  unit: UsageUnit;
  quantity: number;
}): Promise<{ allowed: boolean; limit: UsageLimit }> {
  const limit = await checkUsageLimits({
    userId: params.userId,
    organizationId: params.organizationId,
    plan: params.plan,
    unit: params.unit,
  });

  return {
    allowed: params.quantity <= limit.remaining,
    limit,
  };
}
