import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { logServerError } from '@/lib/server/logger';
import {
  evaluateAllStoryHealth,
  evaluateStoryHealthForStudio,
} from '@/lib/story-health/evaluator';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const studioId = searchParams.get('studioId');
    if (studioId) {
      const result = await evaluateStoryHealthForStudio({ studioId });
      return NextResponse.json({
        success: true,
        checked: 1,
        processed: 1,
        ...result,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await evaluateAllStoryHealth();
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    logServerError('[internal/story-health/evaluate] failed', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
