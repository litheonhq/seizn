/**
 * POST /api/winter/rtbf/request
 *
 * Create a new RTBF (Right to Be Forgotten) erasure request.
 * GDPR Article 17 compliant data deletion.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  createRTBFRequest,
  analyzeImpact,
  ErasureScope,
  ErasureScopeParams,
} from '@/lib/winter/rtbf';

interface RequestBody {
  scope: ErasureScope;
  scope_params?: ErasureScopeParams;
  reason: string;
  legal_basis?: string;
  retain_audit_log?: boolean;
  include_analysis?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    // Parse body
    const body: RequestBody = await request.json();

    // Validate required fields
    if (!body.scope) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'scope is required' } },
        { status: 400 }
      );
    }

    if (!body.reason) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'reason is required' } },
        { status: 400 }
      );
    }

    // Validate scope
    const validScopes: ErasureScope[] = ['user', 'memory', 'namespace', 'date_range'];
    if (!validScopes.includes(body.scope)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_SCOPE',
            message: `Invalid scope. Must be one of: ${validScopes.join(', ')}`,
          },
        },
        { status: 400 }
      );
    }

    // Build scope params
    const scopeParams: ErasureScopeParams = body.scope_params || {};

    // For user scope, default to the requesting user
    if (body.scope === 'user' && !scopeParams.user_id) {
      scopeParams.user_id = userId;
    }

    // For namespace scope, require namespace and default user_id
    if (body.scope === 'namespace') {
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
    if (body.scope === 'memory' && (!scopeParams.memory_ids || scopeParams.memory_ids.length === 0)) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'memory_ids is required for memory scope' } },
        { status: 400 }
      );
    }

    // For date_range scope, require date_from and date_to
    if (body.scope === 'date_range') {
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

    // Create RTBF request
    const rtbfRequest = await createRTBFRequest({
      requesterId: userId,
      subjectId: scopeParams.user_id || scopeParams.user_id_for_namespace || scopeParams.user_id_for_date_range || userId,
      scope: body.scope,
      scopeParams,
      reason: body.reason,
      legalBasis: body.legal_basis,
      retainAuditLog: body.retain_audit_log ?? true,
    });

    // Optionally include impact analysis
    let impactAnalysis = null;
    if (body.include_analysis) {
      impactAnalysis = await analyzeImpact(rtbfRequest);
    }

    return NextResponse.json(
      {
        success: true,
        request_id: rtbfRequest.id,
        status: rtbfRequest.status,
        phase: rtbfRequest.phase,
        requested_at: rtbfRequest.requested_at,
        impact_analysis: impactAnalysis,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('RTBF request error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create RTBF request' } },
      { status: 500 }
    );
  }
}
