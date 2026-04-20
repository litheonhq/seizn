import { NextRequest, NextResponse } from 'next/server';
import { loadSnapshot, listSnapshots } from '@/lib/replay/snapshot';
import { replaySnapshot } from '@/lib/replay/replay';
import { requireReplayRouteAuth, withReplayHeaders } from '@/lib/replay/api-auth';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(request: NextRequest) {
  const auth = await requireReplayRouteAuth(request);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get('limit') || '50', 10);
  const snapshots = await listSnapshots(auth.organizationId, {
    limit: Number.isFinite(limit) ? limit : 50,
    after: searchParams.get('after'),
    endpoint: searchParams.get('endpoint'),
  });

  return withReplayHeaders(
    NextResponse.json({
      success: true,
      data: {
        snapshots,
        count: snapshots.length,
      },
    }),
    auth.rateLimitHeaders
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireReplayRouteAuth(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null) as {
    traceId?: string;
    mockLLM?: boolean;
    mockTools?: boolean;
  } | null;

  if (!body?.traceId) {
    return NextResponse.json(
      { success: false, error: { code: 'missing_trace_id', message: 'traceId is required.' } },
      { status: 400 }
    );
  }

  const snapshot = await loadSnapshot(body.traceId, auth.organizationId);
  if (!snapshot) {
    return NextResponse.json(
      { success: false, error: { code: 'not_found', message: 'Replay snapshot not found.' } },
      { status: 404 }
    );
  }

  const result = await replaySnapshot(body.traceId, auth.organizationId, {
    mockLLM: body.mockLLM,
    mockTools: body.mockTools,
  });

  await logAuditEvent(
    { userId: auth.userId, apiKeyId: auth.apiKeyId },
    {
      action: 'replay.invoked',
      resourceType: 'replay_snapshot',
      resourceId: body.traceId,
      teamId: auth.organizationId,
      details: { mock_llm: body.mockLLM === true, mock_tools: body.mockTools === true },
    }
  );

  return withReplayHeaders(
    NextResponse.json({
      success: true,
      data: {
        snapshot,
        replay: result,
      },
    }),
    auth.rateLimitHeaders
  );
}
