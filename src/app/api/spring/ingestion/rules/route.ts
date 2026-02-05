/**
 * Ingestion Rules API
 *
 * GET /api/spring/ingestion/rules - List ingestion rules
 * POST /api/spring/ingestion/rules - Create ingestion rule
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
import { createIngestionService } from '@/lib/spring/memory-v4/ingestion-service';
import type { IngestionRuleInput, IngestionAction } from '@/lib/spring/memory-v4/types';

// =============================================================================
// GET - List Ingestion Rules
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
    const workspaceId = searchParams.get('workspace_id') || undefined;
    const enabledOnly = searchParams.get('enabled_only') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = createServerClient();
    const service = createIngestionService(supabase);
    const rules = await service.listRules(userId, {
      workspaceId,
      enabledOnly,
      limit,
      offset,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/ingestion/rules', method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        priority: r.priority,
        enabled: r.enabled,
        workspaceId: r.workspaceId,
        namespace: r.namespace,
        agentId: r.agentId,
        noteTypes: r.noteTypes,
        categories: r.categories,
        tagPatterns: r.tagPatterns,
        contentPatterns: r.contentPatterns,
        confidenceThreshold: r.confidenceThreshold,
        action: r.action,
        redactReplacement: r.redactReplacement,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      total: rules.length,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('List ingestion rules error:', error);
    return ServerErrors.internal('list_ingestion_rules');
  }
}

// =============================================================================
// POST - Create Ingestion Rule
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
    if (!body.name || typeof body.name !== 'string') {
      return ValidationErrors.missingField('name');
    }

    if (!body.action || typeof body.action !== 'string') {
      return ValidationErrors.missingField('action');
    }

    const validActions = ['store', 'redact', 'deny', 'store_as_candidate'];
    if (!validActions.includes(body.action as string)) {
      return ValidationErrors.invalidValue('action', body.action, validActions.join(', '));
    }

    // Build input
    const input: IngestionRuleInput = {
      name: body.name as string,
      action: body.action as IngestionAction,
    };

    if (body.description) input.description = body.description as string;
    if (body.priority !== undefined) input.priority = Number(body.priority);
    if (body.enabled !== undefined) input.enabled = Boolean(body.enabled);
    if (body.workspaceId) input.workspaceId = body.workspaceId as string;
    if (body.namespace) input.namespace = body.namespace as string;
    if (body.agentId) input.agentId = body.agentId as string;
    if (body.noteTypes) input.noteTypes = body.noteTypes as string[];
    if (body.categories) input.categories = body.categories as string[];
    if (body.tagPatterns) input.tagPatterns = body.tagPatterns as string[];
    if (body.contentPatterns) input.contentPatterns = body.contentPatterns as string[];
    if (body.confidenceThreshold !== undefined) {
      input.confidenceThreshold = Number(body.confidenceThreshold);
    }
    if (body.redactReplacement) input.redactReplacement = body.redactReplacement as string;
    if (body.metadata) input.metadata = body.metadata as Record<string, unknown>;

    const supabase = createServerClient();
    const service = createIngestionService(supabase);
    const rule = await service.createRule(userId, input);

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/ingestion/rules', method: 'POST', startTime },
      201
    );

    const response = NextResponse.json(
      {
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
      },
      { status: 201 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Create ingestion rule error:', error);
    return ServerErrors.internal('create_ingestion_rule');
  }
}
