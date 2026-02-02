/**
 * RTBF Deletion Certificate API
 *
 * Generate cryptographic proof of data deletion for GDPR compliance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { generateDeletionCertificate } from '@/lib/winter/rtbf/verification';

interface RouteParams {
  params: Promise<{ requestId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { requestId } = await params;
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the request to verify access
    const { data: rtbfRequest, error: reqError } = await supabase
      .from('winter_rtbf_requests')
      .select('id, organization_id, subject_id, status')
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

    // Only generate certificates for completed requests
    if (rtbfRequest.status !== 'completed') {
      return NextResponse.json(
        {
          error: 'Cannot generate certificate for incomplete request',
          status: rtbfRequest.status,
        },
        { status: 400 }
      );
    }

    // Generate certificate
    const certificate = await generateDeletionCertificate(requestId);

    // Check for format parameter
    const format = request.nextUrl.searchParams.get('format');

    if (format === 'pdf') {
      // In production, this would generate a PDF
      // For now, return JSON with PDF generation hint
      return NextResponse.json({
        certificate,
        message: 'PDF generation not yet implemented - use JSON format',
      });
    }

    return NextResponse.json({
      certificate,
      downloadable: true,
      formats: ['json', 'pdf'],
    });
  } catch (error) {
    console.error('Certificate generation error:', error);

    if (error instanceof Error && error.message.includes('incomplete')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
