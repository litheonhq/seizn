import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  listDatasets,
  createDataset,
} from '@/lib/fall/eval';
import type { CreateDatasetInput } from '@/lib/fall/eval';

/**
 * GET /api/fall/eval/datasets
 * List all evaluation datasets for the authenticated user
 *
 * Query params:
 * - limit: number (default: 20)
 * - offset: number (default: 0)
 * - source: string (filter by source type)
 * - search: string (search by name)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { searchParams } = new URL(request.url);

    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const source = searchParams.get('source') || undefined;
    const search = searchParams.get('search') || undefined;

    const result = await listDatasets({
      userId,
      pagination: { limit, offset },
      filters: { source, search },
    });

    return NextResponse.json({
      success: true,
      datasets: result.datasets,
      total: result.total,
      pagination: { limit, offset },
    });
  } catch (err) {
    console.error('Fall eval datasets list error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/fall/eval/datasets
 * Create a new evaluation dataset
 *
 * Body:
 * {
 *   "name": "string",
 *   "description"?: "string",
 *   "cases"?: [
 *     {
 *       "query": "string",
 *       "expected_ids"?: ["uuid"],
 *       "relevance_scores"?: [number],
 *       "expected_answer"?: "string",
 *       "metadata"?: {}
 *     }
 *   ],
 *   "source"?: "manual" | "import" | "generated",
 *   "metadata"?: {}
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
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'name (string) is required' },
        { status: 400 }
      );
    }

    const input: CreateDatasetInput = {
      name: body.name,
      description: body.description,
      cases: body.cases,
      source: body.source,
      metadata: body.metadata,
    };

    const result = await createDataset({ userId, input });

    return NextResponse.json(
      {
        success: true,
        dataset: result.dataset,
        casesCreated: result.casesCreated,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Fall eval dataset create error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
