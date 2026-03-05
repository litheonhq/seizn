/**
 * Winter Governance - Policy Version History API
 *
 * GET /api/winter/org/[orgId]/policies/versions/history - Get version history with filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import { getUserOrgRole } from '@/lib/winter/org';
import {
  getVersionHistory,
  getVersionAtTime,
  getVersionChangeSummary,
} from '@/lib/winter/org/policy-versions';


interface RouteContext {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/winter/org/[orgId]/policies/versions/history
 * Get version history for a policy
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user has access
    const role = await getUserOrgRole(orgId, user.id);
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const policyId = searchParams.get('policy_id');
    const includeArchived = searchParams.get('include_archived') === 'true';
    const includeDrafts = searchParams.get('include_drafts') === 'true';
    const startDateStr = searchParams.get('start_date');
    const endDateStr = searchParams.get('end_date');
    const atTimeStr = searchParams.get('at_time');
    const summaryOnly = searchParams.get('summary_only') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!policyId) {
      return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
    }

    // If requesting version at a specific time
    if (atTimeStr) {
      const atTime = new Date(atTimeStr);
      if (isNaN(atTime.getTime())) {
        return NextResponse.json({ error: 'Invalid at_time format' }, { status: 400 });
      }

      const versionAtTime = await getVersionAtTime(policyId, atTime);
      return NextResponse.json({
        success: true,
        version: versionAtTime,
        requested_time: atTimeStr,
      });
    }

    // If requesting summary only (change log)
    if (summaryOnly) {
      const summaries = await getVersionChangeSummary(policyId, limit);
      return NextResponse.json({
        success: true,
        change_log: summaries,
      });
    }

    // Build options
    const options: {
      includeArchived?: boolean;
      includeDrafts?: boolean;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {
      includeArchived,
      includeDrafts,
      limit,
      offset,
    };

    if (startDateStr) {
      const startDate = new Date(startDateStr);
      if (!isNaN(startDate.getTime())) {
        options.startDate = startDate;
      }
    }

    if (endDateStr) {
      const endDate = new Date(endDateStr);
      if (!isNaN(endDate.getTime())) {
        options.endDate = endDate;
      }
    }

    const history = await getVersionHistory(policyId, options);

    return NextResponse.json({
      success: true,
      versions: history.data,
      total: history.total,
      limit: history.limit,
      offset: history.offset,
      has_more: history.has_more,
    });
  } catch (error) {
    console.error('[PolicyVersions History] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
