/**
 * POST /api/winter/rtbf/[requestId]/execute
 *
 * Execute an RTBF erasure request.
 * This performs the actual data deletion.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  getRTBFRequest,
  executeErasure,
  verifyErasure,
  generateDeletionCertificate,
} from '@/lib/winter/rtbf';

interface RouteParams {
  params: Promise<{ requestId: string }>;
}

interface RequestBody {
  skip_backup?: boolean;
  dry_run?: boolean;
  include_certificate?: boolean;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { requestId } = await params;

    // Parse body
    let body: RequestBody = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional
    }

    // Get request
    const rtbfRequest = await getRTBFRequest(requestId);

    if (!rtbfRequest) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'RTBF request not found' } },
        { status: 404 }
      );
    }

    // Check authorization (only requester can execute)
    if (rtbfRequest.requester_id !== userId) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Not authorized to execute this request' } },
        { status: 403 }
      );
    }

    // Check status
    if (rtbfRequest.status !== 'pending') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_STATE',
            message: `Cannot execute request in status: ${rtbfRequest.status}`,
          },
        },
        { status: 400 }
      );
    }

    // Execute erasure
    const result = await executeErasure({
      requestId,
      skipBackup: body.skip_backup,
      dryRun: body.dry_run,
    });

    // If successful and not dry run, verify and optionally generate certificate
    let verification = null;
    let certificate = null;

    if (result.success && !body.dry_run) {
      verification = await verifyErasure(requestId);

      if (body.include_certificate && verification.verified) {
        try {
          certificate = await generateDeletionCertificate(requestId);
        } catch {
          // Certificate generation is optional
        }
      }
    }

    return NextResponse.json({
      success: result.success,
      request_id: requestId,
      phase: result.phase,
      dry_run: body.dry_run ?? false,
      deleted_records: result.deleted_records,
      total_deleted: result.total_deleted,
      duration_ms: result.duration_ms,
      verification: verification
        ? {
            verified: verification.verified,
            checks_passed: verification.checks.filter((c) => c.passed).length,
            checks_total: verification.checks.length,
            verification_hash: verification.verification_hash,
          }
        : null,
      certificate: certificate
        ? {
            certificate_id: certificate.certificate_id,
            issued_at: certificate.issued_at,
            signature: certificate.signature,
          }
        : null,
      error: result.error,
    });
  } catch (err) {
    console.error('RTBF execute error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to execute RTBF request' } },
      { status: 500 }
    );
  }
}
