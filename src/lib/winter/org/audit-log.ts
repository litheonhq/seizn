/**
 * Seizn Winter - Audit Log System
 *
 * Comprehensive audit logging for organization activities:
 * - All API calls and operations
 * - Authentication events
 * - Admin actions
 * - Security events
 * - Data access and modifications
 */

import { createServerClient } from '@/lib/supabase';
import type {
  AuditLogEntry,
  AuditLogFilter,
  AuditAction,
  ResourceType,
  PaginatedResult,
} from './types';

// ============================================
// Types
// ============================================

export interface LogAuditEventParams {
  user_id?: string;
  organization_id?: string;
  api_key_id?: string;
  service_account?: string;

  action: AuditAction;
  resource_type: ResourceType;
  resource_id?: string;

  details?: Record<string, unknown>;
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;

  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  session_id?: string;

  status: 'success' | 'failed' | 'denied';
  error_message?: string;
}

export interface AuditSummary {
  total_events: number;
  events_by_action: Record<string, number>;
  events_by_resource: Record<string, number>;
  events_by_status: Record<string, number>;
  top_users: Array<{ user_id: string; count: number }>;
  period_start: string;
  period_end: string;
}

// ============================================
// Audit Log CRUD
// ============================================

/**
 * Log an audit event
 */
export async function logAuditEvent(
  params: LogAuditEventParams
): Promise<string | null> {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: params.user_id,
        organization_id: params.organization_id,
        api_key_id: params.api_key_id,
        action: params.action,
        resource_type: params.resource_type,
        resource_id: params.resource_id,
        details: params.details || {},
        previous_state: params.previous_state,
        new_state: params.new_state,
        ip_address: params.ip_address,
        user_agent: params.user_agent,
        request_id: params.request_id,
        status: params.status,
        error_message: params.error_message,
      })
      .select('id')
      .single();

    if (error) {
      // Silently fail for audit logging - shouldn't break main flow
      console.error('[AuditLog] Failed to log event:', error);
      return null;
    }

    return data.id;
  } catch (err) {
    console.error('[AuditLog] Error logging event:', err);
    return null;
  }
}

/**
 * Log an audit event using the database function (for triggers)
 */
export async function logAuditEventRpc(
  params: LogAuditEventParams
): Promise<string | null> {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase.rpc('log_audit_event', {
      p_user_id: params.user_id || null,
      p_organization_id: params.organization_id || null,
      p_api_key_id: params.api_key_id || null,
      p_action: params.action,
      p_resource_type: params.resource_type,
      p_resource_id: params.resource_id || null,
      p_details: params.details || {},
      p_previous_state: params.previous_state || null,
      p_new_state: params.new_state || null,
      p_ip_address: params.ip_address || null,
      p_user_agent: params.user_agent || null,
      p_status: params.status,
      p_error_message: params.error_message || null,
    });

    if (error) {
      console.error('[AuditLog] RPC failed:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[AuditLog] RPC error:', err);
    return null;
  }
}

/**
 * Get a single audit log entry
 */
export async function getAuditLogEntry(entryId: string): Promise<AuditLogEntry | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('audit_logs')
    .select(
      `
      *,
      user:profiles (
        email,
        full_name
      )
    `
    )
    .eq('id', entryId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return {
    ...data,
    user: data.user as AuditLogEntry['user'],
  } as AuditLogEntry;
}

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(
  filter: AuditLogFilter
): Promise<PaginatedResult<AuditLogEntry>> {
  const supabase = createServerClient();

  const limit = filter.limit || 50;
  const offset = filter.offset || 0;

  let query = supabase
    .from('audit_logs')
    .select(
      `
      *,
      user:profiles (
        email,
        full_name
      )
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Apply filters
  if (filter.organization_id) {
    query = query.eq('organization_id', filter.organization_id);
  }

  if (filter.user_id) {
    query = query.eq('user_id', filter.user_id);
  }

  if (filter.action) {
    if (Array.isArray(filter.action)) {
      query = query.in('action', filter.action);
    } else {
      query = query.eq('action', filter.action);
    }
  }

  if (filter.resource_type) {
    if (Array.isArray(filter.resource_type)) {
      query = query.in('resource_type', filter.resource_type);
    } else {
      query = query.eq('resource_type', filter.resource_type);
    }
  }

  if (filter.resource_id) {
    query = query.eq('resource_id', filter.resource_id);
  }

  if (filter.status) {
    query = query.eq('status', filter.status);
  }

  if (filter.start_date) {
    query = query.gte('created_at', filter.start_date);
  }

  if (filter.end_date) {
    query = query.lte('created_at', filter.end_date);
  }

  if (filter.ip_address) {
    query = query.eq('ip_address', filter.ip_address);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    data: (data || []).map((entry) => ({
      ...entry,
      user: entry.user as AuditLogEntry['user'],
    })) as AuditLogEntry[],
    total: count || 0,
    limit,
    offset,
    has_more: (count || 0) > offset + limit,
  };
}

// ============================================
// Audit Log Analysis
// ============================================

/**
 * Get audit log summary for a period
 */
export async function getAuditSummary(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<AuditSummary> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('audit_logs')
    .select('action, resource_type, status, user_id, created_at')
    .eq('organization_id', organizationId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (error) throw error;

  const entries = data || [];

  // Calculate summaries
  const events_by_action: Record<string, number> = {};
  const events_by_resource: Record<string, number> = {};
  const events_by_status: Record<string, number> = {};
  const user_counts: Record<string, number> = {};

  for (const entry of entries) {
    events_by_action[entry.action] = (events_by_action[entry.action] || 0) + 1;
    events_by_resource[entry.resource_type] =
      (events_by_resource[entry.resource_type] || 0) + 1;
    events_by_status[entry.status] = (events_by_status[entry.status] || 0) + 1;
    if (entry.user_id) {
      user_counts[entry.user_id] = (user_counts[entry.user_id] || 0) + 1;
    }
  }

  // Get top users
  const top_users = Object.entries(user_counts)
    .map(([user_id, count]) => ({ user_id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total_events: entries.length,
    events_by_action,
    events_by_resource,
    events_by_status,
    top_users,
    period_start: startDate.toISOString(),
    period_end: endDate.toISOString(),
  };
}

/**
 * Get security-related audit events
 */
export async function getSecurityEvents(
  organizationId: string,
  startDate?: Date,
  limit?: number
): Promise<AuditLogEntry[]> {
  const securityActions: AuditAction[] = [
    'auth.login_failed',
    'auth.2fa_enabled',
    'auth.2fa_disabled',
    'auth.password_change',
    'security.ip_blocked',
    'security.rate_limited',
    'security.suspicious_activity',
    'api_key.revoke',
    'member.suspend',
    'member.remove',
    'policy.update',
    'pii.detected',
    'pii.denied',
  ];

  return queryAuditLogs({
    organization_id: organizationId,
    action: securityActions,
    start_date: startDate?.toISOString(),
    limit: limit || 100,
  }).then((result) => result.data);
}

/**
 * Get admin-related audit events
 */
export async function getAdminEvents(
  organizationId: string,
  startDate?: Date,
  limit?: number
): Promise<AuditLogEntry[]> {
  const adminActions: AuditAction[] = [
    'org.create',
    'org.update',
    'org.delete',
    'org.settings_change',
    'member.invite',
    'member.role_change',
    'member.remove',
    'member.suspend',
    'team.create',
    'team.delete',
    'policy.create',
    'policy.update',
    'policy.delete',
    'billing.plan_change',
  ];

  return queryAuditLogs({
    organization_id: organizationId,
    action: adminActions,
    start_date: startDate?.toISOString(),
    limit: limit || 100,
  }).then((result) => result.data);
}

/**
 * Get data access events for compliance reporting
 */
export async function getDataAccessEvents(
  organizationId: string,
  startDate?: Date,
  limit?: number
): Promise<AuditLogEntry[]> {
  const dataActions: AuditAction[] = [
    'memory.create',
    'memory.read',
    'memory.update',
    'memory.delete',
    'memory.export',
    'memory.import',
    'collection.create',
    'collection.delete',
    'data.export',
    'data.deletion_requested',
    'data.deletion_completed',
  ];

  return queryAuditLogs({
    organization_id: organizationId,
    action: dataActions,
    start_date: startDate?.toISOString(),
    limit: limit || 100,
  }).then((result) => result.data);
}

// ============================================
// Audit Log Export
// ============================================

export interface ExportedAuditLog {
  timestamp: string;
  user_email?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  status: string;
  ip_address?: string;
  details: string;
}

/**
 * Export audit logs in a flat format for compliance reporting
 */
export async function exportAuditLogs(
  filter: AuditLogFilter
): Promise<ExportedAuditLog[]> {
  // Increase limit for export
  const allLogs: AuditLogEntry[] = [];
  let offset = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const result = await queryAuditLogs({
      ...filter,
      limit: batchSize,
      offset,
    });

    allLogs.push(...result.data);
    hasMore = result.has_more;
    offset += batchSize;

    // Safety limit
    if (offset > 50000) break;
  }

  return allLogs.map((log) => ({
    timestamp: log.created_at,
    user_email: log.user?.email,
    action: log.action,
    resource_type: log.resource_type,
    resource_id: log.resource_id,
    status: log.status,
    ip_address: log.ip_address || undefined,
    details: JSON.stringify(log.details),
  }));
}

/**
 * Export audit logs as CSV
 */
export async function exportAuditLogsAsCsv(
  filter: AuditLogFilter
): Promise<string> {
  const logs = await exportAuditLogs(filter);

  const headers = [
    'Timestamp',
    'User Email',
    'Action',
    'Resource Type',
    'Resource ID',
    'Status',
    'IP Address',
    'Details',
  ];

  const rows = logs.map((log) => [
    log.timestamp,
    log.user_email || '',
    log.action,
    log.resource_type,
    log.resource_id || '',
    log.status,
    log.ip_address || '',
    log.details.replace(/"/g, '""'),
  ]);

  const csv = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  return csv;
}

// ============================================
// Audit Log Cleanup
// ============================================

/**
 * Delete audit logs older than retention period
 */
export async function cleanupOldAuditLogs(
  organizationId: string,
  retentionDays: number
): Promise<number> {
  const supabase = createServerClient();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // First count
  const { count } = await supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .lt('created_at', cutoffDate.toISOString());

  if (!count || count === 0) {
    return 0;
  }

  // Delete in batches
  let deleted = 0;
  const batchSize = 1000;

  while (deleted < count) {
    const { data: toDelete } = await supabase
      .from('audit_logs')
      .select('id')
      .eq('organization_id', organizationId)
      .lt('created_at', cutoffDate.toISOString())
      .limit(batchSize);

    if (!toDelete || toDelete.length === 0) break;

    const ids = toDelete.map((r) => r.id);
    await supabase.from('audit_logs').delete().in('id', ids);

    deleted += ids.length;
  }

  return deleted;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get a human-readable description for an audit action
 */
export function getActionDescription(action: AuditAction): string {
  const descriptions: Record<AuditAction, string> = {
    'memory.create': 'Created a memory',
    'memory.read': 'Read a memory',
    'memory.update': 'Updated a memory',
    'memory.delete': 'Deleted a memory',
    'memory.export': 'Exported memories',
    'memory.import': 'Imported memories',
    'collection.create': 'Created a collection',
    'collection.update': 'Updated a collection',
    'collection.delete': 'Deleted a collection',
    'api_key.create': 'Created an API key',
    'api_key.revoke': 'Revoked an API key',
    'api_key.rotate': 'Rotated an API key',
    'org.create': 'Created organization',
    'org.update': 'Updated organization',
    'org.delete': 'Deleted organization',
    'org.settings_change': 'Changed organization settings',
    'member.invite': 'Invited a member',
    'member.join': 'Joined organization',
    'member.role_change': 'Changed member role',
    'member.remove': 'Removed a member',
    'member.suspend': 'Suspended a member',
    'team.create': 'Created a team',
    'team.update': 'Updated a team',
    'team.delete': 'Deleted a team',
    'team.member_add': 'Added team member',
    'team.member_remove': 'Removed team member',
    'policy.create': 'Created a policy',
    'policy.update': 'Updated a policy',
    'policy.delete': 'Deleted a policy',
    'policy.activate': 'Activated a policy',
    'policy.deactivate': 'Deactivated a policy',
    'policy.version_create': 'Created a policy version draft',
    'policy.version_update': 'Updated a policy version draft',
    'policy.version_publish': 'Published a policy version',
    'policy.version_delete': 'Deleted a policy version draft',
    'policy.version_rollback': 'Rolled back to a previous policy version',
    'webhook.create': 'Created a webhook',
    'webhook.update': 'Updated a webhook',
    'webhook.delete': 'Deleted a webhook',
    'auth.login': 'Logged in',
    'auth.logout': 'Logged out',
    'auth.login_failed': 'Failed login attempt',
    'auth.2fa_enabled': 'Enabled 2FA',
    'auth.2fa_disabled': 'Disabled 2FA',
    'auth.password_change': 'Changed password',
    'security.ip_blocked': 'IP address blocked',
    'security.rate_limited': 'Rate limited',
    'security.suspicious_activity': 'Suspicious activity detected',
    'billing.plan_change': 'Changed billing plan',
    'billing.payment_failed': 'Payment failed',
    'billing.invoice_created': 'Invoice created',
    'pii.detected': 'PII detected',
    'pii.masked': 'PII masked',
    'pii.denied': 'Request denied due to PII',
    'data.export': 'Exported data',
    'data.deletion_requested': 'Data deletion requested',
    'data.deletion_completed': 'Data deletion completed',
  };

  return descriptions[action] || action;
}

/**
 * Categorize an action for filtering/grouping
 */
export function getActionCategory(action: AuditAction): string {
  if (action.startsWith('memory.') || action.startsWith('collection.')) {
    return 'Data';
  }
  if (action.startsWith('api_key.') || action.startsWith('webhook.')) {
    return 'Integration';
  }
  if (action.startsWith('org.') || action.startsWith('member.') || action.startsWith('team.')) {
    return 'Organization';
  }
  if (action.startsWith('policy.')) {
    return 'Policy';
  }
  if (action.startsWith('auth.') || action.startsWith('security.')) {
    return 'Security';
  }
  if (action.startsWith('billing.')) {
    return 'Billing';
  }
  if (action.startsWith('pii.') || action.startsWith('data.')) {
    return 'Compliance';
  }
  return 'Other';
}
