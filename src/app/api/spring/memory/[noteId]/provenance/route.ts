/**
 * Memory V3 API - Provenance Route
 *
 * GET  /api/spring/memory/[noteId]/provenance - Get provenance information
 * POST /api/spring/memory/[noteId]/provenance - Attach provenance
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
import { createMemoryV3Service } from '@/lib/spring/memory-v3/service';
import type { ProvenanceInfo, ExtractionSource } from '@/lib/spring/memory-v3/types';

interface RouteParams {
  params: Promise<{ noteId: string }>;
}

// =============================================================================
// GET /api/spring/memory/[noteId]/provenance - Get Provenance
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { noteId } = await params;

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Validate noteId
    if (!noteId || typeof noteId !== 'string') {
      return ValidationErrors.missingField('noteId');
    }

    // Get note first to verify ownership
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);
    const note = await service.getNote(noteId);

    if (!note) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/${noteId}/provenance`, method: 'GET', startTime },
        404
      );
      return NotFoundErrors.memory(noteId);
    }

    // Verify ownership
    if (note.userId !== userId) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/${noteId}/provenance`, method: 'GET', startTime },
        403
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this note',
          },
        },
        { status: 403 }
      );
    }

    // Get provenance
    const provenance = await service.getProvenance(noteId);

    // Log request
    await logRequest(
      { userId, keyId, endpoint: `/api/spring/memory/${noteId}/provenance`, method: 'GET', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        noteId,
        provenance,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Memory V3 GET provenance error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return NotFoundErrors.memory(noteId);
    }
    return ServerErrors.internal('get_provenance');
  }
}

// =============================================================================
// POST /api/spring/memory/[noteId]/provenance - Attach Provenance
// =============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { noteId } = await params;

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Validate noteId
    if (!noteId || typeof noteId !== 'string') {
      return ValidationErrors.missingField('noteId');
    }

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Get note first to verify ownership
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);
    const note = await service.getNote(noteId);

    if (!note) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/${noteId}/provenance`, method: 'POST', startTime },
        404
      );
      return NotFoundErrors.memory(noteId);
    }

    // Verify ownership
    if (note.userId !== userId) {
      await logRequest(
        { userId, keyId, endpoint: `/api/spring/memory/${noteId}/provenance`, method: 'POST', startTime },
        403
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this note',
          },
        },
        { status: 403 }
      );
    }

    // Build provenance update
    const provenanceUpdate: Partial<ProvenanceInfo> = {};

    // Handle corroborating sources
    if (body.corroborating_sources && Array.isArray(body.corroborating_sources)) {
      provenanceUpdate.corroboratingSources = body.corroborating_sources.map(
        (src: Record<string, unknown>): ExtractionSource => ({
          type: src.type as string,
          sourceId: src.source_id as string | undefined,
          sourceUrl: src.source_url as string | undefined,
          extractedAt: src.extracted_at ? new Date(src.extracted_at as string) : new Date(),
          extractionMethod: src.extraction_method as string | undefined,
          extractionConfidence: src.extraction_confidence as number | undefined,
          rawContent: src.raw_content as string | undefined,
          offset: src.offset as { start: number; end: number } | undefined,
        })
      );
    }

    // Handle model version
    if (body.model_version) {
      provenanceUpdate.modelVersion = body.model_version as string;
    }

    // Handle transformations
    if (body.transformations && Array.isArray(body.transformations)) {
      provenanceUpdate.transformations = body.transformations as string[];
    }

    // Handle derivation chain
    if (body.derivation_chain && Array.isArray(body.derivation_chain)) {
      provenanceUpdate.derivationChain = body.derivation_chain as string[];
    }

    // Handle source update (full replacement)
    if (body.source) {
      const src = body.source as Record<string, unknown>;
      if (!src.type) {
        return ValidationErrors.missingField('source.type');
      }
      provenanceUpdate.source = {
        type: src.type as string,
        sourceId: src.source_id as string | undefined,
        sourceUrl: src.source_url as string | undefined,
        extractedAt: src.extracted_at ? new Date(src.extracted_at as string) : new Date(),
        extractionMethod: src.extraction_method as string | undefined,
        extractionConfidence: src.extraction_confidence as number | undefined,
        rawContent: src.raw_content as string | undefined,
        offset: src.offset as { start: number; end: number } | undefined,
      };
    }

    // Check if there are any updates
    if (Object.keys(provenanceUpdate).length === 0) {
      return ValidationErrors.invalidBody('No valid provenance fields to update');
    }

    // Attach provenance
    await service.attachProvenance(noteId, {
      ...note.provenance,
      ...provenanceUpdate,
      corroboratingSources: [
        ...(note.provenance?.corroboratingSources || []),
        ...(provenanceUpdate.corroboratingSources || []),
      ],
    });

    // Get updated provenance
    const updatedProvenance = await service.getProvenance(noteId);

    // Log request
    await logRequest(
      { userId, keyId, endpoint: `/api/spring/memory/${noteId}/provenance`, method: 'POST', startTime },
      200
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        noteId,
        provenance: updatedProvenance,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Memory V3 POST provenance error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return NotFoundErrors.memory(noteId);
    }
    return ServerErrors.internal('attach_provenance');
  }
}
