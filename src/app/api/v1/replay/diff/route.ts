import { NextRequest, NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/audit/logger';
import { diffSnapshotRecords } from '@/lib/replay/replay';
import { loadSnapshot } from '@/lib/replay/snapshot';
import { requireReplayRouteAuth, withReplayHeaders } from '@/lib/replay/api-auth';

export async function POST(request: NextRequest) {
  const auth = await requireReplayRouteAuth(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null) as {
    traceIdA?: string;
    traceIdB?: string;
  } | null;

  if (!body?.traceIdA || !body?.traceIdB) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'missing_trace_ids', message: 'traceIdA and traceIdB are required.' },
      },
      { status: 400 }
    );
  }

  const [a, b] = await Promise.all([
    loadSnapshot(body.traceIdA, auth.organizationId),
    loadSnapshot(body.traceIdB, auth.organizationId),
  ]);

  if (!a || !b) {
    return NextResponse.json(
      { success: false, error: { code: 'not_found', message: 'One or both snapshots were not found.' } },
      { status: 404 }
    );
  }

  const divergence = diffSnapshotRecords(a, b);

  await logAuditEvent(
    { userId: auth.userId, apiKeyId: auth.apiKeyId },
    {
      action: 'replay.diff',
      resourceType: 'replay_snapshot',
      resourceId: `${body.traceIdA}:${body.traceIdB}`,
      teamId: auth.organizationId,
      details: { matches: !divergence, divergence_path: divergence?.path ?? null },
    }
  );

  return withReplayHeaders(
    NextResponse.json({
      success: true,
      data: {
        matches: !divergence,
        divergence: divergence ?? null,
      },
    }),
    auth.rateLimitHeaders
  );
}
