/**
 * DELETE /api/winter/rtbf
 *
 * Simplified RTBF (Right to Be Forgotten) endpoint.
 * Creates and immediately executes an erasure request.
 * GDPR Article 17 compliant data deletion.
 *
 * This is a convenience endpoint that combines:
 * 1. Creating an RTBF request
 * 2. Executing the erasure
 * 3. Verifying completion
 * 4. Generating deletion certificate
 * 5. Sending confirmation email (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import {
  createRTBFRequest,
  executeErasure,
  verifyErasure,
  generateDeletionCertificate,
  ErasureScope,
  ErasureScopeParams,
  DeletionCertificate,
} from '@/lib/winter/rtbf';
import { sendEmail, rtbfDeletionConfirmationEmail } from '@/lib/email';

interface RequestBody {
  scope?: ErasureScope;
  scope_params?: ErasureScopeParams;
  reason?: string;
  legal_basis?: string;
  send_confirmation_email?: boolean;
  dry_run?: boolean;
}

interface RTBFResponse {
  success: boolean;
  request_id: string;
  scope: ErasureScope;
  deleted_records: Array<{
    table_name: string;
    deleted_count: number;
    soft_deleted?: number;
    hard_deleted?: number;
  }>;
  total_deleted: number;
  verification: {
    verified: boolean;
    checks_passed: number;
    checks_total: number;
    verification_hash: string;
  } | null;
  certificate: DeletionCertificate | null;
  email_sent: boolean;
  duration_ms: number;
  error?: string;
}

export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    // Parse body (optional)
    let body: RequestBody = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional, use defaults
    }

    // Default to 'user' scope if not specified
    const scope: ErasureScope = body.scope || 'user';
    const reason = body.reason || 'User requested data deletion via RTBF';
    const legalBasis = body.legal_basis || 'consent_withdrawal';
    const sendConfirmationEmail = body.send_confirmation_email ?? true;
    const dryRun = body.dry_run ?? false;

    // Build scope params
    const scopeParams: ErasureScopeParams = body.scope_params || {};

    // For user scope, default to the requesting user
    if (scope === 'user' && !scopeParams.user_id) {
      scopeParams.user_id = userId;
    }

    // For namespace scope, require namespace and default user_id
    if (scope === 'namespace') {
      if (!scopeParams.namespace) {
        return NextResponse.json(
          { error: { code: 'INVALID_REQUEST', message: 'namespace is required for namespace scope' } },
          { status: 400 }
        );
      }
      if (!scopeParams.user_id_for_namespace) {
        scopeParams.user_id_for_namespace = userId;
      }
    }

    // For memory scope, require memory_ids
    if (scope === 'memory' && (!scopeParams.memory_ids || scopeParams.memory_ids.length === 0)) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'memory_ids is required for memory scope' } },
        { status: 400 }
      );
    }

    // For date_range scope, require date_from and date_to
    if (scope === 'date_range') {
      if (!scopeParams.date_from || !scopeParams.date_to) {
        return NextResponse.json(
          { error: { code: 'INVALID_REQUEST', message: 'date_from and date_to are required for date_range scope' } },
          { status: 400 }
        );
      }
      if (!scopeParams.user_id_for_date_range) {
        scopeParams.user_id_for_date_range = userId;
      }
    }

    // Validate authorization - users can only delete their own data
    const targetUserId = scopeParams.user_id || scopeParams.user_id_for_namespace || scopeParams.user_id_for_date_range;
    if (targetUserId && targetUserId !== userId) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You can only delete your own data' } },
        { status: 403 }
      );
    }

    // Step 1: Create RTBF request
    const rtbfRequest = await createRTBFRequest({
      requesterId: userId,
      subjectId: targetUserId || userId,
      scope,
      scopeParams,
      reason,
      legalBasis,
      retainAuditLog: true,
    });

    // Step 2: Execute erasure
    const result = await executeErasure({
      requestId: rtbfRequest.id,
      skipBackup: false,
      dryRun,
    });

    // Step 3: Verify and generate certificate
    let verification = null;
    let certificate: DeletionCertificate | null = null;

    if (result.success && !dryRun) {
      verification = await verifyErasure(rtbfRequest.id);

      if (verification.verified) {
        try {
          certificate = await generateDeletionCertificate(rtbfRequest.id);
        } catch (certError) {
          console.error('Certificate generation failed:', certError);
        }
      }
    }

    // Step 4: Send confirmation email (optional)
    let emailSent = false;
    if (sendConfirmationEmail && result.success && !dryRun) {
      try {
        // Get user email from profiles
        const supabase = createServerClient();
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, name')
          .eq('id', userId)
          .single();

        if (profile?.email) {
          const emailHtml = rtbfDeletionConfirmationEmail({
            name: profile.name || 'User',
            requestId: rtbfRequest.id,
            scope,
            deletedCount: result.total_deleted,
            certificateId: certificate?.certificate_id,
            verificationHash: verification?.verification_hash,
            completedAt: new Date().toISOString(),
          });

          const emailResult = await sendEmail({
            to: profile.email,
            subject: 'Your Data Has Been Deleted - Seizn GDPR Compliance',
            html: emailHtml,
          });

          emailSent = emailResult.success;
        }
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }
    }

    // Build response
    const response: RTBFResponse = {
      success: result.success,
      request_id: rtbfRequest.id,
      scope,
      deleted_records: result.deleted_records,
      total_deleted: result.total_deleted,
      verification: verification
        ? {
            verified: verification.verified,
            checks_passed: verification.checks.filter((c) => c.passed).length,
            checks_total: verification.checks.length,
            verification_hash: verification.verification_hash,
          }
        : null,
      certificate,
      email_sent: emailSent,
      duration_ms: Date.now() - startTime,
    };

    if (result.error) {
      response.error = result.error;
    }

    return NextResponse.json(response, {
      status: result.success ? 200 : 500,
    });
  } catch (err) {
    console.error('RTBF DELETE error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to process RTBF deletion request',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/winter/rtbf
 *
 * List RTBF requests for the authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | null;
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Query requests
    const supabase = createServerClient();

    let query = supabase
      .from('winter_rtbf_requests')
      .select('*', { count: 'exact' })
      .eq('requester_id', userId)
      .order('requested_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, count, error } = await query;

    if (error) {
      throw new Error(`Failed to list RTBF requests: ${error.message}`);
    }

    // Calculate progress for each request
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

    const requests = (data || []).map((req) => ({
      request_id: req.id,
      scope: req.scope,
      scope_params: req.scope_params,
      reason: req.reason,
      status: req.status,
      phase: req.phase,
      progress_percent: phaseProgress[req.phase] || 0,
      requested_at: req.requested_at,
      completed_at: req.completed_at,
    }));

    return NextResponse.json({
      requests,
      pagination: {
        total: count || 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error('RTBF LIST error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to list RTBF requests' } },
      { status: 500 }
    );
  }
}
