import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { getRequestUser } from '@/lib/api/request-user';
import { sendEmail } from '@/lib/email';
import { organizationInviteEmail } from '@/lib/email/templates';

function isValidRole(role: unknown): role is 'admin' | 'member' {
  return role === 'admin' || role === 'member';
}

// GET /api/organizations/invites?organization_id=... - list pending invites
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

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    // Only admins can see invites; return empty list for members to keep UI stable.
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ success: true, invites: [] });
    }

    const { data: invites, error } = await supabase
      .from('organization_invites')
      .select('id, email, role, created_at, expires_at')
      .eq('organization_id', orgId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch invites error:', error);
      return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      invites: (invites || []).map((invite) => ({
        ...invite,
        status: 'pending',
      })),
    });
  } catch (error) {
    console.error('Invites GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/organizations/invites - create invite
export async function POST(request: NextRequest) {
  try {
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

    if (!isValidRole(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be admin or member' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Not authorized to invite members' }, { status: 403 });
    }

    const emailLower = String(email).toLowerCase();

    // Check if user already a member
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
    expiresAt.setDate(expiresAt.getDate() + 7);

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

    if (inviteError || !invite) {
      console.error('Create invite error:', inviteError);
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    // Send email (best-effort)
    try {
      const [{ data: org }, { data: inviter }] = await Promise.all([
        supabase.from('organizations').select('name').eq('id', orgId).single(),
        supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      ]);

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.seizn.com';
      const inviteUrl = `${baseUrl}/invite/${token}`;

      await sendEmail({
        to: emailLower,
        subject: `You've been invited to join ${org?.name || 'an organization'} on Seizn`,
        html: organizationInviteEmail(
          inviter?.full_name || 'A team member',
          org?.name || 'Organization',
          inviteUrl
        ),
      });
    } catch (emailError) {
      console.error('Failed to send invite email:', emailError);
    }

    return NextResponse.json({
      success: true,
      invite: { ...invite, status: 'pending' },
    });
  } catch (error) {
    console.error('Invites POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/organizations/invites?id=...
export async function DELETE(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const inviteId = searchParams.get('id');

    if (!inviteId) {
      return NextResponse.json({ error: 'Invite ID required' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data: invite, error: inviteFetchError } = await supabase
      .from('organization_invites')
      .select('id, organization_id')
      .eq('id', inviteId)
      .single();

    if (inviteFetchError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', invite.organization_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Not authorized to cancel invites' }, { status: 403 });
    }

    const { error } = await supabase
      .from('organization_invites')
      .delete()
      .eq('id', inviteId);

    if (error) {
      console.error('Cancel invite error:', error);
      return NextResponse.json({ error: 'Failed to cancel invite' }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: inviteId });
  } catch (error) {
    console.error('Invites DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
