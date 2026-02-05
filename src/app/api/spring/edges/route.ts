/**
 * Memory Edges API
 *
 * GET /api/spring/edges - List edges for a memory
 * POST /api/spring/edges - Create an edge
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

const VALID_EDGE_TYPES: EdgeType[] = [
  'relates_to',
  'supports',
  'contradicts',
  'supersedes',
  'derived_from',
  'mentions',
  'part_of',
  'causes',
  'similar_to',
];

// =============================================================================
// GET - List Edges for a Memory
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

    const direction = (searchParams.get('direction') || 'both') as 'outgoing' | 'incoming' | 'both';
    const edgeTypesParam = searchParams.get('edge_types');
    const edgeTypes = edgeTypesParam ? edgeTypesParam.split(',') as EdgeType[] : undefined;
    const minWeight = parseFloat(searchParams.get('min_weight') || '0');

    const supabase = createServerClient();
    const service = createEdgeService(supabase);

    const edges = await service.getEdgesForMemory(memoryId, {
      edgeTypes,
      direction,
      minWeight,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/edges', method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      memoryId,
      edges: edges.map((e) => ({
        id: e.id,
        srcMemoryId: e.srcMemoryId,
        dstMemoryId: e.dstMemoryId,
        edgeType: e.edgeType,
        weight: e.weight,
        reason: e.reason,
        direction: e.direction,
        otherMemory: {
          id: e.otherMemory.id,
          content: e.otherMemory.content.substring(0, 200),
          type: e.otherMemory.type,
          tags: e.otherMemory.tags,
        },
        createdAt: e.createdAt.toISOString(),
      })),
      count: edges.length,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('List edges error:', error);
    return ServerErrors.internal('list_edges');
  }
}

// =============================================================================
// POST - Create Edge
// =============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Validate required fields
    if (!body.srcMemoryId) {
      return ValidationErrors.missingField('srcMemoryId');
    }
    if (!body.dstMemoryId) {
      return ValidationErrors.missingField('dstMemoryId');
    }
    if (!body.edgeType) {
      return ValidationErrors.missingField('edgeType');
    }

    const edgeType = body.edgeType as EdgeType;
    if (!VALID_EDGE_TYPES.includes(edgeType)) {
      return ValidationErrors.invalidValue('edgeType', edgeType, VALID_EDGE_TYPES.join(', '));
    }

    const supabase = createServerClient();
    const service = createEdgeService(supabase);

    const edge = await service.createEdge(userId, {
      srcMemoryId: body.srcMemoryId as string,
      dstMemoryId: body.dstMemoryId as string,
      edgeType,
      weight: body.weight as number | undefined,
      reason: body.reason as string | undefined,
      confidence: body.confidence as number | undefined,
      createdByAgent: body.agentId as string | undefined,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/edges', method: 'POST', startTime },
      201
    );

    const response = NextResponse.json(
      {
        success: true,
        edge: {
          id: edge.id,
          srcMemoryId: edge.srcMemoryId,
          dstMemoryId: edge.dstMemoryId,
          edgeType: edge.edgeType,
          weight: edge.weight,
          reason: edge.reason,
          createdAt: edge.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Create edge error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('already exists')) {
      return NextResponse.json(
        { success: false, error: { code: 'EDGE_EXISTS', message } },
        { status: 409 }
      );
    }

    if (message.includes('not found') || message.includes('does not belong')) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_MEMORY', message } },
        { status: 400 }
      );
    }

    return ServerErrors.internal('create_edge');
  }
}
