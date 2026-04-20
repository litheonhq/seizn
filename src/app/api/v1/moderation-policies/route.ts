import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import {
  isModerationEnabled,
  listModerationPolicies,
  resolveModerationOrganizationId,
} from '@/lib/moderation/guard';

const META = { version: 'v1' as const };

function withHeaders(response: NextResponse, headers?: Record<string, string>): NextResponse {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

async function resolveAuth(
  request: NextRequest
): Promise<
  | { userId: string; keyId: string | null; rateLimitHeaders?: Record<string, string> }
  | { error: NextResponse }
> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return {
      userId: authResult.userId,
      keyId: authResult.keyId,
      rateLimitHeaders: authResult.rateLimitHeaders,
    };
  }

  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null };
  }

  return { error: authErrorResponse(authResult.authError) };
}

async function hasOrganizationMembership(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  organizationId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();

  return Boolean(data);
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await resolveAuth(request);
    if ('error' in authResult) return authResult.error;

    const { userId, keyId } = authResult;
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const organizationId =
      searchParams.get('organization_id') ||
      (await resolveModerationOrganizationId(supabase, { userId, keyId }));

    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'organization_required', message: 'organization_id is required' },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 400 }
      );
    }

    if (!(await hasOrganizationMembership(supabase, userId, organizationId))) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'forbidden', message: 'Not a member of this organization' },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 403 }
      );
    }

    const policies = await listModerationPolicies(organizationId, supabase);

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/moderation-policies', method: 'GET', startTime },
        200
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        data: {
          policies,
          count: policies.length,
          featureEnabled: isModerationEnabled(),
          provider: process.env.SEIZN_MODERATION_PROVIDER || 'openai',
        },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('[v1/moderation-policies] GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'internal_error', message: 'Failed to list moderation policies' },
        meta: { ...META, latencyMs: Date.now() - startTime },
      },
      { status: 500 }
    );
  }
}
