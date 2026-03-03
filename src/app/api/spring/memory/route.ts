/**
 * Memory V3 API - Main Route
 *
 * GET  /api/spring/memory - List/search notes with query params
 * POST /api/spring/memory - Create new note (or candidate if autoApprove=false)
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
import type { NoteQuery, NoteType, NoteStatus, NoteScope, PrivacyClass, MemoryNote, MemoryCandidate } from '@/lib/spring/memory-v3/types';

// =============================================================================
// GET /api/spring/memory - List/Search Notes
// =============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const query: NoteQuery = {
      userId,
    };

    // Semantic search
    const semanticQuery = searchParams.get('q') || searchParams.get('query');
    if (semanticQuery) {
      query.semanticQuery = semanticQuery;
    }

    // Text search
    const textQuery = searchParams.get('text');
    if (textQuery) {
      query.textQuery = textQuery;
    }

    // Filters
    const types = searchParams.get('types');
    if (types) {
      query.types = types.split(',') as NoteType[];
    }

    const statuses = searchParams.get('statuses');
    if (statuses) {
      query.statuses = statuses.split(',') as NoteStatus[];
    }

    const scopes = searchParams.get('scopes');
    if (scopes) {
      query.scopes = scopes.split(',') as NoteScope[];
    }

    const privacyClasses = searchParams.get('privacy_classes');
    if (privacyClasses) {
      query.privacyClasses = privacyClasses.split(',') as PrivacyClass[];
    }

    const workspaceId = searchParams.get('workspace_id');
    if (workspaceId) {
      query.workspaceId = workspaceId;
    }

    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      query.sessionId = sessionId;
    }

    const agentId = searchParams.get('agent_id');
    if (agentId) {
      query.agentId = agentId;
    }

    // Tags
    const tagsAny = searchParams.get('tags_any');
    if (tagsAny) {
      query.tagsAny = tagsAny.split(',');
    }

    const tagsAll = searchParams.get('tags_all');
    if (tagsAll) {
      query.tagsAll = tagsAll.split(',');
    }

    // Date filters
    const createdAfter = searchParams.get('created_after');
    if (createdAfter) {
      query.createdAfter = new Date(createdAfter);
    }

    const createdBefore = searchParams.get('created_before');
    if (createdBefore) {
      query.createdBefore = new Date(createdBefore);
    }

    // Scoring filters
    const minSalience = searchParams.get('min_salience');
    if (minSalience) {
      query.minSalience = parseFloat(minSalience);
    }

    const minUtility = searchParams.get('min_utility');
    if (minUtility) {
      query.minUtility = parseFloat(minUtility);
    }

    // Similarity threshold for semantic search
    const threshold = searchParams.get('threshold');
    if (threshold) {
      query.similarityThreshold = parseFloat(threshold);
    }

    // Sorting
    const sortBy = searchParams.get('sort_by') as NoteQuery['sortBy'];
    if (sortBy) {
      query.sortBy = sortBy;
    }

    const sortOrder = searchParams.get('sort_order') as 'asc' | 'desc';
    if (sortOrder) {
      query.sortOrder = sortOrder;
    }

    // Pagination
    const limit = searchParams.get('limit');
    if (limit) {
      query.limit = Math.min(parseInt(limit, 10), 100);
    }

    const offset = searchParams.get('offset');
    if (offset) {
      query.offset = parseInt(offset, 10);
    }

    const cursor = searchParams.get('cursor');
    if (cursor) {
      query.cursor = cursor;
    }

    // Include options
    query.includeExpired = searchParams.get('include_expired') === 'true';
    query.includeEmbedding = searchParams.get('include_embedding') === 'true';
    query.includeProvenance = searchParams.get('include_provenance') === 'true';
    query.includeEntityMentions = searchParams.get('include_entities') === 'true';

    // Execute query
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);
    const result = await service.listNotes(query);

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/spring/memory', method: 'GET', startTime },
      200,
      { embedding: semanticQuery ? semanticQuery.length : 0 }
    );

    // Build response
    const response = NextResponse.json(
      {
        success: true,
        notes: result.notes,
        total: result.total,
        hasMore: result.total > (query.offset || 0) + (query.limit || 50),
        cursor: result.notes.length > 0 ? result.notes[result.notes.length - 1].id : undefined,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Memory V3 GET error:', error);
    return ServerErrors.internal('list_notes');
  }
}

// =============================================================================
// POST /api/spring/memory - Create Note
// =============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Validate required fields
    const MAX_CONTENT_LENGTH = 50_000; // 50KB max
    const content = body.content as string;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return ValidationErrors.missingField('content');
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return ValidationErrors.invalidField('content', `must be at most ${MAX_CONTENT_LENGTH} characters`);
    }

    const type = body.type as NoteType;
    if (!type) {
      return ValidationErrors.missingField('type');
    }

    const validTypes: NoteType[] = ['fact', 'preference', 'instruction', 'episode', 'procedure', 'relationship'];
    if (!validTypes.includes(type)) {
      return ValidationErrors.invalidValue('type', type, validTypes.join(', '));
    }

    const scope = body.scope as NoteScope;
    if (!scope) {
      return ValidationErrors.missingField('scope');
    }

    const validScopes: NoteScope[] = ['user', 'workspace', 'org', 'session', 'agent'];
    if (!validScopes.includes(scope)) {
      return ValidationErrors.invalidValue('scope', scope, validScopes.join(', '));
    }

    // Parse provenance (required)
    const provenance = body.provenance as Record<string, unknown> | undefined;
    if (!provenance || !provenance.source) {
      return ValidationErrors.missingField('provenance.source');
    }

    const source = provenance.source as Record<string, unknown>;
    if (!source.type) {
      return ValidationErrors.missingField('provenance.source.type');
    }

    // Build note input
    const noteInput = {
      content: content.trim(),
      type,
      scope,
      userId,
      privacyClass: (body.privacy_class || body.privacyClass || 'internal') as PrivacyClass,
      workspaceId: body.workspace_id as string | undefined,
      orgId: body.org_id as string | undefined,
      sessionId: body.session_id as string | undefined,
      agentId: body.agent_id as string | undefined,
      embedding: body.embedding as number[] | undefined,
      embeddingModel: body.embedding_model as string | undefined,
      importanceBoost: body.importance_boost as number | undefined,
      provenance: {
        source: {
          type: source.type as string,
          sourceId: source.source_id as string | undefined,
          sourceUrl: source.source_url as string | undefined,
          extractedAt: source.extracted_at ? new Date(source.extracted_at as string) : new Date(),
          extractionMethod: source.extraction_method as string | undefined,
          extractionConfidence: source.extraction_confidence as number | undefined,
          rawContent: source.raw_content as string | undefined,
        },
        corroboratingSources: provenance.corroborating_sources as Array<{
          type: string;
          sourceId?: string;
          sourceUrl?: string;
          extractedAt: Date;
        }> | undefined,
        createdBy: (provenance.created_by as string) || userId,
        modelVersion: provenance.model_version as string | undefined,
        transformations: provenance.transformations as string[] | undefined,
      },
      entityMentions: body.entity_mentions as Array<{
        entityId: string;
        mentionText: string;
        position?: { start: number; end: number };
        confidence?: number;
        role?: string;
      }> | undefined,
      tags: body.tags as string[] | undefined,
      metadata: body.metadata as Record<string, unknown> | undefined,
      expiresAt: body.expires_at ? new Date(body.expires_at as string) : undefined,
    };

    // Determine if auto-approve
    const autoApprove = body.auto_approve !== false;

    // Create note
    const supabase = createServerClient();
    const service = createMemoryV3Service(supabase);

    let result: MemoryNote | MemoryCandidate;
    if (autoApprove) {
      result = await service.createNote(noteInput);
    } else {
      result = await service.createCandidate(noteInput, noteInput.provenance.source);
    }

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/spring/memory', method: 'POST', startTime },
      201,
      { embedding: content.length }
    );

    // Build response
    const isCandidate = 'candidateReason' in result;
    const candidate = isCandidate ? result as MemoryCandidate : null;
    const response = NextResponse.json(
      {
        success: true,
        note: candidate ? candidate.note : result,
        isCandidate,
        candidate: candidate ? {
          reason: candidate.candidateReason,
          extractionConfidence: candidate.extractionConfidence,
          similarNotes: candidate.similarNotes,
          suggestedActions: candidate.suggestedActions,
          autoActionAt: candidate.autoActionAt?.toISOString(),
          autoAction: candidate.autoAction,
        } : undefined,
      },
      { status: 201 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Memory V3 POST error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return NotFoundErrors.resource('Note', message);
    }
    return ServerErrors.internal('create_note');
  }
}
