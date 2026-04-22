import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getDsrObjectStore } from '@/lib/compliance/dsr-object-store';
import { processNextDsrJob } from '@/lib/compliance/dsr-worker';
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
    const result = await processNextDsrJob(createServerClient(), getDsrObjectStore());
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logServerError('[api/cron/dsr-worker] failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'dsr_worker_failed', message: 'DSR worker failed' } },
      { status: 500 }
    );
  }
}
