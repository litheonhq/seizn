import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import {
  recallWithPerspective,
  resolveBeliefOrganizationId,
} from '@/lib/memory/belief';
import { logServerError } from '@/lib/server/logger';

const META = { version: 'v1' as const };

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return ValidationErrors.invalidField('body', 'JSON body is required');

    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const perspectiveEntityId =
      typeof body.perspective_entity_id === 'string' ? body.perspective_entity_id.trim() : '';
    const topK = body.top_k == null ? 10 : Number(body.top_k);
    const asOf = typeof body.as_of === 'string' ? new Date(body.as_of) : undefined;

    if (!query) return ValidationErrors.missingField('query');
    if (!perspectiveEntityId) return ValidationErrors.missingField('perspective_entity_id');
    if (!Number.isFinite(topK) || topK < 1 || topK > 100) {
      return ValidationErrors.invalidField('top_k', 'Must be a number between 1 and 100');
    }
    if (asOf && Number.isNaN(asOf.getTime())) {
      return ValidationErrors.invalidField('as_of', 'Must be an ISO timestamp');
    }

    const supabase = createServerClient();
    const organizationId = await resolveBeliefOrganizationId(supabase, {
      userId: authResult.userId,
      keyId: authResult.keyId,
    });
    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'organization_not_found', message: 'No organization is associated with this API key.' },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 404 }
      );
    }

    const result = await recallWithPerspective(
      {
        organizationId,
        perspectiveEntityId,
        query,
        asOf,
        topK,
      },
      supabase
    );

    await logRequest(
      {
        userId: authResult.userId,
        keyId: authResult.keyId,
        endpoint: '/api/v1/memories.recall',
        method: 'POST',
        startTime,
      },
      200
    );

    return NextResponse.json({
      success: true,
      data: {
        results: result.memories,
        excluded: result.excluded,
        count: result.memories.length,
      },
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    logServerError('[v1/memories.recall] POST error', error);
    return ServerErrors.internal('memories_recall');
  }
}
