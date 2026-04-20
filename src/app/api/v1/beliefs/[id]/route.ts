import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { resolveBeliefOrganizationId, revokeBelief } from '@/lib/memory/belief';
import { logServerError } from '@/lib/server/logger';

const META = { version: 'v1' as const };

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
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

  try {
    const { id } = await params;
    await revokeBelief({ organizationId, beliefId: id }, supabase);
    await logRequest(
      {
        userId: authResult.userId,
        keyId: authResult.keyId,
        endpoint: '/api/v1/beliefs/[id]',
        method: 'DELETE',
        startTime,
      },
      200
    );

    return NextResponse.json({
      success: true,
      data: { revoked: id },
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    logServerError('[v1/beliefs/:id] DELETE error', error);
    return ServerErrors.internal('revoke_belief');
  }
}
