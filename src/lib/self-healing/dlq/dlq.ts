/**
 * Dead Letter Queue (DLQ) Service
 *
 * Manages failed jobs that have exceeded max retries:
 * - Move failed jobs to DLQ
 * - List and query DLQ entries
 * - Retry DLQ entries
 * - Resolve/archive/discard entries
 * - Generate statistics
 */

import { createServerClient } from '@/lib/supabase';
import type { HealingJob, IssueType, IssuesSummary, ActionSummary, JobError, TriggerSource, HealingJobType } from '../types';
import type {
  DLQEntry,
  DLQStatus,
  FailureCode,
  FailureDetails,
  DLQStats,
  ListDLQParams,
  DEFAULT_DLQ_CONFIG,
} from './types';
import { classifyFailureCode } from './types';

// ============================================
// Core DLQ Operations
// ============================================

/**
 * Move a failed job to the Dead Letter Queue
 */
export async function moveToDLQ(
  job: HealingJob,
  failureReason: string,
  options?: {
    failureCode?: FailureCode;
    failureDetails?: FailureDetails;
  }
): Promise<DLQEntry> {
  const supabase = createServerClient();

  // Classify failure code if not provided
  const failureCode = options?.failureCode ?? classifyFailureCode(failureReason);

  // Use database function for atomicity
  const { data, error } = await supabase.rpc('move_job_to_dlq', {
    p_job_id: job.id,
    p_failure_reason: failureReason,
    p_failure_code: failureCode,
    p_failure_details: options?.failureDetails ?? {},
  });

  if (error) {
    throw new Error(`Failed to move job to DLQ: ${error.message}`);
  }

  // Fetch the created DLQ entry
  const entry = await getDLQEntry(data as string);
  if (!entry) {
    throw new Error('Failed to retrieve created DLQ entry');
  }

  return entry;
}

/**
 * Move a failed job to DLQ by job ID
 */
export async function moveJobToDLQById(
  jobId: string,
  failureReason: string,
  options?: {
    failureCode?: FailureCode;
    failureDetails?: FailureDetails;
  }
): Promise<DLQEntry> {
  const supabase = createServerClient();

  const failureCode = options?.failureCode ?? classifyFailureCode(failureReason);

  const { data, error } = await supabase.rpc('move_job_to_dlq', {
    p_job_id: jobId,
    p_failure_reason: failureReason,
    p_failure_code: failureCode,
    p_failure_details: options?.failureDetails ?? {},
  });

  if (error) {
    throw new Error(`Failed to move job to DLQ: ${error.message}`);
  }

  const entry = await getDLQEntry(data as string);
  if (!entry) {
    throw new Error('Failed to retrieve created DLQ entry');
  }

  return entry;
}

/**
 * Get a single DLQ entry by ID
 */
export async function getDLQEntry(dlqId: string): Promise<DLQEntry | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('healing_dlq')
    .select('*')
    .eq('id', dlqId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapDLQEntryFromDb(data);
}

/**
 * List DLQ entries for a user
 */
export async function listDLQEntries(
  userId: string,
  params?: ListDLQParams
): Promise<{ entries: DLQEntry[]; total: number }> {
  const supabase = createServerClient();

  let query = supabase
    .from('healing_dlq')
    .select('*', { count: 'exact' })
    .eq('user_id', userId);

  // Apply filters
  if (params?.collectionId) {
    query = query.eq('collection_id', params.collectionId);
  }

  if (params?.status) {
    if (Array.isArray(params.status)) {
      query = query.in('status', params.status);
    } else {
      query = query.eq('status', params.status);
    }
  }

  if (params?.failureCode) {
    if (Array.isArray(params.failureCode)) {
      query = query.in('failure_code', params.failureCode);
    } else {
      query = query.eq('failure_code', params.failureCode);
    }
  }

  // Apply sorting
  const sortBy = params?.sortBy ?? 'created_at';
  const sortOrder = params?.sortOrder ?? 'desc';
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });

  // Apply pagination
  if (params?.limit) {
    query = query.limit(params.limit);
  }

  if (params?.offset) {
    query = query.range(params.offset, params.offset + (params.limit ?? 20) - 1);
  }

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to list DLQ entries: ${error.message}`);
  }

  return {
    entries: (data ?? []).map(mapDLQEntryFromDb),
    total: count ?? 0,
  };
}

/**
 * Retry a DLQ entry by creating a new job
 */
export async function retryDLQEntry(
  dlqId: string,
  userId: string,
  options?: {
    modifyJob?: {
      priority?: number;
      targetIssues?: IssueType[];
    };
  }
): Promise<{ newJobId: string; dlqEntry: DLQEntry }> {
  const supabase = createServerClient();

  // Use database function for retry
  const { data: newJobId, error } = await supabase.rpc('retry_dlq_entry', {
    p_dlq_id: dlqId,
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to retry DLQ entry: ${error.message}`);
  }

  // If modifications requested, update the new job
  if (options?.modifyJob && newJobId) {
    const updates: Record<string, unknown> = {};
    if (options.modifyJob.priority !== undefined) {
      updates.priority = options.modifyJob.priority;
    }
    if (options.modifyJob.targetIssues !== undefined) {
      updates.target_issues = options.modifyJob.targetIssues;
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('healing_jobs')
        .update(updates)
        .eq('id', newJobId);
    }
  }

  // Fetch updated DLQ entry
  const dlqEntry = await getDLQEntry(dlqId);
  if (!dlqEntry) {
    throw new Error('Failed to retrieve updated DLQ entry');
  }

  return {
    newJobId: newJobId as string,
    dlqEntry,
  };
}

/**
 * Resolve a DLQ entry
 */
export async function resolveDLQEntry(
  dlqId: string,
  userId: string,
  status: 'resolved' | 'archived' | 'discarded',
  resolutionNotes?: string
): Promise<DLQEntry> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc('resolve_dlq_entry', {
    p_dlq_id: dlqId,
    p_user_id: userId,
    p_resolution_notes: resolutionNotes ?? null,
    p_status: status,
  });

  if (error) {
    throw new Error(`Failed to resolve DLQ entry: ${error.message}`);
  }

  const entry = await getDLQEntry(dlqId);
  if (!entry) {
    throw new Error('Failed to retrieve resolved DLQ entry');
  }

  return entry;
}

/**
 * Acknowledge a DLQ alert
 */
export async function acknowledgeDLQAlert(
  dlqId: string,
  userId: string
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc('acknowledge_dlq_alert', {
    p_dlq_id: dlqId,
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to acknowledge alert: ${error.message}`);
  }
}

/**
 * Bulk action on DLQ entries
 */
export async function bulkDLQAction(
  dlqIds: string[],
  userId: string,
  action: 'retry' | 'resolve' | 'archive' | 'discard' | 'acknowledge',
  resolutionNotes?: string
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ dlqId: string; error: string }>;
  newJobIds?: string[];
}> {
  const errors: Array<{ dlqId: string; error: string }> = [];
  const newJobIds: string[] = [];
  let succeeded = 0;

  for (const dlqId of dlqIds) {
    try {
      switch (action) {
        case 'retry':
          const result = await retryDLQEntry(dlqId, userId);
          newJobIds.push(result.newJobId);
          break;
        case 'resolve':
          await resolveDLQEntry(dlqId, userId, 'resolved', resolutionNotes);
          break;
        case 'archive':
          await resolveDLQEntry(dlqId, userId, 'archived', resolutionNotes);
          break;
        case 'discard':
          await resolveDLQEntry(dlqId, userId, 'discarded', resolutionNotes);
          break;
        case 'acknowledge':
          await acknowledgeDLQAlert(dlqId, userId);
          break;
      }
      succeeded++;
    } catch (err) {
      errors.push({
        dlqId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return {
    processed: dlqIds.length,
    succeeded,
    failed: errors.length,
    errors,
    newJobIds: newJobIds.length > 0 ? newJobIds : undefined,
  };
}

// ============================================
// Statistics
// ============================================

/**
 * Get DLQ statistics for a user
 */
export async function getDLQStats(userId: string): Promise<DLQStats> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('get_dlq_stats', {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to get DLQ stats: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    pendingCount: Number(row?.pending_count ?? 0),
    retryingCount: Number(row?.retrying_count ?? 0),
    resolvedCount: Number(row?.resolved_count ?? 0),
    archivedCount: Number(row?.archived_count ?? 0),
    discardedCount: Number(row?.discarded_count ?? 0),
    totalCount: Number(row?.total_count ?? 0),
    unacknowledgedAlerts: Number(row?.unacknowledged_alerts ?? 0),
    oldestPendingAt: row?.oldest_pending_at ?? undefined,
  };
}

/**
 * Get DLQ statistics with failure code breakdown
 */
export async function getDLQExtendedStats(userId: string): Promise<{
  stats: DLQStats;
  pendingByFailureCode: Record<FailureCode, number>;
  pendingByCollection: Record<string, number>;
}> {
  const supabase = createServerClient();

  // Get basic stats
  const stats = await getDLQStats(userId);

  // Get breakdown by failure code
  const { data: byCode } = await supabase
    .from('healing_dlq')
    .select('failure_code')
    .eq('user_id', userId)
    .eq('status', 'pending');

  const pendingByFailureCode: Record<string, number> = {};
  (byCode ?? []).forEach((row) => {
    const code = row.failure_code ?? 'unknown';
    pendingByFailureCode[code] = (pendingByFailureCode[code] ?? 0) + 1;
  });

  // Get breakdown by collection
  const { data: byCollection } = await supabase
    .from('healing_dlq')
    .select('collection_id')
    .eq('user_id', userId)
    .eq('status', 'pending');

  const pendingByCollection: Record<string, number> = {};
  (byCollection ?? []).forEach((row) => {
    const id = row.collection_id;
    pendingByCollection[id] = (pendingByCollection[id] ?? 0) + 1;
  });

  return {
    stats,
    pendingByFailureCode: pendingByFailureCode as Record<FailureCode, number>,
    pendingByCollection,
  };
}

// ============================================
// Cleanup
// ============================================

/**
 * Clean up old resolved/archived DLQ entries
 */
export async function cleanupOldDLQEntries(
  userId: string,
  options?: {
    retentionDays?: number;
    statuses?: DLQStatus[];
  }
): Promise<{ deleted: number }> {
  const supabase = createServerClient();

  const retentionDays = options?.retentionDays ?? 30;
  const statuses = options?.statuses ?? ['resolved', 'archived', 'discarded'];

  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('healing_dlq')
    .delete()
    .eq('user_id', userId)
    .in('status', statuses)
    .lt('updated_at', cutoffDate)
    .select('id');

  if (error) {
    throw new Error(`Failed to cleanup DLQ entries: ${error.message}`);
  }

  return { deleted: data?.length ?? 0 };
}

// ============================================
// Helpers
// ============================================

/**
 * Map database row to DLQEntry type
 */
function mapDLQEntryFromDb(row: Record<string, unknown>): DLQEntry {
  return {
    id: row.id as string,
    originalJobId: row.original_job_id as string,
    collectionId: row.collection_id as string,
    userId: row.user_id as string,
    orgId: row.org_id as string | undefined,

    jobType: row.job_type as HealingJobType,
    targetIssues: (row.target_issues as IssueType[]) ?? [],
    priority: (row.priority as number) ?? 5,

    failureReason: row.failure_reason as string,
    failureCode: row.failure_code as FailureCode | undefined,
    failureDetails: row.failure_details as FailureDetails | undefined,

    originalRetryCount: (row.original_retry_count as number) ?? 0,
    dlqRetryCount: (row.dlq_retry_count as number) ?? 0,
    maxDlqRetries: (row.max_dlq_retries as number) ?? 3,
    lastRetryAt: row.last_retry_at as string | undefined,
    nextRetryAt: row.next_retry_at as string | undefined,

    status: row.status as DLQStatus,
    resolutionNotes: row.resolution_notes as string | undefined,
    resolvedBy: row.resolved_by as string | undefined,
    resolvedAt: row.resolved_at as string | undefined,

    chunksScanned: (row.chunks_scanned as number) ?? 0,
    chunksHealed: (row.chunks_healed as number) ?? 0,
    chunksFailed: (row.chunks_failed as number) ?? 0,
    issuesFound: (row.issues_found as IssuesSummary) ?? {
      total: 0,
      byType: {} as Record<IssueType, number>,
      bySeverity: {} as Record<string, number>,
    },
    actionsTaken: (row.actions_taken as ActionSummary[]) ?? [],
    errors: (row.errors as JobError[]) ?? [],

    originalScheduledAt: row.original_scheduled_at as string | undefined,
    originalStartedAt: row.original_started_at as string | undefined,
    originalFailedAt: row.original_failed_at as string | undefined,
    originalDurationMs: row.original_duration_ms as number | undefined,

    triggeredBy: (row.triggered_by as TriggerSource) ?? 'system',
    triggerRuleId: row.trigger_rule_id as string | undefined,

    alertSent: (row.alert_sent as boolean) ?? false,
    alertSentAt: row.alert_sent_at as string | undefined,
    alertAcknowledged: (row.alert_acknowledged as boolean) ?? false,
    alertAcknowledgedAt: row.alert_acknowledged_at as string | undefined,
    alertAcknowledgedBy: row.alert_acknowledged_by as string | undefined,

    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Check if a job should be moved to DLQ
 */
export function shouldMoveToDLQ(job: HealingJob): boolean {
  return job.status === 'failed' && job.retryCount >= job.maxRetries;
}
