import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/cron-auth';

// Retention period in days
const RETENTION_DAYS = 90;

// GET /api/cron/usage-cleanup - Clean up old usage_logs (older than 90 days)
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cutoffDateStr = cutoffDate.toISOString();

  const results = {
    usage_logs_deleted: 0,
    aggregated_stats: null as {
      total_records: number;
      total_api_calls: number;
      total_tokens: number;
      date_range: { from: string; to: string };
    } | null,
  };

  try {
    const supabase = createServerClient();

    // First, aggregate old data before deletion
    const { data: oldLogs, error: fetchError } = await supabase
      .from('usage_logs')
      .select('id, user_id, endpoint, input_tokens, output_tokens, embedding_tokens, cost_cents, created_at')
      .lt('created_at', cutoffDateStr)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Failed to fetch old usage logs:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch old usage logs' },
        { status: 500 }
      );
    }

    const recordsToDelete = oldLogs?.length || 0;

    if (recordsToDelete > 0) {
      // Aggregate statistics before deletion
      const aggregatedStats = {
        total_records: recordsToDelete,
        total_api_calls: recordsToDelete,
        total_tokens: oldLogs!.reduce(
          (sum, log) =>
            sum +
            (log.input_tokens || 0) +
            (log.output_tokens || 0) +
            (log.embedding_tokens || 0),
          0
        ),
        total_cost_cents: oldLogs!.reduce((sum, log) => sum + (log.cost_cents || 0), 0),
        date_range: {
          from: oldLogs![0].created_at,
          to: oldLogs![oldLogs!.length - 1].created_at,
        },
        by_endpoint: oldLogs!.reduce(
          (acc, log) => {
            acc[log.endpoint] = (acc[log.endpoint] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
      };

      results.aggregated_stats = {
        total_records: aggregatedStats.total_records,
        total_api_calls: aggregatedStats.total_api_calls,
        total_tokens: aggregatedStats.total_tokens,
        date_range: aggregatedStats.date_range,
      };

      // Store aggregated data in audit log before deletion
      await supabase.from('audit_logs').insert({
        user_id: null, // System action
        action: 'system.usage_cleanup',
        resource_type: 'usage_logs',
        resource_id: null,
        details: {
          retention_days: RETENTION_DAYS,
          cutoff_date: cutoffDateStr,
          aggregated_stats: aggregatedStats,
        },
        status: 'success',
      });

      // Delete old usage logs in batches to avoid timeout
      const BATCH_SIZE = 1000;
      const logIds = oldLogs!.map((log) => log.id);

      for (let i = 0; i < logIds.length; i += BATCH_SIZE) {
        const batchIds = logIds.slice(i, i + BATCH_SIZE);
        const { error: deleteError } = await supabase
          .from('usage_logs')
          .delete()
          .in('id', batchIds);

        if (deleteError) {
          console.error(`Failed to delete batch ${i / BATCH_SIZE + 1}:`, deleteError);
          // Continue with next batch instead of failing completely
        } else {
          results.usage_logs_deleted += batchIds.length;
        }
      }

      console.log(
        `Usage cleanup: deleted ${results.usage_logs_deleted}/${recordsToDelete} logs older than ${RETENTION_DAYS} days`
      );
    } else {
      console.log(`Usage cleanup: no logs older than ${RETENTION_DAYS} days to delete`);
    }

    // Also clean up old audit logs (optional, keep longer than usage logs)
    const auditRetentionDays = 365; // Keep audit logs for 1 year
    const auditCutoffDate = new Date(
      now.getTime() - auditRetentionDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const { count: auditLogsDeleted } = await supabase
      .from('audit_logs')
      .delete()
      .lt('created_at', auditCutoffDate);

    if (auditLogsDeleted && auditLogsDeleted > 0) {
      console.log(`Usage cleanup: also deleted ${auditLogsDeleted} audit logs older than ${auditRetentionDays} days`);
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      retention_days: RETENTION_DAYS,
      cutoff_date: cutoffDateStr,
      usage_logs_deleted: results.usage_logs_deleted,
      audit_logs_deleted: auditLogsDeleted || 0,
      aggregated_stats: results.aggregated_stats,
      duration_ms: duration,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Usage cleanup cron error:', errorMessage);

    // Log the failure
    try {
      const supabase = createServerClient();
      await supabase.from('audit_logs').insert({
        user_id: null,
        action: 'system.usage_cleanup',
        resource_type: 'usage_logs',
        resource_id: null,
        details: { retention_days: RETENTION_DAYS, cutoff_date: cutoffDateStr },
        status: 'failed',
        error_message: errorMessage,
      });
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
