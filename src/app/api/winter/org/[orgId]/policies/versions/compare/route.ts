/**
 * Winter Governance - Policy Version Compare API
 *
 * GET /api/winter/org/[orgId]/policies/versions/compare - Compare two versions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import { getUserOrgRole } from '@/lib/winter/org';
import {
  compareVersions,
  getPolicyVersion,
} from '@/lib/winter/org/policy-versions';
import { logServerError } from '@/lib/server/logger';


interface RouteContext {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/winter/org/[orgId]/policies/versions/compare
 * Compare two versions
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
    const versionIdA = searchParams.get('version_a');
    const versionIdB = searchParams.get('version_b');

    if (!versionIdA || !versionIdB) {
      return NextResponse.json({
        error: 'Both version_a and version_b are required'
      }, { status: 400 });
    }

    // Verify both versions belong to this org
    const [versionA, versionB] = await Promise.all([
      getPolicyVersion(versionIdA),
      getPolicyVersion(versionIdB),
    ]);

    if (!versionA || versionA.organization_id !== orgId) {
      return NextResponse.json({ error: 'Version A not found' }, { status: 404 });
    }

    if (!versionB || versionB.organization_id !== orgId) {
      return NextResponse.json({ error: 'Version B not found' }, { status: 404 });
    }

    // Verify both versions are for the same policy
    if (versionA.policy_id !== versionB.policy_id) {
      return NextResponse.json({
        error: 'Versions must belong to the same policy'
      }, { status: 400 });
    }

    const diff = await compareVersions(versionIdA, versionIdB);

    return NextResponse.json({
      success: true,
      diff,
    });
  } catch (error) {
    logServerError('[PolicyVersions Compare] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
