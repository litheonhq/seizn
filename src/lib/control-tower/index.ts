/**
 * Control Tower - Main Module
 *
 * Epic D: Control Tower UI from Paid Features Blueprint
 *
 * Unified monitoring and management dashboard providing:
 * - System health monitoring
 * - Real-time metrics and analytics
 * - Alert management
 * - Configuration management
 */

// Types
export * from './types';

// Health monitoring
export {
  getSystemHealth,
  recordServiceHealth,
  getServiceHealthHistory,
} from './health';

// Metrics collection
export {
  getDashboardMetrics,
  getMetricSeries,
  recordMetric,
} from './metrics';

// Alert management
export {
  getActiveAlerts,
  getAlertHistory,
  createAlert,
  acknowledgeAlert,
  resolveAlert,
  silenceAlert,
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  getNotificationChannels,
  evaluateAlertRules,
} from './alerts';

// Convenience function to get full overview
import { getSystemHealth } from './health';
import { getDashboardMetrics } from './metrics';
import { getActiveAlerts } from './alerts';
import type { ControlTowerOverview, UsageQuota } from './types';
import { createServerClient } from '@/lib/supabase';

/**
 * Get complete Control Tower overview
 */
export async function getControlTowerOverview(
  userId: string,
  organizationId?: string
): Promise<ControlTowerOverview> {
  const [health, metrics, activeAlerts, recentActivity, quotaStatus] = await Promise.all([
    getSystemHealth(),
    getDashboardMetrics(userId, organizationId),
    getActiveAlerts(userId, organizationId),
    getRecentActivity(userId, organizationId),
    getQuotaStatus(userId, organizationId),
  ]);

  return {
    health,
    metrics,
    activeAlerts,
    recentActivity,
    quotaStatus,
  };
}

/**
 * Get recent activity events
 */
async function getRecentActivity(
  userId: string,
  organizationId?: string,
  limit: number = 20
) {
  const supabase = createServerClient();

  let query = supabase
    .from('audit_logs')
    .select('id, user_id, action, resource_type, resource_id, details, created_at, ip_address, user_agent')
    .order('created_at', { ascending: false });

  if (organizationId) {
    query = query.or(`user_id.eq.${userId},organization_id.eq.${organizationId}`);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    console.error('Failed to get recent activity:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    type: row.action,
    actor: {
      id: row.user_id,
      type: 'user' as const,
    },
    resource: {
      type: row.resource_type,
      id: row.resource_id,
    },
    action: row.action,
    details: row.details,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    timestamp: row.created_at,
  }));
}

/**
 * Get usage quota status
 */
async function getQuotaStatus(
  userId: string,
  organizationId?: string
): Promise<UsageQuota[]> {
  const supabase = createServerClient();

  // Get user's plan limits
  const { data: planData } = await supabase
    .from('subscriptions')
    .select('plan, limits')
    .eq('user_id', userId)
    .single();

  const limits = (planData?.limits as Record<string, number>) || {
    api_calls_monthly: 10000,
    storage_bytes: 1073741824, // 1GB
    memories: 10000,
  };

  // Get current usage
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // API calls this month
  let apiCallsQuery = supabase
    .from('api_traces')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', monthStart);

  if (organizationId) {
    apiCallsQuery = apiCallsQuery.eq('organization_id', organizationId);
  } else {
    apiCallsQuery = apiCallsQuery.eq('user_id', userId);
  }

  const { count: apiCalls } = await apiCallsQuery;

  // Total memories
  let memoriesQuery = supabase
    .from('memories')
    .select('id', { count: 'exact', head: true });

  if (organizationId) {
    memoriesQuery = memoriesQuery.eq('organization_id', organizationId);
  } else {
    memoriesQuery = memoriesQuery.eq('user_id', userId);
  }

  const { count: memories } = await memoriesQuery;

  // Storage usage (simplified - would need actual file size tracking)
  const storageUsed = (memories || 0) * 10000; // Rough estimate: 10KB per memory

  return [
    {
      metric: 'api_calls_monthly',
      limit: limits.api_calls_monthly || 10000,
      used: apiCalls || 0,
      resetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    },
    {
      metric: 'storage_bytes',
      limit: limits.storage_bytes || 1073741824,
      used: storageUsed,
    },
    {
      metric: 'memories',
      limit: limits.memories || 10000,
      used: memories || 0,
    },
  ];
}
