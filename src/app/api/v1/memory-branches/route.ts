import { NextRequest, NextResponse } from 'next/server';
import { logRequest } from '@/lib/api-auth';
import { createMemoryBranch, listMemoryBranches } from '@/lib/memory/versioning';
import {
  asVersioningString,
  jsonError,
  resolveVersioningAuth,
  resolveVersioningOrganizationId,
  VERSIONING_META,
  withVersioningHeaders,
} from '@/lib/memory/versioning-api';
import { createServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    const authResult = await resolveVersioningAuth(request);
    if ('error' in authResult) return authResult.error;

    const { userId, keyId } = authResult;
    const namespace = new URL(request.url).searchParams.get('namespace') || 'default';
    const branches = await listMemoryBranches(createServerClient(), { userId, namespace });

    if (keyId) {
      await logRequest({ userId, keyId, endpoint: '/api/v1/memory-branches', method: 'GET', startTime }, 200);
    }

    return withVersioningHeaders(
      NextResponse.json({
        success: true,
        data: { branches, count: branches.length },
        meta: { ...VERSIONING_META, latencyMs: Date.now() - startTime },
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list memory branches';
    return jsonError(message, 500, startTime);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const authResult = await resolveVersioningAuth(request);
    if ('error' in authResult) return authResult.error;

    const { userId, keyId } = authResult;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = asVersioningString(body.name);
    if (!name) return jsonError('name is required', 400, startTime, 'invalid_field');

    const supabase = createServerClient();
    const branch = await createMemoryBranch(supabase, {
      userId,
      organizationId: await resolveVersioningOrganizationId(supabase, userId, keyId),
      namespace: asVersioningString(body.namespace) || 'default',
      name,
      parentBranchId: asVersioningString(body.parent_branch_id) || asVersioningString(body.parentBranchId),
      baseSnapshotId: asVersioningString(body.base_snapshot_id) || asVersioningString(body.baseSnapshotId),
      activate: body.activate === true,
    });

    if (keyId) {
      await logRequest({ userId, keyId, endpoint: '/api/v1/memory-branches', method: 'POST', startTime }, 201);
    }

    return withVersioningHeaders(
      NextResponse.json({
        success: true,
        data: { branch },
        meta: { ...VERSIONING_META, latencyMs: Date.now() - startTime },
      }, { status: 201 }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create memory branch';
    return jsonError(message, 500, startTime);
  }
}
