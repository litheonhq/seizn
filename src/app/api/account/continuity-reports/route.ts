/**
 * Continuity reports — list + signed-URL download.
 *
 * Locked 2026-05-08. Pro+ Managed perk per CLAUDE.md "Pro+ 가산: Monthly
 * Continuity Report". The cron at /api/cron/continuity-reports writes
 * markdown to R2; this endpoint is the read path that lets the user
 * actually retrieve it.
 *
 * GET → list the user's completed reports (most recent first), each with
 * a short-lived signed R2 URL. Failed/pending reports are surfaced too so
 * the dashboard can show "generating…" / "failed" states.
 *
 * Query params:
 *   ?limit=N   (default 12, max 36) — cap to ~3 years of monthly reports.
 *   ?id=UUID   — fetch a single report by id (still owner-scoped).
 */

import { NextRequest } from 'next/server';
import { withAuthorUiService } from '@/lib/author/ui';
import { AuthorUiNotFoundError } from '@/lib/author/ui/service';
import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';
import { AuthorR2Store, AuthorR2ConfigError } from '@/lib/author/storage/r2-store';

export const runtime = 'nodejs';

const SIGNED_URL_TTL_SECONDS = 900; // 15 min — enough for a click; bounded re-share window.
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 36;

interface ReportRow {
  id: string;
  scheduled_for: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  report_r2_key: string | null;
  llm_cost_cents: number | null;
  generated_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  return withAuthorUiService(request, async (_service, userId) => {
    if (!hasServerSupabaseServiceRoleConfig()) {
      throw new Error('service_role_not_configured');
    }
    const supabase = createServerClient();

    const idFilter = request.nextUrl.searchParams.get('id');
    const limitParam = Number(request.nextUrl.searchParams.get('limit'));
    const limit =
      Number.isInteger(limitParam) && limitParam > 0
        ? Math.min(limitParam, MAX_LIMIT)
        : DEFAULT_LIMIT;

    let query = supabase
      .from('continuity_reports')
      .select(
        'id, scheduled_for, status, report_r2_key, llm_cost_cents, generated_at, failure_reason, created_at',
      )
      .eq('user_id', userId)
      .order('scheduled_for', { ascending: false })
      .limit(limit);
    if (idFilter) query = query.eq('id', idFilter);

    const { data, error } = await query;
    if (error) {
      throw new Error(`continuity_reports query failed: ${error.message}`);
    }

    const rows = (data ?? []) as ReportRow[];
    if (idFilter && rows.length === 0) {
      throw new AuthorUiNotFoundError('Continuity report not found');
    }

    // Sign URLs only for completed rows that have an R2 key. Other states
    // (pending/running/failed) surface in the response without a URL so
    // the UI can show the lifecycle.
    let store: AuthorR2Store | null = null;
    try {
      store = new AuthorR2Store();
    } catch (storeError) {
      // R2 misconfigured — return rows without download URLs rather than
      // failing the whole list. Operator can investigate via the
      // generated_at + status fields.
      if (storeError instanceof AuthorR2ConfigError) {
        store = null;
      } else {
        throw storeError;
      }
    }

    const reports = await Promise.all(
      rows.map(async (row) => {
        let downloadUrl: string | null = null;
        let downloadExpiresAt: string | null = null;
        if (store && row.status === 'completed' && row.report_r2_key) {
          try {
            downloadUrl = await store.getSignedReadUrl(
              row.report_r2_key,
              SIGNED_URL_TTL_SECONDS,
            );
            downloadExpiresAt = new Date(
              Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
            ).toISOString();
          } catch (signError) {
            console.warn(
              `[continuity] sign URL failed for ${row.report_r2_key}`,
              signError,
            );
          }
        }
        return {
          id: row.id,
          scheduled_for: row.scheduled_for,
          status: row.status,
          generated_at: row.generated_at,
          failure_reason: row.failure_reason,
          download_url: downloadUrl,
          download_expires_at: downloadExpiresAt,
        };
      }),
    );

    return { reports };
  });
}
