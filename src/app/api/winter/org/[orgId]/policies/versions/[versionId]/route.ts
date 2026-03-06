/**
 * Winter Governance - Policy Version Operations API
 *
 * GET    /api/winter/org/[orgId]/policies/versions/[versionId] - Get a version
 * PATCH  /api/winter/org/[orgId]/policies/versions/[versionId] - Update a draft version
 * DELETE /api/winter/org/[orgId]/policies/versions/[versionId] - Delete a draft version
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import { getUserOrgRole } from '@/lib/winter/org';
import {
  getPolicyVersion,
  updateDraftVersion,
  deleteDraftVersion,
  publishVersion,
  compareWithCurrent,
} from '@/lib/winter/org/policy-versions';
import { logServerError } from '@/lib/server/logger';


interface RouteContext {
  params: Promise<{ orgId: string; versionId: string }>;
}

/**
 * GET /api/winter/org/[orgId]/policies/versions/[versionId]
 * Get a specific version
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId, versionId } = await context.params;

    // Check user has access
    const role = await getUserOrgRole(orgId, user.id);
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    const version = await getPolicyVersion(versionId);
    if (!version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    // Verify version belongs to this org
    if (version.organization_id !== orgId) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    // Include diff with current if requested
    const { searchParams } = new URL(request.url);
    const includeDiff = searchParams.get('include_diff') === 'true';

    let diff = null;
    if (includeDiff && version.state === 'draft') {
      diff = await compareWithCurrent(versionId);
    }

    return NextResponse.json({
      success: true,
      version,
      ...(diff && { diff }),
    });
  } catch (error) {
    logServerError('[PolicyVersion] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/winter/org/[orgId]/policies/versions/[versionId]
 * Update a draft version or publish it
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId, versionId } = await context.params;

    // Check user is admin or owner
    const role = await getUserOrgRole(orgId, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to update policy versions' }, { status: 403 });
    }

    // Verify version exists and belongs to org
    const existing = await getPolicyVersion(versionId);
    if (!existing || existing.organization_id !== orgId) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action, name, description, config, scope, priority, change_summary } = body;

    // Handle publish action
    if (action === 'publish') {
      if (existing.state !== 'draft') {
        return NextResponse.json({ error: 'Can only publish draft versions' }, { status: 400 });
      }

      const published = await publishVersion(versionId, user.id);
      return NextResponse.json({
        success: true,
        version: published,
        message: 'Version published successfully',
      });
    }

    // Handle regular update
    if (existing.state !== 'draft') {
      return NextResponse.json({ error: 'Can only update draft versions' }, { status: 400 });
    }

    const updated = await updateDraftVersion(
      {
        version_id: versionId,
        name,
        description,
        config,
        scope,
        priority,
        change_summary,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      version: updated,
    });
  } catch (error) {
    logServerError('[PolicyVersion] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/winter/org/[orgId]/policies/versions/[versionId]
 * Delete a draft version
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId, versionId } = await context.params;

    // Check user is admin or owner
    const role = await getUserOrgRole(orgId, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to delete policy versions' }, { status: 403 });
    }

    // Verify version exists and belongs to org
    const existing = await getPolicyVersion(versionId);
    if (!existing || existing.organization_id !== orgId) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    if (existing.state !== 'draft') {
      return NextResponse.json({ error: 'Can only delete draft versions' }, { status: 400 });
    }

    await deleteDraftVersion(versionId, user.id);

    return NextResponse.json({
      success: true,
      message: 'Draft version deleted',
    });
  } catch (error) {
    logServerError('[PolicyVersion] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
