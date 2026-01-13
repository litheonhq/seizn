/**
 * Seizn Policy Simulator - Simulation Results API
 *
 * GET /api/policies/simulations/[id] - Get simulation results
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  getSimulation,
  getSimulationResults,
  analyzeDetailedDiff as _analyzeDetailedDiff,
  calculateDiffStatistics,
} from '@/lib/policy-simulator';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ============================================
// GET /api/policies/simulations/[id]
// ============================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    // Query params
    const includeDetails = searchParams.get('include_details') !== 'false';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get simulation
    const simulation = await getSimulation(id, userId);

    if (!simulation) {
      return NextResponse.json(
        { error: 'Simulation not found' },
        { status: 404 }
      );
    }

    // Build response
    const response: Record<string, unknown> = {
      success: true,
      simulation: {
        id: simulation.id,
        status: simulation.status,
        base_policy_id: simulation.basePolicyId,
        test_policy_id: simulation.testPolicyId,
        total_queries: simulation.totalQueries,
        affected_queries: simulation.affectedQueries,
        blocked_chunks_count: simulation.blockedChunksCount,
        unblocked_chunks_count: simulation.unblockedChunksCount,
        results_summary: simulation.results,
        error_message: simulation.errorMessage,
        started_at: simulation.startedAt,
        completed_at: simulation.completedAt,
        created_at: simulation.createdAt,
      },
    };

    // Include detailed results if requested
    if (includeDetails && simulation.status === 'completed') {
      const { results, total } = await getSimulationResults(id, userId, limit, offset);

      response.results = results.map((r) => ({
        id: r.id,
        query_id: r.queryId,
        query_text: r.queryText,
        impact_score: r.impactScore,
        newly_blocked_count: r.newlyBlocked.length,
        newly_allowed_count: r.newlyAllowed.length,
        masking_changed_count: r.maskingChanged.length,
        base_chunks_count: r.baseChunks.length,
        test_chunks_count: r.testChunks.length,
        newly_blocked: r.newlyBlocked.map(simplifyChunk),
        newly_allowed: r.newlyAllowed.map(simplifyChunk),
        masking_changed: r.maskingChanged.map(simplifyChunk),
      }));

      response.pagination = {
        total,
        limit,
        offset,
        has_more: total > offset + limit,
      };

      // Include statistics
      const diffs = results.map((r) => ({
        newlyBlocked: r.newlyBlocked,
        newlyAllowed: r.newlyAllowed,
        maskingChanged: r.maskingChanged.map((c) => ({
          chunk: c,
          baseMasked: '',
          testMasked: '',
        })),
        impactScore: r.impactScore,
        impactBreakdown: {
          blockedImpact: r.newlyBlocked.length / (r.baseChunks.length || 1),
          allowedImpact: r.newlyAllowed.length / (r.baseChunks.length || 1),
          maskingImpact: r.maskingChanged.length / (r.baseChunks.length || 1),
        },
      }));

      response.statistics = calculateDiffStatistics(diffs);
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('Get simulation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================
// Helper Functions
// ============================================

interface ChunkLike {
  id: string;
  content: string;
  matchedRules: string[];
  reason?: string;
}

function simplifyChunk(chunk: ChunkLike) {
  return {
    id: chunk.id,
    content_preview: chunk.content.slice(0, 200) + (chunk.content.length > 200 ? '...' : ''),
    matched_rules: chunk.matchedRules,
    reason: chunk.reason,
  };
}
