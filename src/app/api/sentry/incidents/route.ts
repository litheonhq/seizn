import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import type { IncidentSeverity, IncidentStatus, ErrorType } from '@/lib/sentry/types';

/**
 * GET /api/sentry/incidents
 * List incidents with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const url = new URL(request.url);

    // Parse query params
    const status = url.searchParams.get('status') as IncidentStatus | null;
    const severity = url.searchParams.get('severity') as IncidentSeverity | null;
    const errorType = url.searchParams.get('error_type') as ErrorType | null;
    const collectionId = url.searchParams.get('collection_id');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100);
    const offset = Number(url.searchParams.get('offset') ?? 0);

    const supabase = createServerClient();

    // Build query
    let query = supabase
      .from('retops_incidents')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (severity) {
      query = query.eq('severity', severity);
    }
    if (errorType) {
      query = query.eq('error_type', errorType);
    }
    if (collectionId) {
      query = query.eq('collection_id', collectionId);
    }

    const { data: incidents, error, count } = await query;

    if (error) {
      throw error;
    }

    // Get summary stats
    const { data: summary } = await supabase
      .rpc('get_incident_summary', { p_user_id: userId });

    return NextResponse.json({
      success: true,
      incidents: incidents ?? [],
      total: count ?? 0,
      summary: summary?.[0] ?? {
        total_incidents: 0,
        open_incidents: 0,
        critical_incidents: 0,
        high_incidents: 0,
        resolved_today: 0,
        new_today: 0,
      },
    });
  } catch (err) {
    console.error('List incidents error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
