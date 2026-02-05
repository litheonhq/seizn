/**
 * Jobs API - Individual
 *
 * GET /api/spring/jobs/[id] - Get job status
 * POST /api/spring/jobs/[id] - Actions (cancel, retry)
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
import { createJobService } from '@/lib/spring/memory-v4/job-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// =============================================================================
// GET - Get Job Status
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
    const service = createJobService(supabase);
    const job = await service.getJob(id);

    if (!job) {
      return NotFoundErrors.resource('Job', id);
    }

    // Verify ownership
    if (job.userId !== userId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      );
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/jobs/${id}`, method: 'GET', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      job: {
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        inputData: job.inputData,
        outputData: job.outputData,
        totalItems: job.totalItems,
        processedItems: job.processedItems,
        failedItems: job.failedItems,
        errorMessage: job.errorMessage,
        errorDetails: job.errorDetails,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        expiresAt: job.expiresAt?.toISOString(),
        // Progress percentage
        progress: job.totalItems
          ? Math.round((job.processedItems / job.totalItems) * 100)
          : null,
      },
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Get job error:', error);
    return ServerErrors.internal('get_job');
  }
}

// =============================================================================
// POST - Job Actions (cancel, retry)
// =============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
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

    // Validate action
    const action = body.action as string;
    if (!action) {
      return ValidationErrors.missingField('action');
    }

    const validActions = ['cancel', 'retry'];
    if (!validActions.includes(action)) {
      return ValidationErrors.invalidValue('action', action, validActions.join(', '));
    }

    const supabase = createServerClient();
    const service = createJobService(supabase);
    const job = await service.getJob(id);

    if (!job) {
      return NotFoundErrors.resource('Job', id);
    }

    // Verify ownership
    if (job.userId !== userId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      );
    }

    let result;

    if (action === 'cancel') {
      // Only pending or running jobs can be cancelled
      if (!['pending', 'running'].includes(job.status)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_STATE',
              message: `Cannot cancel job with status: ${job.status}`,
            },
          },
          { status: 400 }
        );
      }

      await service.cancelJob(id);
      result = { action: 'cancelled', jobId: id };
    } else if (action === 'retry') {
      // Only failed jobs can be retried
      if (job.status !== 'failed') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_STATE',
              message: 'Only failed jobs can be retried',
            },
          },
          { status: 400 }
        );
      }

      if (job.retryCount >= job.maxRetries) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'MAX_RETRIES_EXCEEDED',
              message: `Max retries (${job.maxRetries}) exceeded`,
            },
          },
          { status: 400 }
        );
      }

      const retriedJob = await service.retryJob(id);
      result = {
        action: 'retried',
        jobId: id,
        retryCount: retriedJob.retryCount,
        status: retriedJob.status,
      };
    }

    await logRequest(
      { userId, keyId, endpoint: `/api/spring/jobs/${id}`, method: 'POST', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      ...result,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Job action error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('not found')) {
      return NotFoundErrors.resource('Job', id);
    }

    return ServerErrors.internal('job_action');
  }
}
