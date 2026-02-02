/**
 * Retention Schedules Management
 *
 * Implements retention schedule functionality:
 * - Create/update/delete retention schedules
 * - Get effective retention for data types
 * - Preview retention impact
 */

import { createServerClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/winter/org/audit-log';
import type {
  RetentionSchedule,
  RetentionDataType,
  CreateRetentionScheduleParams,
  UpdateRetentionScheduleParams,
  ListRetentionSchedulesParams,
  RetentionCheckRequest,
  RetentionCheckResult,
  RetentionPreview,
} from './types';
import type { PaginatedResult } from '@/lib/winter/org/types';
import { isUnderLegalHold } from './legal-holds';

// ============================================
// Default Retention Periods
// ============================================

const DEFAULT_RETENTION_DAYS: Record<RetentionDataType, number> = {
  memories: 90,
  documents: 365,
  traces: 30,
  audit_logs: 365,
  api_keys: 730, // 2 years
  sessions: 30,
};

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new retention schedule
 */
export async function createRetentionSchedule(
  params: CreateRetentionScheduleParams
): Promise<RetentionSchedule> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('retention_schedules')
    .insert({
      organization_id: params.organization_id,
      name: params.name,
      description: params.description,
      data_type: params.data_type,
      retention_days: params.retention_days,
      archive_days: params.archive_days,
      deletion_type: params.deletion_type || 'soft',
      conditions: params.conditions || {},
      notify_before_days: params.notify_before_days || 7,
      notify_emails: params.notify_emails,
      priority: params.priority || 0,
      is_active: true,
      created_by: params.created_by,
    })
    .select()
    .single();

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: params.created_by,
    organization_id: params.organization_id,
    action: 'policy.create',
    resource_type: 'policies',
    resource_id: data.id,
    details: {
      type: 'retention_schedule_created',
      name: params.name,
      data_type: params.data_type,
      retention_days: params.retention_days,
    },
    status: 'success',
  });

  return data as RetentionSchedule;
}

/**
 * Get a retention schedule by ID
 */
export async function getRetentionSchedule(
  scheduleId: string
): Promise<RetentionSchedule | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('retention_schedules')
    .select('*')
    .eq('id', scheduleId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as RetentionSchedule;
}

/**
 * List retention schedules for an organization
 */
export async function listRetentionSchedules(
  params: ListRetentionSchedulesParams
): Promise<PaginatedResult<RetentionSchedule>> {
  const supabase = createServerClient();
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  let query = supabase
    .from('retention_schedules')
    .select('*', { count: 'exact' })
    .eq('organization_id', params.organization_id)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.data_type) {
    query = query.eq('data_type', params.data_type);
  }

  if (params.is_active !== undefined) {
    query = query.eq('is_active', params.is_active);
  }

  const { data, error, count } = await query;

  if (error) {
    // Table might not exist
    if (error.code === '42P01') {
      return { data: [], total: 0, limit, offset, has_more: false };
    }
    throw error;
  }

  return {
    data: (data || []) as RetentionSchedule[],
    total: count || 0,
    limit,
    offset,
    has_more: (count || 0) > offset + limit,
  };
}

/**
 * Update a retention schedule
 */
export async function updateRetentionSchedule(
  params: UpdateRetentionScheduleParams,
  updatedBy: string
): Promise<RetentionSchedule> {
  const supabase = createServerClient();

  const current = await getRetentionSchedule(params.id);
  if (!current) {
    throw new Error('Retention schedule not found');
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.retention_days !== undefined) updates.retention_days = params.retention_days;
  if (params.archive_days !== undefined) updates.archive_days = params.archive_days;
  if (params.deletion_type !== undefined) updates.deletion_type = params.deletion_type;
  if (params.conditions !== undefined) {
    updates.conditions = { ...current.conditions, ...params.conditions };
  }
  if (params.notify_before_days !== undefined) updates.notify_before_days = params.notify_before_days;
  if (params.notify_emails !== undefined) updates.notify_emails = params.notify_emails;
  if (params.is_active !== undefined) updates.is_active = params.is_active;
  if (params.priority !== undefined) updates.priority = params.priority;

  const { data, error } = await supabase
    .from('retention_schedules')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: updatedBy,
    organization_id: current.organization_id,
    action: 'policy.update',
    resource_type: 'policies',
    resource_id: params.id,
    details: {
      type: 'retention_schedule_updated',
      updated_fields: Object.keys(params).filter(k => k !== 'id'),
    },
    previous_state: {
      retention_days: current.retention_days,
      conditions: current.conditions,
    },
    new_state: {
      retention_days: updates.retention_days || current.retention_days,
      conditions: updates.conditions || current.conditions,
    },
    status: 'success',
  });

  return data as RetentionSchedule;
}

/**
 * Delete a retention schedule
 */
export async function deleteRetentionSchedule(
  scheduleId: string,
  deletedBy: string
): Promise<void> {
  const supabase = createServerClient();

  const schedule = await getRetentionSchedule(scheduleId);
  if (!schedule) {
    throw new Error('Retention schedule not found');
  }

  const { error } = await supabase
    .from('retention_schedules')
    .delete()
    .eq('id', scheduleId);

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: deletedBy,
    organization_id: schedule.organization_id,
    action: 'policy.delete',
    resource_type: 'policies',
    resource_id: scheduleId,
    details: {
      type: 'retention_schedule_deleted',
      name: schedule.name,
      data_type: schedule.data_type,
    },
    status: 'success',
  });
}

// ============================================
// Retention Resolution
// ============================================

/**
 * Get the effective retention schedule for a data type
 */
export async function getEffectiveRetentionSchedule(
  organizationId: string,
  dataType: RetentionDataType,
  context?: { tags?: string[] }
): Promise<RetentionSchedule | null> {
  const supabase = createServerClient();

  // Get all active schedules for this data type, ordered by priority
  const { data: schedules, error } = await supabase
    .from('retention_schedules')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('data_type', dataType)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error) {
    if (error.code === '42P01') return null;
    throw error;
  }

  if (!schedules || schedules.length === 0) {
    return null;
  }

  // Find the first matching schedule based on conditions
  for (const schedule of schedules) {
    const s = schedule as RetentionSchedule;
    const conditions = s.conditions;

    // Check tag conditions
    if (conditions.tags && conditions.tags.length > 0) {
      if (!context?.tags?.some(tag => conditions.tags!.includes(tag))) {
        continue;
      }
    }

    if (conditions.exclude_tags && conditions.exclude_tags.length > 0) {
      if (context?.tags?.some(tag => conditions.exclude_tags!.includes(tag))) {
        continue;
      }
    }

    // If we get here, the schedule matches
    return s;
  }

  // Return the first schedule (highest priority) as fallback
  return schedules[0] as RetentionSchedule;
}

/**
 * Get effective retention days for a data type
 */
export async function getEffectiveRetentionDays(
  organizationId: string,
  dataType: RetentionDataType,
  context?: { tags?: string[] }
): Promise<number> {
  const schedule = await getEffectiveRetentionSchedule(organizationId, dataType, context);

  if (schedule) {
    return schedule.retention_days;
  }

  // Fall back to default
  return DEFAULT_RETENTION_DAYS[dataType] || 90;
}

/**
 * Check retention status for a specific record
 */
export async function checkRetentionStatus(
  request: RetentionCheckRequest
): Promise<RetentionCheckResult> {
  const result: RetentionCheckResult = {
    can_delete: true,
    blocked_reasons: [],
    legal_holds: [],
    retention_days: DEFAULT_RETENTION_DAYS[request.data_type] || 90,
    data_type: request.data_type,
  };

  // 1. Check legal holds
  const holdCheck = await isUnderLegalHold({
    organization_id: request.organization_id,
    data_type: request.data_type,
    record_id: request.record_id,
    user_id: request.user_id,
    tags: request.tags,
    created_at: request.created_at,
  });

  if (holdCheck.held) {
    result.can_delete = false;
    result.legal_holds = holdCheck.holds;
    result.blocked_reasons.push(
      `Under legal hold: ${holdCheck.holds.map(h => h.name).join(', ')}`
    );
  }

  // 2. Get effective retention schedule
  const schedule = await getEffectiveRetentionSchedule(
    request.organization_id,
    request.data_type,
    { tags: request.tags }
  );

  if (schedule) {
    result.retention_days = schedule.retention_days;

    if (schedule.archive_days) {
      result.archive_date = calculateDate(request.created_at, schedule.archive_days);
    }
  }

  // 3. Calculate deletion date
  if (request.created_at) {
    result.deletion_date = calculateDate(request.created_at, result.retention_days);

    const deletionDate = new Date(result.deletion_date);
    const now = new Date();

    if (deletionDate > now) {
      result.can_delete = false;
      result.blocked_reasons.push(
        `Retention period not expired (expires ${result.deletion_date})`
      );
    }
  }

  return result;
}

/**
 * Preview retention impact for an organization
 */
export async function previewRetention(
  organizationId: string,
  dataType: RetentionDataType
): Promise<RetentionPreview> {
  const supabase = createServerClient();

  // Get effective schedule
  const schedule = await getEffectiveRetentionSchedule(organizationId, dataType);
  const retentionDays = schedule?.retention_days || DEFAULT_RETENTION_DAYS[dataType] || 90;
  const archiveDays = schedule?.archive_days;

  // Calculate cutoff dates
  const now = new Date();
  const deletionCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const archiveCutoff = archiveDays
    ? new Date(now.getTime() - archiveDays * 24 * 60 * 60 * 1000)
    : null;

  // Get table name based on data type
  const tableMap: Record<RetentionDataType, string> = {
    memories: 'memories',
    documents: 'summer_documents',
    traces: 'fall_retrieval_traces',
    audit_logs: 'audit_logs',
    api_keys: 'api_keys',
    sessions: 'sessions',
  };

  const tableName = tableMap[dataType];

  // Count records
  let totalRecords = 0;
  let eligibleForDeletion = 0;
  let eligibleForArchive = 0;

  try {
    // Get total count
    const { count: total } = await supabase
      .from(tableName)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', organizationId); // Simplified - would need org-based query

    totalRecords = total || 0;

    // Get deletion eligible count
    const { count: deleteCount } = await supabase
      .from(tableName)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', organizationId)
      .lt('created_at', deletionCutoff.toISOString());

    eligibleForDeletion = deleteCount || 0;

    // Get archive eligible count
    if (archiveCutoff) {
      const { count: archiveCount } = await supabase
        .from(tableName)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', organizationId)
        .lt('created_at', archiveCutoff.toISOString())
        .gte('created_at', deletionCutoff.toISOString());

      eligibleForArchive = archiveCount || 0;
    }
  } catch {
    // Table might not exist or different schema
  }

  // Check legal holds
  const holdCheck = await isUnderLegalHold({
    organization_id: organizationId,
    data_type: dataType,
  });

  return {
    organization_id: organizationId,
    data_type: dataType,
    total_records: totalRecords,
    eligible_for_deletion: eligibleForDeletion,
    eligible_for_archive: eligibleForArchive,
    under_legal_hold: holdCheck.held ? totalRecords : 0, // Simplified - would need precise count
    sample_records: [], // Would need additional query
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate a date offset from a base date
 */
function calculateDate(baseDate: string | undefined, daysOffset: number): string {
  const base = baseDate ? new Date(baseDate) : new Date();
  base.setDate(base.getDate() + daysOffset);
  return base.toISOString();
}

/**
 * Get default retention days for a data type
 */
export function getDefaultRetentionDays(dataType: RetentionDataType): number {
  return DEFAULT_RETENTION_DAYS[dataType] || 90;
}
