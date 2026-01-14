/**
 * Network Learning Policy API
 *
 * GET: Get policy updates
 * POST: Apply/approve/reject policy updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors, NotFoundErrors } from '@/lib/api-error';
import {
  getPolicyUpdates,
  getPendingUpdates,
  approvePolicyUpdate,
  rejectPolicyUpdate,
  applyPolicyUpdate,
  generatePolicyRecommendations,
  createPolicyUpdate,
  createABTestConfig,
} from '@/lib/network-learning';
import type { PolicyResponse, AggregationPeriod } from '@/lib/network-learning';

// GET /api/network-learning/policy
// Query params:
// - status: pending | approved | applied | rejected (optional)
// - limit: number (default: 50, max: 100)
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { searchParams } = new URL(request.url);

    // Parse status filter
    const statusParam = searchParams.get('status');
    const validStatuses = ['pending', 'approved', 'applied', 'rejected'];
    let status: 'pending' | 'approved' | 'applied' | 'rejected' | undefined;

    if (statusParam) {
      if (!validStatuses.includes(statusParam)) {
        return ValidationErrors.invalidValue(
          'status',
          statusParam,
          'pending | approved | applied | rejected'
        );
      }
      status = statusParam as typeof status;
    }

    // Parse limit
    const limitParam = searchParams.get('limit');
    let limit = 50;

    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return ValidationErrors.invalidValue('limit', limitParam, 'positive integer');
      }
      limit = Math.min(parsedLimit, 100);
    }

    // Get updates
    const updates = await getPolicyUpdates({ status, limit });

    // Get counts
    const pendingUpdates = await getPendingUpdates();
    const appliedUpdates = await getPolicyUpdates({ status: 'applied', limit: 1000 });

    const response: PolicyResponse = {
      success: true,
      updates,
      pendingCount: pendingUpdates.length,
      appliedCount: appliedUpdates.length,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('Network learning policy GET error:', err);
    return ServerErrors.internal('policy_get');
  }
}

// POST /api/network-learning/policy
// Body:
// {
//   "action": "generate" | "approve" | "reject" | "apply",
//   "updateId"?: string,  // required for approve/reject/apply
//   "period"?: "daily" | "weekly" | "monthly",  // for generate action
//   "createABTest"?: boolean  // for apply action
// }
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    if (!body || typeof body !== 'object') {
      return ValidationErrors.invalidBody('Request body must be an object');
    }

    const { action, updateId, period, createABTest } = body as {
      action?: string;
      updateId?: string;
      period?: string;
      createABTest?: boolean;
    };

    if (!action || typeof action !== 'string') {
      return ValidationErrors.missingField('action');
    }

    const validActions = ['generate', 'approve', 'reject', 'apply'];
    if (!validActions.includes(action)) {
      return ValidationErrors.invalidValue('action', action, 'generate | approve | reject | apply');
    }

    // Handle generate action
    if (action === 'generate') {
      const validPeriods: AggregationPeriod[] = ['daily', 'weekly', 'monthly'];
      const periodValue = (period as AggregationPeriod) ?? 'weekly';

      if (period && !validPeriods.includes(period as AggregationPeriod)) {
        return ValidationErrors.invalidValue('period', period, 'daily | weekly | monthly');
      }

      const recommendations = await generatePolicyRecommendations(periodValue);

      // Create policy updates from recommendations
      const createdUpdates = [];
      for (const rec of recommendations) {
        try {
          const update = await createPolicyUpdate(rec);
          createdUpdates.push(update);
        } catch (createError) {
          console.error('Failed to create policy update:', createError);
        }
      }

      return NextResponse.json({
        success: true,
        action: 'generate',
        recommendationsGenerated: recommendations.length,
        updatesCreated: createdUpdates.length,
        updates: createdUpdates,
      }, { status: 201 });
    }

    // For other actions, updateId is required
    if (!updateId || typeof updateId !== 'string') {
      return ValidationErrors.missingField('updateId');
    }

    // Handle approve action
    if (action === 'approve') {
      try {
        const update = await approvePolicyUpdate(updateId);
        return NextResponse.json({
          success: true,
          action: 'approve',
          update,
          message: 'Policy update approved successfully',
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return NotFoundErrors.resource('PolicyUpdate', updateId);
        }
        throw err;
      }
    }

    // Handle reject action
    if (action === 'reject') {
      try {
        const update = await rejectPolicyUpdate(updateId);
        return NextResponse.json({
          success: true,
          action: 'reject',
          update,
          message: 'Policy update rejected',
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return NotFoundErrors.resource('PolicyUpdate', updateId);
        }
        throw err;
      }
    }

    // Handle apply action
    if (action === 'apply') {
      try {
        const { update, applied } = await applyPolicyUpdate(updateId);

        const response: {
          success: boolean;
          action: string;
          update: typeof update;
          applied: boolean;
          message: string;
          abTestConfig?: ReturnType<typeof createABTestConfig>;
        } = {
          success: true,
          action: 'apply',
          update,
          applied,
          message: 'Policy update applied successfully',
        };

        // Create A/B test config if requested
        if (createABTest) {
          response.abTestConfig = createABTestConfig(update);
        }

        return NextResponse.json(response);
      } catch (err) {
        if (err instanceof Error) {
          if (err.message.includes('not found')) {
            return NotFoundErrors.resource('PolicyUpdate', updateId);
          }
          if (err.message.includes('must be approved')) {
            return ValidationErrors.invalidField('updateId', 'Policy update must be approved before applying');
          }
        }
        throw err;
      }
    }

    // Should not reach here
    return ValidationErrors.invalidValue('action', action);
  } catch (err) {
    console.error('Network learning policy POST error:', err);
    return ServerErrors.internal('policy_post');
  }
}
