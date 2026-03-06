/**
 * RTBF Verification API
 *
 * Verify that data has been completely erased for an RTBF request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { verifyErasure, verifyWithRetry } from '@/lib/winter/rtbf/verification';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ requestId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { requestId } = await params;
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Get the request to verify access
    const { data: rtbfRequest, error: reqError } = await supabase
      .from('winter_rtbf_requests')
      .select('id, organization_id, subject_id, status, phase')
      .eq('id', requestId)
      .single();

    if (reqError || !rtbfRequest) {
      return NextResponse.json(
        { error: 'RTBF request not found' },
        { status: 404 }
      );
    }

    // Check user has access to this organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', rtbfRequest.organization_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Only verify completed requests
    if (rtbfRequest.status !== 'completed' && rtbfRequest.phase !== 'completed') {
      return NextResponse.json(
        {
          error: 'Request is not yet completed',
          status: rtbfRequest.status,
          phase: rtbfRequest.phase,
        },
        { status: 400 }
      );
    }

    // Run verification
    const result = await verifyErasure(requestId);

    return NextResponse.json({
      verification: result,
      message: result.verified
        ? 'All data has been successfully verified as deleted'
        : 'Some data records may still exist',
    });
  } catch (error) {
    logServerError('RTBF verification error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { requestId } = await params;
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Get the request to verify access
    const { data: rtbfRequest, error: reqError } = await supabase
      .from('winter_rtbf_requests')
      .select('id, organization_id, status, phase')
      .eq('id', requestId)
      .single();

    if (reqError || !rtbfRequest) {
      return NextResponse.json(
        { error: 'RTBF request not found' },
        { status: 404 }
      );
    }

    // Check user is admin
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', rtbfRequest.organization_id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const maxRetries = body.maxRetries || 3;

    // Run verification with retry
    const result = await verifyWithRetry(requestId, maxRetries);

    // Update request status based on verification
    if (result.verified) {
      await supabase
        .from('winter_rtbf_requests')
        .update({
          phase: 'verified',
          verified_at: new Date().toISOString(),
        })
        .eq('id', requestId);
    }

    return NextResponse.json({
      verification: result,
      message: result.verified
        ? 'Verification complete - all data confirmed deleted'
        : 'Verification failed - some data may remain',
    });
  } catch (error) {
    logServerError('RTBF verification retry error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
