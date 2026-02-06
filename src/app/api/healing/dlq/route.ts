import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { parsePagination } from '@/lib/parse-params';
import {
  listDLQEntries,
  getDLQEntry,
  getDLQStats,
  getDLQExtendedStats,
  retryDLQEntry,
  resolveDLQEntry,
  acknowledgeDLQAlert,
  bulkDLQAction,
  cleanupOldDLQEntries,
  DLQStatus,
  FailureCode,
  IssueType,
} from '@/lib/self-healing/dlq';

/**
 * GET /api/healing/dlq - List DLQ entries or get statistics
 *
 * Query params:
 * - dlqId: UUID (optional) - Get specific entry
 * - collectionId: UUID (optional) - Filter by collection
 * - status: DLQStatus or comma-separated (optional)
 * - failureCode: FailureCode or comma-separated (optional)
 * - limit: number (default: 20)
 * - offset: number (default: 0)
 * - stats: boolean (optional) - Include statistics
 * - extendedStats: boolean (optional) - Get extended statistics only
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

    const dlqId = searchParams.get('dlqId');
    const collectionId = searchParams.get('collectionId') ?? undefined;
    const statusParam = searchParams.get('status');
    const failureCodeParam = searchParams.get('failureCode');
    const { limit, offset } = parsePagination(searchParams);
    const includeStats = searchParams.get('stats') === 'true';
    const extendedStatsOnly = searchParams.get('extendedStats') === 'true';

    // If requesting extended stats only
    if (extendedStatsOnly) {
      const extendedStats = await getDLQExtendedStats(userId);

      await logRequest(
        { userId, keyId, endpoint: '/api/healing/dlq', method: 'GET', startTime },
        200
      );

      return NextResponse.json({
        success: true,
        ...extendedStats,
      });
    }

    // If requesting specific entry
    if (dlqId) {
      const entry = await getDLQEntry(dlqId);

      if (!entry || entry.userId !== userId) {
        await logRequest(
          { userId, keyId, endpoint: '/api/healing/dlq', method: 'GET', startTime },
          404
        );
        return NextResponse.json(
          { error: 'DLQ entry not found' },
          { status: 404 }
        );
      }

      await logRequest(
        { userId, keyId, endpoint: '/api/healing/dlq', method: 'GET', startTime },
        200
      );

      return NextResponse.json({
        success: true,
        entry,
      });
    }

    // Parse filters
    let status: DLQStatus | DLQStatus[] | undefined;
    if (statusParam) {
      if (statusParam.includes(',')) {
        status = statusParam.split(',') as DLQStatus[];
      } else {
        status = statusParam as DLQStatus;
      }
    }

    let failureCode: FailureCode | FailureCode[] | undefined;
    if (failureCodeParam) {
      if (failureCodeParam.includes(',')) {
        failureCode = failureCodeParam.split(',') as FailureCode[];
      } else {
        failureCode = failureCodeParam as FailureCode;
      }
    }

    // List entries
    const { entries, total } = await listDLQEntries(userId, {
      collectionId,
      status,
      failureCode,
      limit,
      offset,
    });

    // Get stats if requested
    let stats;
    if (includeStats) {
      stats = await getDLQStats(userId);
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/dlq', method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      entries,
      total,
      limit,
      offset,
      ...(stats && { stats }),
    });
  } catch (err) {
    console.error('DLQ GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/healing/dlq - Retry a DLQ entry or perform bulk actions
 *
 * Body:
 * - dlqId: UUID (for single retry)
 * - dlqIds: UUID[] (for bulk actions)
 * - action: 'retry' | 'resolve' | 'archive' | 'discard' | 'acknowledge'
 * - resolutionNotes: string (optional)
 * - modifyJob: { priority?: number, targetIssues?: IssueType[] } (optional, for retry)
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

    const dlqId = body?.dlqId;
    const dlqIds = body?.dlqIds as string[] | undefined;
    const action = body?.action ?? 'retry';
    const resolutionNotes = body?.resolutionNotes;
    const modifyJob = body?.modifyJob;

    // Validate action
    const validActions = ['retry', 'resolve', 'archive', 'discard', 'acknowledge'];
    if (!validActions.includes(action)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/dlq', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: `action must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      );
    }

    // Bulk action
    if (dlqIds && dlqIds.length > 0) {
      const result = await bulkDLQAction(
        dlqIds,
        userId,
        action as 'retry' | 'resolve' | 'archive' | 'discard' | 'acknowledge',
        resolutionNotes
      );

      await logRequest(
        { userId, keyId, endpoint: '/api/healing/dlq', method: 'POST', startTime },
        200
      );

      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    // Single action
    if (!dlqId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/dlq', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: 'dlqId or dlqIds is required' },
        { status: 400 }
      );
    }

    // Verify entry belongs to user
    const entry = await getDLQEntry(dlqId);
    if (!entry || entry.userId !== userId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/dlq', method: 'POST', startTime },
        404
      );
      return NextResponse.json(
        { error: 'DLQ entry not found' },
        { status: 404 }
      );
    }

    let result;

    switch (action) {
      case 'retry':
        result = await retryDLQEntry(dlqId, userId, { modifyJob });
        await logRequest(
          { userId, keyId, endpoint: '/api/healing/dlq', method: 'POST', startTime },
          201
        );
        return NextResponse.json({
          success: true,
          newJobId: result.newJobId,
          dlqEntry: result.dlqEntry,
        }, { status: 201 });

      case 'resolve':
        result = await resolveDLQEntry(dlqId, userId, 'resolved', resolutionNotes);
        break;

      case 'archive':
        result = await resolveDLQEntry(dlqId, userId, 'archived', resolutionNotes);
        break;

      case 'discard':
        result = await resolveDLQEntry(dlqId, userId, 'discarded', resolutionNotes);
        break;

      case 'acknowledge':
        await acknowledgeDLQAlert(dlqId, userId);
        result = await getDLQEntry(dlqId);
        break;
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/dlq', method: 'POST', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      entry: result,
    });
  } catch (err) {
    console.error('DLQ POST error:', err);

    if (err instanceof Error) {
      if (err.message.includes('exceeded max retries')) {
        return NextResponse.json(
          { error: err.message },
          { status: 400 }
        );
      }
      if (err.message.includes('not found') || err.message.includes('not retryable')) {
        return NextResponse.json(
          { error: err.message },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/healing/dlq - Cleanup old DLQ entries
 *
 * Query params:
 * - retentionDays: number (default: 30)
 * - statuses: comma-separated DLQStatus (default: resolved,archived,discarded)
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

    const retentionDays = parseInt(searchParams.get('retentionDays') ?? '30');
    const statusesParam = searchParams.get('statuses');

    let statuses: DLQStatus[] | undefined;
    if (statusesParam) {
      statuses = statusesParam.split(',') as DLQStatus[];
    }

    const result = await cleanupOldDLQEntries(userId, {
      retentionDays,
      statuses,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/dlq', method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      retentionDays,
    });
  } catch (err) {
    console.error('DLQ DELETE error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
