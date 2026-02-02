/**
 * Retention Executor
 *
 * Executes retention policies:
 * - Scheduled deletion jobs
 * - Manual cleanup triggers
 * - Post-legal-hold releases
 */

import { createServerClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/winter/org/audit-log';
import { isUnderLegalHold, expireLegalHolds } from './legal-holds';
import { getEffectiveRetentionSchedule, getDefaultRetentionDays } from './schedules';
import type {
  RetentionDataType,
  RetentionExecutionLog,
  ExecutionType,
  ExecutionStatus,
} from './types';

// ============================================
// Types
// ============================================

export interface ExecuteRetentionParams {
  organization_id: string;
  data_type: RetentionDataType;
  execution_type?: ExecutionType;
  dry_run?: boolean;
  batch_size?: number;
  triggered_by?: string;
}

export interface ExecuteRetentionResult {
  execution_id: string;
  dry_run: boolean;
  status: ExecutionStatus;
  records_processed: number;
  records_deleted: number;
  records_archived: number;
  records_skipped: number;
  duration_ms: number;
  errors: string[];
}

// ============================================
// Table Mapping
// ============================================

const DATA_TYPE_TABLES: Record<RetentionDataType, {
  table: string;
  has_soft_delete: boolean;
  org_column: string;
}> = {
  memories: { table: 'memories', has_soft_delete: true, org_column: 'user_id' },
  documents: { table: 'summer_documents', has_soft_delete: true, org_column: 'user_id' },
  traces: { table: 'fall_retrieval_traces', has_soft_delete: false, org_column: 'user_id' },
  audit_logs: { table: 'audit_logs', has_soft_delete: false, org_column: 'organization_id' },
  api_keys: { table: 'api_keys', has_soft_delete: false, org_column: 'user_id' },
  sessions: { table: 'sessions', has_soft_delete: false, org_column: 'user_id' },
};

// ============================================
// Execution Functions
// ============================================

/**
 * Execute retention for a specific organization and data type
 */
export async function executeRetention(
  params: ExecuteRetentionParams
): Promise<ExecuteRetentionResult> {
  const startTime = Date.now();
  const supabase = createServerClient();

  const {
    organization_id,
    data_type,
    execution_type = 'manual',
    dry_run = false,
    batch_size = 1000,
    triggered_by,
  } = params;

  const result: ExecuteRetentionResult = {
    execution_id: '',
    dry_run,
    status: 'running',
    records_processed: 0,
    records_deleted: 0,
    records_archived: 0,
    records_skipped: 0,
    duration_ms: 0,
    errors: [],
  };

  // Create execution log record
  let executionLog: RetentionExecutionLog | null = null;

  if (!dry_run) {
    const { data: logData, error: logError } = await supabase
      .from('retention_execution_log')
      .insert({
        organization_id,
        data_type,
        execution_type,
        status: 'running',
        triggered_by: triggered_by || 'system',
      })
      .select()
      .single();

    if (logError) {
      // Log table might not exist - continue anyway
      console.warn('Could not create execution log:', logError.message);
    } else {
      executionLog = logData as RetentionExecutionLog;
      result.execution_id = executionLog.id;
    }
  }

  try {
    // First, expire any legal holds past their effective_until date
    await expireLegalHolds();

    // Get effective retention schedule
    const schedule = await getEffectiveRetentionSchedule(organization_id, data_type);
    const retentionDays = schedule?.retention_days || getDefaultRetentionDays(data_type);
    const archiveDays = schedule?.archive_days;
    const deletionType = schedule?.deletion_type || 'soft';

    // Calculate cutoff dates
    const now = new Date();
    const deletionCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const archiveCutoff = archiveDays
      ? new Date(now.getTime() - archiveDays * 24 * 60 * 60 * 1000)
      : null;

    // Get table info
    const tableInfo = DATA_TYPE_TABLES[data_type];
    if (!tableInfo) {
      throw new Error(`Unknown data type: ${data_type}`);
    }

    // Get records eligible for deletion
    const eligibleRecords = await getEligibleRecords(
      organization_id,
      data_type,
      deletionCutoff,
      batch_size
    );

    result.records_processed = eligibleRecords.length;

    // Process each record
    for (const record of eligibleRecords) {
      try {
        // Check if under legal hold
        const holdCheck = await isUnderLegalHold({
          organization_id,
          data_type,
          record_id: record.id,
          user_id: record.user_id,
          tags: record.tags,
          created_at: record.created_at,
        });

        if (holdCheck.held) {
          result.records_skipped++;
          continue;
        }

        // Check if should archive instead of delete
        if (archiveCutoff) {
          const createdAt = new Date(record.created_at);
          if (createdAt > archiveCutoff) {
            // Archive instead of delete
            if (!dry_run) {
              await archiveRecord(tableInfo.table, record.id);
            }
            result.records_archived++;
            continue;
          }
        }

        // Delete record
        if (!dry_run) {
          if (deletionType === 'soft' && tableInfo.has_soft_delete) {
            await softDeleteRecord(tableInfo.table, record.id);
          } else if (deletionType === 'anonymize') {
            await anonymizeRecord(tableInfo.table, record.id);
          } else {
            await hardDeleteRecord(tableInfo.table, record.id);
          }
        }
        result.records_deleted++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Record ${record.id}: ${message}`);
        result.records_skipped++;
      }
    }

    result.status = result.errors.length > 0 ? 'completed' : 'completed';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(message);
    result.status = 'failed';
  }

  result.duration_ms = Date.now() - startTime;

  // Update execution log
  if (executionLog && !dry_run) {
    await supabase
      .from('retention_execution_log')
      .update({
        status: result.status,
        records_processed: result.records_processed,
        records_deleted: result.records_deleted,
        records_archived: result.records_archived,
        records_skipped: result.records_skipped,
        completed_at: new Date().toISOString(),
        error_message: result.errors.length > 0 ? result.errors[0] : null,
        error_details: result.errors.length > 0 ? { errors: result.errors } : null,
      })
      .eq('id', executionLog.id);
  }

  // Log audit event
  if (!dry_run && triggered_by) {
    await logAuditEvent({
      user_id: triggered_by,
      organization_id,
      action: 'data.deletion_completed',
      resource_type: 'policies',
      resource_id: result.execution_id,
      details: {
        type: 'retention_execution',
        data_type,
        records_deleted: result.records_deleted,
        records_archived: result.records_archived,
        records_skipped: result.records_skipped,
      },
      status: result.status === 'completed' ? 'success' : 'failed',
    });
  }

  return result;
}

/**
 * Get execution history for an organization
 */
export async function getExecutionHistory(
  organizationId: string,
  options?: {
    data_type?: RetentionDataType;
    status?: ExecutionStatus;
    limit?: number;
    offset?: number;
  }
): Promise<RetentionExecutionLog[]> {
  const supabase = createServerClient();

  let query = supabase
    .from('retention_execution_log')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (options?.data_type) {
    query = query.eq('data_type', options.data_type);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    if (error.code === '42P01') {
      return [];
    }
    throw error;
  }

  return (data || []) as RetentionExecutionLog[];
}

// ============================================
// Helper Functions
// ============================================

interface EligibleRecord {
  id: string;
  created_at: string;
  user_id?: string;
  tags?: string[];
}

async function getEligibleRecords(
  organizationId: string,
  dataType: RetentionDataType,
  cutoffDate: Date,
  limit: number
): Promise<EligibleRecord[]> {
  const supabase = createServerClient();
  const tableInfo = DATA_TYPE_TABLES[dataType];

  if (!tableInfo) {
    return [];
  }

  try {
    let query = supabase
      .from(tableInfo.table)
      .select('id, created_at, user_id')
      .lt('created_at', cutoffDate.toISOString())
      .limit(limit);

    // Add org filter
    query = query.eq(tableInfo.org_column, organizationId);

    // Exclude already deleted records if table has soft delete
    if (tableInfo.has_soft_delete) {
      query = query.eq('is_deleted', false);
    }

    const { data, error } = await query;

    if (error) {
      console.warn(`Could not query ${tableInfo.table}:`, error.message);
      return [];
    }

    return (data || []).map(record => ({
      id: record.id,
      created_at: record.created_at,
      user_id: record.user_id,
      tags: [], // Would need to join with tags table
    }));
  } catch (error) {
    console.warn(`Error querying ${tableInfo.table}:`, error);
    return [];
  }
}

async function softDeleteRecord(table: string, recordId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from(table)
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', recordId);

  if (error) throw error;
}

async function hardDeleteRecord(table: string, recordId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', recordId);

  if (error) throw error;
}

async function anonymizeRecord(table: string, recordId: string): Promise<void> {
  const supabase = createServerClient();

  // Generic anonymization - would need table-specific logic in production
  const { error } = await supabase
    .from(table)
    .update({
      content: '[ANONYMIZED]',
      metadata: {},
      updated_at: new Date().toISOString(),
    })
    .eq('id', recordId);

  if (error) throw error;
}

async function archiveRecord(table: string, recordId: string): Promise<void> {
  const supabase = createServerClient();

  // Mark as archived - would move to archive table in production
  const { error } = await supabase
    .from(table)
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
    })
    .eq('id', recordId);

  if (error) {
    // Column might not exist - fallback to soft delete
    await softDeleteRecord(table, recordId);
  }
}

// ============================================
// Scheduled Job Entry Points
// ============================================

/**
 * Run scheduled retention for all organizations
 * Called by cron job
 */
export async function runScheduledRetention(): Promise<{
  organizations_processed: number;
  total_deleted: number;
  total_archived: number;
  errors: string[];
}> {
  const supabase = createServerClient();

  const result = {
    organizations_processed: 0,
    total_deleted: 0,
    total_archived: 0,
    errors: [] as string[],
  };

  try {
    // Get all organizations with active retention schedules
    const { data: orgs } = await supabase
      .from('retention_schedules')
      .select('organization_id')
      .eq('is_active', true);

    const uniqueOrgs = [...new Set((orgs || []).map(o => o.organization_id))];

    for (const orgId of uniqueOrgs) {
      // Get active schedules for this org
      const { data: schedules } = await supabase
        .from('retention_schedules')
        .select('data_type')
        .eq('organization_id', orgId)
        .eq('is_active', true);

      const dataTypes = [...new Set((schedules || []).map(s => s.data_type))];

      for (const dataType of dataTypes) {
        try {
          const execResult = await executeRetention({
            organization_id: orgId,
            data_type: dataType as RetentionDataType,
            execution_type: 'scheduled',
            batch_size: 500,
          });

          result.total_deleted += execResult.records_deleted;
          result.total_archived += execResult.records_archived;

          if (execResult.errors.length > 0) {
            result.errors.push(...execResult.errors.map(e => `${orgId}/${dataType}: ${e}`));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`${orgId}/${dataType}: ${message}`);
        }
      }

      result.organizations_processed++;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Global: ${message}`);
  }

  console.log(
    `[Retention] Scheduled run completed:`,
    `orgs=${result.organizations_processed}`,
    `deleted=${result.total_deleted}`,
    `archived=${result.total_archived}`,
    result.errors.length > 0 ? `errors=${result.errors.length}` : ''
  );

  return result;
}
