import { createServerClient } from '@/lib/supabase';
import type { ApiKeyPeriod, SupabaseLike } from './types';

export interface UsageBreakdownByTool {
  tool: string;
  count: number;
}

export interface UsageBreakdownByModel {
  provider: string | null;
  model: string | null;
  count: number;
  cost_usd_milli: number;
}

export interface UsageBreakdownDaily {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface ApiKeyUsageBreakdown {
  apiKeyId: string;
  total: number;
  cost_usd_milli: number;
  byTool: UsageBreakdownByTool[];
  byModel: UsageBreakdownByModel[];
  daily: UsageBreakdownDaily[];
}

function periodStart(now: Date, period: ApiKeyPeriod): Date {
  if (period === 'day') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Pulls a single key's full per-period breakdown from `api_key_usage`.
 * Aggregations are done client-side because PostgREST cannot ORDER BY GROUP BY
 * results — and the row volume per key per month is bounded by the quota
 * (max ~1M rows for Enterprise, far less for everyone else).
 *
 * For the dashboard summary page we run this in parallel across the user's
 * keys (typically 1-5 keys per user, capped at TRACK_2_KEY_CAP_PER_USER).
 *
 * IMPORTANT: when `ownedBy` is provided, results are scoped to that user.
 * Callers should ALWAYS pass `ownedBy` when the apiKeyId originates from
 * untrusted input (URL param, body, etc.). Without it, a caller that
 * forwards a user-supplied apiKeyId could read another tenant's per-tool /
 * per-model breakdown. The dashboard caller filters keys by user_id first
 * and then iterates, so it can safely omit `ownedBy`.
 */
export async function getApiKeyUsageBreakdown(
  apiKeyId: string,
  period: ApiKeyPeriod = 'month',
  deps: { supabase?: SupabaseLike; now?: Date; ownedBy?: string } = {},
): Promise<ApiKeyUsageBreakdown> {
  const supabase = deps.supabase ?? createServerClient();
  const now = deps.now ?? new Date();
  const startIso = periodStart(now, period).toISOString();

  if (deps.ownedBy) {
    // Defensive: confirm ownership before reading usage rows. If the key
    // doesn't belong to the user, return an empty breakdown rather than
    // throwing — that way a misrouted dashboard request just shows zeros
    // instead of leaking the existence of another tenant's key id.
    const { data: keyRow } = await supabase
      .from('api_keys')
      .select('id')
      .eq('id', apiKeyId)
      .eq('user_id', deps.ownedBy)
      .maybeSingle();
    if (!keyRow) {
      return {
        apiKeyId,
        total: 0,
        cost_usd_milli: 0,
        byTool: [],
        byModel: [],
        daily: [],
      };
    }
  }

  const { data, error } = await supabase
    .from('api_key_usage')
    .select('tool, cost_units, llm_cost_usd_milli, llm_provider, llm_model, occurred_at')
    .eq('api_key_id', apiKeyId)
    .gte('occurred_at', startIso);

  if (error) {
    throw error;
  }

  type Row = {
    tool: string | null;
    cost_units: number | null;
    llm_cost_usd_milli: number | null;
    llm_provider: string | null;
    llm_model: string | null;
    occurred_at: string | null;
  };
  const rows = (data ?? []) as Row[];

  const toolCounts = new Map<string, number>();
  const modelCounts = new Map<
    string,
    { provider: string | null; model: string | null; count: number; cost_usd_milli: number }
  >();
  const dailyCounts = new Map<string, number>();
  let total = 0;
  let totalCostMilli = 0;

  for (const row of rows) {
    const cost = row.cost_units ?? 1;
    total += cost;
    const llmCost = row.llm_cost_usd_milli ?? 0;
    totalCostMilli += llmCost;

    const tool = row.tool ?? 'unknown';
    toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + cost);

    const modelKey = `${row.llm_provider ?? '_'}/${row.llm_model ?? '_'}`;
    const existing = modelCounts.get(modelKey);
    if (existing) {
      existing.count += cost;
      existing.cost_usd_milli += llmCost;
    } else {
      modelCounts.set(modelKey, {
        provider: row.llm_provider,
        model: row.llm_model,
        count: cost,
        cost_usd_milli: llmCost,
      });
    }

    if (row.occurred_at) {
      const day = row.occurred_at.slice(0, 10);
      dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + cost);
    }
  }

  const byTool: UsageBreakdownByTool[] = Array.from(toolCounts.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);

  const byModel: UsageBreakdownByModel[] = Array.from(modelCounts.values())
    .filter((entry) => entry.provider !== null || entry.model !== null)
    .sort((a, b) => b.count - a.count);

  const daily: UsageBreakdownDaily[] = Array.from(dailyCounts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    apiKeyId,
    total,
    cost_usd_milli: totalCostMilli,
    byTool,
    byModel,
    daily,
  };
}

/**
 * Roll up per-key breakdowns into a single user-level summary. Useful when the
 * dashboard wants one "you used X requests this month" headline above the
 * per-key table.
 */
export interface UserUsageSummary {
  totalRequests: number;
  totalCostUsdMilli: number;
  byTool: UsageBreakdownByTool[];
  byModel: UsageBreakdownByModel[];
  perKey: ApiKeyUsageBreakdown[];
}

export function aggregateUserUsage(perKey: ApiKeyUsageBreakdown[]): UserUsageSummary {
  const toolMap = new Map<string, number>();
  const modelMap = new Map<
    string,
    { provider: string | null; model: string | null; count: number; cost_usd_milli: number }
  >();
  let totalRequests = 0;
  let totalCostUsdMilli = 0;

  for (const key of perKey) {
    totalRequests += key.total;
    totalCostUsdMilli += key.cost_usd_milli;
    for (const t of key.byTool) {
      toolMap.set(t.tool, (toolMap.get(t.tool) ?? 0) + t.count);
    }
    for (const m of key.byModel) {
      const k = `${m.provider ?? '_'}/${m.model ?? '_'}`;
      const existing = modelMap.get(k);
      if (existing) {
        existing.count += m.count;
        existing.cost_usd_milli += m.cost_usd_milli;
      } else {
        modelMap.set(k, { ...m });
      }
    }
  }

  return {
    totalRequests,
    totalCostUsdMilli,
    byTool: Array.from(toolMap.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count),
    byModel: Array.from(modelMap.values()).sort((a, b) => b.count - a.count),
    perKey,
  };
}
