/**
 * Search v3 API
 *
 * POST /api/spring/search-v3 - Advanced search with filters, expansion, reranking
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
import { createSearchServiceV3 } from '@/lib/spring/memory-v4/search-service';
import type { SearchV3Request, SearchFiltersV3, TimeFilter } from '@/lib/spring/memory-v4/types';

// =============================================================================
// POST - Advanced Search
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
    if (!body.query || typeof body.query !== 'string') {
      return ValidationErrors.missingField('query');
    }

    // Build search request
    const searchRequest: SearchV3Request = {
      query: body.query as string,
    };

    // Parse optional fields
    if (body.scope) {
      const validScopes = ['user', 'workspace', 'org'];
      if (!validScopes.includes(body.scope as string)) {
        return ValidationErrors.invalidValue('scope', body.scope, validScopes.join(', '));
      }
      searchRequest.scope = body.scope as 'user' | 'workspace' | 'org';
    }

    if (body.mode) {
      const validModes = ['semantic', 'keyword', 'hybrid', 'advanced'];
      if (!validModes.includes(body.mode as string)) {
        return ValidationErrors.invalidValue('mode', body.mode, validModes.join(', '));
      }
      searchRequest.mode = body.mode as 'semantic' | 'keyword' | 'hybrid' | 'advanced';
    }

    if (body.topK !== undefined) {
      searchRequest.topK = Math.min(Math.max(1, Number(body.topK)), 100);
    }

    if (body.rerank !== undefined) {
      searchRequest.rerank = Boolean(body.rerank);
    }

    if (body.expandQuery !== undefined) {
      searchRequest.expandQuery = Boolean(body.expandQuery);
    }

    if (body.includeUsage !== undefined) {
      searchRequest.includeUsage = Boolean(body.includeUsage);
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
      if (f.agentId) filters.agentId = f.agentId as string;
      if (f.namespace) filters.namespace = f.namespace as string;
      if (f.includeExpired !== undefined) filters.includeExpired = Boolean(f.includeExpired);

      // Parse time filter
      if (f.time && typeof f.time === 'object') {
        const t = f.time as Record<string, unknown>;
        const time: TimeFilter = {};
        if (t.since) time.since = t.since as string;
        if (t.until) time.until = t.until as string;
        filters.time = time;
      }

      searchRequest.filters = filters;
    }

    // Execute search
    const supabase = createServerClient();
    const service = createSearchServiceV3(supabase);
    const result = await service.search(userId, searchRequest);

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/search-v3', method: 'POST', startTime },
      200,
      { embedding: body.query.length }
    );

    const response = NextResponse.json({
      success: true,
      results: result.results.map((r) => ({
        id: r.id,
        content: r.content,
        type: r.type,
        status: r.status,
        category: r.category,
        tags: r.tags,
        privacyClass: r.privacyClass,
        metadata: r.metadata,
        extractionConfidence: r.extractionConfidence,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        validUntil: r.validUntil?.toISOString(),
        scores: {
          semantic: r.semanticScore,
          keyword: r.keywordScore,
          combined: r.combinedScore,
          rerank: r.rerankScore,
        },
        usageCount: r.usageCount,
        lastUsedAt: r.lastUsedAt?.toISOString(),
      })),
      total: result.total,
      queryExpansion: result.queryExpansion,
      filters: result.filters,
      mode: result.mode,
      processingMs: result.processingMs,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Search v3 error:', error);
    return ServerErrors.internal('search_v3');
  }
}
