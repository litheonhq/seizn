/**
 * Self-Healing Job Scheduler
 *
 * Manages scheduling, execution, and monitoring of healing jobs.
 * Supports full scans, incremental updates, and targeted healing.
 */

import { createServerClient } from '@/lib/supabase';
import {
  HealingJob,
  HealingJobType,
  JobStatus,
  IssueType,
  TriggerSource,
  HealingConfig,
  DEFAULT_HEALING_CONFIG,
  IssuesSummary,
  ActionSummary,
  JobError,
} from './types';
import { scanCollection, saveHealthRecord } from './scanner';
import { healIssues, reembedChunks, resolveQueuedIssues } from './healer';
import { getActiveRules } from './rules';

// ============================================
// Constants
// ============================================

const MAX_CONCURRENT_JOBS_DEFAULT = 2;
const JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds

// ============================================
// Job Scheduling
// ============================================

/**
 * Schedule a new healing job
 */
export async function scheduleHealingJob(
  collectionId: string,
  userId: string,
  jobType: HealingJobType,
  options?: {
    targetIssues?: IssueType[];
    priority?: number;
    scheduledAt?: string;
    triggeredBy?: TriggerSource;
    triggerRuleId?: string;
  }
): Promise<HealingJob> {
  const supabase = createServerClient();

  // Check concurrent job limit
  const canSchedule = await canScheduleJob(userId);
  if (!canSchedule) {
    throw new Error('Maximum concurrent jobs limit reached');
  }

  // Create job record
  const { data: job, error } = await supabase
    .from('healing_jobs')
    .insert({
      collection_id: collectionId,
      user_id: userId,
      job_type: jobType,
      target_issues: options?.targetIssues ?? [],
      priority: options?.priority ?? 5,
      status: options?.scheduledAt ? 'pending' : 'queued',
      scheduled_at: options?.scheduledAt,
      triggered_by: options?.triggeredBy ?? 'manual',
      trigger_rule_id: options?.triggerRuleId,
      issues_found: {},
      actions_taken: [],
      errors: [],
    })
    .select('*')
    .single();

  if (error || !job) {
    throw new Error(`Failed to create job: ${error?.message}`);
  }

  return mapJobFromDb(job);
}

/**
 * Check if user can schedule a new job
 */
async function canScheduleJob(userId: string): Promise<boolean> {
  const supabase = createServerClient();

  // Get user config
  const config = await getHealingConfig(userId);
  const maxConcurrent = config?.maxConcurrentJobs ?? MAX_CONCURRENT_JOBS_DEFAULT;

  // Count running jobs
  const { count } = await supabase
    .from('healing_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['queued', 'running']);

  return (count ?? 0) < maxConcurrent;
}

/**
 * Get the next job to process
 */
export async function getNextJob(userId?: string): Promise<HealingJob | null> {
  const supabase = createServerClient();

  let query = supabase
    .from('healing_jobs')
    .select('*')
    .eq('status', 'queued')
    .or('scheduled_at.is.null,scheduled_at.lte.' + new Date().toISOString())
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data: jobs } = await query;

  if (!jobs || jobs.length === 0) {
    return null;
  }

  return mapJobFromDb(jobs[0]);
}

// ============================================
// Job Execution
// ============================================

/**
 * Execute a healing job
 */
export async function executeJob(jobId: string): Promise<HealingJob> {
  const supabase = createServerClient();

  // Get job
  const { data: jobData, error: fetchError } = await supabase
    .from('healing_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (fetchError || !jobData) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const job = mapJobFromDb(jobData);

  // Check if job can be executed
  if (job.status !== 'queued' && job.status !== 'paused') {
    throw new Error(`Job ${jobId} is not in a runnable state: ${job.status}`);
  }

  // Update job status to running
  await updateJobStatus(jobId, 'running', {
    startedAt: new Date().toISOString(),
    workerId: `worker_${Date.now()}`,
  });

  try {
    // Execute based on job type
    const result = await runJobByType(job);

    // Update job with results
    await updateJobStatus(jobId, 'completed', {
      completedAt: new Date().toISOString(),
      progressPercent: 100,
      chunksScanned: result.chunksScanned,
      chunksHealed: result.chunksHealed,
      chunksFailed: result.chunksFailed,
      chunksSkipped: result.chunksSkipped,
      issuesFound: result.issuesFound,
      actionsTaken: result.actionsTaken,
      errors: result.errors,
      actualDurationMs: result.duration,
    });

    // Update health record
    await saveHealthFromJob(job.collectionId, job.userId, result);

    return {
      ...job,
      status: 'completed',
      progressPercent: 100,
      chunksScanned: result.chunksScanned,
      chunksHealed: result.chunksHealed,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await updateJobStatus(jobId, 'failed', {
      completedAt: new Date().toISOString(),
      errors: [
        {
          timestamp: new Date().toISOString(),
          message: errorMessage,
          retryable: true,
        },
      ],
    });

    throw error;
  }
}

/**
 * Run job based on type
 */
async function runJobByType(job: HealingJob): Promise<JobExecutionResult> {
  switch (job.jobType) {
    case 'full_scan':
      return executeFullScan(job);
    case 'incremental':
      return executeIncrementalScan(job);
    case 'targeted':
      return executeTargetedHealing(job);
    case 'emergency':
      return executeEmergencyHealing(job);
    default:
      throw new Error(`Unknown job type: ${job.jobType}`);
  }
}

interface JobExecutionResult {
  chunksScanned: number;
  chunksHealed: number;
  chunksFailed: number;
  chunksSkipped: number;
  issuesFound: IssuesSummary;
  actionsTaken: ActionSummary[];
  errors: JobError[];
  duration: number;
}

/**
 * Execute a full collection scan
 */
async function executeFullScan(job: HealingJob): Promise<JobExecutionResult> {
  const startTime = Date.now();

  // Run scanner
  const scanResult = await scanCollection(job.collectionId, job.userId, {
    issueTypes: job.targetIssues.length > 0 ? job.targetIssues : undefined,
  });

  // Get rules for healing
  const rules = await getActiveRules(job.userId, job.collectionId);

  // Heal detected issues
  const healResult = await healIssues(
    job.collectionId,
    job.userId,
    scanResult.issues,
    rules,
    { stopOnError: false }
  );

  // Build issues summary
  const issuesFound: IssuesSummary = {
    total: scanResult.issues.reduce((sum, i) => sum + i.chunkIds.length, 0),
    byType: scanResult.metrics.issuesByType,
    bySeverity: scanResult.metrics.issuesBySeverity,
  };

  // Build actions summary
  const actionsTaken: ActionSummary[] = healResult.actions.map(action => ({
    actionType: action.actionType,
    issueType: 'stale', // Would need to track this properly
    chunkCount: action.chunkIds.length,
    successCount: action.successCount,
    failureCount: action.failureCount,
    durationMs: action.duration,
  }));

  return {
    chunksScanned: scanResult.metrics.scannedChunks,
    chunksHealed: healResult.chunksHealed,
    chunksFailed: healResult.chunksFailed,
    chunksSkipped: 0,
    issuesFound,
    actionsTaken,
    errors: healResult.errors,
    duration: Date.now() - startTime,
  };
}

/**
 * Execute an incremental scan (changes since last scan)
 */
async function executeIncrementalScan(job: HealingJob): Promise<JobExecutionResult> {
  const startTime = Date.now();
  const supabase = createServerClient();

  // Get last health check time
  const { data: health } = await supabase
    .from('index_health')
    .select('last_checked_at')
    .eq('collection_id', job.collectionId)
    .single();

  const sinceTime = health?.last_checked_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Get chunks modified since last check
  const { data: modifiedChunks } = await supabase
    .from('summer_chunks')
    .select('id')
    .eq('collection_id', job.collectionId)
    .gt('updated_at', sinceTime);

  const chunkIds = modifiedChunks?.map(c => c.id) ?? [];

  if (chunkIds.length === 0) {
    return {
      chunksScanned: 0,
      chunksHealed: 0,
      chunksFailed: 0,
      chunksSkipped: 0,
      issuesFound: { total: 0, byType: {} as Record<IssueType, number>, bySeverity: {} as Record<string, number> },
      actionsTaken: [],
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  // Scan only modified chunks
  const scanResult = await scanCollection(job.collectionId, job.userId, {
    chunkIds,
  });

  // Get rules and heal
  const rules = await getActiveRules(job.userId, job.collectionId);
  const healResult = await healIssues(job.collectionId, job.userId, scanResult.issues, rules);

  return {
    chunksScanned: chunkIds.length,
    chunksHealed: healResult.chunksHealed,
    chunksFailed: healResult.chunksFailed,
    chunksSkipped: 0,
    issuesFound: {
      total: scanResult.issues.reduce((sum, i) => sum + i.chunkIds.length, 0),
      byType: scanResult.metrics.issuesByType,
      bySeverity: scanResult.metrics.issuesBySeverity,
    },
    actionsTaken: healResult.actions.map(a => ({
      actionType: a.actionType,
      issueType: 'stale' as IssueType,
      chunkCount: a.chunkIds.length,
      successCount: a.successCount,
      failureCount: a.failureCount,
      durationMs: a.duration,
    })),
    errors: healResult.errors,
    duration: Date.now() - startTime,
  };
}

/**
 * Execute targeted healing for specific issue types
 */
async function executeTargetedHealing(job: HealingJob): Promise<JobExecutionResult> {
  const startTime = Date.now();

  // Scan with specific issue types
  const scanResult = await scanCollection(job.collectionId, job.userId, {
    issueTypes: job.targetIssues,
  });

  // Filter issues to only targeted types
  const targetedIssues = scanResult.issues.filter(i => job.targetIssues.includes(i.type));

  // Get rules and heal
  const rules = await getActiveRules(job.userId, job.collectionId);
  const healResult = await healIssues(job.collectionId, job.userId, targetedIssues, rules);

  return {
    chunksScanned: scanResult.metrics.scannedChunks,
    chunksHealed: healResult.chunksHealed,
    chunksFailed: healResult.chunksFailed,
    chunksSkipped: scanResult.issues
      .filter(i => !job.targetIssues.includes(i.type))
      .reduce((sum, i) => sum + i.chunkIds.length, 0),
    issuesFound: {
      total: targetedIssues.reduce((sum, i) => sum + i.chunkIds.length, 0),
      byType: scanResult.metrics.issuesByType,
      bySeverity: scanResult.metrics.issuesBySeverity,
    },
    actionsTaken: healResult.actions.map(a => ({
      actionType: a.actionType,
      issueType: job.targetIssues[0] ?? 'stale',
      chunkCount: a.chunkIds.length,
      successCount: a.successCount,
      failureCount: a.failureCount,
      durationMs: a.duration,
    })),
    errors: healResult.errors,
    duration: Date.now() - startTime,
  };
}

/**
 * Execute emergency healing (critical issues only)
 */
async function executeEmergencyHealing(job: HealingJob): Promise<JobExecutionResult> {
  const startTime = Date.now();

  // Scan for all issues
  const scanResult = await scanCollection(job.collectionId, job.userId);

  // Filter to critical issues only
  const criticalIssues = scanResult.issues.filter(i => i.severity === 'critical' || i.severity === 'high');

  if (criticalIssues.length === 0) {
    return {
      chunksScanned: scanResult.metrics.scannedChunks,
      chunksHealed: 0,
      chunksFailed: 0,
      chunksSkipped: scanResult.issues.reduce((sum, i) => sum + i.chunkIds.length, 0),
      issuesFound: {
        total: 0,
        byType: {} as Record<IssueType, number>,
        bySeverity: {} as Record<string, number>,
      },
      actionsTaken: [],
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  // Get rules and heal with high priority
  const rules = await getActiveRules(job.userId, job.collectionId);
  const healResult = await healIssues(job.collectionId, job.userId, criticalIssues, rules, {
    stopOnError: true, // Stop on first error for emergency
  });

  return {
    chunksScanned: scanResult.metrics.scannedChunks,
    chunksHealed: healResult.chunksHealed,
    chunksFailed: healResult.chunksFailed,
    chunksSkipped: scanResult.issues
      .filter(i => i.severity !== 'critical' && i.severity !== 'high')
      .reduce((sum, i) => sum + i.chunkIds.length, 0),
    issuesFound: {
      total: criticalIssues.reduce((sum, i) => sum + i.chunkIds.length, 0),
      byType: scanResult.metrics.issuesByType,
      bySeverity: { high: scanResult.metrics.issuesBySeverity.high, critical: scanResult.metrics.issuesBySeverity.critical, medium: scanResult.metrics.issuesBySeverity.medium ?? 0, low: scanResult.metrics.issuesBySeverity.low ?? 0 },
    },
    actionsTaken: healResult.actions.map(a => ({
      actionType: a.actionType,
      issueType: 'corrupted' as IssueType,
      chunkCount: a.chunkIds.length,
      successCount: a.successCount,
      failureCount: a.failureCount,
      durationMs: a.duration,
    })),
    errors: healResult.errors,
    duration: Date.now() - startTime,
  };
}

// ============================================
// Job Management
// ============================================

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<HealingJob | null> {
  const supabase = createServerClient();

  const { data: job } = await supabase
    .from('healing_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (!job) {
    return null;
  }

  return mapJobFromDb(job);
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('healing_jobs')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .in('status', ['pending', 'queued', 'running', 'paused']);

  if (error) {
    throw new Error(`Failed to cancel job: ${error.message}`);
  }
}

/**
 * Pause a running job
 */
export async function pauseJob(jobId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('healing_jobs')
    .update({
      status: 'paused',
    })
    .eq('id', jobId)
    .eq('status', 'running');

  if (error) {
    throw new Error(`Failed to pause job: ${error.message}`);
  }
}

/**
 * Resume a paused job
 */
export async function resumeJob(jobId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('healing_jobs')
    .update({
      status: 'queued',
    })
    .eq('id', jobId)
    .eq('status', 'paused');

  if (error) {
    throw new Error(`Failed to resume job: ${error.message}`);
  }
}

/**
 * List jobs for a user/collection
 */
export async function listJobs(
  userId: string,
  options?: {
    collectionId?: string;
    status?: JobStatus | JobStatus[];
    limit?: number;
    offset?: number;
  }
): Promise<{ jobs: HealingJob[]; total: number }> {
  const supabase = createServerClient();

  let query = supabase
    .from('healing_jobs')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options?.collectionId) {
    query = query.eq('collection_id', options.collectionId);
  }

  if (options?.status) {
    if (Array.isArray(options.status)) {
      query = query.in('status', options.status);
    } else {
      query = query.eq('status', options.status);
    }
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 10) - 1);
  }

  const { data: jobs, count } = await query;

  return {
    jobs: (jobs ?? []).map(mapJobFromDb),
    total: count ?? 0,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Update job status
 */
async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  updates?: Partial<{
    startedAt: string;
    completedAt: string;
    progressPercent: number;
    chunksScanned: number;
    chunksHealed: number;
    chunksFailed: number;
    chunksSkipped: number;
    issuesFound: IssuesSummary;
    actionsTaken: ActionSummary[];
    errors: JobError[];
    workerId: string;
    actualDurationMs: number;
  }>
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('healing_jobs')
    .update({
      status,
      started_at: updates?.startedAt,
      completed_at: updates?.completedAt,
      progress_percent: updates?.progressPercent,
      chunks_scanned: updates?.chunksScanned,
      chunks_healed: updates?.chunksHealed,
      chunks_failed: updates?.chunksFailed,
      chunks_skipped: updates?.chunksSkipped,
      issues_found: updates?.issuesFound,
      actions_taken: updates?.actionsTaken,
      errors: updates?.errors,
      worker_id: updates?.workerId,
      actual_duration_ms: updates?.actualDurationMs,
    })
    .eq('id', jobId);

  if (error) {
    console.error('Failed to update job status:', error);
  }
}

/**
 * Save health record from job results
 */
async function saveHealthFromJob(
  collectionId: string,
  userId: string,
  result: JobExecutionResult
): Promise<void> {
  const supabase = createServerClient();

  await supabase.rpc('update_index_health', {
    p_collection_id: collectionId,
    p_user_id: userId,
    p_total_chunks: result.chunksScanned,
    p_healthy_chunks: result.chunksScanned - result.issuesFound.total,
    p_stale_chunks: result.issuesFound.byType.stale ?? 0,
    p_orphaned_chunks: result.issuesFound.byType.orphaned ?? 0,
    p_missing_embeddings: result.issuesFound.byType.missing_embedding ?? 0,
    p_corrupted_chunks: result.issuesFound.byType.corrupted ?? 0,
    p_check_duration_ms: result.duration,
  });
}

/**
 * Get healing configuration for a user
 */
export async function getHealingConfig(
  userId: string,
  collectionId?: string
): Promise<HealingConfig | null> {
  const supabase = createServerClient();

  // Try to get collection-specific config first
  if (collectionId) {
    const { data: collectionConfig } = await supabase
      .from('healing_config')
      .select('*')
      .eq('user_id', userId)
      .eq('collection_id', collectionId)
      .single();

    if (collectionConfig) {
      return mapConfigFromDb(collectionConfig);
    }
  }

  // Fall back to user default config
  const { data: userConfig } = await supabase
    .from('healing_config')
    .select('*')
    .eq('user_id', userId)
    .is('collection_id', null)
    .single();

  if (userConfig) {
    return mapConfigFromDb(userConfig);
  }

  return null;
}

/**
 * Map database job to typed HealingJob
 */
function mapJobFromDb(job: Record<string, unknown>): HealingJob {
  return {
    id: job.id as string,
    collectionId: job.collection_id as string,
    userId: job.user_id as string,
    orgId: job.org_id as string | undefined,
    jobType: job.job_type as HealingJobType,
    targetIssues: (job.target_issues as IssueType[]) ?? [],
    priority: (job.priority as number) ?? 5,
    status: job.status as JobStatus,
    progressPercent: (job.progress_percent as number) ?? 0,
    chunksScanned: (job.chunks_scanned as number) ?? 0,
    chunksHealed: (job.chunks_healed as number) ?? 0,
    chunksFailed: (job.chunks_failed as number) ?? 0,
    chunksSkipped: (job.chunks_skipped as number) ?? 0,
    issuesFound: (job.issues_found as IssuesSummary) ?? { total: 0, byType: {}, bySeverity: {} },
    actionsTaken: (job.actions_taken as ActionSummary[]) ?? [],
    errors: (job.errors as JobError[]) ?? [],
    scheduledAt: job.scheduled_at as string | undefined,
    startedAt: job.started_at as string | undefined,
    completedAt: job.completed_at as string | undefined,
    estimatedDurationMs: job.estimated_duration_ms as number | undefined,
    actualDurationMs: job.actual_duration_ms as number | undefined,
    workerId: job.worker_id as string | undefined,
    retryCount: (job.retry_count as number) ?? 0,
    maxRetries: (job.max_retries as number) ?? 3,
    triggeredBy: (job.triggered_by as TriggerSource) ?? 'manual',
    triggerRuleId: job.trigger_rule_id as string | undefined,
    createdAt: job.created_at as string,
  };
}

/**
 * Map database config to typed HealingConfig
 */
function mapConfigFromDb(config: Record<string, unknown>): HealingConfig {
  return {
    id: config.id as string,
    userId: config.user_id as string,
    orgId: config.org_id as string | undefined,
    collectionId: config.collection_id as string | undefined,
    autoHealingEnabled: (config.auto_healing_enabled as boolean) ?? DEFAULT_HEALING_CONFIG.autoHealingEnabled,
    autoScanEnabled: (config.auto_scan_enabled as boolean) ?? DEFAULT_HEALING_CONFIG.autoScanEnabled,
    scanIntervalHours: (config.scan_interval_hours as number) ?? DEFAULT_HEALING_CONFIG.scanIntervalHours,
    staleThresholdDays: (config.stale_threshold_days as number) ?? DEFAULT_HEALING_CONFIG.staleThresholdDays,
    healthAlertThreshold: (config.health_alert_threshold as number) ?? DEFAULT_HEALING_CONFIG.healthAlertThreshold,
    criticalAlertThreshold: (config.critical_alert_threshold as number) ?? DEFAULT_HEALING_CONFIG.criticalAlertThreshold,
    maxConcurrentJobs: (config.max_concurrent_jobs as number) ?? DEFAULT_HEALING_CONFIG.maxConcurrentJobs,
    maxChunksPerScan: (config.max_chunks_per_scan as number) ?? DEFAULT_HEALING_CONFIG.maxChunksPerScan,
    batchSize: (config.batch_size as number) ?? DEFAULT_HEALING_CONFIG.batchSize,
    emailAlerts: (config.email_alerts as boolean) ?? DEFAULT_HEALING_CONFIG.emailAlerts,
    webhookAlerts: (config.webhook_alerts as boolean) ?? DEFAULT_HEALING_CONFIG.webhookAlerts,
    webhookUrl: config.webhook_url as string | undefined,
    reembedRateLimit: (config.reembed_rate_limit as number) ?? DEFAULT_HEALING_CONFIG.reembedRateLimit,
    deleteRequiresApproval: (config.delete_requires_approval as boolean) ?? DEFAULT_HEALING_CONFIG.deleteRequiresApproval,
    createdAt: config.created_at as string,
    updatedAt: config.updated_at as string,
  };
}
