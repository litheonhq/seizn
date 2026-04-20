import { NextRequest, NextResponse } from 'next/server';
import { logRequest } from '@/lib/api-auth';
import { mergeBranchDiff } from '@/lib/memory/versioning';
import {
  asVersioningString,
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
    const sourceBranchId = decodeURIComponent(id || '').trim();
    if (!sourceBranchId) return jsonError('source branch id is required', 400, startTime, 'invalid_field');

    const authResult = await resolveVersioningAuth(request);
    if ('error' in authResult) return authResult.error;

    const { userId, keyId } = authResult;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const targetBranchId = asVersioningString(body.target_branch_id) || asVersioningString(body.targetBranchId);
    if (!targetBranchId) return jsonError('target_branch_id is required', 400, startTime, 'invalid_field');

    const diff = await mergeBranchDiff(createServerClient(), { userId, sourceBranchId, targetBranchId });

    if (keyId) {
      await logRequest({ userId, keyId, endpoint: '/api/v1/memory-branches/[id]/merge', method: 'POST', startTime }, 200);
    }

    return withVersioningHeaders(
      NextResponse.json({
        success: true,
        data: { diff, count: diff.length, applied: false },
        meta: { ...VERSIONING_META, latencyMs: Date.now() - startTime },
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to merge memory branch';
    return jsonError(message, 500, startTime);
  }
}
