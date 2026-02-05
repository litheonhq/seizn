/**
 * Memory Usage API
 *
 * GET /api/spring/memory/[noteId]/usage - Get usage history for a note
 * POST /api/spring/memory/[noteId]/usage - Record a usage event
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
import { createMemoryUsageService } from '@/lib/spring/memory-v4/usage-service';
import type { UsageType } from '@/lib/spring/memory-v4/types';

interface RouteParams {
  params: Promise<{ noteId: string }>;
}

// =============================================================================
// GET - Get Usage History
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { noteId } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Verify note ownership
    const supabase = createServerClient();
    const { data: note, error: noteError } = await supabase
      .from('spring_memory_notes')
      .select('user_id')
      .eq('id', noteId)
      .single();

    if (noteError || !note) {
      return NotFoundErrors.resource('Note', noteId);
    }

    if (note.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const usageType = searchParams.get('usage_type') as UsageType | null;

    const service = createMemoryUsageService(supabase);

    // Get usage history
    const history = await service.getNoteUsageHistory(noteId, {
      limit,
      offset,
      usageType: usageType || undefined,
    });

    // Get stats
    const stats = await service.getNoteUsageStats(noteId);

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/memory/${noteId}/usage`, method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      usage: history.map((u) => ({
        id: u.id,
        usageType: u.usageType,
        traceId: u.traceId,
        spanId: u.spanId,
        sessionId: u.sessionId,
        agentId: u.agentId,
        relevanceScore: u.relevanceScore,
        outcome: u.outcome,
        feedback: u.feedback,
        feedbackReason: u.feedbackReason,
        queryText: u.queryText,
        responseSnippet: u.responseSnippet,
        createdAt: u.createdAt.toISOString(),
      })),
      stats: {
        totalUsages: stats.totalUsages,
        recallCount: stats.recallCount,
        citedCount: stats.citedCount,
        successRate: stats.successRate,
        positiveRate: stats.positiveRate,
        negativeRate: stats.negativeRate,
        lastUsedAt: stats.lastUsedAt?.toISOString(),
        avgRelevanceScore: stats.avgRelevanceScore,
      },
      total: history.length,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Get usage history error:', error);
    return ServerErrors.internal('get_usage_history');
  }
}

// =============================================================================
// POST - Record Usage
// =============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { noteId } = await params;

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

    // Validate usage type
    if (!body.usageType || typeof body.usageType !== 'string') {
      return ValidationErrors.missingField('usageType');
    }

    const validUsageTypes = ['recalled', 'cited', 'influenced', 'rejected'];
    if (!validUsageTypes.includes(body.usageType)) {
      return ValidationErrors.invalidValue('usageType', body.usageType, validUsageTypes.join(', '));
    }

    const supabase = createServerClient();
    const service = createMemoryUsageService(supabase);

    const usage = await service.recordUsage({
      noteId,
      usageType: body.usageType as UsageType,
      traceId: body.traceId as string | undefined,
      spanId: body.spanId as string | undefined,
      sessionId: body.sessionId as string | undefined,
      agentId: body.agentId as string | undefined,
      relevanceScore: body.relevanceScore ? Number(body.relevanceScore) : undefined,
      queryText: body.queryText as string | undefined,
      responseSnippet: body.responseSnippet as string | undefined,
    });

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/memory/${noteId}/usage`, method: 'POST', startTime },
      201
    );

    const response = NextResponse.json(
      {
        success: true,
        usage: {
          id: usage.id,
          noteId: usage.noteId,
          usageType: usage.usageType,
          traceId: usage.traceId,
          createdAt: usage.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Record usage error:', error);
    return ServerErrors.internal('record_usage');
  }
}
