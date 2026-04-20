import { NextRequest, NextResponse } from 'next/server';
import { loadSnapshot } from '@/lib/replay/snapshot';
import { requireReplayRouteAuth, withReplayHeaders } from '@/lib/replay/api-auth';

interface RouteParams {
  params: Promise<{ traceId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireReplayRouteAuth(request);
  if ('error' in auth) return auth.error;

  const { traceId } = await params;
  const snapshot = await loadSnapshot(traceId, auth.organizationId);
  if (!snapshot) {
    return NextResponse.json(
      { success: false, error: { code: 'not_found', message: 'Replay snapshot not found.' } },
      { status: 404 }
    );
  }

  return withReplayHeaders(
    NextResponse.json({ success: true, data: { snapshot } }),
    auth.rateLimitHeaders
  );
}
