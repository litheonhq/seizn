/**
 * Seizn Winter - RTBF Audit Logging
 *
 * Comprehensive audit trail for GDPR Article 17 compliance.
 * Maintains immutable records of all erasure requests and executions.
 */

import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase';
import {
  RTBFAuditLog,
  RTBFAuditResponse,
  ErasureScope,
  ErasureScopeParams,
  ErasureStatus,
  ErasurePhase,
  RTBFMetadata,
} from './types';

// ============================================
// Audit Log Creation
// ============================================

export interface CreateAuditLogParams {
  requestId: string;
  requesterId: string;
  subjectId: string;
  scope: ErasureScope;
  scopeParams: ErasureScopeParams;
  status: ErasureStatus;
  phase: ErasurePhase;
  metadata?: Partial<RTBFMetadata>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create a new audit log entry for an RTBF request
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<RTBFAuditLog> {
  const supabase = createServerClient();

  const auditLog: Omit<RTBFAuditLog, 'id'> = {
    request_id: params.requestId,
    requester_id: params.requesterId,
    subject_id: params.subjectId,
    scope: params.scope,
    scope_params: params.scopeParams,
    affected_tables: [],
    affected_count: 0,
    status: params.status,
    phase: params.phase,
    metadata: {
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
      reason: params.metadata?.reason,
      legal_basis: params.metadata?.legal_basis,
      initiated_by: params.metadata?.initiated_by || 'api',
      execution_mode: params.metadata?.execution_mode || 'async',
      dry_run: params.metadata?.dry_run || false,
    },
    requested_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('winter_rtbf_audit_logs')
    .insert({
      request_id: auditLog.request_id,
      requester_id: auditLog.requester_id,
      subject_id: auditLog.subject_id,
      scope: auditLog.scope,
      scope_params: auditLog.scope_params,
      affected_tables: auditLog.affected_tables,
      affected_count: auditLog.affected_count,
      status: auditLog.status,
      phase: auditLog.phase,
      metadata: auditLog.metadata,
      requested_at: auditLog.requested_at,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create audit log: ${error.message}`);
  }

  return { ...auditLog, id: data.id };
}

// ============================================
// Audit Log Updates
// ============================================

export interface UpdateAuditLogParams {
  status?: ErasureStatus;
  phase?: ErasurePhase;
  affected_tables?: string[];
  affected_count?: number;
  verification_hash?: string;
  backup_id?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

/**
 * Update an existing audit log entry
 */
export async function updateAuditLog(
  requestId: string,
  updates: UpdateAuditLogParams
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('winter_rtbf_audit_logs')
    .update(updates)
    .eq('request_id', requestId);

  if (error) {
    throw new Error(`Failed to update audit log: ${error.message}`);
  }
}

/**
 * Mark audit log as started
 */
export async function markAuditLogStarted(requestId: string): Promise<void> {
  await updateAuditLog(requestId, {
    status: 'processing',
    phase: 'analyzing',
    started_at: new Date().toISOString(),
  });
}

/**
 * Mark audit log as completed with results
 */
export async function markAuditLogCompleted(
  requestId: string,
  results: {
    affectedTables: string[];
    affectedCount: number;
    verificationHash: string;
    backupId?: string;
  }
): Promise<void> {
  await updateAuditLog(requestId, {
    status: 'completed',
    phase: 'completed',
    affected_tables: results.affectedTables,
    affected_count: results.affectedCount,
    verification_hash: results.verificationHash,
    backup_id: results.backupId,
    completed_at: new Date().toISOString(),
  });
}

/**
 * Mark audit log as failed
 */
export async function markAuditLogFailed(
  requestId: string,
  error: string
): Promise<void> {
  await updateAuditLog(requestId, {
    status: 'failed',
    phase: 'failed',
    error,
    completed_at: new Date().toISOString(),
  });
}

// ============================================
// Audit Log Queries
// ============================================

export interface AuditLogQueryParams {
  userId?: string;
  requestId?: string;
  subjectId?: string;
  scope?: ErasureScope;
  status?: ErasureStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
}

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(
  params: AuditLogQueryParams
): Promise<RTBFAuditResponse> {
  const supabase = createServerClient();
  const page = params.page || 1;
  const perPage = params.perPage || 20;
  const offset = (page - 1) * perPage;

  let query = supabase
    .from('winter_rtbf_audit_logs')
    .select('*', { count: 'exact' })
    .order('requested_at', { ascending: false });

  // Apply filters
  if (params.userId) {
    query = query.eq('requester_id', params.userId);
  }

  if (params.requestId) {
    query = query.eq('request_id', params.requestId);
  }

  if (params.subjectId) {
    query = query.eq('subject_id', params.subjectId);
  }

  if (params.scope) {
    query = query.eq('scope', params.scope);
  }

  if (params.status) {
    query = query.eq('status', params.status);
  }

  if (params.dateFrom) {
    query = query.gte('requested_at', params.dateFrom);
  }

  if (params.dateTo) {
    query = query.lte('requested_at', params.dateTo);
  }

  // Apply pagination
  query = query.range(offset, offset + perPage - 1);

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to query audit logs: ${error.message}`);
  }

  return {
    logs: (data || []) as RTBFAuditLog[],
    total_count: count || 0,
    page,
    per_page: perPage,
  };
}

/**
 * Get single audit log by request ID
 */
export async function getAuditLog(requestId: string): Promise<RTBFAuditLog | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_rtbf_audit_logs')
    .select('*')
    .eq('request_id', requestId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as RTBFAuditLog;
}

// ============================================
// Audit Log Statistics
// ============================================

export interface AuditStatistics {
  total_requests: number;
  completed_requests: number;
  failed_requests: number;
  pending_requests: number;
  total_records_deleted: number;
  requests_by_scope: Record<ErasureScope, number>;
  average_completion_time_ms: number;
}

/**
 * Get audit statistics for a user or globally (admin)
 */
export async function getAuditStatistics(userId?: string): Promise<AuditStatistics> {
  const supabase = createServerClient();

  let query = supabase
    .from('winter_rtbf_audit_logs')
    .select('status, scope, affected_count, requested_at, completed_at');

  if (userId) {
    query = query.eq('requester_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get audit statistics: ${error.message}`);
  }

  const logs = data || [];

  // Calculate statistics
  const stats: AuditStatistics = {
    total_requests: logs.length,
    completed_requests: logs.filter((l) => l.status === 'completed').length,
    failed_requests: logs.filter((l) => l.status === 'failed').length,
    pending_requests: logs.filter((l) => l.status === 'pending' || l.status === 'processing').length,
    total_records_deleted: logs.reduce((sum, l) => sum + (l.affected_count || 0), 0),
    requests_by_scope: {
      user: logs.filter((l) => l.scope === 'user').length,
      memory: logs.filter((l) => l.scope === 'memory').length,
      namespace: logs.filter((l) => l.scope === 'namespace').length,
      date_range: logs.filter((l) => l.scope === 'date_range').length,
    },
    average_completion_time_ms: 0,
  };

  // Calculate average completion time
  const completedLogs = logs.filter(
    (l) => l.status === 'completed' && l.requested_at && l.completed_at
  );

  if (completedLogs.length > 0) {
    const totalTime = completedLogs.reduce((sum, l) => {
      const start = new Date(l.requested_at).getTime();
      const end = new Date(l.completed_at).getTime();
      return sum + (end - start);
    }, 0);
    stats.average_completion_time_ms = Math.round(totalTime / completedLogs.length);
  }

  return stats;
}

// ============================================
// Audit Hash Generation
// ============================================

/**
 * Generate verification hash for audit trail integrity
 */
export function generateVerificationHash(data: {
  requestId: string;
  subjectId: string;
  affectedTables: string[];
  affectedCount: number;
  timestamp: string;
}): string {
  const hashInput = JSON.stringify({
    request_id: data.requestId,
    subject_id: data.subjectId,
    affected_tables: data.affectedTables.sort(),
    affected_count: data.affectedCount,
    timestamp: data.timestamp,
  });

  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Verify audit log integrity
 */
export function verifyAuditLogIntegrity(log: RTBFAuditLog): boolean {
  if (!log.verification_hash || !log.completed_at) {
    return false;
  }

  const expectedHash = generateVerificationHash({
    requestId: log.request_id,
    subjectId: log.subject_id,
    affectedTables: log.affected_tables,
    affectedCount: log.affected_count,
    timestamp: log.completed_at,
  });

  return expectedHash === log.verification_hash;
}

// ============================================
// Compliance Report Generation
// ============================================

export interface ComplianceReport {
  generated_at: string;
  period: { from: string; to: string };
  user_id?: string;
  summary: AuditStatistics;
  requests: Array<{
    request_id: string;
    subject_id: string;
    scope: ErasureScope;
    status: ErasureStatus;
    affected_count: number;
    requested_at: string;
    completed_at?: string;
    legal_basis?: string;
  }>;
  verification_hash: string;
}

/**
 * Generate GDPR compliance report for audit purposes
 */
export async function generateComplianceReport(
  dateFrom: string,
  dateTo: string,
  userId?: string
): Promise<ComplianceReport> {
  const supabase = createServerClient();

  let query = supabase
    .from('winter_rtbf_audit_logs')
    .select('*')
    .gte('requested_at', dateFrom)
    .lte('requested_at', dateTo)
    .order('requested_at', { ascending: true });

  if (userId) {
    query = query.eq('requester_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to generate compliance report: ${error.message}`);
  }

  const logs = (data || []) as RTBFAuditLog[];
  const statistics = await getAuditStatistics(userId);

  const requests = logs.map((log) => ({
    request_id: log.request_id,
    subject_id: log.subject_id,
    scope: log.scope,
    status: log.status,
    affected_count: log.affected_count,
    requested_at: log.requested_at,
    completed_at: log.completed_at,
    legal_basis: log.metadata?.legal_basis,
  }));

  const report: ComplianceReport = {
    generated_at: new Date().toISOString(),
    period: { from: dateFrom, to: dateTo },
    user_id: userId,
    summary: statistics,
    requests,
    verification_hash: '',
  };

  // Generate report verification hash
  report.verification_hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ ...report, verification_hash: undefined }))
    .digest('hex');

  return report;
}
