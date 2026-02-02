/**
 * Seizn API - EU AI Act Article 50 Compliance Report
 *
 * GET /api/winter/transparency/report - Generate Article 50 compliance report
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { generateArticle50Report } from '@/lib/winter/transparency';

/**
 * GET /api/winter/transparency/report
 * Generate Article 50 compliance report for a period
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    const report = await generateArticle50Report({
      organizationId: membership.organization_id,
      periodStart: new Date(startDate),
      periodEnd: new Date(endDate),
      includeDetails: searchParams.get('includeDetails') !== 'false',
    });

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Failed to generate Article 50 report:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate report' },
      { status: 500 }
    );
  }
}
