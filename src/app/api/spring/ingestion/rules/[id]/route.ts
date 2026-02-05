/**
 * Ingestion Rule API - Individual
 *
 * GET /api/spring/ingestion/rules/[id] - Get single rule
 * PATCH /api/spring/ingestion/rules/[id] - Update rule
 * DELETE /api/spring/ingestion/rules/[id] - Delete rule
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
import { createIngestionService } from '@/lib/spring/memory-v4/ingestion-service';
import type { IngestionAction } from '@/lib/spring/memory-v4/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// =============================================================================
// GET - Get Single Rule
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
    const service = createIngestionService(supabase);
    const rule = await service.getRule(id);

    if (!rule) {
      return NotFoundErrors.resource('Ingestion rule', id);
    }

    // Verify ownership
    if (rule.userId !== userId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      );
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/ingestion/rules/${id}`, method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      rule: {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        priority: rule.priority,
        enabled: rule.enabled,
        workspaceId: rule.workspaceId,
        namespace: rule.namespace,
        agentId: rule.agentId,
        noteTypes: rule.noteTypes,
        categories: rule.categories,
        tagPatterns: rule.tagPatterns,
        contentPatterns: rule.contentPatterns,
        confidenceThreshold: rule.confidenceThreshold,
        action: rule.action,
        redactReplacement: rule.redactReplacement,
        metadata: rule.metadata,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      },
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Get ingestion rule error:', error);
    return ServerErrors.internal('get_ingestion_rule');
  }
}

// =============================================================================
// PATCH - Update Rule
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

    const supabase = createServerClient();
    const service = createIngestionService(supabase);

    // Check rule exists and ownership
    const existing = await service.getRule(id);
    if (!existing) {
      return NotFoundErrors.resource('Ingestion rule', id);
    }
    if (existing.userId !== userId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      );
    }

    // Build update input
    const input: Record<string, unknown> = {};

    if (body.name !== undefined) input.name = body.name;
    if (body.description !== undefined) input.description = body.description;
    if (body.priority !== undefined) input.priority = Number(body.priority);
    if (body.enabled !== undefined) input.enabled = Boolean(body.enabled);
    if (body.workspaceId !== undefined) input.workspaceId = body.workspaceId;
    if (body.namespace !== undefined) input.namespace = body.namespace;
    if (body.agentId !== undefined) input.agentId = body.agentId;
    if (body.noteTypes !== undefined) input.noteTypes = body.noteTypes;
    if (body.categories !== undefined) input.categories = body.categories;
    if (body.tagPatterns !== undefined) input.tagPatterns = body.tagPatterns;
    if (body.contentPatterns !== undefined) input.contentPatterns = body.contentPatterns;
    if (body.confidenceThreshold !== undefined) {
      input.confidenceThreshold = Number(body.confidenceThreshold);
    }
    if (body.action !== undefined) {
      const validActions = ['store', 'redact', 'deny', 'store_as_candidate'];
      if (!validActions.includes(body.action as string)) {
        return ValidationErrors.invalidValue('action', body.action, validActions.join(', '));
      }
      input.action = body.action as IngestionAction;
    }
    if (body.redactReplacement !== undefined) input.redactReplacement = body.redactReplacement;
    if (body.metadata !== undefined) input.metadata = body.metadata;

    const rule = await service.updateRule(id, input);

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/ingestion/rules/${id}`, method: 'PATCH', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      rule: {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        priority: rule.priority,
        enabled: rule.enabled,
        action: rule.action,
        confidenceThreshold: rule.confidenceThreshold,
        updatedAt: rule.updatedAt.toISOString(),
      },
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Update ingestion rule error:', error);
    return ServerErrors.internal('update_ingestion_rule');
  }
}

// =============================================================================
// DELETE - Delete Rule
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
    const service = createIngestionService(supabase);

    // Check rule exists and ownership
    const existing = await service.getRule(id);
    if (!existing) {
      return NotFoundErrors.resource('Ingestion rule', id);
    }
    if (existing.userId !== userId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      );
    }

    await service.deleteRule(id);

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/ingestion/rules/${id}`, method: 'DELETE', startTime },
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
    console.error('Delete ingestion rule error:', error);
    return ServerErrors.internal('delete_ingestion_rule');
  }
}
