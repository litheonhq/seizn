import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { runTtlCleanup, previewCleanup } from '@/lib/winter/ttl';
import { logServerError } from '@/lib/server/logger';

/**
 * POST /api/winter/cleanup
 *
 * Manually trigger TTL cleanup job for the authenticated user.
 *
 * Body (optional):
 * {
 *   "dry_run"?: boolean,        // Preview without deleting (default: false)
 *   "ttl_days"?: number,        // Override memory TTL (default: policy or 30)
 *   "trace_retention_days"?: number,  // Override trace retention (default: 14)
 *   "batch_size"?: number       // Max records per run (default: 1000)
 * }
 *
 * Response:
 * {
 *   "success": boolean,
 *   "dry_run": boolean,
 *   "deleted": {
 *     "memories": number,
 *     "traces": number,
 *     "documents": number,
 *     "chunks": number
 *   },
 *   "execution_time_ms": number,
 *   "errors"?: string[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    // Parse request body
    let body: {
      dry_run?: boolean;
      ttl_days?: number;
      trace_retention_days?: number;
      batch_size?: number;
    } = {};

    try {
      body = await request.json();
    } catch {
      // Empty body is fine - use defaults
    }

    const dryRun = body.dry_run ?? false;
    const ttlDays = body.ttl_days;
    const traceRetentionDays = body.trace_retention_days;
    const batchSize = body.batch_size ?? 1000;

    // Validate parameters
    if (ttlDays !== undefined && (ttlDays < 1 || ttlDays > 365)) {
      return NextResponse.json(
        { error: 'ttl_days must be between 1 and 365' },
        { status: 400 }
      );
    }

    if (traceRetentionDays !== undefined && (traceRetentionDays < 1 || traceRetentionDays > 90)) {
      return NextResponse.json(
        { error: 'trace_retention_days must be between 1 and 90' },
        { status: 400 }
      );
    }

    if (batchSize < 1 || batchSize > 10000) {
      return NextResponse.json(
        { error: 'batch_size must be between 1 and 10000' },
        { status: 400 }
      );
    }

    // Run cleanup
    const result = await runTtlCleanup({
      userId,
      ttlDays,
      traceRetentionDays,
      dryRun,
      batchSize,
    });

    return NextResponse.json({
      success: result.success,
      dry_run: result.dryRun,
      deleted: {
        memories: result.deletedMemories,
        traces: result.deletedTraces,
        documents: result.deletedDocuments,
        chunks: result.deletedChunks,
      },
      execution_time_ms: result.executionTimeMs,
      ...(result.errors.length > 0 ? { errors: result.errors } : {}),
    });
  } catch (err) {
    logServerError('Winter cleanup error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/winter/cleanup
 *
 * Preview what would be cleaned up (dry run).
 *
 * Query parameters:
 * - ttl_days: Override memory TTL
 * - trace_retention_days: Override trace retention
 *
 * Response:
 * {
 *   "preview": {
 *     "memories": [{ id, type, created_at, ttl_days }],
 *     "traces": [...],
 *     "documents": [...]
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { searchParams } = new URL(request.url);

    const ttlDays = searchParams.get('ttl_days')
      ? parseInt(searchParams.get('ttl_days')!, 10)
      : undefined;
    const traceRetentionDays = searchParams.get('trace_retention_days')
      ? parseInt(searchParams.get('trace_retention_days')!, 10)
      : undefined;

    const preview = await previewCleanup({
      userId,
      ttlDays,
      traceRetentionDays,
    });

    return NextResponse.json({
      preview: {
        memories: preview.memories,
        traces: preview.traces,
        documents: preview.documents,
      },
      counts: {
        memories: preview.memories.length,
        traces: preview.traces.length,
        documents: preview.documents.length,
      },
    });
  } catch (err) {
    logServerError('Winter cleanup preview error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
