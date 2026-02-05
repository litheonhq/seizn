/**
 * Semantic Update API
 *
 * POST /api/spring/update - Semantic memory update
 * POST /api/spring/update/batch - Batch update memories
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
import { createSemanticUpdateService } from '@/lib/spring/memory-v4/semantic-update-service';
import type { SemanticUpdateRequest, SearchFiltersV3, TimeFilter } from '@/lib/spring/memory-v4/types';

// =============================================================================
// POST - Semantic Update
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
    if (!body.statement || typeof body.statement !== 'string') {
      return ValidationErrors.missingField('statement');
    }

    // Build request
    const updateRequest: SemanticUpdateRequest = {
      statement: body.statement as string,
    };

    if (body.scope) {
      const validScopes = ['user', 'workspace'];
      if (!validScopes.includes(body.scope as string)) {
        return ValidationErrors.invalidValue('scope', body.scope, validScopes.join(', '));
      }
      updateRequest.scope = body.scope as 'user' | 'workspace';
    }

    if (body.autoApply !== undefined) {
      updateRequest.autoApply = Boolean(body.autoApply);
    }

    if (body.dryRun !== undefined) {
      updateRequest.dryRun = Boolean(body.dryRun);
    }

    // Parse filters
    if (body.filters && typeof body.filters === 'object') {
      const f = body.filters as Record<string, unknown>;
      const filters: SearchFiltersV3 = {};

      if (f.types) filters.types = f.types as string[];
      if (f.categories) filters.categories = f.categories as string[];
      if (f.tags) filters.tags = f.tags as string[];
      if (f.privacyClasses) filters.privacyClasses = f.privacyClasses as string[];
      if (f.statuses) filters.statuses = f.statuses as string[];
      if (f.namespace) filters.namespace = f.namespace as string;

      if (f.time && typeof f.time === 'object') {
        const t = f.time as Record<string, unknown>;
        const time: TimeFilter = {};
        if (t.since) time.since = t.since as string;
        if (t.until) time.until = t.until as string;
        filters.time = time;
      }

      updateRequest.filters = filters;
    }

    // Execute semantic update
    const supabase = createServerClient();
    const service = createSemanticUpdateService(supabase);
    const result = await service.semanticUpdate(userId, updateRequest);

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/update', method: 'POST', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      statement: result.statement,
      candidates: result.candidates.map((c) => ({
        noteId: c.noteId,
        content: c.content,
        classification: c.classification,
        confidence: c.confidence,
        suggestedContent: c.suggestedContent,
        explanation: c.explanation,
      })),
      appliedChanges: result.appliedChanges,
      dryRun: result.dryRun,
      processingMs: result.processingMs,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Semantic update error:', error);
    return ServerErrors.internal('semantic_update');
  }
}
