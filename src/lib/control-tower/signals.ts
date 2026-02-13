/**
 * Control Tower - High-signal Insights
 *
 * Aggregates the three "value in 30 seconds" panels:
 * - top failing traces
 * - security policy events
 * - search quality regressions
 */

import { createServerClient } from '@/lib/supabase';
import type {
  ControlTowerSignals,
  FailingTraceSignal,
  SearchQualityRegressionSignal,
  SecurityPolicyEventSignal,
} from './types';

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getControlTowerSignals(
  userId: string,
  organizationId?: string,
  limit: number = DEFAULT_LIMIT
): Promise<ControlTowerSignals> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - DEFAULT_WINDOW_MS).toISOString();

  const [failingTraces, securityPolicyEvents, searchQualityRegressions] = await Promise.all([
    getTopFailingTraces(supabase, userId, since, limit),
    getSecurityPolicyEvents(supabase, userId, organizationId, since, limit),
    getSearchQualityRegressions(supabase, userId, since, limit),
  ]);

  return {
    failingTraces,
    securityPolicyEvents,
    searchQualityRegressions,
    generatedAt: new Date().toISOString(),
  };
}

async function getTopFailingTraces(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  since: string,
  limit: number
): Promise<FailingTraceSignal[]> {
  try {
    const { data, error } = await supabase
      .from('usage_logs')
      .select('id, endpoint, method, status_code, latency_ms, created_at')
      .eq('user_id', userId)
      .gte('created_at', since)
      .gte('status_code', 400)
      .order('status_code', { ascending: false })
      .order('latency_ms', { ascending: false })
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row.id,
      endpoint: row.endpoint,
      method: row.method,
      statusCode: row.status_code || 0,
      latencyMs: row.latency_ms || 0,
      occurredAt: row.created_at,
    }));
  } catch (error) {
    console.error('Failed to load failing traces:', error);
    return [];
  }
}

async function getSecurityPolicyEvents(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  organizationId: string | undefined,
  since: string,
  limit: number
): Promise<SecurityPolicyEventSignal[]> {
  try {
    let query = supabase
      .from('audit_logs')
      .select('id, action, resource_type, status, details, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);

    if (organizationId) {
      query = query.or(`user_id.eq.${userId},organization_id.eq.${organizationId}`);
    } else {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error || !data) {
      return [];
    }

    return data
      .filter((row) => {
        const action = (row.action || '').toLowerCase();
        const resourceType = (row.resource_type || '').toLowerCase();
        return (
          action.includes('policy') ||
          action.includes('security') ||
          resourceType.includes('policy') ||
          resourceType.includes('security')
        );
      })
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        action: row.action,
        resourceType: row.resource_type,
        status: row.status || 'success',
        occurredAt: row.created_at,
        details: (row.details || undefined) as Record<string, unknown> | undefined,
      }));
  } catch (error) {
    console.error('Failed to load security policy events:', error);
    return [];
  }
}

async function getSearchQualityRegressions(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  since: string,
  limit: number
): Promise<SearchQualityRegressionSignal[]> {
  try {
    const { data, error } = await supabase
      .from('fall_eval_regression_events')
      .select('id, metric_key, baseline_value, candidate_value, delta, severity, acknowledged, created_at')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row.id,
      metricKey: row.metric_key,
      baselineValue: row.baseline_value ?? 0,
      candidateValue: row.candidate_value ?? 0,
      delta: row.delta ?? 0,
      severity: (row.severity === 'critical' ? 'critical' : 'warning') as 'warning' | 'critical',
      acknowledged: row.acknowledged ?? false,
      occurredAt: row.created_at,
    }));
  } catch (error) {
    console.error('Failed to load search quality regressions:', error);
    return [];
  }
}
