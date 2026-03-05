/**
 * Winter Governance - Roles API
 *
 * GET    /api/winter/org/[orgId]/roles - List roles and permissions
 * POST   /api/winter/org/[orgId]/roles - Create custom role
 * PATCH  /api/winter/org/[orgId]/roles - Update custom role
 * DELETE /api/winter/org/[orgId]/roles - Delete custom role
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  getUserOrgRole,
  getAllOrgRoles,
  getCustomRoles,
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
  DEFAULT_ORG_ROLES,
} from '@/lib/winter/org';


interface RouteContext {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/winter/org/[orgId]/roles
 * List all roles (default + custom) and their permissions
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

    // Get default roles
    const defaultRoles = getAllOrgRoles();

    // Get custom roles for this organization
    let customRoles: unknown[] = [];
    try {
      customRoles = await getCustomRoles(orgId);
    } catch {
      // Table might not exist yet
    }

    return NextResponse.json({
      success: true,
      default_roles: defaultRoles,
      custom_roles: customRoles,
      your_role: role,
      your_permissions: DEFAULT_ORG_ROLES[role]?.permissions || [],
    });
  } catch (error) {
    console.error('[WinterOrg Roles] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/winter/org/[orgId]/roles
 * Create a custom role (enterprise feature)
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is owner
    const role = await getUserOrgRole(orgId, user.id);
    if (role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can create custom roles' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, base_role, permissions } = body;

    if (!name) {
      return NextResponse.json({ error: 'Role name is required' }, { status: 400 });
    }

    if (!base_role || !['owner', 'admin', 'member', 'viewer'].includes(base_role)) {
      return NextResponse.json(
        { error: 'Valid base_role is required (owner, admin, member, viewer)' },
        { status: 400 }
      );
    }

    const customRole = await createCustomRole({
      organization_id: orgId,
      name,
      description,
      base_role,
      permissions: permissions || [],
    });

    return NextResponse.json({
      success: true,
      role: customRole,
    });
  } catch (error) {
    console.error('[WinterOrg Roles] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/winter/org/[orgId]/roles
 * Update a custom role
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is owner
    const role = await getUserOrgRole(orgId, user.id);
    if (role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can update custom roles' }, { status: 403 });
    }

    const body = await request.json();
    const { role_id, name, description, permissions } = body;

    if (!role_id) {
      return NextResponse.json({ error: 'Role ID is required' }, { status: 400 });
    }

    const customRole = await updateCustomRole(role_id, {
      name,
      description,
      permissions,
    });

    return NextResponse.json({
      success: true,
      role: customRole,
    });
  } catch (error) {
    console.error('[WinterOrg Roles] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/winter/org/[orgId]/roles
 * Delete a custom role
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is owner
    const role = await getUserOrgRole(orgId, user.id);
    if (role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can delete custom roles' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get('role_id');

    if (!roleId) {
      return NextResponse.json({ error: 'Role ID is required' }, { status: 400 });
    }

    await deleteCustomRole(roleId);

    return NextResponse.json({
      success: true,
      deleted: roleId,
    });
  } catch (error) {
    console.error('[WinterOrg Roles] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
