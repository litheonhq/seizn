/**
 * Jobs API
 *
 * GET /api/spring/jobs - List jobs
 * POST /api/spring/jobs - Create a job
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
import type { JobType, JobStatus } from '@/lib/spring/memory-v4/types';

// =============================================================================
// GET - List Jobs
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
    const status = searchParams.get('status') as JobStatus | null;
    const jobType = searchParams.get('job_type') as JobType | null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = createServerClient();
    const service = createJobService(supabase);
    const jobs = await service.listJobs(userId, {
      status: status || undefined,
      jobType: jobType || undefined,
      limit,
      offset,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/jobs', method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      jobs: jobs.map((j) => ({
        id: j.id,
        jobType: j.jobType,
        status: j.status,
        totalItems: j.totalItems,
        processedItems: j.processedItems,
        failedItems: j.failedItems,
        errorMessage: j.errorMessage,
        retryCount: j.retryCount,
        createdAt: j.createdAt.toISOString(),
        startedAt: j.startedAt?.toISOString(),
        completedAt: j.completedAt?.toISOString(),
        expiresAt: j.expiresAt?.toISOString(),
      })),
      total: jobs.length,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('List jobs error:', error);
    return ServerErrors.internal('list_jobs');
  }
}

// =============================================================================
// POST - Create Job
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

    // Validate job type
    if (!body.jobType || typeof body.jobType !== 'string') {
      return ValidationErrors.missingField('jobType');
    }

    const validJobTypes = ['ingest', 'ingest_multimodal', 'consolidate', 'distill', 'export', 'bulk_update', 'bulk_delete'];
    if (!validJobTypes.includes(body.jobType)) {
      return ValidationErrors.invalidValue('jobType', body.jobType, validJobTypes.join(', '));
    }

    const supabase = createServerClient();
    const service = createJobService(supabase);

    let job;
    const jobType = body.jobType as JobType;

    switch (jobType) {
      case 'ingest':
        if (!Array.isArray(body.memories)) {
          return ValidationErrors.missingField('memories');
        }
        job = await service.createIngestionJob(userId, body.memories as Array<{
          content: string;
          type?: string;
          tags?: string[];
        }>);
        break;

      case 'bulk_update':
        if (!Array.isArray(body.updates)) {
          return ValidationErrors.missingField('updates');
        }
        job = await service.createBulkUpdateJob(userId, body.updates as Array<{
          noteId: string;
          content?: string;
          type?: string;
          tags?: string[];
        }>);
        break;

      case 'bulk_delete':
        if (!body.filters || typeof body.filters !== 'object') {
          return ValidationErrors.missingField('filters');
        }
        job = await service.createBulkDeleteJob(userId, body.filters as Record<string, unknown>);
        break;

      case 'export':
        const exportResult = await service.createExportJob(userId, {
          filters: body.filters as Record<string, unknown>,
          templateId: body.templateId as string | undefined,
          format: body.format as 'json' | 'jsonl' | 'csv' | 'markdown' | undefined,
          includeMetadata: body.includeMetadata as boolean | undefined,
          includeProvenance: body.includeProvenance as boolean | undefined,
          includeMindmap: body.includeMindmap as boolean | undefined,
          signExport: body.signExport as boolean | undefined,
        });

        await logRequest(
          { userId, keyId, endpoint: '/api/spring/jobs', method: 'POST', startTime },
          201
        );

        return NextResponse.json(
          {
            success: true,
            jobId: exportResult.jobId,
            status: exportResult.status,
            expiresAt: exportResult.expiresAt?.toISOString(),
          },
          { status: 201 }
        );

      default:
        job = await service.createJob(userId, {
          jobType,
          inputData: body.inputData as Record<string, unknown> || {},
          totalItems: body.totalItems as number | undefined,
        });
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/jobs', method: 'POST', startTime },
      201
    );

    const response = NextResponse.json(
      {
        success: true,
        job: {
          id: job.id,
          jobType: job.jobType,
          status: job.status,
          totalItems: job.totalItems,
          createdAt: job.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Create job error:', error);
    return ServerErrors.internal('create_job');
  }
}
