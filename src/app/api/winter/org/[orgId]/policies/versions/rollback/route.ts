/**
 * Winter Governance - Policy Version Rollback API
 *
 * POST /api/winter/org/[orgId]/policies/versions/rollback - Rollback to a previous version
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import { getUserOrgRole } from '@/lib/winter/org';
import {
  rollbackToVersion,
  getVersionHistory,
} from '@/lib/winter/org/policy-versions';


interface RouteContext {
  params: Promise<{ orgId: string }>;
}

/**
 * POST /api/winter/org/[orgId]/policies/versions/rollback
 * Rollback to a previous version
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is admin or owner
    const role = await getUserOrgRole(orgId, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to rollback policies' }, { status: 403 });
    }

    const body = await request.json();
    const { policy_id, target_version, reason } = body;

    if (!policy_id) {
      return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
    }

    if (typeof target_version !== 'number') {
      return NextResponse.json({ error: 'target_version must be a number' }, { status: 400 });
    }

    // Verify the target version exists and belongs to this org
    const history = await getVersionHistory(policy_id, {
      includeArchived: true,
      includeDrafts: false,
    });

    const targetExists = history.data.some(
      v => v.version === target_version && v.organization_id === orgId
    );

    if (!targetExists) {
      return NextResponse.json({
        error: `Version ${target_version} not found for this policy`
      }, { status: 404 });
    }

    const rollbackVersion = await rollbackToVersion({
      policy_id,
      target_version,
      rolled_back_by: user.id,
      reason,
    });

    return NextResponse.json({
      success: true,
      version: rollbackVersion,
      message: `Created rollback draft from version ${target_version}. Publish to apply.`,
    });
  } catch (error) {
    console.error('[PolicyVersions Rollback] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
