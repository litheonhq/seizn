/**
 * GET /api/cron/audit-batch - Scheduled Merkle batch creation
 *
 * Creates Merkle batches for all organizations with unbatched audit entries.
 * Should be triggered via Vercel Cron or similar scheduler.
 *
 * Schedule: Every hour
 *
 * vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/audit-batch",
 *     "schedule": "0 * * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createMerkleBatch } from '@/lib/audit/tamper-evident';
import { createServerClient } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/cron-auth';

export async function GET(request: NextRequest) {
  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // Get all organizations with unbatched entries
    const { data: orgsWithUnbatched, error: orgError } = await supabase
      .from('audit_logs_tamper_evident')
      .select('organization_id')
      .is('merkle_batch_id', null)
      .not('organization_id', 'is', null);

    if (orgError) throw orgError;

    // Get unique organization IDs
    const organizationIds = [
      ...new Set(orgsWithUnbatched?.map((e) => e.organization_id).filter(Boolean)),
    ];

    if (organizationIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unbatched entries found',
        batches_created: 0,
      });
    }

    // Create batches for each organization
    const results: Array<{
      organization_id: string;
      batch_id: string | null;
      entry_count: number;
      error?: string;
    }> = [];

    for (const orgId of organizationIds) {
      try {
        const batch = await createMerkleBatch(orgId as string, {
          maxEntries: 10000,
        });

        results.push({
          organization_id: orgId as string,
          batch_id: batch?.id || null,
          entry_count: batch?.entry_count || 0,
        });
      } catch (error) {
        results.push({
          organization_id: orgId as string,
          batch_id: null,
          entry_count: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.batch_id).length;
    const totalEntries = results.reduce((sum, r) => sum + r.entry_count, 0);

    return NextResponse.json({
      success: true,
      batches_created: successCount,
      total_entries_batched: totalEntries,
      results,
    });
  } catch (error) {
    console.error('[AuditBatchCron] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Prevent accidental caching
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for batch processing
