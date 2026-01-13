/**
 * POST /api/drift/alerts/[id]/acknowledge
 *
 * Acknowledge a drift alert.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  // Authenticate
  const auth = await authenticateRequest(request, { skipUsageCheck: true });
  if ('authError' in auth) {
    return NextResponse.json(
      { success: false, error: auth.authError.error, code: auth.authError.code },
      { status: auth.authError.status }
    );
  }

  const { userId } = auth;
  const { id: alertId } = await params;

  if (!alertId) {
    return NextResponse.json(
      { success: false, error: 'Alert ID is required' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Update the alert
  const { data, error } = await supabase
    .from('drift_alerts')
    .update({
      acknowledged: true,
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString(),
      status: 'acknowledged',
      updated_at: new Date().toISOString(),
    })
    .eq('id', alertId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Failed to acknowledge alert:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to acknowledge alert' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { success: false, error: 'Alert not found' },
      { status: 404 }
    );
  }

  // Transform to camelCase
  const alert = {
    id: data.id,
    userId: data.user_id,
    orgId: data.org_id,
    collectionId: data.collection_id,
    alertType: data.alert_type,
    severity: data.severity,
    status: data.status,
    title: data.title,
    message: data.message,
    currentValue: data.current_value,
    previousValue: data.previous_value,
    threshold: data.threshold,
    deviationPct: data.deviation_pct,
    recommendations: data.recommendations,
    snapshotId: data.snapshot_id,
    comparisonSnapshotId: data.comparison_snapshot_id,
    acknowledged: data.acknowledged,
    acknowledgedBy: data.acknowledged_by,
    acknowledgedAt: data.acknowledged_at,
    resolvedAt: data.resolved_at,
    resolutionNotes: data.resolution_notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };

  return NextResponse.json({
    success: true,
    alert,
  });
}
