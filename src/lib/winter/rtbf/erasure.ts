/**
 * Seizn Winter - RTBF Erasure Engine
 *
 * Core deletion logic for GDPR Article 17 compliance.
 * Handles soft delete, hard delete, and cascading deletions.
 */

import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { encryptJson } from '../crypto';
import {
  RTBFRequest,
  ErasureScope,
  ErasureScopeParams,
  ErasureStatus,
  ErasurePhase,
  ImpactAnalysis,
  AffectedTable,
  ExecuteRTBFParams,
  ErasureResult,
  DeletedRecordSummary,
  BackupConfig,
  ErasureBackup,
  CreateRTBFRequestParams,
  DEFAULT_RTBF_CONFIG,
  ErasureTableConfig,
} from './types';
import { createAuditLog, updateAuditLog } from './audit';

// ============================================
// Request Management
// ============================================

/**
 * Create a new RTBF (erasure) request
 */
export async function createRTBFRequest(
  params: CreateRTBFRequestParams
): Promise<RTBFRequest> {
  const supabase = createServerClient();

  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();

  const request: Omit<RTBFRequest, 'id'> & { id: string } = {
    id: requestId,
    requester_id: params.requesterId,
    subject_id: params.subjectId,
    scope: params.scope,
    scope_params: params.scopeParams,
    reason: params.reason,
    legal_basis: params.legalBasis,
    retain_audit_log: params.retainAuditLog ?? true,
    status: 'pending',
    phase: 'requested',
    requested_at: now,
  };

  const { error } = await supabase
    .from('winter_rtbf_requests')
    .insert({
      id: request.id,
      requester_id: request.requester_id,
      subject_id: request.subject_id,
      scope: request.scope,
      scope_params: request.scope_params,
      reason: request.reason,
      legal_basis: request.legal_basis,
      retain_audit_log: request.retain_audit_log,
      status: request.status,
      phase: request.phase,
      requested_at: request.requested_at,
    });

  if (error) {
    throw new Error(`Failed to create RTBF request: ${error.message}`);
  }

  // Create initial audit log
  await createAuditLog({
    requestId: request.id,
    requesterId: request.requester_id,
    subjectId: request.subject_id,
    scope: request.scope,
    scopeParams: request.scope_params,
    status: 'pending',
    phase: 'requested',
    metadata: {
      reason: request.reason,
      legal_basis: request.legal_basis,
      initiated_by: 'api',
      execution_mode: 'async',
      dry_run: false,
    },
  });

  return request;
}

/**
 * Get RTBF request by ID
 */
export async function getRTBFRequest(requestId: string): Promise<RTBFRequest | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_rtbf_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as RTBFRequest;
}

/**
 * Update RTBF request status
 */
export async function updateRTBFRequest(
  requestId: string,
  updates: Partial<Pick<RTBFRequest, 'status' | 'phase' | 'processed_at' | 'completed_at'>>
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('winter_rtbf_requests')
    .update(updates)
    .eq('id', requestId);

  if (error) {
    throw new Error(`Failed to update RTBF request: ${error.message}`);
  }
}

// ============================================
// Impact Analysis
// ============================================

/**
 * Analyze the impact of an erasure request before execution
 */
export async function analyzeImpact(
  request: RTBFRequest
): Promise<ImpactAnalysis> {
  const supabase = createServerClient();
  const affectedTables: AffectedTable[] = [];
  let totalRecords = 0;
  let totalSizeBytes = 0;
  const warnings: string[] = [];

  // Update phase
  await updateRTBFRequest(request.id, { phase: 'analyzing' });

  // Build query conditions based on scope
  const conditions = buildScopeConditions(request.scope, request.scope_params);

  // Check each configured table
  for (const tableConfig of DEFAULT_RTBF_CONFIG.erasure_tables) {
    try {
      const count = await countAffectedRecords(
        supabase,
        tableConfig,
        conditions
      );

      if (count > 0) {
        const estimatedSize = count * 1024; // Rough estimate: 1KB per record

        affectedTables.push({
          table_name: tableConfig.table_name,
          record_count: count,
          estimated_size_bytes: estimatedSize,
          has_cascade: tableConfig.has_cascade,
          cascade_tables: tableConfig.has_cascade
            ? getCascadeTables(tableConfig.table_name)
            : undefined,
        });

        totalRecords += count;
        totalSizeBytes += estimatedSize;
      }
    } catch (err) {
      // Table might not exist, skip
      warnings.push(`Could not analyze table ${tableConfig.table_name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Estimate duration (rough: 100ms per 100 records)
  const estimatedDuration = Math.max(5, Math.ceil(totalRecords / 100) * 0.1);

  return {
    request_id: request.id,
    affected_tables: affectedTables,
    total_records: totalRecords,
    total_size_bytes: totalSizeBytes,
    has_dependencies: affectedTables.some((t) => t.has_cascade),
    dependencies: [],
    warnings,
    estimated_duration_seconds: estimatedDuration,
  };
}

/**
 * Build query conditions based on erasure scope
 */
function buildScopeConditions(
  scope: ErasureScope,
  params: ErasureScopeParams
): Record<string, unknown> {
  switch (scope) {
    case 'user':
      return { user_id: params.user_id };

    case 'memory':
      return { memory_ids: params.memory_ids };

    case 'namespace':
      return {
        user_id: params.user_id_for_namespace,
        namespace: params.namespace,
      };

    case 'date_range':
      return {
        user_id: params.user_id_for_date_range,
        date_from: params.date_from,
        date_to: params.date_to,
      };

    default:
      throw new Error(`Unknown erasure scope: ${scope}`);
  }
}

/**
 * Count affected records in a table
 */
async function countAffectedRecords(
  supabase: ReturnType<typeof createServerClient>,
  tableConfig: ErasureTableConfig,
  conditions: Record<string, unknown>
): Promise<number> {
  let query = supabase
    .from(tableConfig.table_name)
    .select('*', { count: 'exact', head: true });

  // Apply user_id condition
  if (conditions.user_id) {
    query = query.eq(tableConfig.user_id_column, conditions.user_id);
  }

  // Apply memory_ids condition (for memory scope)
  if (conditions.memory_ids && Array.isArray(conditions.memory_ids)) {
    query = query.in('id', conditions.memory_ids);
  }

  // Apply namespace condition
  if (conditions.namespace && tableConfig.table_name === 'memories') {
    query = query.eq('namespace', conditions.namespace);
  }

  // Apply date range condition
  if (conditions.date_from) {
    query = query.gte('created_at', conditions.date_from);
  }
  if (conditions.date_to) {
    query = query.lte('created_at', conditions.date_to);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count ?? 0;
}

/**
 * Get tables that cascade from a parent table
 */
function getCascadeTables(tableName: string): string[] {
  const cascadeMap: Record<string, string[]> = {
    summer_collections: ['summer_documents', 'summer_chunks'],
    summer_documents: ['summer_chunks'],
    fall_eval_datasets: ['fall_eval_examples'],
    fall_experiments: ['fall_experiment_runs', 'fall_experiment_results'],
  };

  return cascadeMap[tableName] || [];
}

// ============================================
// Erasure Execution
// ============================================

/**
 * Execute RTBF erasure request
 */
export async function executeErasure(
  params: ExecuteRTBFParams
): Promise<ErasureResult> {
  const supabase = createServerClient();
  const startTime = Date.now();
  const deletedRecords: DeletedRecordSummary[] = [];
  let totalDeleted = 0;

  // Get request
  const request = await getRTBFRequest(params.requestId);
  if (!request) {
    throw new Error(`RTBF request not found: ${params.requestId}`);
  }

  // Check status
  if (request.status !== 'pending') {
    throw new Error(`Cannot execute request in status: ${request.status}`);
  }

  try {
    // Update status to processing
    await updateRTBFRequest(request.id, {
      status: 'processing',
      phase: 'analyzing',
      processed_at: new Date().toISOString(),
    });

    // Analyze impact
    const impact = await analyzeImpact(request);

    // Dry run check
    if (params.dryRun) {
      return {
        request_id: request.id,
        success: true,
        phase: 'completed',
        deleted_records: impact.affected_tables.map((t) => ({
          table_name: t.table_name,
          deleted_count: t.record_count,
          soft_deleted: t.record_count,
          hard_deleted: 0,
        })),
        total_deleted: impact.total_records,
        duration_ms: Date.now() - startTime,
      };
    }

    // Create backup if enabled
    if (!params.skipBackup && DEFAULT_RTBF_CONFIG.backup.enabled) {
      await updateRTBFRequest(request.id, { phase: 'backing_up' });
      await createErasureBackup(request, impact);
    }

    // Build conditions
    const conditions = buildScopeConditions(request.scope, request.scope_params);

    // Phase 1: Soft delete (mark as deleted)
    await updateRTBFRequest(request.id, { phase: 'soft_delete' });
    const softDeleteResults = await executeSoftDelete(supabase, conditions);
    for (const result of softDeleteResults) {
      deletedRecords.push({
        table_name: result.table_name,
        deleted_count: result.count,
        soft_deleted: result.count,
        hard_deleted: 0,
      });
      totalDeleted += result.count;
    }

    // Grace period delay (configurable)
    if (DEFAULT_RTBF_CONFIG.hard_delete_delay_seconds > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, DEFAULT_RTBF_CONFIG.hard_delete_delay_seconds * 1000)
      );
    }

    // Phase 2: Hard delete (physical removal)
    await updateRTBFRequest(request.id, { phase: 'hard_delete' });
    const hardDeleteResults = await executeHardDelete(supabase, conditions);

    // Update deleted records with hard delete counts
    for (const result of hardDeleteResults) {
      const existing = deletedRecords.find((r) => r.table_name === result.table_name);
      if (existing) {
        existing.hard_deleted = result.count;
      } else {
        deletedRecords.push({
          table_name: result.table_name,
          deleted_count: result.count,
          soft_deleted: 0,
          hard_deleted: result.count,
        });
        totalDeleted += result.count;
      }
    }

    // Generate verification hash
    const verificationHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ request_id: request.id, deleted: deletedRecords, timestamp: Date.now() }))
      .digest('hex');

    // Update status to completed
    await updateRTBFRequest(request.id, {
      status: 'completed',
      phase: 'completed',
      completed_at: new Date().toISOString(),
    });

    // Update audit log
    await updateAuditLog(request.id, {
      status: 'completed',
      phase: 'completed',
      affected_tables: deletedRecords.map((r) => r.table_name),
      affected_count: totalDeleted,
      verification_hash: verificationHash,
      completed_at: new Date().toISOString(),
    });

    return {
      request_id: request.id,
      success: true,
      phase: 'completed',
      deleted_records: deletedRecords,
      total_deleted: totalDeleted,
      verification_hash: verificationHash,
      duration_ms: Date.now() - startTime,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // Update status to failed
    await updateRTBFRequest(request.id, {
      status: 'failed',
      phase: 'failed',
    });

    // Update audit log
    await updateAuditLog(request.id, {
      status: 'failed',
      phase: 'failed',
      error: errorMessage,
    });

    return {
      request_id: request.id,
      success: false,
      phase: 'failed',
      deleted_records: deletedRecords,
      total_deleted: totalDeleted,
      error: errorMessage,
      duration_ms: Date.now() - startTime,
    };
  }
}

/**
 * Execute soft delete (mark records as deleted)
 */
async function executeSoftDelete(
  supabase: ReturnType<typeof createServerClient>,
  conditions: Record<string, unknown>
): Promise<Array<{ table_name: string; count: number }>> {
  const results: Array<{ table_name: string; count: number }> = [];

  // Only update tables with soft delete column
  const tablesWithSoftDelete = DEFAULT_RTBF_CONFIG.erasure_tables.filter(
    (t) => t.soft_delete_column
  );

  for (const tableConfig of tablesWithSoftDelete) {
    try {
      // First count the records to be updated
      let countQuery = supabase
        .from(tableConfig.table_name)
        .select('*', { count: 'exact', head: true })
        .eq(tableConfig.user_id_column, conditions.user_id);

      // Apply additional conditions for count
      if (conditions.memory_ids && Array.isArray(conditions.memory_ids)) {
        countQuery = countQuery.in('id', conditions.memory_ids);
      }
      if (conditions.namespace) {
        countQuery = countQuery.eq('namespace', conditions.namespace);
      }
      if (conditions.date_from) {
        countQuery = countQuery.gte('created_at', conditions.date_from);
      }
      if (conditions.date_to) {
        countQuery = countQuery.lte('created_at', conditions.date_to);
      }

      const { count: preCount } = await countQuery;

      // Then update the records
      let updateQuery = supabase
        .from(tableConfig.table_name)
        .update({ [tableConfig.soft_delete_column!]: true, deleted_at: new Date().toISOString() })
        .eq(tableConfig.user_id_column, conditions.user_id);

      // Apply additional conditions for update
      if (conditions.memory_ids && Array.isArray(conditions.memory_ids)) {
        updateQuery = updateQuery.in('id', conditions.memory_ids);
      }
      if (conditions.namespace) {
        updateQuery = updateQuery.eq('namespace', conditions.namespace);
      }
      if (conditions.date_from) {
        updateQuery = updateQuery.gte('created_at', conditions.date_from);
      }
      if (conditions.date_to) {
        updateQuery = updateQuery.lte('created_at', conditions.date_to);
      }

      const { error } = await updateQuery;

      if (!error) {
        results.push({ table_name: tableConfig.table_name, count: preCount ?? 0 });
      }
    } catch {
      // Continue with other tables
    }
  }

  return results;
}

/**
 * Execute hard delete (physical removal)
 */
async function executeHardDelete(
  supabase: ReturnType<typeof createServerClient>,
  conditions: Record<string, unknown>
): Promise<Array<{ table_name: string; count: number }>> {
  const results: Array<{ table_name: string; count: number }> = [];

  // Sort tables by priority (delete in correct order for cascades)
  const sortedTables = [...DEFAULT_RTBF_CONFIG.erasure_tables].sort(
    (a, b) => a.priority - b.priority
  );

  for (const tableConfig of sortedTables) {
    try {
      // First count
      let countQuery = supabase
        .from(tableConfig.table_name)
        .select('*', { count: 'exact', head: true })
        .eq(tableConfig.user_id_column, conditions.user_id);

      // Apply additional conditions
      if (conditions.memory_ids && Array.isArray(conditions.memory_ids)) {
        countQuery = countQuery.in('id', conditions.memory_ids);
      }
      if (conditions.namespace) {
        countQuery = countQuery.eq('namespace', conditions.namespace);
      }
      if (conditions.date_from) {
        countQuery = countQuery.gte('created_at', conditions.date_from);
      }
      if (conditions.date_to) {
        countQuery = countQuery.lte('created_at', conditions.date_to);
      }

      const { count: preCount } = await countQuery;

      // Then delete
      let deleteQuery = supabase
        .from(tableConfig.table_name)
        .delete()
        .eq(tableConfig.user_id_column, conditions.user_id);

      // Apply additional conditions
      if (conditions.memory_ids && Array.isArray(conditions.memory_ids)) {
        deleteQuery = deleteQuery.in('id', conditions.memory_ids);
      }
      if (conditions.namespace) {
        deleteQuery = deleteQuery.eq('namespace', conditions.namespace);
      }
      if (conditions.date_from) {
        deleteQuery = deleteQuery.gte('created_at', conditions.date_from);
      }
      if (conditions.date_to) {
        deleteQuery = deleteQuery.lte('created_at', conditions.date_to);
      }

      await deleteQuery;

      results.push({ table_name: tableConfig.table_name, count: preCount ?? 0 });
    } catch {
      // Continue with other tables
    }
  }

  return results;
}

// ============================================
// Backup Functions
// ============================================

/**
 * Create encrypted backup before erasure
 */
async function createErasureBackup(
  request: RTBFRequest,
  impact: ImpactAnalysis
): Promise<ErasureBackup | null> {
  const supabase = createServerClient();
  const backupConfig = DEFAULT_RTBF_CONFIG.backup;

  if (!backupConfig.enabled) {
    return null;
  }

  try {
    // Collect data from affected tables
    const backupData: Record<string, unknown[]> = {};
    const conditions = buildScopeConditions(request.scope, request.scope_params);

    for (const table of impact.affected_tables) {
      const tableConfig = DEFAULT_RTBF_CONFIG.erasure_tables.find(
        (t) => t.table_name === table.table_name
      );

      if (!tableConfig) continue;

      const query = supabase
        .from(tableConfig.table_name)
        .select('*')
        .eq(tableConfig.user_id_column, conditions.user_id)
        .limit(10000); // Safety limit

      const { data } = await query;
      if (data && data.length > 0) {
        backupData[table.table_name] = data;
      }
    }

    // Encrypt backup data
    const encryptedData = encryptJson(backupData);
    const dataHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(backupData))
      .digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + backupConfig.retention_days);

    const backup: Omit<ErasureBackup, 'id'> = {
      request_id: request.id,
      backup_data: encryptedData,
      data_hash: dataHash,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      legal_hold: backupConfig.legal_hold ?? false,
    };

    const { data, error } = await supabase
      .from('winter_rtbf_backups')
      .insert(backup)
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create backup:', error);
      return null;
    }

    return { ...backup, id: data.id };
  } catch (err) {
    console.error('Backup creation failed:', err);
    return null;
  }
}

// ============================================
// Cancel Request
// ============================================

/**
 * Cancel a pending RTBF request
 */
export async function cancelRTBFRequest(requestId: string): Promise<boolean> {
  const request = await getRTBFRequest(requestId);

  if (!request) {
    throw new Error(`RTBF request not found: ${requestId}`);
  }

  if (request.status !== 'pending') {
    throw new Error(`Cannot cancel request in status: ${request.status}`);
  }

  await updateRTBFRequest(requestId, {
    status: 'cancelled',
    phase: 'completed',
    completed_at: new Date().toISOString(),
  });

  await updateAuditLog(requestId, {
    status: 'cancelled',
    phase: 'completed',
    completed_at: new Date().toISOString(),
  });

  return true;
}

// ============================================
// List Requests
// ============================================

/**
 * List RTBF requests for a user
 */
export async function listRTBFRequests(
  userId: string,
  options?: {
    status?: ErasureStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{ requests: RTBFRequest[]; total: number }> {
  const supabase = createServerClient();

  let query = supabase
    .from('winter_rtbf_requests')
    .select('*', { count: 'exact' })
    .eq('requester_id', userId)
    .order('requested_at', { ascending: false });

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to list RTBF requests: ${error.message}`);
  }

  return {
    requests: (data || []) as RTBFRequest[],
    total: count || 0,
  };
}
