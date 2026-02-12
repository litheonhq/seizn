/**
 * Spring Jobs Cron Worker
 *
 * Processes pending jobs from the spring_jobs table.
 * Intended to be called by a cron scheduler (e.g., Vercel Cron, Railway Cron).
 *
 * GET /api/cron/spring/jobs/process
 *
 * Headers:
 *   Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createJobService } from '@/lib/spring/memory-v4/job-service';
import { createIngestionService } from '@/lib/spring/memory-v4/ingestion-service';
import { createSearchServiceV3 } from '@/lib/spring/memory-v4/search-service';
import { verifyCronSecret } from '@/lib/cron-auth';
import type { Job, JobType } from '@/lib/spring/memory-v4/types';

// =============================================================================
// Configuration
// =============================================================================

const MAX_JOBS_PER_RUN = 5;
const JOB_TIMEOUT_MS = 55000; // 55 seconds (leave room for response)

// =============================================================================
// Job Processors
// =============================================================================

interface JobProcessor {
  (job: Job, supabase: ReturnType<typeof createServerClient>): Promise<{
    success: boolean;
    outputData?: Record<string, unknown>;
    error?: string;
  }>;
}

const processors: Partial<Record<JobType, JobProcessor>> = {
  /**
   * Ingest memories
   */
  async ingest(job, supabase) {
    const memories = job.inputData.memories as Array<{
      content: string;
      type?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }>;

    if (!memories || !Array.isArray(memories)) {
      return { success: false, error: 'Invalid input: memories array required' };
    }

    const ingestionService = createIngestionService(supabase);
    const jobService = createJobService(supabase);
    const settings = await ingestionService.getSettings(job.userId);

    let processed = 0;
    let failed = 0;
    const results: Array<{ noteId?: string; action: string; error?: string }> = [];

    for (const memory of memories) {
      try {
        // Evaluate ingestion rules
        const evaluation = await ingestionService.evaluateIngestion(
          job.userId,
          memory.content,
          {
            noteType: memory.type,
            categories: memory.tags,
          }
        );

        if (evaluation.action === 'deny') {
          results.push({ action: 'denied', error: evaluation.reason });
          failed++;
        } else if (evaluation.action === 'redact') {
          // Store redacted content
          const { data } = await supabase
            .from('spring_memory_notes')
            .insert({
              user_id: job.userId,
              content: evaluation.redactedContent || memory.content,
              note_type: memory.type || 'fact',
              tags: memory.tags || [],
              confidence: evaluation.confidence,
              status: settings.candidateModeEnabled ? 'candidate' : 'active',
              payload_json: memory.metadata,
            })
            .select('id')
            .single();

          results.push({ noteId: data?.id, action: 'redacted' });
          processed++;
        } else if (evaluation.action === 'store_as_candidate') {
          const { data } = await supabase
            .from('spring_memory_notes')
            .insert({
              user_id: job.userId,
              content: memory.content,
              note_type: memory.type || 'fact',
              tags: memory.tags || [],
              confidence: evaluation.confidence,
              status: 'candidate',
              payload_json: memory.metadata,
            })
            .select('id')
            .single();

          results.push({ noteId: data?.id, action: 'candidate' });
          processed++;
        } else {
          // Store normally
          const { data } = await supabase
            .from('spring_memory_notes')
            .insert({
              user_id: job.userId,
              content: memory.content,
              note_type: memory.type || 'fact',
              tags: memory.tags || [],
              confidence: evaluation.confidence,
              status: settings.candidateModeEnabled ? 'candidate' : 'active',
              payload_json: memory.metadata,
            })
            .select('id')
            .single();

          results.push({ noteId: data?.id, action: 'stored' });
          processed++;
        }

        // Update progress
        await jobService.updateJobProgress(job.id, {
          processedItems: processed + failed,
          failedItems: failed,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({ action: 'error', error: message });
        failed++;
      }
    }

    return {
      success: failed === 0,
      outputData: {
        processed,
        failed,
        results,
      },
    };
  },

  /**
   * Bulk update memories
   */
  async bulk_update(job, supabase) {
    const updates = job.inputData.updates as Array<{
      noteId: string;
      content?: string;
      type?: string;
      tags?: string[];
    }>;

    if (!updates || !Array.isArray(updates)) {
      return { success: false, error: 'Invalid input: updates array required' };
    }

    const jobService = createJobService(supabase);
    let processed = 0;
    let failed = 0;
    const results: Array<{ noteId: string; success: boolean; error?: string }> = [];

    for (const update of updates) {
      try {
        const updateData: Record<string, unknown> = {};
        if (update.content !== undefined) updateData.content = update.content;
        if (update.type !== undefined) updateData.note_type = update.type;
        if (update.tags !== undefined) updateData.tags = update.tags;
        updateData.updated_at = new Date().toISOString();

        const { error } = await supabase
          .from('spring_memory_notes')
          .update(updateData)
          .eq('id', update.noteId)
          .eq('user_id', job.userId);

        if (error) {
          results.push({ noteId: update.noteId, success: false, error: error.message });
          failed++;
        } else {
          results.push({ noteId: update.noteId, success: true });
          processed++;
        }

        await jobService.updateJobProgress(job.id, {
          processedItems: processed + failed,
          failedItems: failed,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({ noteId: update.noteId, success: false, error: message });
        failed++;
      }
    }

    return {
      success: failed === 0,
      outputData: { processed, failed, results },
    };
  },

  /**
   * Bulk delete memories
   */
  async bulk_delete(job, supabase) {
    const filters = job.inputData.filters as Record<string, unknown>;

    if (!filters) {
      return { success: false, error: 'Invalid input: filters required' };
    }

    // Build delete query
    let query = supabase
      .from('spring_memory_notes')
      .delete()
      .eq('user_id', job.userId);

    if (filters.types && Array.isArray(filters.types)) {
      query = query.in('type', filters.types);
    }

    if (filters.categories && Array.isArray(filters.categories)) {
      query = query.overlaps('categories', filters.categories);
    }

    if (filters.tags && Array.isArray(filters.tags)) {
      query = query.overlaps('tags', filters.tags);
    }

    if (filters.createdBefore) {
      query = query.lt('created_at', filters.createdBefore);
    }

    if (filters.createdAfter) {
      query = query.gt('created_at', filters.createdAfter);
    }

    const { error, count } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      outputData: { deletedCount: count || 0 },
    };
  },

  /**
   * Export memories
   */
  async export(job, supabase) {
    const input = job.inputData as {
      filters?: Record<string, unknown>;
      format?: 'json' | 'jsonl' | 'csv' | 'markdown';
      includeMetadata?: boolean;
      includeProvenance?: boolean;
    };

    const searchService = createSearchServiceV3(supabase);

    // Fetch all matching memories (paginated)
    const allNotes: Array<Record<string, unknown>> = [];
    let offset = 0;
    const batchSize = 100;

    while (true) {
      const response = await searchService.search(job.userId, {
        query: '*',
        filters: input.filters,
        topK: batchSize,
      });

      if (response.results.length === 0) break;

      allNotes.push(...response.results.map(r => ({
        id: r.id,
        content: r.content,
        type: r.type,
        tags: r.tags,
        category: r.category,
        extractionConfidence: r.extractionConfidence,
        createdAt: r.createdAt,
        ...(input.includeMetadata ? { metadata: r.metadata } : {}),
      })));

      if (response.results.length < batchSize) break;
      offset += batchSize;
    }

    // Format export data
    let exportContent: string;
    const format = input.format || 'json';

    switch (format) {
      case 'jsonl':
        exportContent = allNotes.map(n => JSON.stringify(n)).join('\n');
        break;
      case 'csv': {
        const headers = ['id', 'content', 'type', 'tags', 'category', 'extractionConfidence', 'createdAt'];
        const rows = allNotes.map(n =>
          headers.map(h => {
            const val = n[h];
            if (Array.isArray(val)) return `"${val.join(', ')}"`;
            if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
            return val;
          }).join(',')
        );
        exportContent = [headers.join(','), ...rows].join('\n');
        break;
      }
      case 'markdown': {
        exportContent = allNotes.map(n =>
          `## ${n.type || 'Memory'}\n\n${n.content}\n\n` +
          `- Tags: ${(n.tags as string[])?.join(', ') || 'none'}\n` +
          `- Created: ${n.createdAt}\n\n---\n`
        ).join('\n');
        break;
      }
      default:
        exportContent = JSON.stringify(allNotes, null, 2);
    }

    // In production, upload to storage and return download URL
    // For now, store in output_data (limited size)
    const fileSizeBytes = new TextEncoder().encode(exportContent).length;

    return {
      success: true,
      outputData: {
        recordCount: allNotes.length,
        fileSizeBytes,
        format,
        // In production: upload to R2/S3 and return URL
        // downloadUrl: 'https://...',
        data: fileSizeBytes < 1000000 ? exportContent : '[Export too large - check storage]',
      },
    };
  },
};

// =============================================================================
// Main Handler
// =============================================================================

export async function GET(request: NextRequest) {
  // Verify cron authentication
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const results: Array<{
    jobId: string;
    jobType: string;
    status: 'completed' | 'failed' | 'skipped';
    duration: number;
    error?: string;
  }> = [];

  try {
    const supabase = createServerClient();
    const jobService = createJobService(supabase);

    // Get pending jobs
    const pendingJobs = await jobService.getPendingJobs(MAX_JOBS_PER_RUN);

    if (pendingJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending jobs',
        processed: 0,
      });
    }

    for (const job of pendingJobs) {
      const jobStartTime = Date.now();

      // Check timeout
      if (Date.now() - startTime > JOB_TIMEOUT_MS) {
        results.push({
          jobId: job.id,
          jobType: job.jobType,
          status: 'skipped',
          duration: 0,
          error: 'Timeout - will process in next run',
        });
        continue;
      }

      // Claim the job
      const claimed = await jobService.claimJob(job.id);
      if (!claimed) {
        results.push({
          jobId: job.id,
          jobType: job.jobType,
          status: 'skipped',
          duration: Date.now() - jobStartTime,
          error: 'Job already claimed',
        });
        continue;
      }

      // Get processor for job type
      const processor = processors[job.jobType];
      if (!processor) {
        await jobService.updateJobStatus(job.id, 'failed', {
          errorMessage: `Unsupported job type: ${job.jobType}`,
        });
        results.push({
          jobId: job.id,
          jobType: job.jobType,
          status: 'failed',
          duration: Date.now() - jobStartTime,
          error: 'Unsupported job type',
        });
        continue;
      }

      try {
        // Process the job
        const result = await processor(job, supabase);

        if (result.success) {
          await jobService.updateJobStatus(job.id, 'completed', {
            outputData: result.outputData,
          });
          results.push({
            jobId: job.id,
            jobType: job.jobType,
            status: 'completed',
            duration: Date.now() - jobStartTime,
          });
        } else {
          await jobService.updateJobStatus(job.id, 'failed', {
            errorMessage: result.error || 'Unknown error',
            outputData: result.outputData,
          });
          results.push({
            jobId: job.id,
            jobType: job.jobType,
            status: 'failed',
            duration: Date.now() - jobStartTime,
            error: result.error,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await jobService.updateJobStatus(job.id, 'failed', {
          errorMessage: message,
          errorDetails: error instanceof Error ? { stack: error.stack } : undefined,
        });
        results.push({
          jobId: job.id,
          jobType: job.jobType,
          status: 'failed',
          duration: Date.now() - jobStartTime,
          error: message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      completed: results.filter(r => r.status === 'completed').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      duration: Date.now() - startTime,
      results,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        duration: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export { GET as POST };
