import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import {
  MODERATION_ACTIONS,
  MODERATION_CATEGORIES,
  resolveModerationOrganizationId,
  type ModerationAction,
  type ModerationCategory,
  type ModerationPolicy,
  upsertModerationPolicy,
} from '@/lib/moderation/guard';
import { requireRole } from '@/lib/rbac/permissions';
import { createServerClient } from '@/lib/supabase';

const META = { version: 'v1' as const };

interface RouteParams {
  params: Promise<{ name: string }>;
}

type RawPolicyInput = {
  organizationId?: unknown;
  organization_id?: unknown;
  memoryClass?: unknown;
  memory_class?: unknown;
  category?: unknown;
  action?: unknown;
  threshold?: unknown;
};

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

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parsePolicyInput(policyName: string, input: RawPolicyInput): Omit<ModerationPolicy, 'organizationId'> {
  const category = asNonEmptyString(input.category);
  const action = asNonEmptyString(input.action);
  const threshold = Number(input.threshold);

  if (!category || !MODERATION_CATEGORIES.includes(category as ModerationCategory)) {
    throw new Error(`category must be one of: ${MODERATION_CATEGORIES.join(', ')}`);
  }
  if (!action || !MODERATION_ACTIONS.includes(action as ModerationAction)) {
    throw new Error(`action must be one of: ${MODERATION_ACTIONS.join(', ')}`);
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('threshold must be a number between 0 and 1');
  }

  return {
    policyName,
    memoryClass: asNonEmptyString(input.memoryClass) || asNonEmptyString(input.memory_class),
    category: category as ModerationCategory,
    action: action as ModerationAction,
    threshold,
  };
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();

  try {
    const { name } = await params;
    const policyName = decodeURIComponent(name || '').trim();
    if (!policyName) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'invalid_field', message: 'policy name is required' },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 400 }
      );
    }

    const authResult = await resolveAuth(request);
    if ('error' in authResult) return authResult.error;

    const { userId, keyId } = authResult;
    const supabase = createServerClient();
    const body = (await request.json()) as RawPolicyInput & { policies?: RawPolicyInput[] };
    const explicitOrganizationId =
      asNonEmptyString(body.organizationId) || asNonEmptyString(body.organization_id);
    const organizationId =
      explicitOrganizationId || (await resolveModerationOrganizationId(supabase, { userId, keyId }));

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

    try {
      await requireRole(userId, organizationId, 'admin');
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'forbidden', message: 'Admin access required to edit moderation policies' },
          meta: { ...META, latencyMs: Date.now() - startTime },
        },
        { status: 403 }
      );
    }

    const inputs = Array.isArray(body.policies) && body.policies.length > 0 ? body.policies : [body];
    const policies = inputs.map((input) => parsePolicyInput(policyName, input));
    const saved = [];
    for (const policy of policies) {
      saved.push(await upsertModerationPolicy(organizationId, policy, supabase));
    }

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/moderation-policies/[name]', method: 'PUT', startTime },
        200
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        data: { policies: saved, count: saved.length },
        meta: { ...META, latencyMs: Date.now() - startTime },
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update moderation policy';
    const status = message.includes('must be') ? 400 : 500;
    console.error('[v1/moderation-policies/:name] PUT error:', error);
    return NextResponse.json(
      {
        success: false,
        error: { code: status === 400 ? 'invalid_field' : 'internal_error', message },
        meta: { ...META, latencyMs: Date.now() - startTime },
      },
      { status }
    );
  }
}
