import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { processQueuedChaosRuns } from '@/lib/chaos/runner';
import { logServerError } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get('limit') || '1', 10);
    const results = await processQueuedChaosRuns(undefined, Number.isFinite(limit) ? limit : 1);
    return NextResponse.json({ success: true, ...results, timestamp: new Date().toISOString() });
  } catch (error) {
    logServerError('[internal/chaos/worker] failed', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
