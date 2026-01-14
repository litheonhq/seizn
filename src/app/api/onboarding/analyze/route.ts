/**
 * Onboarding Analysis API
 *
 * POST /api/onboarding/analyze
 *
 * Analyzes document samples and provides chunking recommendations
 * for the No-Regrets Onboarding Wizard (A2 feature).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  performOnboardingAnalysis,
  type DocumentSample,
  type OnboardingResult,
} from '@/lib/onboarding';

/**
 * Request body schema
 */
interface AnalyzeRequestBody {
  /** Array of document samples to analyze */
  samples: DocumentSample[];
  /** Optional: Total number of documents for cost extrapolation */
  totalDocuments?: number;
}

/**
 * Validates the request body
 */
function validateRequestBody(
  body: unknown
): body is AnalyzeRequestBody {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const { samples } = body as Partial<AnalyzeRequestBody>;

  if (!Array.isArray(samples)) {
    return false;
  }

  // Validate each sample has content
  return samples.every(
    (sample) =>
      sample &&
      typeof sample === 'object' &&
      typeof sample.content === 'string' &&
      sample.content.length > 0
  );
}

/**
 * POST /api/onboarding/analyze
 *
 * Analyzes document samples and returns chunking recommendations.
 *
 * @param request - Next.js request object
 * @returns OnboardingResult with analysis, strategy, and cost estimates
 *
 * @example
 * ```bash
 * curl -X POST https://api.seizn.com/api/onboarding/analyze \
 *   -H "Authorization: Bearer szn_xxx" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "samples": [
 *       { "content": "Your document text here..." },
 *       { "content": "Another document..." }
 *     ],
 *     "totalDocuments": 1000
 *   }'
 * ```
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate the request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      await logRequest(
        {
          userId,
          keyId,
          endpoint: '/api/onboarding/analyze',
          method: 'POST',
          startTime,
        },
        400
      );
      return ValidationErrors.invalidBody('Invalid JSON in request body');
    }

    // Validate request body
    if (!validateRequestBody(body)) {
      await logRequest(
        {
          userId,
          keyId,
          endpoint: '/api/onboarding/analyze',
          method: 'POST',
          startTime,
        },
        400
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'Invalid request body. Expected { samples: [{ content: string }] }',
          },
        },
        { status: 400 }
      );
    }

    const { samples, totalDocuments } = body;

    // Validate sample count
    if (samples.length === 0) {
      await logRequest(
        {
          userId,
          keyId,
          endpoint: '/api/onboarding/analyze',
          method: 'POST',
          startTime,
        },
        400
      );
      return ValidationErrors.missingField('samples (at least one required)');
    }

    // Limit sample count to prevent abuse
    const MAX_SAMPLES = 50;
    if (samples.length > MAX_SAMPLES) {
      await logRequest(
        {
          userId,
          keyId,
          endpoint: '/api/onboarding/analyze',
          method: 'POST',
          startTime,
        },
        400
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Too many samples. Maximum allowed: ${MAX_SAMPLES}`,
          },
        },
        { status: 400 }
      );
    }

    // Limit individual sample size
    const MAX_SAMPLE_LENGTH = 100000; // 100KB per sample
    const oversizedSample = samples.find(
      (s) => s.content.length > MAX_SAMPLE_LENGTH
    );
    if (oversizedSample) {
      await logRequest(
        {
          userId,
          keyId,
          endpoint: '/api/onboarding/analyze',
          method: 'POST',
          startTime,
        },
        400
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Sample content too large. Maximum allowed: ${MAX_SAMPLE_LENGTH} characters per sample`,
          },
        },
        { status: 400 }
      );
    }

    // Perform analysis
    const result: OnboardingResult = performOnboardingAnalysis(
      samples,
      totalDocuments
    );

    // Log successful request
    await logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/onboarding/analyze',
        method: 'POST',
        startTime,
      },
      200
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Onboarding analysis error:', error);

    return ServerErrors.internal(
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
