/**
 * Job Service
 *
 * Manages async jobs for ingestion, consolidation, export, and bulk operations.
 * Implements Mem0-style "async-by-default" pattern.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Job,
  JobType,
  JobStatus,
  CreateJobInput,
  JobProgress,
  ExportRequest,
  ExportResult,
  SearchFiltersV3,
} from './types';

// =============================================================================
// Job Service
// =============================================================================

export class JobService {
  constructor(private supabase: SupabaseClient) {}

  // ===========================================================================
  // Job CRUD
  // ===========================================================================

  /**
   * Create a new job
   */
  async createJob(userId: string, input: CreateJobInput): Promise<Job> {
    const { data, error } = await this.supabase
      .from('spring_jobs')
      .insert({
        user_id: userId,
        job_type: input.jobType,
        status: 'pending',
        input_data: input.inputData,
        total_items: input.totalItems,
        max_retries: input.maxRetries ?? 3,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create job: ${error.message}`);
    }

    return this.mapJobFromDb(data);
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId: string): Promise<Job | null> {
    const { data, error } = await this.supabase
      .from('spring_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get job: ${error.message}`);
    }

    return this.mapJobFromDb(data);
  }

  /**
   * List jobs for a user
   */
  async listJobs(
    userId: string,
    options?: {
      status?: JobStatus;
      jobType?: JobType;
      limit?: number;
      offset?: number;
    }
  ): Promise<Job[]> {
    let query = this.supabase
      .from('spring_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (options?.jobType) {
      query = query.eq('job_type', options.jobType);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list jobs: ${error.message}`);
    }

    return (data || []).map(this.mapJobFromDb);
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    extras?: {
      errorMessage?: string;
      errorDetails?: Record<string, unknown>;
      outputData?: Record<string, unknown>;
    }
  ): Promise<Job> {
    const updates: Record<string, unknown> = { status };

    if (status === 'running' && !extras?.errorMessage) {
      updates.started_at = new Date().toISOString();
    }

    if (status === 'completed' || status === 'failed') {
      updates.completed_at = new Date().toISOString();
    }

    if (extras?.errorMessage) {
      updates.error_message = extras.errorMessage;
    }

    if (extras?.errorDetails) {
      updates.error_details = extras.errorDetails;
    }

    if (extras?.outputData) {
      updates.output_data = extras.outputData;
    }

    const { data, error } = await this.supabase
      .from('spring_jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update job status: ${error.message}`);
    }

    return this.mapJobFromDb(data);
  }

  /**
   * Update job progress
   */
  async updateJobProgress(jobId: string, progress: JobProgress): Promise<void> {
    const updates: Record<string, unknown> = {
      processed_items: progress.processedItems,
    };

    if (progress.failedItems !== undefined) {
      updates.failed_items = progress.failedItems;
    }

    if (progress.outputData) {
      updates.output_data = progress.outputData;
    }

    const { error } = await this.supabase
      .from('spring_jobs')
      .update(updates)
      .eq('id', jobId);

    if (error) {
      throw new Error(`Failed to update job progress: ${error.message}`);
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    await this.updateJobStatus(jobId, 'cancelled');
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<Job> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'failed') {
      throw new Error('Only failed jobs can be retried');
    }

    if (job.retryCount >= job.maxRetries) {
      throw new Error('Max retries exceeded');
    }

    const { data, error } = await this.supabase
      .from('spring_jobs')
      .update({
        status: 'pending',
        retry_count: job.retryCount + 1,
        error_message: null,
        error_details: null,
        started_at: null,
        completed_at: null,
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to retry job: ${error.message}`);
    }

    return this.mapJobFromDb(data);
  }

  // ===========================================================================
  // Export Jobs
  // ===========================================================================

  /**
   * Create an export job
   */
  async createExportJob(
    userId: string,
    request: ExportRequest
  ): Promise<ExportResult> {
    // Create the job
    const job = await this.createJob(userId, {
      jobType: 'export',
      inputData: {
        filters: request.filters,
        templateId: request.templateId,
        format: request.format || 'json',
        includeMetadata: request.includeMetadata ?? true,
        includeProvenance: request.includeProvenance ?? false,
        includeMindmap: request.includeMindmap ?? false,
        signExport: request.signExport ?? false,
      },
    });

    // Set expiration (24 hours)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.supabase
      .from('spring_jobs')
      .update({ expires_at: expiresAt.toISOString() })
      .eq('id', job.id);

    return {
      jobId: job.id,
      status: job.status,
      expiresAt,
    };
  }

  /**
   * Get export result (after job completes)
   */
  async getExportResult(jobId: string): Promise<ExportResult> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error('Export job not found');
    }

    if (job.jobType !== 'export') {
      throw new Error('Not an export job');
    }

    const result: ExportResult = {
      jobId: job.id,
      status: job.status,
      expiresAt: job.expiresAt,
    };

    if (job.status === 'completed' && job.outputData) {
      result.downloadUrl = job.outputData.downloadUrl as string;
      result.recordCount = job.outputData.recordCount as number;
      result.fileSizeBytes = job.outputData.fileSizeBytes as number;
      result.signature = job.outputData.signature as string | undefined;
    }

    return result;
  }

  // ===========================================================================
  // Ingestion Jobs
  // ===========================================================================

  /**
   * Create an async ingestion job
   */
  async createIngestionJob(
    userId: string,
    memories: Array<{
      content: string;
      type?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }>
  ): Promise<Job> {
    return this.createJob(userId, {
      jobType: 'ingest',
      inputData: { memories },
      totalItems: memories.length,
    });
  }

  /**
   * Create a bulk update job
   */
  async createBulkUpdateJob(
    userId: string,
    updates: Array<{
      noteId: string;
      content?: string;
      type?: string;
      tags?: string[];
    }>
  ): Promise<Job> {
    return this.createJob(userId, {
      jobType: 'bulk_update',
      inputData: { updates },
      totalItems: updates.length,
    });
  }

  /**
   * Create a bulk delete job
   */
  async createBulkDeleteJob(
    userId: string,
    filters: SearchFiltersV3
  ): Promise<Job> {
    return this.createJob(userId, {
      jobType: 'bulk_delete',
      inputData: { filters },
    });
  }

  // ===========================================================================
  // Job Processing (Worker)
  // ===========================================================================

  /**
   * Get pending jobs for processing
   */
  async getPendingJobs(limit = 10): Promise<Job[]> {
    const { data, error } = await this.supabase
      .from('spring_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get pending jobs: ${error.message}`);
    }

    return (data || []).map(this.mapJobFromDb);
  }

  /**
   * Claim a job for processing
   */
  async claimJob(jobId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('spring_jobs')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('status', 'pending')
      .select();

    if (error) {
      throw new Error(`Failed to claim job: ${error.message}`);
    }

    return (data?.length || 0) > 0;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private mapJobFromDb(row: Record<string, unknown>): Job {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      jobType: row.job_type as JobType,
      status: row.status as JobStatus,
      inputData: row.input_data as Record<string, unknown>,
      outputData: row.output_data as Record<string, unknown> | undefined,
      totalItems: row.total_items as number | undefined,
      processedItems: row.processed_items as number,
      failedItems: row.failed_items as number,
      errorMessage: row.error_message as string | undefined,
      errorDetails: row.error_details as Record<string, unknown> | undefined,
      retryCount: row.retry_count as number,
      maxRetries: row.max_retries as number,
      createdAt: new Date(row.created_at as string),
      startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createJobService(supabase: SupabaseClient): JobService {
  return new JobService(supabase);
}
