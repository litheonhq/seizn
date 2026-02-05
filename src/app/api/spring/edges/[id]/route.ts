/**
 * Memory Edge API - Individual
 *
 * GET /api/spring/edges/[id] - Get single edge
 * PATCH /api/spring/edges/[id] - Update edge weight
 * DELETE /api/spring/edges/[id] - Delete edge
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors, NotFoundErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createEdgeService } from '@/lib/spring/memory-v4';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// =============================================================================
// GET - Get Single Edge
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const supabase = createServerClient();
    const service = createEdgeService(supabase);
    const edge = await service.getEdge(id);

    if (!edge) {
      return NotFoundErrors.resource('Edge', id);
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/edges/${id}`, method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      edge: {
        id: edge.id,
        srcMemoryId: edge.srcMemoryId,
        dstMemoryId: edge.dstMemoryId,
        edgeType: edge.edgeType,
        weight: edge.weight,
        reason: edge.reason,
        confidence: edge.confidence,
        createdBy: edge.createdBy,
        createdByAgent: edge.createdByAgent,
        createdBySystem: edge.createdBySystem,
        createdAt: edge.createdAt.toISOString(),
      },
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Get edge error:', error);
    return ServerErrors.internal('get_edge');
  }
}

// =============================================================================
// PATCH - Update Edge Weight
// =============================================================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

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

    if (body.weight === undefined) {
      return ValidationErrors.missingField('weight');
    }

    const weight = Number(body.weight);
    if (isNaN(weight) || weight < 0 || weight > 1) {
      return ValidationErrors.invalidValue('weight', body.weight, '0 to 1');
    }

    const supabase = createServerClient();
    const service = createEdgeService(supabase);

    // Verify edge exists
    const existing = await service.getEdge(id);
    if (!existing) {
      return NotFoundErrors.resource('Edge', id);
    }

    const edge = await service.updateEdgeWeight(id, weight);

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/edges/${id}`, method: 'PATCH', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      edge: {
        id: edge.id,
        srcMemoryId: edge.srcMemoryId,
        dstMemoryId: edge.dstMemoryId,
        edgeType: edge.edgeType,
        weight: edge.weight,
      },
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Update edge error:', error);
    return ServerErrors.internal('update_edge');
  }
}

// =============================================================================
// DELETE - Delete Edge
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    const supabase = createServerClient();
    const service = createEdgeService(supabase);

    // Verify edge exists
    const existing = await service.getEdge(id);
    if (!existing) {
      return NotFoundErrors.resource('Edge', id);
    }

    await service.deleteEdge(id);

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/edges/${id}`, method: 'DELETE', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      deleted: true,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Delete edge error:', error);
    return ServerErrors.internal('delete_edge');
  }
}
