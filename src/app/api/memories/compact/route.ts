/**
 * Memory Compaction API - Cluster and archive old memories
 *
 * POST /api/memories/compact - Run compaction for a user
 * GET /api/memories/compact - Get compaction stats
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ServerErrors } from '@/lib/api-error';
import {
  runCompaction,
  getCompactionCandidates,
  getClusterStats,
  searchClusters,
} from '@/lib/memory/compaction';

// GET /api/memories/compact - Get compaction stats and candidates
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const namespace = searchParams.get('namespace') || 'default';
    const action = searchParams.get('action') || 'stats';

    if (action === 'candidates') {
      // Get compaction candidates
      const minAgeDays = parseInt(searchParams.get('min_age_days') || '30');
      const maxImportance = parseInt(searchParams.get('max_importance') || '3');

      const candidates = await getCompactionCandidates(userId, namespace, {
        minAgeDays,
        maxImportance,
        maxCandidates: 50,
      });

      await logRequest(
        { userId, keyId, endpoint: '/api/memories/compact', method: 'GET', startTime },
        200
      );

      return NextResponse.json({
        success: true,
        candidates: candidates.map((c) => ({
          id: c.id,
          content: c.content.slice(0, 100) + (c.content.length > 100 ? '...' : ''),
          memory_type: c.memory_type,
          importance: c.importance,
          created_at: c.created_at,
        })),
        count: candidates.length,
      });
    }

    if (action === 'search') {
      // Search clusters
      const query = searchParams.get('query');
      if (!query) {
        return NextResponse.json({ error: 'query is required' }, { status: 400 });
      }

      const clusters = await searchClusters(userId, query, namespace);

      await logRequest(
        { userId, keyId, endpoint: '/api/memories/compact', method: 'GET', startTime },
        200
      );

      return NextResponse.json({
        success: true,
        clusters,
        count: clusters.length,
      });
    }

    // Default: stats
    const stats = await getClusterStats(userId, namespace);

    await logRequest(
      { userId, keyId, endpoint: '/api/memories/compact', method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Get compaction stats error:', error);
    return ServerErrors.internal('get_compaction_stats');
  }
}

// POST /api/memories/compact - Run compaction
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    const {
      namespace = 'default',
      minAgeDays = 30,
      maxImportance = 3,
      minClusterSize = 3,
      model = 'haiku',
    } = body;

    // Run compaction
    const result = await runCompaction(userId, namespace, {
      minAgeDays,
      maxImportance,
      minClusterSize,
      model,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/memories/compact', method: 'POST', startTime },
      200,
      { output: result.memoriesArchived }
    );

    return NextResponse.json({
      success: true,
      result,
      message: `Created ${result.clustersCreated} clusters, archived ${result.memoriesArchived} memories`,
    });
  } catch (error) {
    console.error('Run compaction error:', error);
    return ServerErrors.internal('run_compaction');
  }
}
