import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { listDecayPolicies, resolveDecayOrganizationId } from '@/lib/memory/decay';
import { logServerError } from '@/lib/server/logger';

const META = { version: 'v1' as const };

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (isAuthError(authResult)) return authErrorResponse(authResult.authError);

  try {
    const supabase = createServerClient();
    const organizationId = await resolveDecayOrganizationId(supabase, {
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

    const policies = await listDecayPolicies(organizationId, supabase);
    await logRequest(
      {
        userId: authResult.userId,
        keyId: authResult.keyId,
        endpoint: '/api/v1/decay-policies',
        method: 'GET',
        startTime,
      },
      200
    );

    return NextResponse.json({
      success: true,
      data: { policies },
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    logServerError('[v1/decay-policies] GET error', error);
    return ServerErrors.internal('list_decay_policies');
  }
}
