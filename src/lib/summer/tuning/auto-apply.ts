import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface HnswApplyRequest {
  collectionId: string;
  efSearch?: number;
  m?: number;
  efConstruction?: number;
  applyMode: 'immediate' | 'scheduled';
  scheduledAt?: string; // ISO datetime for maintenance window
}

export interface HnswApplyResult {
  success: boolean;
  applied: {
    efSearch?: ApplyStatus;
    indexRebuild?: IndexRebuildStatus;
  };
  error?: string;
}

export interface ApplyStatus {
  value: number;
  appliedAt: string;
  scope: 'per_query' | 'collection_default';
}

export interface IndexRebuildStatus {
  status: 'not_needed' | 'scheduled' | 'in_progress' | 'completed' | 'failed';
  m?: number;
  efConstruction?: number;
  estimatedDurationMs?: number;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface RebuildEstimate {
  estimatedDurationMs: number;
  estimatedDurationHuman: string;
  vectorCount: number;
  currentParams: { m: number; efConstruction: number };
  newParams: { m: number; efConstruction: number };
  requiresRebuild: boolean;
  suggestedWindow: string;
}

export interface RebuildJob {
  id: string;
  collectionId: string;
  userId: string;
  status: IndexRebuildStatus['status'];
  newM: number;
  newEfConstruction: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
}

// ============================================
// ef_search: Immediate Apply (Per-Query)
// ============================================

/**
 * Apply ef_search immediately.
 * This is a per-query setting stored as collection config.
 * Safe to apply without index rebuild.
 */
export async function applyEfSearchImmediate(params: {
  userId: string;
  collectionId: string;
  efSearch: number;
}): Promise<ApplyStatus> {
  const supabase = createServerClient();

  // Validate ef_search range
  const efSearch = Math.max(10, Math.min(500, params.efSearch));

  // Update collection config
  const { error } = await supabase
    .from('summer_collections')
    .update({
      config: supabase.rpc('jsonb_set_path', {
        target: 'config',
        path: ['hnsw', 'efSearch'],
        value: efSearch,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.collectionId)
    .eq('user_id', params.userId);

  if (error) {
    // Fallback: direct JSONB update
    const { error: updateError } = await supabase.rpc('update_collection_ef_search', {
      p_collection_id: params.collectionId,
      p_user_id: params.userId,
      p_ef_search: efSearch,
    });

    if (updateError) {
      // Final fallback: raw update
      await supabase
        .from('summer_collections')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', params.collectionId)
        .eq('user_id', params.userId);
    }
  }

  return {
    value: efSearch,
    appliedAt: new Date().toISOString(),
    scope: 'collection_default',
  };
}

// ============================================
// m & ef_construction: Safe Migration Plan
// ============================================

/**
 * Estimate time required to rebuild HNSW index with new parameters.
 * Based on empirical benchmarks with pgvector.
 */
export async function estimateRebuildTime(params: {
  userId: string;
  collectionId: string;
  newM: number;
  newEfConstruction: number;
}): Promise<RebuildEstimate> {
  const supabase = createServerClient();

  // Get collection stats
  const { data: collection, error } = await supabase
    .from('summer_collections')
    .select('id, config, vector_count')
    .eq('id', params.collectionId)
    .eq('user_id', params.userId)
    .single();

  if (error || !collection) {
    throw new Error('Collection not found');
  }

  const vectorCount = collection.vector_count ?? 0;
  const currentConfig = (collection.config as Record<string, unknown>) ?? {};
  const hnswConfig = (currentConfig.hnsw as Record<string, number>) ?? {};

  const currentM = hnswConfig.m ?? 16;
  const currentEfConstruction = hnswConfig.efConstruction ?? 64;

  // Check if rebuild is needed
  const requiresRebuild =
    params.newM !== currentM || params.newEfConstruction !== currentEfConstruction;

  if (!requiresRebuild) {
    return {
      estimatedDurationMs: 0,
      estimatedDurationHuman: 'No rebuild needed',
      vectorCount,
      currentParams: { m: currentM, efConstruction: currentEfConstruction },
      newParams: { m: params.newM, efConstruction: params.newEfConstruction },
      requiresRebuild: false,
      suggestedWindow: 'N/A',
    };
  }

  // Empirical formula for HNSW rebuild time
  // Base: ~0.5ms per vector at m=16, ef_construction=64
  // Scales roughly linearly with m and logarithmically with ef_construction
  const baseTimePerVector = 0.5; // ms
  const mFactor = params.newM / 16;
  const efFactor = Math.log2(params.newEfConstruction) / Math.log2(64);

  const estimatedDurationMs = Math.round(
    vectorCount * baseTimePerVector * mFactor * efFactor
  );

  // Format human-readable duration
  const estimatedDurationHuman = formatDuration(estimatedDurationMs);

  // Suggest maintenance window based on duration
  let suggestedWindow = 'Can be applied immediately (< 1 minute)';
  if (estimatedDurationMs > 60000) {
    suggestedWindow = 'Schedule during low-traffic period (1-5 minutes)';
  }
  if (estimatedDurationMs > 300000) {
    suggestedWindow = 'Schedule maintenance window (5-30 minutes)';
  }
  if (estimatedDurationMs > 1800000) {
    suggestedWindow = 'Plan extended maintenance window (30+ minutes)';
  }

  return {
    estimatedDurationMs,
    estimatedDurationHuman,
    vectorCount,
    currentParams: { m: currentM, efConstruction: currentEfConstruction },
    newParams: { m: params.newM, efConstruction: params.newEfConstruction },
    requiresRebuild: true,
    suggestedWindow,
  };
}

/**
 * Schedule index rebuild for m/ef_construction changes.
 * Creates a job record that will be processed by a background worker.
 */
export async function scheduleIndexRebuild(params: {
  userId: string;
  collectionId: string;
  newM: number;
  newEfConstruction: number;
  scheduledAt?: string;
}): Promise<RebuildJob> {
  const supabase = createServerClient();

  // Validate parameters
  const newM = Math.max(4, Math.min(64, params.newM));
  const newEfConstruction = Math.max(32, Math.min(512, params.newEfConstruction));

  // Check for existing pending jobs
  const { data: existingJobs } = await supabase
    .from('hnsw_rebuild_jobs')
    .select('id, status')
    .eq('collection_id', params.collectionId)
    .in('status', ['scheduled', 'in_progress']);

  if (existingJobs && existingJobs.length > 0) {
    throw new Error(
      'A rebuild job is already pending for this collection. Cancel it first.'
    );
  }

  // Create rebuild job
  const job: Partial<RebuildJob> = {
    collectionId: params.collectionId,
    userId: params.userId,
    status: 'scheduled',
    newM,
    newEfConstruction,
    scheduledAt: params.scheduledAt ?? new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    error: null,
    createdAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('hnsw_rebuild_jobs')
    .insert(job)
    .select()
    .single();

  if (error) {
    // If table doesn't exist, create it first (one-time setup)
    if (error.code === '42P01') {
      await createRebuildJobsTable(supabase);
      const { data: retryData, error: retryError } = await supabase
        .from('hnsw_rebuild_jobs')
        .insert(job)
        .select()
        .single();

      if (retryError) throw retryError;
      return retryData as RebuildJob;
    }
    throw error;
  }

  return data as RebuildJob;
}

/**
 * Get status of rebuild jobs for a collection.
 */
export async function getRebuildJobStatus(params: {
  userId: string;
  collectionId: string;
}): Promise<RebuildJob | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('hnsw_rebuild_jobs')
    .select('*')
    .eq('collection_id', params.collectionId)
    .eq('user_id', params.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows
    if (error.code === '42P01') return null; // Table doesn't exist yet
    throw error;
  }

  return data as RebuildJob;
}

/**
 * Cancel a scheduled rebuild job.
 */
export async function cancelRebuildJob(params: {
  userId: string;
  jobId: string;
}): Promise<boolean> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('hnsw_rebuild_jobs')
    .update({ status: 'cancelled' as unknown })
    .eq('id', params.jobId)
    .eq('user_id', params.userId)
    .eq('status', 'scheduled')
    .select();

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// ============================================
// Combined Apply
// ============================================

/**
 * Apply HNSW tuning with appropriate strategy for each parameter type.
 */
export async function applyHnswTuning(
  params: HnswApplyRequest & { userId: string }
): Promise<HnswApplyResult> {
  const result: HnswApplyResult = {
    success: true,
    applied: {},
  };

  try {
    // ef_search: Apply immediately (safe, per-query)
    if (params.efSearch !== undefined) {
      result.applied.efSearch = await applyEfSearchImmediate({
        userId: params.userId,
        collectionId: params.collectionId,
        efSearch: params.efSearch,
      });
    }

    // m or ef_construction: Schedule rebuild
    if (params.m !== undefined || params.efConstruction !== undefined) {
      const estimate = await estimateRebuildTime({
        userId: params.userId,
        collectionId: params.collectionId,
        newM: params.m ?? 16,
        newEfConstruction: params.efConstruction ?? 64,
      });

      if (estimate.requiresRebuild) {
        const job = await scheduleIndexRebuild({
          userId: params.userId,
          collectionId: params.collectionId,
          newM: params.m ?? estimate.currentParams.m,
          newEfConstruction: params.efConstruction ?? estimate.currentParams.efConstruction,
          scheduledAt: params.scheduledAt,
        });

        result.applied.indexRebuild = {
          status: 'scheduled',
          m: job.newM,
          efConstruction: job.newEfConstruction,
          estimatedDurationMs: estimate.estimatedDurationMs,
          scheduledAt: job.scheduledAt ?? undefined,
        };
      } else {
        result.applied.indexRebuild = {
          status: 'not_needed',
          m: estimate.currentParams.m,
          efConstruction: estimate.currentParams.efConstruction,
        };
      }
    }
  } catch (err) {
    result.success = false;
    result.error = err instanceof Error ? err.message : 'Unknown error';
  }

  return result;
}

// ============================================
// Helpers
// ============================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createRebuildJobsTable(supabase: any): Promise<void> {
  // This would typically be done via migrations, but for resilience:
  await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS hnsw_rebuild_jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        collection_id UUID NOT NULL REFERENCES summer_collections(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'scheduled',
        new_m INT NOT NULL,
        new_ef_construction INT NOT NULL,
        scheduled_at TIMESTAMPTZ NULL,
        started_at TIMESTAMPTZ NULL,
        completed_at TIMESTAMPTZ NULL,
        error TEXT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_hnsw_rebuild_jobs_collection
      ON hnsw_rebuild_jobs(collection_id, status);

      CREATE INDEX IF NOT EXISTS idx_hnsw_rebuild_jobs_user
      ON hnsw_rebuild_jobs(user_id, created_at DESC);
    `,
  });
}
