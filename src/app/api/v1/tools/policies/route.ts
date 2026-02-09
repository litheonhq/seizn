/**
 * Tool Policies API
 *
 * GET  /api/v1/tools/policies - List org policies
 * POST /api/v1/tools/policies - Create policy (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { createToolGatingService } from '@/lib/tool-gating';
import { requireRole } from '@/lib/rbac/permissions';

const META = { version: 'v1' as const };

async function resolveAuth(
  request: NextRequest
): Promise<{ userId: string; keyId: string | null } | { error: NextResponse }> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return { userId: authResult.userId, keyId: authResult.keyId };
  }
  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null };
  }
  return { error: authErrorResponse(authResult.authError) };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await resolveAuth(request);
    if ('error' in result) return result.error;

    const { userId, keyId } = result;
    const orgId = new URL(request.url).searchParams.get('organization_id');

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: 'organization_id is required' },
        { status: 400 }
      );
    }

    // Verify org membership (any member can view policies)
    const supabaseCheck = createServerClient();
    const { data: membership } = await supabaseCheck
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'Not a member of this organization' },
        { status: 403 }
      );
    }

    const supabase = createServerClient();
    const service = createToolGatingService(supabase);
    const policies = await service.listPolicies(orgId);

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/tools/policies', method: 'GET', startTime },
        200
      );
    }

    return NextResponse.json({
      success: true,
      data: { policies, count: policies.length },
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    console.error('[v1/tools/policies] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const result = await resolveAuth(request);
    if ('error' in result) return result.error;

    const { userId, keyId } = result;
    const body = await request.json();
    const { organizationId, name, action, ...rest } = body;

    if (!organizationId || !name || !action) {
      return NextResponse.json(
        { success: false, error: 'organizationId, name, and action are required' },
        { status: 400 }
      );
    }

    // Require admin role for policy creation
    try {
      await requireRole(userId, organizationId, 'admin');
    } catch {
      return NextResponse.json(
        { success: false, error: 'Admin access required to create policies' },
        { status: 403 }
      );
    }

    const supabase = createServerClient();
    const service = createToolGatingService(supabase);
    const policy = await service.createPolicy(organizationId, {
      name,
      action,
      ...rest,
    });

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/tools/policies', method: 'POST', startTime },
        201
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: { policy },
        meta: { ...META, latencyMs: Date.now() - startTime },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[v1/tools/policies] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
