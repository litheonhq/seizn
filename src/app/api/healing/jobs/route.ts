import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  scheduleHealingJob,
  listJobs,
  getJobStatus,
  cancelJob,
  executeJob,
  HealingJobType,
  IssueType,
  JobStatus,
} from '@/lib/self-healing';

/**
 * GET /api/healing/jobs - List healing jobs
 *
 * Query params:
 * - collectionId: UUID (optional)
 * - status: JobStatus or comma-separated statuses (optional)
 * - limit: number (default: 20)
 * - offset: number (default: 0)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const collectionId = searchParams.get('collectionId') ?? undefined;
    const statusParam = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') ?? '20');
    const offset = parseInt(searchParams.get('offset') ?? '0');

    // Parse status filter
    let status: JobStatus | JobStatus[] | undefined;
    if (statusParam) {
      if (statusParam.includes(',')) {
        status = statusParam.split(',') as JobStatus[];
      } else {
        status = statusParam as JobStatus;
      }
    }

    const { jobs, total } = await listJobs(userId, {
      collectionId,
      status,
      limit,
      offset,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/jobs', method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      jobs,
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error('Healing jobs GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/healing/jobs - Create a new healing job
 *
 * Body:
 * - collectionId: UUID of the collection
 * - jobType: 'full_scan' | 'incremental' | 'targeted' | 'emergency'
 * - targetIssues: IssueType[] (optional)
 * - priority: number 1-10 (optional, default: 5)
 * - scheduledAt: ISO timestamp (optional) - Schedule for later
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    const collectionId = body?.collectionId;
    const jobType = body?.jobType as HealingJobType;

    if (!collectionId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/jobs', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: 'collectionId is required' },
        { status: 400 }
      );
    }

    const validJobTypes: HealingJobType[] = ['full_scan', 'incremental', 'targeted', 'emergency'];
    if (!jobType || !validJobTypes.includes(jobType)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/jobs', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: `jobType must be one of: ${validJobTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const job = await scheduleHealingJob(collectionId, userId, jobType, {
      targetIssues: body.targetIssues as IssueType[],
      priority: body.priority,
      scheduledAt: body.scheduledAt,
      triggeredBy: 'manual',
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/jobs', method: 'POST', startTime },
      201
    );

    return NextResponse.json(
      {
        success: true,
        job,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Healing jobs POST error:', err);

    if (err instanceof Error && err.message.includes('limit reached')) {
      return NextResponse.json(
        { error: err.message },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/healing/jobs - Cancel a job
 *
 * Query params:
 * - jobId: UUID of the job to cancel
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const jobId = searchParams.get('jobId');

    if (!jobId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/jobs', method: 'DELETE', startTime },
        400
      );
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      );
    }

    // Verify job belongs to user
    const job = await getJobStatus(jobId);
    if (!job || job.userId !== userId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/jobs', method: 'DELETE', startTime },
        404
      );
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    await cancelJob(jobId);

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/jobs', method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      message: 'Job cancelled',
    });
  } catch (err) {
    console.error('Healing jobs DELETE error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/healing/jobs - Execute or control a job
 *
 * Body:
 * - jobId: UUID of the job
 * - action: 'execute' | 'pause' | 'resume'
 */
export async function PATCH(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    const jobId = body?.jobId;
    const action = body?.action;

    if (!jobId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/jobs', method: 'PATCH', startTime },
        400
      );
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      );
    }

    if (!action || !['execute', 'pause', 'resume'].includes(action)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/jobs', method: 'PATCH', startTime },
        400
      );
      return NextResponse.json(
        { error: 'action must be one of: execute, pause, resume' },
        { status: 400 }
      );
    }

    // Verify job belongs to user
    const job = await getJobStatus(jobId);
    if (!job || job.userId !== userId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/jobs', method: 'PATCH', startTime },
        404
      );
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    let updatedJob = job;

    switch (action) {
      case 'execute':
        // Execute job synchronously (for small jobs)
        // For production, you would want to use a queue
        updatedJob = await executeJob(jobId);
        break;

      case 'pause':
        // Pause is handled in scheduler
        const { pauseJob } = await import('@/lib/self-healing');
        await pauseJob(jobId);
        updatedJob = await getJobStatus(jobId) ?? job;
        break;

      case 'resume':
        const { resumeJob } = await import('@/lib/self-healing');
        await resumeJob(jobId);
        updatedJob = await getJobStatus(jobId) ?? job;
        break;
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/jobs', method: 'PATCH', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      job: updatedJob,
    });
  } catch (err) {
    console.error('Healing jobs PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
