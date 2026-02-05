/**
 * Graph Neighborhood API
 *
 * GET /api/spring/graph/neighborhood - Get N-hop neighbors of a memory
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createEdgeService, type EdgeType } from '@/lib/spring/memory-v4';

// =============================================================================
// GET - Get Neighborhood
// =============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const { searchParams } = new URL(request.url);
    const memoryId = searchParams.get('memory_id');

    if (!memoryId) {
      return ValidationErrors.missingField('memory_id');
    }

    const maxHops = Math.min(parseInt(searchParams.get('max_hops') || '2', 10), 5);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const minWeight = parseFloat(searchParams.get('min_weight') || '0');
    const edgeTypesParam = searchParams.get('edge_types');
    const edgeTypes = edgeTypesParam ? edgeTypesParam.split(',') as EdgeType[] : undefined;

    const supabase = createServerClient();
    const service = createEdgeService(supabase);

    const neighbors = await service.getNeighborhood(memoryId, maxHops, {
      edgeTypes,
      minWeight,
      limit,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/graph/neighborhood', method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      memoryId,
      maxHops,
      neighbors: neighbors.map((n) => ({
        memoryId: n.memoryId,
        content: n.content.substring(0, 300),
        edgeType: n.edgeType,
        weight: n.weight,
        direction: n.direction,
        hops: n.hops,
      })),
      count: neighbors.length,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Get neighborhood error:', error);
    return ServerErrors.internal('get_neighborhood');
  }
}
