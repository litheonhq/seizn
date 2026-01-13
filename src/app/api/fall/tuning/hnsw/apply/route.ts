import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  applyHnswTuning,
  estimateRebuildTime,
  cancelRebuildJob,
  getRebuildJobStatus,
  type HnswApplyRequest,
} from '@/lib/summer/tuning';

/**
 * POST /api/fall/tuning/hnsw/apply
 *
 * Apply HNSW tuning parameters to a collection.
 *
 * Request body:
 * {
 *   collection_id: string (required)
 *   ef_search?: number - Applied immediately per-query
 *   m?: number - Requires index rebuild
 *   ef_construction?: number - Requires index rebuild
 *   apply_mode?: 'immediate' | 'scheduled' (default: 'immediate')
 *   scheduled_at?: string - ISO datetime for scheduled rebuild
 * }
 *
 * Response:
 * {
 *   success: boolean
 *   applied: {
 *     ef_search?: { value, applied_at, scope }
 *     index_rebuild?: { status, m, ef_construction, estimated_duration_ms, scheduled_at }
 *   }
 *   error?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    const body = await request.json();

    // Validate required fields
    if (!body.collection_id) {
      return NextResponse.json(
        { error: 'collection_id is required' },
        { status: 400 }
      );
    }

    // Validate at least one parameter is provided
    if (
      body.ef_search === undefined &&
      body.m === undefined &&
      body.ef_construction === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one of ef_search, m, or ef_construction is required' },
        { status: 400 }
      );
    }

    // Build apply request
    const applyRequest: HnswApplyRequest & { userId: string } = {
      userId,
      collectionId: body.collection_id,
      applyMode: body.apply_mode ?? 'immediate',
      scheduledAt: body.scheduled_at,
    };

    if (body.ef_search !== undefined) {
      const efSearch = Number(body.ef_search);
      if (!Number.isFinite(efSearch) || efSearch < 10 || efSearch > 500) {
        return NextResponse.json(
          { error: 'ef_search must be between 10 and 500' },
          { status: 400 }
        );
      }
      applyRequest.efSearch = efSearch;
    }

    if (body.m !== undefined) {
      const m = Number(body.m);
      if (!Number.isFinite(m) || m < 4 || m > 64) {
        return NextResponse.json(
          { error: 'm must be between 4 and 64' },
          { status: 400 }
        );
      }
      applyRequest.m = m;
    }

    if (body.ef_construction !== undefined) {
      const efConstruction = Number(body.ef_construction);
      if (!Number.isFinite(efConstruction) || efConstruction < 32 || efConstruction > 512) {
        return NextResponse.json(
          { error: 'ef_construction must be between 32 and 512' },
          { status: 400 }
        );
      }
      applyRequest.efConstruction = efConstruction;
    }

    // Apply tuning
    const result = await applyHnswTuning(applyRequest);

    // Format response with snake_case keys for consistency
    const response = {
      success: result.success,
      applied: {
        ef_search: result.applied.efSearch
          ? {
              value: result.applied.efSearch.value,
              applied_at: result.applied.efSearch.appliedAt,
              scope: result.applied.efSearch.scope,
            }
          : undefined,
        index_rebuild: result.applied.indexRebuild
          ? {
              status: result.applied.indexRebuild.status,
              m: result.applied.indexRebuild.m,
              ef_construction: result.applied.indexRebuild.efConstruction,
              estimated_duration_ms: result.applied.indexRebuild.estimatedDurationMs,
              scheduled_at: result.applied.indexRebuild.scheduledAt,
            }
          : undefined,
      },
      error: result.error,
    };

    return NextResponse.json(response, {
      status: result.success ? 200 : 500,
    });
  } catch (err) {
    console.error('HNSW apply error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/fall/tuning/hnsw/apply?collection_id=xxx
 *
 * Get rebuild estimate and current job status.
 *
 * Query parameters:
 * - collection_id: string (required)
 * - m?: number - Target m value for estimate
 * - ef_construction?: number - Target ef_construction for estimate
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    const url = new URL(request.url);
    const collectionId = url.searchParams.get('collection_id');

    if (!collectionId) {
      return NextResponse.json(
        { error: 'collection_id is required' },
        { status: 400 }
      );
    }

    const m = Number(url.searchParams.get('m') ?? 16);
    const efConstruction = Number(url.searchParams.get('ef_construction') ?? 64);

    // Get rebuild estimate
    const estimate = await estimateRebuildTime({
      userId,
      collectionId,
      newM: m,
      newEfConstruction: efConstruction,
    });

    // Get current job status
    let currentJob = null;
    try {
      currentJob = await getRebuildJobStatus({ userId, collectionId });
    } catch {
      // Table may not exist yet
    }

    return NextResponse.json({
      success: true,
      estimate: {
        estimated_duration_ms: estimate.estimatedDurationMs,
        estimated_duration_human: estimate.estimatedDurationHuman,
        vector_count: estimate.vectorCount,
        current_params: {
          m: estimate.currentParams.m,
          ef_construction: estimate.currentParams.efConstruction,
        },
        new_params: {
          m: estimate.newParams.m,
          ef_construction: estimate.newParams.efConstruction,
        },
        requires_rebuild: estimate.requiresRebuild,
        suggested_window: estimate.suggestedWindow,
      },
      current_job: currentJob
        ? {
            id: currentJob.id,
            status: currentJob.status,
            new_m: currentJob.newM,
            new_ef_construction: currentJob.newEfConstruction,
            scheduled_at: currentJob.scheduledAt,
            started_at: currentJob.startedAt,
            completed_at: currentJob.completedAt,
            error: currentJob.error,
          }
        : null,
    });
  } catch (err) {
    console.error('HNSW apply GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/fall/tuning/hnsw/apply?job_id=xxx
 *
 * Cancel a scheduled rebuild job.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    const url = new URL(request.url);
    const jobId = url.searchParams.get('job_id');

    if (!jobId) {
      return NextResponse.json(
        { error: 'job_id is required' },
        { status: 400 }
      );
    }

    const cancelled = await cancelRebuildJob({ userId, jobId });

    if (!cancelled) {
      return NextResponse.json(
        { error: 'Job not found or cannot be cancelled (already in progress or completed)' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Rebuild job cancelled',
      job_id: jobId,
    });
  } catch (err) {
    console.error('HNSW apply DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
