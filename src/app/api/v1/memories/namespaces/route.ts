/**
 * GET /api/v1/memories/namespaces — List all namespaces with stats
 *
 * Returns unique namespaces for the authenticated user with memory count per namespace.
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

const META = { version: 'v1' as const };

async function resolveAuth(
  request: NextRequest
): Promise<
  | { userId: string; keyId: string | null }
  | { error: NextResponse }
> {
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
    const supabase = createServerClient();

    // Get distinct namespaces with counts using a raw SQL query via RPC
    // Fallback: query all non-deleted memories and aggregate client-side
    const { data: memories, error } = await supabase
      .from('memories')
      .select('namespace')
      .eq('user_id', userId)
      .eq('is_deleted', false);

    if (error) {
      console.error('[v1/memories/namespaces] Error:', error);
      return NextResponse.json(
        { success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to fetch namespaces' } },
        { status: 500 }
      );
    }

    // Aggregate namespace counts
    const namespaceCounts = new Map<string, number>();
    for (const m of memories || []) {
      const ns = m.namespace || 'default';
      namespaceCounts.set(ns, (namespaceCounts.get(ns) || 0) + 1);
    }

    const namespaces = Array.from(namespaceCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    if (keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/v1/memories/namespaces', method: 'GET', startTime },
        200
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        namespaces,
        total: namespaces.length,
      },
      meta: { ...META, latencyMs: Date.now() - startTime },
    });
  } catch (error) {
    console.error('[v1/memories/namespaces] Error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
