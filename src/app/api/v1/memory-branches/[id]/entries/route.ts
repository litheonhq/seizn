import { NextRequest, NextResponse } from 'next/server';
import { logRequest } from '@/lib/api-auth';
import { listBranchEntriesForUser, recordBranchEntry, type BranchOperation } from '@/lib/memory/versioning';
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

function parseOperation(value: unknown): BranchOperation | null {
  return value === 'added' || value === 'updated' || value === 'deleted' ? value : null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  try {
    const { id } = await params;
    const branchId = decodeURIComponent(id || '').trim();
    if (!branchId) return jsonError('branch id is required', 400, startTime, 'invalid_field');

    const authResult = await resolveVersioningAuth(request);
    if ('error' in authResult) return authResult.error;

    const { userId, keyId } = authResult;
    const entries = await listBranchEntriesForUser(createServerClient(), { userId, branchId });

    if (keyId) {
      await logRequest({ userId, keyId, endpoint: '/api/v1/memory-branches/[id]/entries', method: 'GET', startTime }, 200);
    }

    return withVersioningHeaders(
      NextResponse.json({
        success: true,
        data: { entries, count: entries.length },
        meta: { ...VERSIONING_META, latencyMs: Date.now() - startTime },
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list branch entries';
    return jsonError(message, 500, startTime);
  }
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
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const memoryId = asVersioningString(body.memory_id) || asVersioningString(body.memoryId);
    const operation = parseOperation(body.operation);
    if (!memoryId || !operation) {
      return jsonError('memory_id and operation are required', 400, startTime, 'invalid_field');
    }

    const entry = await recordBranchEntry(createServerClient(), {
      userId,
      branchId,
      memoryId,
      operation,
      content: asVersioningString(body.content),
      metadata: typeof body.metadata === 'object' && body.metadata !== null ? body.metadata as Record<string, unknown> : {},
    });

    if (keyId) {
      await logRequest({ userId, keyId, endpoint: '/api/v1/memory-branches/[id]/entries', method: 'POST', startTime }, 201);
    }

    return withVersioningHeaders(
      NextResponse.json({
        success: true,
        data: { entry },
        meta: { ...VERSIONING_META, latencyMs: Date.now() - startTime },
      }, { status: 201 }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record branch entry';
    return jsonError(message, 500, startTime);
  }
}
