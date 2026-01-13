import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  scanCollection,
  saveHealthRecord,
  scheduleHealingJob,
  IssueType,
} from '@/lib/self-healing';

/**
 * POST /api/healing/scan - Trigger an index scan
 *
 * Body:
 * - collectionId: UUID of the collection
 * - options:
 *   - issueTypes: IssueType[] (optional) - Types of issues to scan for
 *   - limit: number (optional) - Max chunks to scan
 *   - async: boolean (optional) - Run scan as a background job
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

    if (!collectionId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/scan', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: 'collectionId is required' },
        { status: 400 }
      );
    }

    const options = body?.options ?? {};
    const runAsync = options.async === true;

    // If async, create a job and return immediately
    if (runAsync) {
      const job = await scheduleHealingJob(collectionId, userId, 'full_scan', {
        targetIssues: options.issueTypes as IssueType[],
        triggeredBy: 'manual',
      });

      await logRequest(
        { userId, keyId, endpoint: '/api/healing/scan', method: 'POST', startTime },
        202
      );

      return NextResponse.json(
        {
          success: true,
          async: true,
          jobId: job.id,
          message: 'Scan job scheduled. Use GET /api/healing/jobs/:id to check status.',
        },
        { status: 202 }
      );
    }

    // Otherwise, run scan synchronously
    const scanResult = await scanCollection(collectionId, userId, {
      issueTypes: options.issueTypes as IssueType[],
      limit: options.limit,
      staleThresholdDays: options.staleThresholdDays,
    });

    // Save health record
    const health = await saveHealthRecord(collectionId, userId, scanResult);

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/scan', method: 'POST', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      result: {
        healthScore: scanResult.healthScore,
        freshnessScore: scanResult.freshnessScore,
        consistencyScore: scanResult.consistencyScore,
        duration: scanResult.duration,
        metrics: scanResult.metrics,
        issues: scanResult.issues.map(issue => ({
          type: issue.type,
          severity: issue.severity,
          chunkCount: issue.chunkIds.length,
          details: issue.details,
          suggestedAction: issue.suggestedAction,
        })),
        recommendations: scanResult.recommendations,
      },
      health,
    });
  } catch (err) {
    console.error('Healing scan POST error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
