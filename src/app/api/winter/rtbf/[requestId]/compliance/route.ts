/**
 * RTBF Compliance Verification API
 *
 * Verify GDPR compliance for a completed RTBF request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { verifyCompliance } from '@/lib/winter/rtbf/verification';
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
      .select('id, organization_id, status')
      .eq('id', requestId)
      .single();

    if (reqError || !rtbfRequest) {
      return NextResponse.json(
        { error: 'RTBF request not found' },
        { status: 404 }
      );
    }

    // Check user is admin (compliance verification is sensitive)
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

    // Run compliance verification
    const compliance = await verifyCompliance(requestId);

    return NextResponse.json({
      compliance,
      summary: {
        overall: compliance.gdpr_compliant ? 'COMPLIANT' : 'NON-COMPLIANT',
        checks_passed: Object.values(compliance.checks).filter(Boolean).length,
        checks_total: Object.keys(compliance.checks).length,
        response_time: `${compliance.response_time_days} days`,
        response_deadline: '30 days (GDPR)',
      },
    });
  } catch (error) {
    logServerError('Compliance verification error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
