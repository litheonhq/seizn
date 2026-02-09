/**
 * Tool Executions API
 *
 * GET /api/v1/tools/executions - List execution history (org-scoped)
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
import { boundedInt } from '@/lib/parse-params';

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
    const { searchParams } = new URL(request.url);

    const orgId = searchParams.get('organization_id');
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: 'organization_id is required' },
        { status: 400 }
      );
    }

    // Verify user is org member
    const supabase = createServerClient();
    const { data: membership } = await supabase
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

    const limit = boundedInt(searchParams.get('limit'), 50, 1, 100);
    const offset = boundedInt(searchParams.get('offset'), 0, 0, 10000);
    const toolId = searchParams.get('tool_id');
    const tokenId = searchParams.get('token_id');
    const status = searchParams.get('status');

    let query = supabase
      .from('agent_tool_executions')
      .select('*')
      .eq('organization_id', orgId)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (toolId) query = query.eq('tool_id', toolId);
    if (tokenId) query = query.eq('token_id', tokenId);
    if (status) query = query.eq('status', status);

    const { data: executions, error } = await query;

    if (error) {
      console.error('[v1/tools/executions] Query error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch executions' },
        { status: 500 }
      );
    }

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/tools/executions', method: 'GET', startTime },
        200
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        executions: executions || [],
        count: executions?.length || 0,
      },
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    console.error('[v1/tools/executions] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
