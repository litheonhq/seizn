/**
 * GET /api/drift/snapshots
 *
 * List drift snapshots for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';

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
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const limit = parseInt(searchParams.get('limit') || '30', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const supabase = createServerClient();

  // Build query
  let query = supabase
    .from('drift_snapshots')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (collectionId) {
    query = query.eq('collection_id', collectionId);
  }
  if (startDate) {
    query = query.gte('snapshot_date', startDate);
  }
  if (endDate) {
    query = query.lte('snapshot_date', endDate);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Failed to fetch drift snapshots:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch snapshots' },
      { status: 500 }
    );
  }

  // Transform to camelCase
  const snapshots = (data || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    collectionId: row.collection_id,
    snapshotDate: row.snapshot_date,
    queryCount: row.query_count,
    queryEntropy: row.query_entropy,
    docCount: row.doc_count,
    avgTop1Score: row.avg_top1_score,
    avgTopKScore: row.avg_topk_score,
    scoreStdDev: row.score_std_dev,
    rerankBoostAvg: row.rerank_boost_avg,
    centroidShiftMagnitude: row.centroid_shift_magnitude,
    entropyChangePct: row.entropy_change_pct,
    scoreChangePct: row.score_change_pct,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json({
    success: true,
    snapshots,
    total: count || 0,
  });
}
