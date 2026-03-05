/**
 * Winter Governance - Members API
 *
 * GET    /api/winter/org/[orgId]/members - List members
 * POST   /api/winter/org/[orgId]/members - Invite member
 * PATCH  /api/winter/org/[orgId]/members - Update member
 * DELETE /api/winter/org/[orgId]/members - Remove member
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  listMembers,
  inviteMember,
  updateMember,
  removeMember,
  getPendingInvites,
  cancelInvite,
  getUserOrgRole,
} from '@/lib/winter/org';


interface RouteContext {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/winter/org/[orgId]/members
 * List organization members and pending invites
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
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status') as 'active' | 'suspended' | 'pending' | undefined;
    const roleFilter = searchParams.get('role') as 'owner' | 'admin' | 'member' | 'viewer' | undefined;
    const search = searchParams.get('search') || undefined;

    const members = await listMembers({
      organization_id: orgId,
      limit,
      offset,
      status,
      role: roleFilter,
      search,
    });

    // Get pending invites for admins
    let pendingInvites: unknown[] = [];
    if (['owner', 'admin'].includes(role)) {
      pendingInvites = await getPendingInvites(orgId);
    }

    return NextResponse.json({
      success: true,
      members: members.data,
      pending_invites: pendingInvites,
      total: members.total,
      limit: members.limit,
      offset: members.offset,
      has_more: members.has_more,
      your_role: role,
    });
  } catch (error) {
    console.error('[WinterOrg Members] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/winter/org/[orgId]/members
 * Invite a new member
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
      return NextResponse.json({ error: 'Not authorized to invite members' }, { status: 403 });
    }

    const body = await request.json();
    const { email, role: inviteRole } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Validate role
    if (inviteRole && !['admin', 'member', 'viewer'].includes(inviteRole)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be admin, member, or viewer' },
        { status: 400 }
      );
    }

    const result = await inviteMember({
      organization_id: orgId,
      email,
      role: inviteRole || 'member',
      invited_by: user.id,
    });

    return NextResponse.json({
      success: true,
      invite: result.invite,
      invite_url: result.invite_url,
    });
  } catch (error) {
    console.error('[WinterOrg Members] POST error:', error);

    if (error instanceof Error) {
      if (
        error.message.includes('already a member') ||
        error.message.includes('already pending')
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/winter/org/[orgId]/members
 * Update a member's role or status
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is owner (only owner can change roles)
    const role = await getUserOrgRole(orgId, user.id);
    if (role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can change member roles' }, { status: 403 });
    }

    const body = await request.json();
    const { member_id, role: newRole, status } = body;

    if (!member_id) {
      return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
    }

    const member = await updateMember(
      {
        member_id,
        role: newRole,
        status,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      member,
    });
  } catch (error) {
    console.error('[WinterOrg Members] PATCH error:', error);

    if (error instanceof Error) {
      if (error.message.includes('Cannot change')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/winter/org/[orgId]/members
 * Remove a member or cancel an invite
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('member_id');
    const inviteId = searchParams.get('invite_id');

    // Check user role
    const role = await getUserOrgRole(orgId, user.id);

    if (inviteId) {
      // Cancel invite - admin or owner can do this
      if (!role || !['owner', 'admin'].includes(role)) {
        return NextResponse.json({ error: 'Not authorized to cancel invites' }, { status: 403 });
      }

      await cancelInvite(inviteId, user.id);

      return NextResponse.json({
        success: true,
        cancelled_invite: inviteId,
      });
    }

    if (memberId) {
      // Remove member - admin/owner can remove, or user can remove themselves
      // Get member details to check if self-removal
      const isSelf = memberId === user.id;

      if (!isSelf && (!role || !['owner', 'admin'].includes(role))) {
        return NextResponse.json({ error: 'Not authorized to remove members' }, { status: 403 });
      }

      await removeMember(memberId, user.id);

      return NextResponse.json({
        success: true,
        removed_member: memberId,
      });
    }

    return NextResponse.json(
      { error: 'Either member_id or invite_id is required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[WinterOrg Members] DELETE error:', error);

    if (error instanceof Error) {
      if (error.message.includes('Cannot remove')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
