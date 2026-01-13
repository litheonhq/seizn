/**
 * Answer Contract Policies API
 *
 * GET  /api/answer-contract/policies - List user's policies
 * POST /api/answer-contract/policies - Create a new policy
 * PUT  /api/answer-contract/policies - Update a policy
 * DELETE /api/answer-contract/policies - Delete a policy
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import {
  getUserPolicies,
  upsertPolicy,
  deletePolicy,
  ContractPolicy,
  PolicyRequest,
  DEFAULT_POLICY as _DEFAULT_POLICY,
} from '@/lib/answer-contract';
import { ErrorCodes } from '@/lib/api-error';

export const runtime = 'nodejs';

/**
 * GET /api/answer-contract/policies
 * List all policies for the authenticated user
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const authResult = await authenticateRequest(request);
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId } = authResult;

  try {
    const policies = await getUserPolicies(userId);

    // Log request
    logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/answer-contract/policies',
        method: 'GET',
        startTime,
      },
      200
    ).catch(console.error);

    return NextResponse.json({
      success: true,
      data: {
        policies: policies.map(formatPolicyResponse),
        count: policies.length,
      },
    });
  } catch (error) {
    console.error('List policies error:', error);

    logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/answer-contract/policies',
        method: 'GET',
        startTime,
      },
      500
    ).catch(console.error);

    return NextResponse.json(
      {
        error: {
          error_code: ErrorCodes.INTERNAL_ERROR,
          message: 'Failed to list policies',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/answer-contract/policies
 * Create a new policy
 *
 * Request body:
 * {
 *   name: string,                    // Required
 *   description?: string,
 *   collectionId?: string,
 *   minGroundingScore?: number,      // 0-1, default 0.7
 *   minFaithfulnessScore?: number,   // 0-1, default 0.8
 *   minCoverageScore?: number,       // 0-1, default 0.5
 *   minEvidenceChunks?: number,      // default 1
 *   maxUnsupportedClaims?: number,   // default 0
 *   onFailAction?: 'abstain' | 'warn' | 'pass',
 *   abstainMessage?: string,
 *   warnPrefix?: string,
 *   isActive?: boolean,
 *   isDefault?: boolean,
 *   priority?: number
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  const authResult = await authenticateRequest(request);
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId } = authResult;

  try {
    const body: PolicyRequest = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        {
          error: {
            error_code: ErrorCodes.VALIDATION_FAILED,
            message: 'name is required and must be a string',
          },
        },
        { status: 400 }
      );
    }

    // Validate score ranges
    const scoreFields = [
      'minGroundingScore',
      'minFaithfulnessScore',
      'minCoverageScore',
      'claimConfidenceThreshold',
      'evidenceRelevanceThreshold',
    ] as const;

    for (const field of scoreFields) {
      if (body[field] !== undefined) {
        const value = body[field];
        if (typeof value !== 'number' || value < 0 || value > 1) {
          return NextResponse.json(
            {
              error: {
                error_code: ErrorCodes.VALIDATION_FAILED,
                message: `${field} must be a number between 0 and 1`,
              },
            },
            { status: 400 }
          );
        }
      }
    }

    // Validate onFailAction
    if (body.onFailAction && !['abstain', 'warn', 'pass'].includes(body.onFailAction)) {
      return NextResponse.json(
        {
          error: {
            error_code: ErrorCodes.VALIDATION_FAILED,
            message: 'onFailAction must be one of: abstain, warn, pass',
          },
        },
        { status: 400 }
      );
    }

    // Create policy
    const policy = await upsertPolicy(userId, body);

    // Log request
    logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/answer-contract/policies',
        method: 'POST',
        startTime,
      },
      201
    ).catch(console.error);

    return NextResponse.json(
      {
        success: true,
        data: formatPolicyResponse(policy),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create policy error:', error);

    logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/answer-contract/policies',
        method: 'POST',
        startTime,
      },
      500
    ).catch(console.error);

    return NextResponse.json(
      {
        error: {
          error_code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Failed to create policy',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/answer-contract/policies
 * Update an existing policy
 *
 * Request body: same as POST, plus:
 * {
 *   id: string  // Required - policy ID to update
 * }
 */
export async function PUT(request: NextRequest) {
  const startTime = Date.now();

  const authResult = await authenticateRequest(request);
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId } = authResult;

  try {
    const body = await request.json();

    // Validate policy ID
    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json(
        {
          error: {
            error_code: ErrorCodes.VALIDATION_FAILED,
            message: 'id is required and must be a string',
          },
        },
        { status: 400 }
      );
    }

    const policyId = body.id;
    delete body.id;

    // Update policy
    const policy = await upsertPolicy(userId, body, policyId);

    // Log request
    logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/answer-contract/policies',
        method: 'PUT',
        startTime,
      },
      200
    ).catch(console.error);

    return NextResponse.json({
      success: true,
      data: formatPolicyResponse(policy),
    });
  } catch (error) {
    console.error('Update policy error:', error);

    logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/answer-contract/policies',
        method: 'PUT',
        startTime,
      },
      500
    ).catch(console.error);

    return NextResponse.json(
      {
        error: {
          error_code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Failed to update policy',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/answer-contract/policies
 * Delete a policy
 *
 * Query params:
 * - id: string (required) - Policy ID to delete
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  const authResult = await authenticateRequest(request);
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, keyId } = authResult;

  try {
    const { searchParams } = new URL(request.url);
    const policyId = searchParams.get('id');

    if (!policyId) {
      return NextResponse.json(
        {
          error: {
            error_code: ErrorCodes.VALIDATION_FAILED,
            message: 'Policy ID is required (use ?id=...)',
          },
        },
        { status: 400 }
      );
    }

    await deletePolicy(userId, policyId);

    // Log request
    logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/answer-contract/policies',
        method: 'DELETE',
        startTime,
      },
      200
    ).catch(console.error);

    return NextResponse.json({
      success: true,
      message: 'Policy deleted successfully',
    });
  } catch (error) {
    console.error('Delete policy error:', error);

    logRequest(
      {
        userId,
        keyId,
        endpoint: '/api/answer-contract/policies',
        method: 'DELETE',
        startTime,
      },
      500
    ).catch(console.error);

    return NextResponse.json(
      {
        error: {
          error_code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Failed to delete policy',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Format policy for API response
 */
function formatPolicyResponse(policy: ContractPolicy) {
  return {
    id: policy.id,
    name: policy.name,
    description: policy.description,
    collectionId: policy.collectionId,
    thresholds: {
      minGroundingScore: policy.minGroundingScore,
      minFaithfulnessScore: policy.minFaithfulnessScore,
      minCoverageScore: policy.minCoverageScore,
      minEvidenceChunks: policy.minEvidenceChunks,
      maxUnsupportedClaims: policy.maxUnsupportedClaims,
    },
    behavior: {
      onFailAction: policy.onFailAction,
      abstainMessage: policy.abstainMessage,
      warnPrefix: policy.warnPrefix,
    },
    advanced: {
      claimConfidenceThreshold: policy.claimConfidenceThreshold,
      evidenceRelevanceThreshold: policy.evidenceRelevanceThreshold,
    },
    isActive: policy.isActive,
    isDefault: policy.isDefault,
    priority: policy.priority,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}
