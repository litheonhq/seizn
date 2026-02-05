/**
 * Enterprise Auth - Admin Audit Logging Service
 *
 * Provides comprehensive audit logging for SSO, SCIM, RBAC,
 * and other administrative actions for compliance.
 */

import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export type AuditEventCategory =
  | 'auth'
  | 'sso'
  | 'scim'
  | 'rbac'
  | 'api_key'
  | 'policy'
  | 'settings'
  | 'data'
  | 'billing'
  | 'export';

export type AuditEventSeverity = 'info' | 'warning' | 'critical';

export interface AuditEventParams {
  organizationId: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  actorIpAddress?: string;
  actorUserAgent?: string;
  eventCategory: AuditEventCategory;
  eventType: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  requestId?: string;
  sessionId?: string;
  source?: 'web' | 'api' | 'scim' | 'system' | 'cron';
  metadata?: Record<string, unknown>;
}

export interface AuditEvent {
  id: string;
  organizationId: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  actorIpAddress?: string;
  eventCategory: AuditEventCategory;
  eventType: string;
  eventSeverity: AuditEventSeverity;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  action: string;
  success: boolean;
  errorMessage?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditQueryParams {
  organizationId: string;
  category?: AuditEventCategory;
  eventType?: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  severity?: AuditEventSeverity;
  success?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AuditSummary {
  eventCategory: string;
  totalEvents: number;
  successCount: number;
  failureCount: number;
  warningCount: number;
  criticalCount: number;
}

// ============================================
// Audit Logging Functions
// ============================================

/**
 * Log an admin audit event
 */
export async function logAuditEvent(params: AuditEventParams): Promise<string> {
  const supabase = createServerClient();

  // Calculate changes if both states provided
  let changes: Record<string, unknown> | undefined;
  if (params.previousState && params.newState) {
    changes = computeChanges(params.previousState, params.newState);
  }

  const { data, error } = await supabase
    .from('admin_audit_events')
    .insert({
      organization_id: params.organizationId,
      actor_id: params.actorId || null,
      actor_email: params.actorEmail || null,
      actor_role: params.actorRole || null,
      actor_ip_address: params.actorIpAddress || null,
      actor_user_agent: params.actorUserAgent || null,
      event_category: params.eventCategory,
      event_type: params.eventType,
      event_severity: determineSeverity(params.eventType, params.success ?? true),
      resource_type: params.resourceType || null,
      resource_id: params.resourceId || null,
      resource_name: params.resourceName || null,
      action: params.action,
      success: params.success ?? true,
      error_code: params.errorCode || null,
      error_message: params.errorMessage || null,
      previous_state: params.previousState || null,
      new_state: params.newState || null,
      changes: changes || null,
      request_id: params.requestId || null,
      session_id: params.sessionId || null,
      source: params.source || 'api',
      metadata: params.metadata || {},
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to log audit event:', error);
    throw new Error(`Audit logging failed: ${error.message}`);
  }

  return data.id;
}

/**
 * Query audit events with filtering
 */
export async function queryAuditEvents(params: AuditQueryParams): Promise<AuditEvent[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('admin_audit_events')
    .select(`
      id,
      organization_id,
      actor_id,
      actor_email,
      actor_role,
      actor_ip_address,
      event_category,
      event_type,
      event_severity,
      resource_type,
      resource_id,
      resource_name,
      action,
      success,
      error_message,
      changes,
      metadata,
      created_at
    `)
    .eq('organization_id', params.organizationId)
    .order('created_at', { ascending: false });

  if (params.category) {
    query = query.eq('event_category', params.category);
  }
  if (params.eventType) {
    query = query.eq('event_type', params.eventType);
  }
  if (params.actorId) {
    query = query.eq('actor_id', params.actorId);
  }
  if (params.resourceType) {
    query = query.eq('resource_type', params.resourceType);
  }
  if (params.resourceId) {
    query = query.eq('resource_id', params.resourceId);
  }
  if (params.severity) {
    query = query.eq('event_severity', params.severity);
  }
  if (params.success !== undefined) {
    query = query.eq('success', params.success);
  }
  if (params.startDate) {
    query = query.gte('created_at', params.startDate);
  }
  if (params.endDate) {
    query = query.lte('created_at', params.endDate);
  }

  query = query.limit(params.limit || 100);
  if (params.offset) {
    query = query.range(params.offset, params.offset + (params.limit || 100) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to query audit events: ${error.message}`);
  }

  return (data || []).map(mapAuditEvent);
}

/**
 * Get audit summary statistics
 */
export async function getAuditSummary(
  organizationId: string,
  days: number = 30
): Promise<AuditSummary[]> {
  const supabase = createServerClient();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('admin_audit_events')
    .select('event_category, event_severity, success')
    .eq('organization_id', organizationId)
    .gte('created_at', startDate.toISOString());

  if (error) {
    throw new Error(`Failed to get audit summary: ${error.message}`);
  }

  // Aggregate by category
  const summaryMap = new Map<string, AuditSummary>();

  for (const event of data || []) {
    const existing = summaryMap.get(event.event_category) || {
      eventCategory: event.event_category,
      totalEvents: 0,
      successCount: 0,
      failureCount: 0,
      warningCount: 0,
      criticalCount: 0,
    };

    existing.totalEvents++;
    if (event.success) {
      existing.successCount++;
    } else {
      existing.failureCount++;
    }
    if (event.event_severity === 'warning') {
      existing.warningCount++;
    }
    if (event.event_severity === 'critical') {
      existing.criticalCount++;
    }

    summaryMap.set(event.event_category, existing);
  }

  return Array.from(summaryMap.values()).sort((a, b) => b.totalEvents - a.totalEvents);
}

// ============================================
// Convenience Logging Functions
// ============================================

/**
 * Log SSO-related event
 */
export async function logSSOEvent(
  organizationId: string,
  eventType: string,
  params: Partial<AuditEventParams>
): Promise<string> {
  return logAuditEvent({
    organizationId,
    eventCategory: 'sso',
    eventType,
    action: eventType.replace(/_/g, ' '),
    ...params,
  });
}

/**
 * Log SCIM-related event
 */
export async function logSCIMEvent(
  organizationId: string,
  eventType: string,
  params: Partial<AuditEventParams>
): Promise<string> {
  return logAuditEvent({
    organizationId,
    eventCategory: 'scim',
    eventType,
    action: eventType.replace(/_/g, ' '),
    source: 'scim',
    ...params,
  });
}

/**
 * Log RBAC-related event
 */
export async function logRBACEvent(
  organizationId: string,
  eventType: string,
  params: Partial<AuditEventParams>
): Promise<string> {
  return logAuditEvent({
    organizationId,
    eventCategory: 'rbac',
    eventType,
    action: eventType.replace(/_/g, ' '),
    ...params,
  });
}

/**
 * Log API key-related event
 */
export async function logAPIKeyEvent(
  organizationId: string,
  eventType: string,
  params: Partial<AuditEventParams>
): Promise<string> {
  return logAuditEvent({
    organizationId,
    eventCategory: 'api_key',
    eventType,
    action: eventType.replace(/_/g, ' '),
    ...params,
  });
}

/**
 * Log authentication event
 */
export async function logAuthEvent(
  organizationId: string,
  eventType: string,
  params: Partial<AuditEventParams>
): Promise<string> {
  return logAuditEvent({
    organizationId,
    eventCategory: 'auth',
    eventType,
    action: eventType.replace(/_/g, ' '),
    ...params,
  });
}

// ============================================
// Export Functions
// ============================================

/**
 * Export audit events to CSV
 */
export function exportAuditEventsToCSV(events: AuditEvent[]): string {
  const headers = [
    'Timestamp',
    'Category',
    'Event Type',
    'Severity',
    'Actor Email',
    'Action',
    'Resource Type',
    'Resource ID',
    'Resource Name',
    'Success',
    'Error Message',
  ];

  const rows = events.map((e) => [
    e.createdAt,
    e.eventCategory,
    e.eventType,
    e.eventSeverity,
    e.actorEmail || '',
    e.action,
    e.resourceType || '',
    e.resourceId || '',
    e.resourceName || '',
    e.success ? 'Yes' : 'No',
    e.errorMessage || '',
  ]);

  return [headers.join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n');
}

/**
 * Export audit events to JSON
 */
export function exportAuditEventsToJSON(events: AuditEvent[]): string {
  return JSON.stringify(events, null, 2);
}

// ============================================
// Helper Functions
// ============================================

function mapAuditEvent(row: any): AuditEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    actorIpAddress: row.actor_ip_address,
    eventCategory: row.event_category,
    eventType: row.event_type,
    eventSeverity: row.event_severity,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    action: row.action,
    success: row.success,
    errorMessage: row.error_message,
    changes: row.changes,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function determineSeverity(eventType: string, success: boolean): AuditEventSeverity {
  // Failed events escalate severity
  if (!success) {
    if (eventType.includes('login') || eventType.includes('auth')) {
      return 'warning';
    }
    if (eventType.includes('delete') || eventType.includes('revoke')) {
      return 'critical';
    }
    return 'warning';
  }

  // Certain successful events are still noteworthy
  if (eventType.includes('delete') || eventType.includes('disabled')) {
    return 'warning';
  }
  if (eventType.includes('violated') || eventType.includes('failed')) {
    return 'critical';
  }

  return 'info';
}

function computeChanges(
  previous: Record<string, unknown>,
  current: Record<string, unknown>
): Record<string, unknown> {
  const added: Record<string, unknown> = {};
  const removed: Record<string, unknown> = {};
  const modified: Record<string, { from: unknown; to: unknown }> = {};

  // Find added and modified
  for (const key of Object.keys(current)) {
    if (!(key in previous)) {
      added[key] = current[key];
    } else if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
      modified[key] = { from: previous[key], to: current[key] };
    }
  }

  // Find removed
  for (const key of Object.keys(previous)) {
    if (!(key in current)) {
      removed[key] = previous[key];
    }
  }

  return { added, removed, modified };
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
