import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { getBudgetSnapshot, listBudgetSnapshots } from '@/lib/memory/budget-telemetry';
import { resolveMemoryBudgetOrganizationId } from '@/lib/memory/budget';
import { logServerError } from '@/lib/server/logger';

const META = { version: 'v1' as const };

// GET /api/v1/memory-budget - list or fetch per-entity tier budget snapshots.
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get('limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return ValidationErrors.invalidField('limit', 'Must be a number between 1 and 100');
  }

  try {
    const organizationId = await resolveMemoryBudgetOrganizationId(supabase, {
      userId: authResult.userId,
      keyId: authResult.keyId,
    });

    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'organization_not_found',
            message: 'No organization is associated with this API key.',
          },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 404 }
      );
    }

    const entityId = searchParams.get('entity_id');
    const snapshots = entityId
      ? [await getBudgetSnapshot(organizationId, entityId, supabase)]
      : await listBudgetSnapshots(organizationId, { limit }, supabase);

    await logRequest(
      {
        userId: authResult.userId,
        keyId: authResult.keyId,
        endpoint: '/api/v1/memory-budget',
        method: 'GET',
        startTime,
      },
      200
    );

    return NextResponse.json({
      success: true,
      data: {
        organization_id: organizationId,
        snapshots,
      },
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    logServerError('[v1/memory-budget] GET error', error);
    await logRequest(
      {
        userId: authResult.userId,
        keyId: authResult.keyId,
        endpoint: '/api/v1/memory-budget',
        method: 'GET',
        startTime,
      },
      500
    );
    return ServerErrors.internal('memory_budget');
  }
}
