import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  getDataset,
  updateDataset,
  deleteDataset,
  getCases,
  addCases,
} from '@/lib/fall/eval';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/fall/eval/datasets/[id]
 * Get a specific dataset with its cases
 *
 * Query params:
 * - include_cases: boolean (default: false)
 * - cases_limit: number (default: 50)
 * - cases_offset: number (default: 0)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id: datasetId } = await context.params;
    const { searchParams } = new URL(request.url);

    const includeCases = searchParams.get('include_cases') === 'true';
    const casesLimit = parseInt(searchParams.get('cases_limit') || '50');
    const casesOffset = parseInt(searchParams.get('cases_offset') || '0');

    const dataset = await getDataset({ userId, datasetId });

    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    const response: Record<string, unknown> = {
      success: true,
      dataset,
    };

    if (includeCases) {
      const casesResult = await getCases({
        userId,
        datasetId,
        pagination: { limit: casesLimit, offset: casesOffset },
      });
      response.cases = casesResult.cases;
      response.casesTotal = casesResult.total;
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('Fall eval dataset get error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/fall/eval/datasets/[id]
 * Update a dataset
 *
 * Body:
 * {
 *   "name"?: "string",
 *   "description"?: "string",
 *   "metadata"?: {}
 * }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id: datasetId } = await context.params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    const dataset = await updateDataset({
      userId,
      datasetId,
      updates,
    });

    return NextResponse.json({
      success: true,
      dataset,
    });
  } catch (err) {
    console.error('Fall eval dataset update error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/fall/eval/datasets/[id]
 * Delete a dataset and all its cases
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id: datasetId } = await context.params;

    await deleteDataset({ userId, datasetId });

    return NextResponse.json({
      success: true,
      message: 'Dataset deleted',
    });
  } catch (err) {
    console.error('Fall eval dataset delete error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/fall/eval/datasets/[id]
 * Add cases to a dataset
 *
 * Body:
 * {
 *   "cases": [
 *     {
 *       "query": "string",
 *       "expected_ids"?: ["uuid"],
 *       "relevance_scores"?: [number],
 *       "expected_answer"?: "string",
 *       "metadata"?: {}
 *     }
 *   ]
 * }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id: datasetId } = await context.params;
    const body = await request.json();

    if (!body.cases || !Array.isArray(body.cases)) {
      return NextResponse.json(
        { error: 'cases (array) is required' },
        { status: 400 }
      );
    }

    const result = await addCases({
      userId,
      datasetId,
      cases: body.cases,
    });

    return NextResponse.json({
      success: true,
      casesCreated: result.casesCreated,
    });
  } catch (err) {
    console.error('Fall eval dataset add cases error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
