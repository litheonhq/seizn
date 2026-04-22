import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { runTierDemotionBatch } from '@/lib/memory/budget';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { success: false, error: { code: 'unauthorized', message: 'Invalid cron secret' } },
      { status: 401 }
    );
  }

  try {
    const result = await runTierDemotionBatch({}, createServerClient());
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logServerError('[api/cron/tier-demotion] failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'tier_demotion_failed', message: 'Tier demotion failed' } },
      { status: 500 }
    );
  }
}
