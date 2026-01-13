/**
 * Answer Contract History API
 *
 * GET /api/answer-contract/history - List contract history
 * GET /api/answer-contract/history/stats - Get statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import {
  getContractHistory,
  getContractStats,
  ContractVerdict,
} from '@/lib/answer-contract';
import { ErrorCodes } from '@/lib/api-error';

export const runtime = 'nodejs';

/**
 * GET /api/answer-contract/history
 * List contract evaluation history
 *
 * Query params:
 * - verdict: 'pass' | 'partial' | 'fail' | 'abstain' (optional)
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 * - page: number (default 1)
 * - perPage: number (default 20, max 100)
 * - stats: 'true' to include statistics
 * - days: number (for stats, default 30)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const authResult = await authenticateRequest(request);
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId } = authResult;

  try {
    const { searchParams } = new URL(request.url);

    // Check if this is a stats request
    const includeStats = searchParams.get('stats') === 'true';
    const statsDays = parseInt(searchParams.get('days') || '30', 10);

    // Parse query parameters
    const verdict = searchParams.get('verdict') as ContractVerdict | null;
    const startDateStr = searchParams.get('startDate') || searchParams.get('start_date');
    const endDateStr = searchParams.get('endDate') || searchParams.get('end_date');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('perPage') || searchParams.get('per_page') || '20', 10)));

    // Validate verdict if provided
    if (verdict && !['pass', 'partial', 'fail', 'abstain'].includes(verdict)) {
      return NextResponse.json(
        {
          error: {
            error_code: ErrorCodes.VALIDATION_FAILED,
            message: 'verdict must be one of: pass, partial, fail, abstain',
          },
        },
        { status: 400 }
      );
    }

    // Parse dates
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (startDateStr) {
      startDate = new Date(startDateStr);
      if (isNaN(startDate.getTime())) {
        return NextResponse.json(
          {
            error: {
              error_code: ErrorCodes.VALIDATION_FAILED,
              message: 'startDate must be a valid ISO date string',
            },
          },
          { status: 400 }
        );
      }
    }

    if (endDateStr) {
      endDate = new Date(endDateStr);
      if (isNaN(endDate.getTime())) {
        return NextResponse.json(
          {
            error: {
              error_code: ErrorCodes.VALIDATION_FAILED,
              message: 'endDate must be a valid ISO date string',
            },
          },
          { status: 400 }
        );
      }
    }

    // Fetch history
    const { contracts, total } = await getContractHistory(userId, {
      verdict: verdict || undefined,
      startDate,
      endDate,
      page,
      perPage,
    });

    // Build response
    const response: Record<string, unknown> = {
      success: true,
      data: {
        contracts: contracts.map((contract) => ({
          id: contract.id,
          traceId: contract.traceId,
          queryText: truncate(contract.queryText, 200),
          answerText: truncate(contract.answerText, 200),
          verdict: contract.verdict,
          scores: {
            grounding: contract.groundingScore,
            faithfulness: contract.faithfulnessScore,
            coverage: contract.coverageScore,
          },
          claims: {
            total: contract.claims.length,
            supported: contract.claims.filter((c) => c.supported).length,
            unsupported: contract.unsupportedClaims.length,
            contradictions: contract.contradictions.length,
          },
          policyId: contract.policyId,
          processingTimeMs: contract.processingTimeMs,
          createdAt: contract.createdAt.toISOString(),
        })),
        pagination: {
          page,
          perPage,
          total,
          totalPages: Math.ceil(total / perPage),
        },
      },
    };

    // Include stats if requested
    if (includeStats) {
      const stats = await getContractStats(userId, statsDays);
      response.data = {
        ...response.data as Record<string, unknown>,
        stats: {
          period: `${statsDays} days`,
          ...stats,
        },
      };
    }

    // Log request
    logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/answer-contract/history',
        method: 'GET',
        startTime,
      },
      200
    ).catch(console.error);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Contract history error:', error);

    logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/answer-contract/history',
        method: 'GET',
        startTime,
      },
      500
    ).catch(console.error);

    return NextResponse.json(
      {
        error: {
          error_code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to fetch contract history',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Truncate text to a maximum length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
