import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { runDeletionJob } from '@/lib/winter/forget';
import { verifyCronSecret } from '@/lib/cron-auth';

// Configuration
const BATCH_SIZE = 10; // Process up to 10 jobs per cron run
const MAX_JOB_AGE_HOURS = 168; // 7 days - fail old jobs

/**
 * GET /api/cron/winter/rtbf/process-queue
 *
 * Process pending RTBF deletion jobs from the queue.
 * Should be called periodically (e.g., every hour) via cron.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const now = new Date();

  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    const supabase = createServerClient();

    // First, fail any old queued jobs that have been waiting too long
    const cutoffDate = new Date(now.getTime() - MAX_JOB_AGE_HOURS * 60 * 60 * 1000);

    const { data: staleJobs, error: staleError } = await supabase
      .from('winter_deletion_jobs')
      .update({
        status: 'failed',
        finished_at: now.toISOString(),
        error: `Job expired after ${MAX_JOB_AGE_HOURS} hours in queue`,
      })
      .eq('status', 'queued')
      .lt('created_at', cutoffDate.toISOString())
      .select('id');

    if (!staleError && staleJobs?.length) {
      results.skipped += staleJobs.length;
      console.log(`[RTBF Cron] Failed ${staleJobs.length} stale jobs`);
    }

    // Fetch pending deletion jobs
    const { data: jobs, error: fetchError } = await supabase
      .from('winter_deletion_jobs')
      .select('id, user_id, created_at')
      .eq('status', 'queued')
      .order('created_at', { ascending: true }) // FIFO
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[RTBF Cron] Failed to fetch jobs:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch deletion jobs' },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      console.log('[RTBF Cron] No pending deletion jobs');
      return NextResponse.json({
        success: true,
        message: 'No pending deletion jobs',
        results,
        duration_ms: Date.now() - startTime,
        timestamp: now.toISOString(),
      });
    }

    console.log(`[RTBF Cron] Processing ${jobs.length} deletion jobs`);

    // Process each job
    for (const job of jobs) {
      results.processed++;

      try {
        await runDeletionJob({ jobId: job.id });
        results.success++;
        console.log(`[RTBF Cron] Successfully processed job ${job.id} for user ${job.user_id}`);

        // Log success to audit
        await supabase.from('audit_logs').insert({
          user_id: job.user_id,
          action: 'winter.rtbf.job_completed',
          resource_type: 'deletion_job',
          resource_id: job.id,
          details: { processed_by: 'cron' },
          status: 'success',
        });
      } catch (err) {
        results.failed++;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`Job ${job.id}: ${errorMessage}`);
        console.error(`[RTBF Cron] Failed to process job ${job.id}:`, errorMessage);

        // Log failure to audit
        await supabase.from('audit_logs').insert({
          user_id: job.user_id,
          action: 'winter.rtbf.job_failed',
          resource_type: 'deletion_job',
          resource_id: job.id,
          details: { processed_by: 'cron', error: errorMessage },
          status: 'failed',
          error_message: errorMessage,
        });
      }
    }

    const duration = Date.now() - startTime;

    // Log cron execution
    await supabase.from('audit_logs').insert({
      user_id: null, // System action
      action: 'system.rtbf_queue_process',
      resource_type: 'winter_deletion_jobs',
      resource_id: null,
      details: {
        batch_size: BATCH_SIZE,
        jobs_processed: results.processed,
        jobs_success: results.success,
        jobs_failed: results.failed,
        jobs_skipped: results.skipped,
        duration_ms: duration,
      },
      status: results.failed > 0 ? 'partial' : 'success',
    });

    return NextResponse.json({
      success: results.failed === 0,
      results,
      duration_ms: duration,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RTBF Cron] Cron error:', errorMessage);

    // Log the failure
    try {
      const supabase = createServerClient();
      await supabase.from('audit_logs').insert({
        user_id: null,
        action: 'system.rtbf_queue_process',
        resource_type: 'winter_deletion_jobs',
        resource_id: null,
        details: { batch_size: BATCH_SIZE },
        status: 'failed',
        error_message: errorMessage,
      });
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
