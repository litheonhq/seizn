/**
 * GET /api/drift/alerts
 *
 * List drift alerts for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import type { DriftAlertStatus, DriftSeverity, DriftAlertType } from '@/lib/drift/types';

export async function GET(request: NextRequest) {
  // Authenticate
  const auth = await authenticateRequest(request, { skipUsageCheck: true });
  if ('authError' in auth) {
    return NextResponse.json(
      { success: false, error: auth.authError.error, code: auth.authError.code },
      { status: auth.authError.status }
    );
  }

  const { userId } = auth;
  const { searchParams } = new URL(request.url);

  // Parse query parameters
  const collectionId = searchParams.get('collectionId');
  const status = searchParams.get('status') as DriftAlertStatus | null;
  const severity = searchParams.get('severity') as DriftSeverity | null;
  const alertType = searchParams.get('alertType') as DriftAlertType | null;
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const supabase = createServerClient();

  // Build query
  let query = supabase
    .from('drift_alerts')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (collectionId) {
    query = query.eq('collection_id', collectionId);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (severity) {
    query = query.eq('severity', severity);
  }
  if (alertType) {
    query = query.eq('alert_type', alertType);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Failed to fetch drift alerts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }

  // Count active alerts
  const { count: activeCount } = await supabase
    .from('drift_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active');

  // Transform to camelCase
  const alerts = (data || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    collectionId: row.collection_id,
    alertType: row.alert_type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    message: row.message,
    currentValue: row.current_value,
    previousValue: row.previous_value,
    threshold: row.threshold,
    deviationPct: row.deviation_pct,
    recommendations: row.recommendations,
    snapshotId: row.snapshot_id,
    comparisonSnapshotId: row.comparison_snapshot_id,
    acknowledged: row.acknowledged,
    acknowledgedBy: row.acknowledged_by,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    resolutionNotes: row.resolution_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json({
    success: true,
    alerts,
    total: count || 0,
    activeCount: activeCount || 0,
  });
}
