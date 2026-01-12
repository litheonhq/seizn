import { createServerClient } from '@/lib/supabase';

export interface EnqueueDeletionJobParams {
  userId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function enqueueDeletionJob(params: EnqueueDeletionJobParams): Promise<{ jobId: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_deletion_jobs')
    .insert({
      user_id: params.userId,
      reason: params.reason ?? null,
      metadata: params.metadata ?? {},
      status: 'queued',
    })
    .select('id')
    .single();

  if (error) throw error;
  return { jobId: data.id as string };
}

export interface RunDeletionJobParams {
  jobId: string;
}

/**
 * MVP runner. In production, run this in a background worker (cron/queue).
 *
 * Deletes:
 * - Summer: collections/documents/chunks (via cascade on user_id)
 * - Fall: traces/feedback/eval/experiments (via user_id cascade)
 * - Spring memory tables (if still present): memories (best-effort)
 */
export async function runDeletionJob(params: RunDeletionJobParams): Promise<void> {
  const supabase = createServerClient();

  // Mark running
  await supabase
    .from('winter_deletion_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', params.jobId);

  try {
    // Fetch job
    const { data: job, error: jobErr } = await supabase
      .from('winter_deletion_jobs')
      .select('user_id')
      .eq('id', params.jobId)
      .single();

    if (jobErr) throw jobErr;
    const userId = job.user_id as string;

    // Delete best-effort from known tables.
    // NOTE: Many tables already have ON DELETE CASCADE via profiles(id).
    // For safety, we explicitly delete top-level summer collections.
    await supabase.from('summer_collections').delete().eq('user_id', userId);
    await supabase.from('fall_eval_datasets').delete().eq('user_id', userId);
    await supabase.from('fall_experiments').delete().eq('user_id', userId);
    await supabase.from('fall_retrieval_traces').delete().eq('user_id', userId);
    await supabase.from('fall_retrieval_feedback').delete().eq('user_id', userId);
    await supabase.from('winter_policies').delete().eq('user_id', userId);
    await supabase.from('winter_pii_events').delete().eq('user_id', userId);

    // Spring memory tables (optional). Ignore if table doesn't exist.
    try {
      await supabase.from('memories').delete().eq('user_id', userId);
    } catch {
      // ignore
    }

    // Finish success
    await supabase
      .from('winter_deletion_jobs')
      .update({ status: 'success', finished_at: new Date().toISOString(), error: null })
      .eq('id', params.jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await supabase
      .from('winter_deletion_jobs')
      .update({ status: 'failed', finished_at: new Date().toISOString(), error: message })
      .eq('id', params.jobId);
    throw err;
  }
}
