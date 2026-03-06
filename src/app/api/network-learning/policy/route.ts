/**
 * Network Learning Policy API
 *
 * GET: Get policy updates
 * POST: Apply/approve/reject policy updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  AuthErrors,
  ErrorCodes,
  NotFoundErrors,
  ServerErrors,
  ValidationErrors,
  createApiError,
} from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import {
  getPolicyUpdates,
  getPolicyUpdateCount,
  approvePolicyUpdate,
  rejectPolicyUpdate,
  applyPolicyUpdate,
  generatePolicyRecommendations,
  createPolicyUpdate,
  createABTestConfig,
} from '@/lib/network-learning';
import type { PolicyResponse, AggregationPeriod } from '@/lib/network-learning';
import { logServerError } from '@/lib/server/logger';

const POLICY_READ_SCOPES = [
  'network-learning:policy:read',
  'network-learning:policy:write',
  'network-learning:*',
  'admin',
] as const;

const POLICY_WRITE_SCOPES = [
  'network-learning:policy:write',
  'network-learning:*',
  'admin',
] as const;

const POLICY_ADMIN_ROLES = new Set(['owner', 'admin']);

async function enforcePolicyAccess(
  keyId: string,
  requiredScopes: readonly string[],
  operation: 'read' | 'write'
): Promise<NextResponse | null> {
  const supabase = createServerClient();

  const { data: keyData, error: keyError } = await supabase
    .from('api_keys')
    .select('id, user_id, org_id, scopes')
    .eq('id', keyId)
    .eq('is_active', true)
    .maybeSingle();

  if (keyError) {
    console.error('Policy access key lookup failed:', {
      keyId,
      code: keyError.code,
      message: keyError.message,
      details: keyError.details,
    });
    return ServerErrors.internal('policy_access_key_lookup');
  }

  if (!keyData) {
    return AuthErrors.invalidKey();
  }

  const scopes = Array.isArray(keyData.scopes)
    ? keyData.scopes.filter((scope): scope is string => typeof scope === 'string')
    : [];

  const hasScope = requiredScopes.some((scope) => scopes.includes(scope));
  if (!hasScope) {
    return createApiError({
      code: ErrorCodes.AUTH_UNAUTHORIZED,
      message: `Insufficient scope for policy ${operation}`,
      status: 403,
      details: {
        required_scopes: requiredScopes,
        operation,
      },
    });
  }

  if (keyData.org_id) {
    const { data: membership, error: membershipError } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', keyData.org_id)
      .eq('user_id', keyData.user_id)
      .maybeSingle();

    if (membershipError) {
      console.error('Policy access membership lookup failed:', {
        keyId,
        orgId: keyData.org_id,
        userId: keyData.user_id,
        code: membershipError.code,
        message: membershipError.message,
        details: membershipError.details,
      });
      return ServerErrors.internal('policy_access_membership_lookup');
    }

    if (!membership || !POLICY_ADMIN_ROLES.has(membership.role)) {
      return createApiError({
        code: ErrorCodes.AUTH_UNAUTHORIZED,
        message: 'Organization admin role required for policy changes',
        status: 403,
        details: {
          required_roles: Array.from(POLICY_ADMIN_ROLES),
          operation,
        },
      });
    }
  }

  return null;
}

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

    const readAccessError = await enforcePolicyAccess(authResult.keyId, POLICY_READ_SCOPES, 'read');
    if (readAccessError) {
      return readAccessError;
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
    const [pendingCount, appliedCount] = await Promise.all([
      getPolicyUpdateCount('pending'),
      getPolicyUpdateCount('applied'),
    ]);

    const response: PolicyResponse = {
      success: true,
      updates,
      pendingCount,
      appliedCount,
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

    const writeAccessError = await enforcePolicyAccess(authResult.keyId, POLICY_WRITE_SCOPES, 'write');
    if (writeAccessError) {
      return writeAccessError;
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
      const failedUpdates: Array<{ targetPolicy: string; error: string }> = [];
      for (const rec of recommendations) {
        try {
          const update = await createPolicyUpdate(rec);
          createdUpdates.push(update);
        } catch (createError) {
          logServerError('Failed to create policy update', createError);
          failedUpdates.push({
            targetPolicy: rec.targetPolicy,
            error: createError instanceof Error ? createError.message : String(createError),
          });
        }
      }

      if (failedUpdates.length > 0) {
        return createApiError({
          code: ErrorCodes.DATABASE_ERROR,
          message: 'Failed to create one or more policy updates',
          status: 500,
          details: {
            recommendations_generated: recommendations.length,
            updates_created: createdUpdates.length,
            failed_updates: failedUpdates,
          },
        });
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
        if (err instanceof Error && err.message.includes('already')) {
          return createApiError({
            code: ErrorCodes.RESOURCE_ALREADY_EXISTS,
            message: err.message,
            status: 409,
            details: { update_id: updateId },
          });
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
        if (err instanceof Error && err.message.includes('already')) {
          return createApiError({
            code: ErrorCodes.RESOURCE_ALREADY_EXISTS,
            message: err.message,
            status: 409,
            details: { update_id: updateId },
          });
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
            return createApiError({
              code: ErrorCodes.RESOURCE_ALREADY_EXISTS,
              message: err.message,
              status: 409,
              details: { update_id: updateId },
            });
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
