/**
 * SCIM Configuration Management Endpoint
 *
 * GET  /api/organizations/:orgId/scim - Get SCIM configuration
 * POST /api/organizations/:orgId/scim - Enable SCIM and generate token
 * PUT  /api/organizations/:orgId/scim - Update SCIM settings
 * DELETE /api/organizations/:orgId/scim - Disable SCIM
 *
 * Manages SCIM provisioning configuration for an organization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { createSCIMToken, getSCIMConfig, updateSCIMConfig, revokeSCIMToken } from '@/lib/scim/auth';
import { verifyCsrfToken } from '@/lib/csrf';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * Check if user is an admin of the organization
 */
async function checkOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();

  return data?.role === 'admin' || data?.role === 'owner';
}

/**
 * GET /api/organizations/:orgId/scim
 * Get SCIM configuration for the organization
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orgId } = await params;

  // Check admin access
  const isAdmin = await checkOrgAdmin(session.user.id, orgId);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const config = await getSCIMConfig(orgId);

    if (!config) {
      return NextResponse.json({
        success: true,
        configured: false,
        config: null,
      });
    }

    // Don't return the token hash
    return NextResponse.json({
      success: true,
      configured: true,
      config: {
        id: config.id,
        organizationId: config.organizationId,
        enabled: config.enabled,
        baseUrl: config.baseUrl,
        syncUsers: config.syncUsers,
        syncGroups: config.syncGroups,
        autoProvision: config.autoProvision,
        autoDeprovision: config.autoDeprovision,
        defaultRole: config.defaultRole,
        groupRoleMapping: config.groupRoleMapping,
        groupToOrgMapping: config.groupToOrgMapping,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        lastSyncAt: config.lastSyncAt,
      },
    });
  } catch (error) {
    console.error('Failed to get SCIM config:', error);
    return NextResponse.json(
      { error: 'Failed to get SCIM configuration' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/organizations/:orgId/scim
 * Enable SCIM and generate a new token
 * Returns the token ONLY ONCE - it cannot be retrieved again
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const csrfErr = verifyCsrfToken(request);
  if (csrfErr) return csrfErr;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orgId } = await params;

  // Check admin access
  const isAdmin = await checkOrgAdmin(session.user.id, orgId);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { token, configId } = await createSCIMToken(orgId, session.user.id);
    const config = await getSCIMConfig(orgId);

    return NextResponse.json({
      success: true,
      message: 'SCIM enabled. Save this token - it will not be shown again.',
      token, // Only returned on creation
      config: {
        id: configId,
        baseUrl: config?.baseUrl,
        enabled: true,
      },
    });
  } catch (error) {
    console.error('Failed to enable SCIM:', error);
    return NextResponse.json(
      { error: 'Failed to enable SCIM' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/organizations/:orgId/scim
 * Update SCIM settings
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const csrfErr = verifyCsrfToken(request);
  if (csrfErr) return csrfErr;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orgId } = await params;

  // Check admin access
  const isAdmin = await checkOrgAdmin(session.user.id, orgId);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();

    await updateSCIMConfig(orgId, {
      enabled: body.enabled,
      syncUsers: body.syncUsers,
      syncGroups: body.syncGroups,
      autoProvision: body.autoProvision,
      autoDeprovision: body.autoDeprovision,
      defaultRole: body.defaultRole,
      groupRoleMapping: body.groupRoleMapping,
      groupToOrgMapping: body.groupToOrgMapping,
    });

    const config = await getSCIMConfig(orgId);

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('Failed to update SCIM config:', error);
    return NextResponse.json(
      { error: 'Failed to update SCIM configuration' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/organizations/:orgId/scim
 * Disable SCIM and revoke token
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const csrfErr = verifyCsrfToken(request);
  if (csrfErr) return csrfErr;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orgId } = await params;

  // Check admin access
  const isAdmin = await checkOrgAdmin(session.user.id, orgId);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await revokeSCIMToken(orgId);

    return NextResponse.json({
      success: true,
      message: 'SCIM has been disabled and the token has been revoked.',
    });
  } catch (error) {
    console.error('Failed to disable SCIM:', error);
    return NextResponse.json(
      { error: 'Failed to disable SCIM' },
      { status: 500 }
    );
  }
}
