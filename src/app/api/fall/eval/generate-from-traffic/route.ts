import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  generateEvalDatasetFromTraffic,
  getTrafficStats,
  type TrafficSamplingConfig,
} from '@/lib/fall/eval';

/**
 * POST /api/fall/eval/generate-from-traffic
 *
 * Generate an eval dataset from real traffic traces.
 *
 * Body:
 * {
 *   "dataset_name"?: string,              // Optional custom name
 *   "sample_size": number,                 // Required: number of traces to sample (1-500)
 *   "collection_id"?: string,              // Filter by collection
 *   "days_back"?: number,                  // Time range (default: 30)
 *   "min_results_count"?: number,          // Filter: minimum results
 *   "max_results_count"?: number,          // Filter: maximum results
 *   "strategy"?: "random" | "recent" | "diverse",  // Sampling strategy (default: diverse)
 *   "include_retrieved_as_expected"?: boolean      // Use retrieved chunks as expected (default: false)
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

    // Validate sample_size
    const sampleSize = Number(body?.sample_size);
    if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 500) {
      return ValidationErrors.invalidField(
        'sample_size',
        'Must be an integer between 1 and 500'
      );
    }

    // Build config
    const config: TrafficSamplingConfig = {
      sampleSize,
      collectionId: body?.collection_id,
      daysBack: body?.days_back ?? 30,
      minResultsCount: body?.min_results_count,
      maxResultsCount: body?.max_results_count,
      strategy: body?.strategy ?? 'diverse',
      excludeErrors: true,
    };

    // Generate dataset
    const result = await generateEvalDatasetFromTraffic({
      userId,
      datasetName: body?.dataset_name,
      config,
      includeRetrievedAsExpected: body?.include_retrieved_as_expected ?? false,
    });

    return NextResponse.json(
      {
        success: true,
        dataset_id: result.datasetId,
        cases_created: result.casesCreated,
        sampled_trace_ids: result.sampledTraceIds,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Generate from traffic error:', err);

    if (err instanceof Error) {
      if (err.message.includes('No eligible traces')) {
        return NextResponse.json(
          {
            error: {
              code: 'NO_ELIGIBLE_TRACES',
              message: err.message,
              suggested_fix: 'Adjust filters or wait for more traffic',
            },
          },
          { status: 400 }
        );
      }
    }

    return ServerErrors.internal('generate_from_traffic');
  }
}

/**
 * GET /api/fall/eval/generate-from-traffic
 *
 * Get statistics about available traffic for conversion.
 *
 * Query params:
 * - days_back?: number (default: 30)
 * - collection_id?: string
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const url = new URL(request.url);

    const daysBack = parseInt(url.searchParams.get('days_back') ?? '30');
    const collectionId = url.searchParams.get('collection_id') ?? undefined;

    const stats = await getTrafficStats({
      userId,
      daysBack,
      collectionId,
    });

    return NextResponse.json({
      success: true,
      stats: {
        total_traces: stats.totalTraces,
        traces_with_results: stats.tracesWithResults,
        unique_queries: stats.uniqueQueries,
        collections: stats.collections,
        date_range: stats.dateRange,
      },
      sampling_recommendations: {
        suggested_sample_size: Math.min(stats.uniqueQueries, 100),
        max_available: stats.tracesWithResults,
        strategy_notes: {
          diverse: 'Recommended for varied evaluation coverage',
          recent: 'Best for testing recent query patterns',
          random: 'Good for unbiased sampling',
        },
      },
    });
  } catch (err) {
    console.error('Traffic stats error:', err);
    return ServerErrors.internal('traffic_stats');
  }
}
