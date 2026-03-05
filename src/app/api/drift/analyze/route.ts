/**
 * POST /api/drift/analyze
 *
 * Trigger manual drift analysis for a collection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { createServerClient, getServerSupabaseServiceRoleKey, getServerSupabaseUrl } from '@/lib/supabase';
import { DriftCollector } from '@/lib/drift';

export async function POST(request: NextRequest) {
  // Authenticate
  const auth = await authenticateRequest(request, { skipUsageCheck: true });
  if ('authError' in auth) {
    return NextResponse.json(
      { success: false, error: auth.authError.error, code: auth.authError.code },
      { status: auth.authError.status }
    );
  }

  const { userId } = auth;

  // Parse request body
  let body: { collectionId?: string; forceRecalculate?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { collectionId, forceRecalculate: _forceRecalculate = false } = body;

  if (!collectionId) {
    return NextResponse.json(
      { success: false, error: 'collectionId is required' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verify collection ownership
  const { data: collection, error: collectionError } = await supabase
    .from('summer_collections')
    .select('id, name, org_id')
    .eq('id', collectionId)
    .eq('user_id', userId)
    .single();

  if (collectionError || !collection) {
    return NextResponse.json(
      { success: false, error: 'Collection not found or access denied' },
      { status: 404 }
    );
  }

  try {
    // Initialize collector
    const collector = new DriftCollector(
      getServerSupabaseUrl(),
      getServerSupabaseServiceRoleKey()
    );

    // Collect snapshot and analyze
    const { snapshot, alerts } = await collector.collectSnapshot(
      collectionId,
      userId,
      collection.org_id
    );

    // Get summary
    const { data: prevSnapshots } = await supabase
      .from('drift_snapshots')
      .select('*')
      .eq('collection_id', collectionId)
      .lt('snapshot_date', snapshot.snapshotDate)
      .order('snapshot_date', { ascending: false })
      .limit(1);

    const previousSnapshot = prevSnapshots?.[0];

    // Calculate health score
    let healthScore = 100;
    if (snapshot.centroidShiftMagnitude) {
      healthScore -= snapshot.centroidShiftMagnitude * 200;
    }
    if (snapshot.scoreChangePct && snapshot.scoreChangePct < 0) {
      healthScore -= Math.abs(snapshot.scoreChangePct);
    }
    healthScore -= alerts.filter(a => a.severity === 'critical').length * 20;
    healthScore -= alerts.filter(a => a.severity === 'warning').length * 10;
    healthScore = Math.max(0, Math.min(100, healthScore));

    // Determine health status
    let healthStatus: 'healthy' | 'warning' | 'degraded' | 'critical';
    if (healthScore >= 80) {
      healthStatus = 'healthy';
    } else if (healthScore >= 60) {
      healthStatus = 'warning';
    } else if (healthScore >= 40) {
      healthStatus = 'degraded';
    } else {
      healthStatus = 'critical';
    }

    // Determine trend
    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (previousSnapshot?.avg_top1_score && snapshot.avgTop1Score) {
      const scoreDiff = snapshot.avgTop1Score - previousSnapshot.avg_top1_score;
      if (scoreDiff > 0.02) {
        trend = 'improving';
      } else if (scoreDiff < -0.02) {
        trend = 'degrading';
      }
    }

    return NextResponse.json({
      success: true,
      result: {
        snapshot,
        previousSnapshot: previousSnapshot ? {
          id: previousSnapshot.id,
          snapshotDate: previousSnapshot.snapshot_date,
          avgTop1Score: previousSnapshot.avg_top1_score,
          queryCount: previousSnapshot.query_count,
          docCount: previousSnapshot.doc_count,
        } : undefined,
        alerts,
        summary: {
          collectionId,
          collectionName: collection.name,
          analysisDate: snapshot.snapshotDate,
          healthScore,
          healthStatus,
          queryCount: snapshot.queryCount,
          docCount: snapshot.docCount,
          avgScore: snapshot.avgTop1Score || 0,
          centroidShift: snapshot.centroidShiftMagnitude || 0,
          entropyChange: snapshot.entropyChangePct || 0,
          scoreChange: snapshot.scoreChangePct || 0,
          trend,
          activeAlerts: alerts.length,
        },
      },
    });
  } catch (error) {
    console.error('Failed to analyze drift:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to analyze drift' },
      { status: 500 }
    );
  }
}
