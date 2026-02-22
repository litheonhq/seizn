import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { organizationInviteEmail } from '@/lib/email/templates';
import { createServerClient } from '@/lib/supabase';
import { getRequestUser } from '@/lib/api/request-user';
import { verifyCsrf } from '@/lib/csrf';
import crypto from 'crypto';

// GET /api/organizations/members - List organization members
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('organization_id') || searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Check user is a member
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    // Get all members
    const { data: members, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        user_id,
        role,
        created_at,
        user:profiles (
          id,
          email,
          full_name,
          avatar_url
        )
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Fetch members error:', error);
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }

    // Map members into dashboard-friendly shape
    const mappedMembers = (members || []).map((m) => {
      const profile = m.user as unknown as {
        id: string;
        email: string | null;
        full_name: string | null;
        avatar_url: string | null;
      } | null;

      return {
        id: m.id as string,
        user_id: (m.user_id as string) || profile?.id,
        email: profile?.email || 'unknown',
        name: profile?.full_name || null,
        role: m.role as string,
        joined_at: m.created_at as string,
        avatar: profile?.avatar_url || undefined,
      };
    });

    // Get pending invites (only for admins)
    let invites: unknown[] = [];
    if (['owner', 'admin'].includes(membership.role)) {
      const { data: pendingInvites } = await supabase
        .from('organization_invites')
        .select('id, email, role, created_at, expires_at')
        .eq('organization_id', orgId)
        .gt('expires_at', new Date().toISOString());

      invites = (pendingInvites || []).map((invite) => ({
        ...invite,
        status: 'pending',
      }));
    }

    return NextResponse.json({
      success: true,
      members: mappedMembers,
      pending_invites: invites,
      your_role: membership.role,
    });
  } catch (error) {
    console.error('Members GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/organizations/members - Invite a new member
export async function POST(request: NextRequest) {
  try {
    const csrfError = verifyCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const orgId = body.organization_id || body.org_id;
    const email = body.email;
    const role = body.role || 'member';

    if (!orgId || !email) {
      return NextResponse.json({ error: 'Organization ID and email required' }, { status: 400 });
    }

    // Validate role
    if (!['admin', 'member'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be admin or member' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Check user is admin/owner
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Not authorized to invite members' }, { status: 403 });
    }

    // Check if user already a member
    const emailLower = String(email).toLowerCase();
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', emailLower)
      .single();

    if (profile?.id) {
      const { data: existingMember } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('user_id', profile.id)
        .single();

      if (existingMember) {
        return NextResponse.json({ error: 'User is already a member' }, { status: 400 });
      }
    }

    // Check for existing pending invite
    const { data: existingInvite } = await supabase
      .from('organization_invites')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', emailLower)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (existingInvite) {
      return NextResponse.json({ error: 'Invite already pending for this email' }, { status: 400 });
    }

    // Create invite
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const { data: invite, error: inviteError } = await supabase
      .from('organization_invites')
      .insert({
        organization_id: orgId,
        email: emailLower,
        role,
        invited_by: user.id,
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select('id, email, role, created_at, expires_at')
      .single();

    if (inviteError) {
      console.error('Create invite error:', inviteError);
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    // Send invite email
    try {
      // Get organization name
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single();

      // Get inviter name
      const { data: inviter } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      await sendEmail({
        to: emailLower,
        subject: `You've been invited to join ${org?.name || 'an organization'} on Seizn`,
        html: organizationInviteEmail(
          inviter?.full_name || 'A team member',
          org?.name || 'Organization',
          `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
        ),
      });
    } catch (emailError) {
      console.error('Failed to send invite email:', emailError);
      // Continue anyway - invite was created successfully
    }

    return NextResponse.json({
      success: true,
      invite: { ...invite, status: 'pending' },
      invite_url: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`,
    });
  } catch (error) {
    console.error('Members POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/organizations/members - Update member role
export async function PATCH(request: NextRequest) {
  try {
    const csrfError = verifyCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const orgId = body.organization_id || body.org_id;
    const memberId = body.member_id;
    const role = body.role;

    if (!orgId || !memberId || !role) {
      return NextResponse.json({ error: 'Organization ID, member ID, and role required' }, { status: 400 });
    }

    if (!['admin', 'member'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Check user is owner (only owner can change roles)
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only owner can change member roles' }, { status: 403 });
    }

    // Can't change owner role
    const { data: targetMember } = await supabase
      .from('organization_members')
      .select('role')
      .eq('id', memberId)
      .single();

    if (targetMember?.role === 'owner') {
      return NextResponse.json({ error: 'Cannot change owner role' }, { status: 400 });
    }

    // Update role
    const { error } = await supabase
      .from('organization_members')
      .update({ role })
      .eq('id', memberId)
      .eq('organization_id', orgId);

    if (error) {
      console.error('Update member role error:', error);
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
    }

    return NextResponse.json({ success: true, role });
  } catch (error) {
    console.error('Members PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/organizations/members - Remove a member
export async function DELETE(request: NextRequest) {
  try {
    const csrfError = verifyCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('organization_id') || searchParams.get('org_id');
    const memberId = searchParams.get('member_id');

    if (!orgId || !memberId) {
      return NextResponse.json({ error: 'Organization ID and member ID required' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Check user is admin/owner or removing themselves
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    const { data: targetMember } = await supabase
      .from('organization_members')
      .select('user_id, role')
      .eq('id', memberId)
      .single();

    const isSelf = targetMember?.user_id === user.id;
    const isAdminOrOwner = membership && ['owner', 'admin'].includes(membership.role);

    if (!isSelf && !isAdminOrOwner) {
      return NextResponse.json({ error: 'Not authorized to remove members' }, { status: 403 });
    }

    // Can't remove owner
    if (targetMember?.role === 'owner') {
      return NextResponse.json({ error: 'Cannot remove the owner' }, { status: 400 });
    }

    // Remove member
    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', memberId)
      .eq('organization_id', orgId);

    if (error) {
      console.error('Remove member error:', error);
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
    }

    return NextResponse.json({ success: true, removed: memberId });
  } catch (error) {
    console.error('Members DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
