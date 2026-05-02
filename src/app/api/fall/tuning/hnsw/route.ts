/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  recommendHnswIndex,
  recommendEfSearch,
  analyzeWorkload,
  generateWorkloadRecommendation,
  getRebuildJobStatus,
} from '@/lib/summer/tuning';

/**
 * GET /api/fall/tuning/hnsw
 *
 * Query parameters:
 * - vector_count: Number of vectors (for heuristic recommendation)
 * - dim: Vector dimension (for heuristic recommendation)
 * - workload: 'latency' | 'recall' | 'balanced' (for heuristic)
 * - top_k: Default topK for search recommendations
 * - collection_id: Collection ID for workload-based recommendations
 * - days_back: Days of trace data to analyze (default: 7)
 * - mode: 'heuristic' | 'workload' | 'both' (default: 'both')
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, plan } = authResult;

    const url = new URL(request.url);

    // Parse query parameters
    const vectorCount = Number(url.searchParams.get('vector_count') ?? 0);
    const dim = Number(url.searchParams.get('dim') ?? 0);
    const workloadParam = url.searchParams.get('workload') ?? 'balanced';
    const workload =
      workloadParam === 'latency' || workloadParam === 'recall' || workloadParam === 'balanced'
        ? workloadParam
        : 'balanced';
    const topK = Number(url.searchParams.get('top_k') ?? 20);
    const collectionId = url.searchParams.get('collection_id');
    const daysBack = Number(url.searchParams.get('days_back') ?? 7);
    const mode = (url.searchParams.get('mode') ?? 'both') as
      | 'heuristic'
      | 'workload'
      | 'both';

    const response: Record<string, unknown> = {
      success: true,
    };

    // Heuristic recommendations (existing logic)
    if (mode === 'heuristic' || mode === 'both') {
      const indexRec = recommendHnswIndex({
        vectorCount: Number.isFinite(vectorCount) && vectorCount > 0 ? vectorCount : 100_000,
        dim: Number.isFinite(dim) && dim > 0 ? dim : 1536,
        workload,
      });

      const searchRec = recommendEfSearch({
        topK: Number.isFinite(topK) ? topK : 20,
        plan,
      });

      response.heuristic = {
        index: indexRec,
        search: searchRec,
      };

      // Backward compatibility
      if (mode === 'heuristic') {
        response.index = indexRec;
        response.search = searchRec;
      }
    }

    // Workload-based recommendations (new)
    if ((mode === 'workload' || mode === 'both') && collectionId) {
      try {
        const workloadStats = await analyzeWorkload({
          userId,
          collectionId,
          daysBack,
        });

        if (workloadStats.length > 0) {
          const stats = workloadStats[0]; // Primary collection
          const workloadRec = generateWorkloadRecommendation(stats);

          response.workload = {
            stats,
            recommendation: workloadRec,
          };

          // If only workload mode, also set top-level for convenience
          if (mode === 'workload') {
            response.index = {
              m: workloadRec.m,
              efConstruction: workloadRec.efConstruction,
              reason: workloadRec.reasoning.join('; '),
            };
            response.search = {
              efSearch: workloadRec.efSearch,
              reason: `Workload-based: ${workloadRec.workloadPattern.pattern} pattern`,
            };
          }
        } else {
          response.workload = {
            stats: null,
            recommendation: null,
            message: 'No trace data available for workload analysis. Using heuristic.',
          };
        }
      } catch (err) {
        console.error('Workload analysis error:', err);
        response.workload = {
          error: 'Failed to analyze workload',
          message: 'Falling back to heuristic recommendations',
        };
      }

      // Check for pending rebuild jobs
      try {
        const rebuildJob = await getRebuildJobStatus({ userId, collectionId });
        if (rebuildJob) {
          response.rebuildJob = {
            id: rebuildJob.id,
            status: rebuildJob.status,
            scheduledAt: rebuildJob.scheduledAt,
            startedAt: rebuildJob.startedAt,
            completedAt: rebuildJob.completedAt,
            error: rebuildJob.error,
          };
        }
      } catch {
        // Ignore - rebuild jobs table may not exist yet
      }
    }

    // Combined recommendation (best of both)
    if (mode === 'both') {
      const heuristic = response.heuristic as any;
      const workloadData = response.workload as any;

      if (workloadData?.recommendation) {
        // Prefer workload-based when available
        response.recommended = {
          m: workloadData.recommendation.m,
          efConstruction: workloadData.recommendation.efConstruction,
          efSearch: workloadData.recommendation.efSearch,
          source: 'workload',
          confidence: workloadData.recommendation.workloadPattern.confidence,
          reasoning: workloadData.recommendation.reasoning,
        };
      } else if (heuristic) {
        // Fall back to heuristic
        response.recommended = {
          m: heuristic.index.m,
          efConstruction: heuristic.index.efConstruction,
          efSearch: heuristic.search.efSearch,
          source: 'heuristic',
          confidence: 0.5,
          reasoning: [heuristic.index.reason, heuristic.search.reason],
        };
      }

      // Backward compatibility: set index/search for clients expecting old format
      if (response.recommended) {
        const rec = response.recommended as any;
        response.index = {
          m: rec.m,
          efConstruction: rec.efConstruction,
          reason: rec.reasoning[0] ?? `${rec.source}-based recommendation`,
        };
        response.search = {
          efSearch: rec.efSearch,
          reason: rec.reasoning[1] ?? `${rec.source}-based recommendation`,
        };
      }
    }

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('Fall tuning hnsw error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
