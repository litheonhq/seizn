/**
 * Export v2 API
 *
 * POST /api/spring/export - Create export job
 * GET /api/spring/export/[jobId] - Get export result/download
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
import { createJobService } from '@/lib/spring/memory-v4/job-service';
import type { ExportFormat, SearchFiltersV3, TimeFilter } from '@/lib/spring/memory-v4/types';

// =============================================================================
// POST - Create Export Job
// =============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Parse filters
    let filters: SearchFiltersV3 | undefined;
    if (body.filters && typeof body.filters === 'object') {
      const f = body.filters as Record<string, unknown>;
      filters = {};

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
    }

    // Validate format if provided
    const format = body.format as string | undefined;
    if (format) {
      const validFormats = ['json', 'jsonl', 'csv', 'markdown'];
      if (!validFormats.includes(format)) {
        return ValidationErrors.invalidValue('format', format, validFormats.join(', '));
      }
    }

    const supabase = createServerClient();
    const service = createJobService(supabase);

    const result = await service.createExportJob(userId, {
      filters,
      templateId: body.templateId as string | undefined,
      format: format as ExportFormat | undefined,
      includeMetadata: body.includeMetadata as boolean | undefined,
      includeProvenance: body.includeProvenance as boolean | undefined,
      includeMindmap: body.includeMindmap as boolean | undefined,
      signExport: body.signExport as boolean | undefined,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/export', method: 'POST', startTime },
      202
    );

    const response = NextResponse.json(
      {
        success: true,
        jobId: result.jobId,
        status: result.status,
        expiresAt: result.expiresAt?.toISOString(),
        message: 'Export job created. Check status at /api/spring/jobs/[jobId]',
      },
      { status: 202 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Create export error:', error);
    return ServerErrors.internal('create_export');
  }
}
