/**
 * GET /api/winter/rtbf/[requestId]
 *
 * Get status of an RTBF erasure request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { getRTBFRequest, getAuditLog } from '@/lib/winter/rtbf';

interface RouteParams {
  params: Promise<{ requestId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { requestId } = await params;

    // Get request
    const rtbfRequest = await getRTBFRequest(requestId);

    if (!rtbfRequest) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'RTBF request not found' } },
        { status: 404 }
      );
    }

    // Check authorization (only requester or subject can view)
    if (rtbfRequest.requester_id !== userId && rtbfRequest.subject_id !== userId) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Not authorized to view this request' } },
        { status: 403 }
      );
    }

    // Get audit log for additional details
    const auditLog = await getAuditLog(requestId);

    // Calculate progress
    const phaseProgress: Record<string, number> = {
      requested: 10,
      analyzing: 20,
      backing_up: 30,
      soft_delete: 50,
      hard_delete: 70,
      verifying: 90,
      completed: 100,
      failed: 100,
    };

    const progressPercent = phaseProgress[rtbfRequest.phase] || 0;

    return NextResponse.json({
      request_id: rtbfRequest.id,
      requester_id: rtbfRequest.requester_id,
      subject_id: rtbfRequest.subject_id,
      scope: rtbfRequest.scope,
      scope_params: rtbfRequest.scope_params,
      reason: rtbfRequest.reason,
      legal_basis: rtbfRequest.legal_basis,
      status: rtbfRequest.status,
      phase: rtbfRequest.phase,
      progress_percent: progressPercent,
      requested_at: rtbfRequest.requested_at,
      processed_at: rtbfRequest.processed_at,
      completed_at: rtbfRequest.completed_at,
      audit: auditLog
        ? {
            affected_tables: auditLog.affected_tables,
            affected_count: auditLog.affected_count,
            verification_hash: auditLog.verification_hash,
          }
        : null,
    });
  } catch (err) {
    console.error('RTBF status error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to get RTBF status' } },
      { status: 500 }
    );
  }
}
