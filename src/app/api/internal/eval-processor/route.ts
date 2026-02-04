/**
 * Internal Eval Processor API
 *
 * POST /api/internal/eval-processor - Process pending evaluation triggers
 *
 * This endpoint is called by a cron job to process pending triggers.
 * It should be protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPendingTriggers } from '@/lib/eval/events';
import { autoEvalService } from '@/lib/eval/auto-eval-service';

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_TRIGGERS_PER_RUN = 10;

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '');

    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get pending triggers
    const triggers = await getPendingTriggers(MAX_TRIGGERS_PER_RUN);

    if (triggers.length === 0) {
      return NextResponse.json({
        processed: 0,
        message: 'No pending triggers',
      });
    }

    console.log(`[EvalProcessor] Processing ${triggers.length} pending triggers`);

    const results: Array<{
      triggerId: string;
      runId?: string;
      status: 'success' | 'failed';
      error?: string;
    }> = [];

    // Process each trigger
    for (const trigger of triggers) {
      try {
        const run = await autoEvalService.runEvaluation(trigger);
        results.push({
          triggerId: trigger.id,
          runId: run.id,
          status: 'success',
        });
      } catch (error) {
        console.error(`[EvalProcessor] Failed to process trigger ${trigger.id}:`, error);
        results.push({
          triggerId: trigger.id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    return NextResponse.json({
      processed: triggers.length,
      success: successCount,
      failed: failedCount,
      results,
    });
  } catch (error) {
    console.error('[EvalProcessor] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// Also support GET for health checks
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '');

    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const triggers = await getPendingTriggers(1);

    return NextResponse.json({
      status: 'healthy',
      pendingTriggers: triggers.length > 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
