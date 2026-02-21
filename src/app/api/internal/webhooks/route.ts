// Internal API for processing webhook deliveries
// Called by Vercel Cron
// NOT exposed to external users

import { NextRequest, NextResponse } from 'next/server';
import { processPendingWebhooks } from '@/lib/webhook';
import { verifyCronSecret } from '@/lib/cron-auth';

// POST /api/internal/webhooks - Process pending webhook deliveries
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch((e: unknown) => {
      console.warn('[Internal Webhooks] Failed to parse request body:', e instanceof Error ? e.message : e);
      return {} as Record<string, unknown>;
    });
    const limit = body.limit || 50;

    const results = await processPendingWebhooks(limit);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results,
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/internal/webhooks - Health check for webhook processing
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    service: 'webhook-processor',
    timestamp: new Date().toISOString(),
  });
}
