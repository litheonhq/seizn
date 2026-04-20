import { NextRequest, NextResponse } from 'next/server';
import { logRequest } from '@/lib/api-auth';
import { checkoutMemoryBranch } from '@/lib/memory/versioning';
import {
  jsonError,
  resolveVersioningAuth,
  VERSIONING_META,
  withVersioningHeaders,
} from '@/lib/memory/versioning-api';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  try {
    const { id } = await params;
    const branchId = decodeURIComponent(id || '').trim();
    if (!branchId) return jsonError('branch id is required', 400, startTime, 'invalid_field');

    const authResult = await resolveVersioningAuth(request);
    if ('error' in authResult) return authResult.error;

    const { userId, keyId } = authResult;
    const branch = await checkoutMemoryBranch(createServerClient(), { userId, branchId });

    if (keyId) {
      await logRequest({ userId, keyId, endpoint: '/api/v1/memory-branches/[id]/checkout', method: 'POST', startTime }, 200);
    }

    return withVersioningHeaders(
      NextResponse.json({
        success: true,
        data: { branch },
        meta: { ...VERSIONING_META, latencyMs: Date.now() - startTime },
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to checkout memory branch';
    return jsonError(message, 500, startTime);
  }
}
