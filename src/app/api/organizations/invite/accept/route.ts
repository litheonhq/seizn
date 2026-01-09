import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';

// GET /api/organizations/invite/accept?token=xxx - Get invite details
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Get invite details
    const { data: invite, error } = await supabase
      .from('organization_invites')
      .select(`
        id,
        email,
        role,
        expires_at,
        organization:organizations (
          id,
          name,
          slug
        ),
        inviter:profiles!invited_by (
          full_name
        )
      `)
      .eq('token', token)
      .single();

    if (error || !invite) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 });
    }

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite has expired' }, { status: 410 });
    }

    return NextResponse.json({
      success: true,
      invite: {
        email: invite.email,
        role: invite.role,
        organization: invite.organization,
        inviter_name: (invite.inviter as unknown as { full_name: string | null } | null)?.full_name || 'A team member',
        expires_at: invite.expires_at,
      },
    });
  } catch (error) {
    console.error('Get invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/organizations/invite/accept - Accept an invite
export async function POST(request: NextRequest) {
  try {
    // Use NextAuth session for authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Get invite
    const { data: invite, error: inviteError } = await supabase
      .from('organization_invites')
      .select('id, organization_id, email, role, expires_at')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invalid invite' }, { status: 404 });
    }

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite has expired' }, { status: 410 });
    }

    // Check if user email matches invite email
    if (session.user.email?.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json({
        error: 'This invite was sent to a different email address'
      }, { status: 403 });
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', invite.organization_id)
      .eq('user_id', session.user.id)
      .single();

    if (existingMember) {
      // Already a member - delete the invite and return success
      await supabase
        .from('organization_invites')
        .delete()
        .eq('id', invite.id);

      return NextResponse.json({
        success: true,
        message: 'You are already a member of this organization',
        organization_id: invite.organization_id,
      });
    }

    // Add user as member
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: invite.organization_id,
        user_id: session.user.id,
        role: invite.role,
      });

    if (memberError) {
      console.error('Add member error:', memberError);
      return NextResponse.json({ error: 'Failed to join organization' }, { status: 500 });
    }

    // Delete the invite
    await supabase
      .from('organization_invites')
      .delete()
      .eq('id', invite.id);

    // Get organization details for response
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('id', invite.organization_id)
      .single();

    return NextResponse.json({
      success: true,
      message: 'Successfully joined the organization',
      organization: org,
    });
  } catch (error) {
    console.error('Accept invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
