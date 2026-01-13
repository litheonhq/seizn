/**
 * Answer Contract Verify API
 *
 * POST /api/answer-contract/verify
 * Verifies an answer against evidence and returns grounding analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import {
  enforceContract,
  VerifyAnswerRequest,
  EvidenceChunk,
} from '@/lib/answer-contract';
import { ErrorCodes } from '@/lib/api-error';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds for complex verification

/**
 * POST /api/answer-contract/verify
 *
 * Request body:
 * {
 *   query: string,        // The original query
 *   answer: string,       // The answer to verify
 *   evidenceChunks: [     // Evidence from retrieval
 *     { chunkId: string, text: string, score: number, source?: {...} }
 *   ],
 *   policyId?: string,    // Optional policy to use
 *   traceId?: string,     // Optional trace ID for linking
 *   collectionId?: string // Optional collection context
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Authenticate request
  const authResult = await authenticateRequest(request);
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId } = authResult;

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.query || typeof body.query !== 'string') {
      return NextResponse.json(
        {
          error: {
            error_code: ErrorCodes.VALIDATION_FAILED,
            message: 'query is required and must be a string',
          },
        },
        { status: 400 }
      );
    }

    if (!body.answer || typeof body.answer !== 'string') {
      return NextResponse.json(
        {
          error: {
            error_code: ErrorCodes.VALIDATION_FAILED,
            message: 'answer is required and must be a string',
          },
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.evidenceChunks)) {
      return NextResponse.json(
        {
          error: {
            error_code: ErrorCodes.VALIDATION_FAILED,
            message: 'evidenceChunks is required and must be an array',
          },
        },
        { status: 400 }
      );
    }

    // Validate and transform evidence chunks
    const evidenceChunks: EvidenceChunk[] = body.evidenceChunks.map(
      (chunk: Record<string, unknown>, idx: number) => ({
        chunkId: (chunk.chunkId as string) || (chunk.chunk_id as string) || `chunk_${idx}`,
        text: (chunk.text as string) || '',
        score: typeof chunk.score === 'number' ? chunk.score : 0.5,
        source: chunk.source as EvidenceChunk['source'],
        metadata: chunk.metadata as Record<string, unknown>,
      })
    );

    // Build verification request
    const verifyRequest: VerifyAnswerRequest = {
      query: body.query,
      answer: body.answer,
      evidenceChunks,
      policyId: body.policyId || body.policy_id,
      traceId: body.traceId || body.trace_id,
      collectionId: body.collectionId || body.collection_id,
    };

    // Enforce contract
    const response = await enforceContract(verifyRequest, userId, {
      saveToDb: true,
      verificationOptions: {
        model: body.model || 'haiku',
      },
    });

    // Log the request
    logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/answer-contract/verify',
        method: 'POST',
        startTime,
      },
      200
    ).catch(console.error);

    return NextResponse.json({
      success: true,
      data: {
        contractId: response.contractId,
        verdict: response.verdict,
        adjustedAnswer: response.adjustedAnswer,
        result: {
          isGrounded: response.result.isGrounded,
          groundingScore: response.result.groundingScore,
          faithfulnessScore: response.result.faithfulnessScore,
          coverageScore: response.result.coverageScore,
          metadata: response.result.metadata,
        },
        claims: {
          total: response.result.claims.length,
          supported: response.result.claims.filter((c) => c.supported).length,
          unsupported: response.result.unsupportedClaims.length,
          contradictions: response.result.contradictions.length,
        },
        policyApplied: response.policyApplied,
      },
    });
  } catch (error) {
    console.error('Answer contract verification error:', error);

    // Log failed request
    logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/answer-contract/verify',
        method: 'POST',
        startTime,
      },
      500
    ).catch(console.error);

    return NextResponse.json(
      {
        error: {
          error_code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Verification failed',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/answer-contract/verify/:contractId
 * Get a specific contract by ID
 */
export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { searchParams } = new URL(request.url);
  const contractId = searchParams.get('id');

  if (!contractId) {
    return NextResponse.json(
      {
        error: {
          error_code: ErrorCodes.VALIDATION_FAILED,
          message: 'Contract ID is required (use ?id=...)',
        },
      },
      { status: 400 }
    );
  }

  try {
    const { createServerClient } = await import('@/lib/supabase');
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('answer_contracts')
      .select('*')
      .eq('id', contractId)
      .eq('user_id', authResult.userId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          error: {
            error_code: ErrorCodes.NOT_FOUND,
            message: 'Contract not found',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        traceId: data.trace_id,
        queryText: data.query_text,
        answerText: data.answer_text,
        evidenceChunks: data.evidence_chunks,
        isGrounded: data.is_grounded,
        groundingScore: data.grounding_score,
        faithfulnessScore: data.faithfulness_score,
        coverageScore: data.coverage_score,
        claims: data.claims,
        unsupportedClaims: data.unsupported_claims,
        contradictions: data.contradictions,
        verdict: data.verdict,
        abstainReason: data.abstain_reason,
        policyId: data.policy_id,
        processingTimeMs: data.processing_time_ms,
        modelUsed: data.model_used,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    console.error('Get contract error:', error);
    return NextResponse.json(
      {
        error: {
          error_code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to retrieve contract',
        },
      },
      { status: 500 }
    );
  }
}
