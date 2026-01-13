/**
 * Adaptive Planner - Plan Selection API
 *
 * POST /api/planner/select - Select best plan for a query
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
  selectPlanForQuery,
  recordPlanOutcome,
} from '@/lib/adaptive-planner';
import type {
  SelectPlanRequest,
  SelectPlanResponse,
} from '@/lib/adaptive-planner';

// ============================================
// POST - Select Plan for Query
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Parse body
    const body: SelectPlanRequest = await request.json();

    // Validate required fields
    if (!body.query || typeof body.query !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/select', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('query');
    }

    if (body.query.trim().length === 0) {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/select', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidField('query', 'cannot be empty');
    }

    // Select the best plan
    const result = await selectPlanForQuery(body.query, {
      userId,
      collectionId: body.collectionId,
      defaultsOnly: body.defaultsOnly,
      useDbFunction: true, // Use the efficient DB function
    });

    // Optionally record the selection for learning (without outcome yet)
    // This creates a record that can be updated later with outcome data
    const recordSelection = request.headers.get('x-record-selection') === 'true';
    let selectionId: string | undefined;

    if (recordSelection) {
      const recordResult = await recordPlanOutcome({
        planId: result.isDefault ? undefined : result.plan.id,
        queryText: body.query,
        detectedIntent: result.features.intent,
        queryFeatures: result.features,
      });

      if (recordResult.success) {
        selectionId = recordResult.selectionId;
      }
    }

    const response: SelectPlanResponse & { selectionId?: string } = {
      success: true,
      plan: result.plan,
      matchScore: result.matchScore,
      matchReasons: result.matchReasons,
      isDefault: result.isDefault,
      queryFeatures: result.features,
      ...(selectionId && { selectionId }),
    };

    await logRequest(
      { userId, keyId, endpoint: '/api/planner/select', method: 'POST', startTime },
      200
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Select plan error:', error);
    return ServerErrors.internal('select plan');
  }
}

// ============================================
// PUT - Update Selection Outcome
// ============================================

export async function PUT(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;

    // Parse body
    const body: {
      selectionId: string;
      latencyMs?: number;
      relevanceScore?: number;
      userSatisfied?: boolean;
    } = await request.json();

    // Validate required fields
    if (!body.selectionId || typeof body.selectionId !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/select', method: 'PUT', startTime },
        400
      );
      return ValidationErrors.missingField('selectionId');
    }

    // At least one outcome field should be provided
    if (
      body.latencyMs === undefined &&
      body.relevanceScore === undefined &&
      body.userSatisfied === undefined
    ) {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/select', method: 'PUT', startTime },
        400
      );
      return NextResponse.json(
        {
          success: false,
          error: 'At least one outcome field (latencyMs, relevanceScore, userSatisfied) is required',
        },
        { status: 400 }
      );
    }

    // Validate field values
    if (body.latencyMs !== undefined && (typeof body.latencyMs !== 'number' || body.latencyMs < 0)) {
      return ValidationErrors.invalidField('latencyMs', 'must be a non-negative number');
    }

    if (body.relevanceScore !== undefined) {
      if (typeof body.relevanceScore !== 'number' || body.relevanceScore < 0 || body.relevanceScore > 1) {
        return ValidationErrors.invalidField('relevanceScore', 'must be a number between 0 and 1');
      }
    }

    // Import the update function
    const { updateSelectionOutcome } = await import('@/lib/adaptive-planner');

    const result = await updateSelectionOutcome(body.selectionId, {
      latencyMs: body.latencyMs,
      relevanceScore: body.relevanceScore,
      userSatisfied: body.userSatisfied,
    });

    if (!result.success) {
      await logRequest(
        { userId, keyId, endpoint: '/api/planner/select', method: 'PUT', startTime },
        500
      );
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to update selection' },
        { status: 500 }
      );
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/planner/select', method: 'PUT', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      updated: body.selectionId,
    });
  } catch (error) {
    console.error('Update selection error:', error);
    return ServerErrors.internal('update selection');
  }
}
