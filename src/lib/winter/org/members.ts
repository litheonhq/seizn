/**
 * Seizn Winter - Member Management
 *
 * CRUD operations for organization members including:
 * - Member listing/invitation/removal
 * - Role management
 * - Status management (active, suspended, pending)
 */

import { createServerClient } from '@/lib/supabase';
import crypto from 'crypto';
import type { OrgMember, OrgRole, MemberStatus, PaginatedResult } from './types';
import { logAuditEvent } from './audit-log';

// ============================================
// Types
// ============================================

export interface ListMembersParams {
  organization_id: string;
  status?: MemberStatus;
  role?: OrgRole;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface InviteMemberParams {
  organization_id: string;
  email: string;
  role?: OrgRole;
  invited_by: string;
}

export interface UpdateMemberParams {
  member_id: string;
  role?: OrgRole;
  status?: MemberStatus;
  permissions?: Record<string, unknown>;
}

export interface OrgInvite {
  id: string;
  organization_id: string;
  email: string;
  role: OrgRole;
  invited_by: string;
  token: string;
  expires_at: string;
  created_at: string;
}

// ============================================
// Member Listing
// ============================================

/**
 * List organization members with pagination and filters
 */
export async function listMembers(
  params: ListMembersParams
): Promise<PaginatedResult<OrgMember>> {
  const supabase = createServerClient();

  const limit = params.limit || 50;
  const offset = params.offset || 0;

  let query = supabase
    .from('organization_members')
    .select(
      `
      id,
      organization_id,
      user_id,
      role,
      permissions,
      invited_by,
      invited_at,
      accepted_at,
      status,
      created_at,
      user:profiles (
        id,
        email,
        full_name,
        avatar_url
      )
    `,
      { count: 'exact' }
    )
    .eq('organization_id', params.organization_id)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (params.status) {
    query = query.eq('status', params.status);
  }

  if (params.role) {
    query = query.eq('role', params.role);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  // If search is provided, filter by user email/name
  let filteredData = data || [];
  if (params.search) {
    const searchLower = params.search.toLowerCase();
    filteredData = filteredData.filter((member) => {
      const user = member.user as { email?: string; full_name?: string } | null;
      return (
        user?.email?.toLowerCase().includes(searchLower) ||
        user?.full_name?.toLowerCase().includes(searchLower)
      );
    });
  }

  return {
    data: filteredData.map((m) => ({
      id: m.id,
      organization_id: m.organization_id,
      user_id: m.user_id,
      role: m.role as OrgRole,
      permissions: m.permissions || {},
      invited_by: m.invited_by,
      invited_at: m.invited_at,
      accepted_at: m.accepted_at,
      status: (m.status || 'active') as MemberStatus,
      created_at: m.created_at,
      user: m.user as OrgMember['user'],
    })),
    total: count || 0,
    limit,
    offset,
    has_more: (count || 0) > offset + limit,
  };
}

/**
 * Get a single member by ID
 */
export async function getMember(memberId: string): Promise<OrgMember | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('organization_members')
    .select(
      `
      id,
      organization_id,
      user_id,
      role,
      permissions,
      invited_by,
      invited_at,
      accepted_at,
      status,
      created_at,
      user:profiles (
        id,
        email,
        full_name,
        avatar_url
      )
    `
    )
    .eq('id', memberId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return {
    id: data.id,
    organization_id: data.organization_id,
    user_id: data.user_id,
    role: data.role as OrgRole,
    permissions: data.permissions || {},
    invited_by: data.invited_by,
    invited_at: data.invited_at,
    accepted_at: data.accepted_at,
    status: (data.status || 'active') as MemberStatus,
    created_at: data.created_at,
    user: data.user as OrgMember['user'],
  };
}

/**
 * Get member by organization and user ID
 */
export async function getMemberByUser(
  organizationId: string,
  userId: string
): Promise<OrgMember | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('organization_members')
    .select(
      `
      id,
      organization_id,
      user_id,
      role,
      permissions,
      invited_by,
      invited_at,
      accepted_at,
      status,
      created_at,
      user:profiles (
        id,
        email,
        full_name,
        avatar_url
      )
    `
    )
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return {
    id: data.id,
    organization_id: data.organization_id,
    user_id: data.user_id,
    role: data.role as OrgRole,
    permissions: data.permissions || {},
    invited_by: data.invited_by,
    invited_at: data.invited_at,
    accepted_at: data.accepted_at,
    status: (data.status || 'active') as MemberStatus,
    created_at: data.created_at,
    user: data.user as OrgMember['user'],
  };
}

// ============================================
// Member Invitation
// ============================================

/**
 * Create an invitation for a new member
 */
export async function inviteMember(
  params: InviteMemberParams
): Promise<{ invite: OrgInvite; invite_url: string }> {
  const supabase = createServerClient();

  const email = params.email.toLowerCase().trim();
  const role = params.role || 'member';

  // Check if user is already a member
  const { data: existingUser } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    const { data: existingMember } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', params.organization_id)
      .eq('user_id', existingUser.id)
      .single();

    if (existingMember) {
      throw new Error('User is already a member of this organization');
    }
  }

  // Check for existing pending invite
  const { data: existingInvite } = await supabase
    .from('organization_invites')
    .select('id')
    .eq('organization_id', params.organization_id)
    .eq('email', email)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (existingInvite) {
    throw new Error('An invitation is already pending for this email');
  }

  // Create invite token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

  const { data: invite, error } = await supabase
    .from('organization_invites')
    .insert({
      organization_id: params.organization_id,
      email,
      role,
      invited_by: params.invited_by,
      token,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, organization_id, email, role, invited_by, token, expires_at, created_at')
    .single();

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: params.invited_by,
    organization_id: params.organization_id,
    action: 'member.invite',
    resource_type: 'members',
    details: { email, role },
    status: 'success',
  });

  const invite_url = `${process.env.NEXT_PUBLIC_APP_URL || ''}/invite/${token}`;

  return {
    invite: invite as OrgInvite,
    invite_url,
  };
}

/**
 * Accept an invitation and become a member
 */
export async function acceptInvite(
  token: string,
  userId: string
): Promise<OrgMember> {
  const supabase = createServerClient();

  // Find the invite
  const { data: invite, error: inviteError } = await supabase
    .from('organization_invites')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (inviteError || !invite) {
    throw new Error('Invalid or expired invitation');
  }

  // Verify user email matches (optional, can be relaxed)
  const { data: user } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single();

  if (user?.email?.toLowerCase() !== invite.email.toLowerCase()) {
    throw new Error('Invitation email does not match your account');
  }

  // Check if already a member
  const { data: existingMember } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', invite.organization_id)
    .eq('user_id', userId)
    .single();

  if (existingMember) {
    // Delete the invite and return existing membership
    await supabase.from('organization_invites').delete().eq('id', invite.id);
    const member = await getMemberByUser(invite.organization_id, userId);
    if (!member) throw new Error('Failed to get member');
    return member;
  }

  // Create membership
  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .insert({
      organization_id: invite.organization_id,
      user_id: userId,
      role: invite.role,
      invited_by: invite.invited_by,
      invited_at: invite.created_at,
      accepted_at: new Date().toISOString(),
      status: 'active',
    })
    .select()
    .single();

  if (memberError) throw memberError;

  // Delete the invite
  await supabase.from('organization_invites').delete().eq('id', invite.id);

  // Log audit event
  await logAuditEvent({
    user_id: userId,
    organization_id: invite.organization_id,
    action: 'member.join',
    resource_type: 'members',
    resource_id: member.id,
    details: { role: invite.role, invited_by: invite.invited_by },
    status: 'success',
  });

  return {
    id: member.id,
    organization_id: member.organization_id,
    user_id: member.user_id,
    role: member.role as OrgRole,
    permissions: member.permissions || {},
    invited_by: member.invited_by,
    invited_at: member.invited_at,
    accepted_at: member.accepted_at,
    status: 'active',
    created_at: member.created_at,
  };
}

/**
 * Get pending invites for an organization
 */
export async function getPendingInvites(
  organizationId: string
): Promise<OrgInvite[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('organization_invites')
    .select('id, organization_id, email, role, invited_by, token, expires_at, created_at')
    .eq('organization_id', organizationId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []) as OrgInvite[];
}

/**
 * Cancel/revoke a pending invite
 */
export async function cancelInvite(
  inviteId: string,
  cancelledBy: string
): Promise<void> {
  const supabase = createServerClient();

  const { data: invite, error: fetchError } = await supabase
    .from('organization_invites')
    .select('organization_id, email')
    .eq('id', inviteId)
    .single();

  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from('organization_invites')
    .delete()
    .eq('id', inviteId);

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: cancelledBy,
    organization_id: invite.organization_id,
    action: 'member.invite',
    resource_type: 'members',
    details: { email: invite.email, action: 'cancelled' },
    status: 'success',
  });
}

// ============================================
// Member Management
// ============================================

/**
 * Update a member's role, status, or permissions
 */
export async function updateMember(
  params: UpdateMemberParams,
  updatedBy: string
): Promise<OrgMember> {
  const supabase = createServerClient();

  // Get current state
  const currentMember = await getMember(params.member_id);
  if (!currentMember) {
    throw new Error('Member not found');
  }

  // Cannot change owner's role
  if (currentMember.role === 'owner' && params.role && params.role !== 'owner') {
    throw new Error('Cannot change the owner role');
  }

  // Build update object
  const updates: Record<string, unknown> = {};
  if (params.role) updates.role = params.role;
  if (params.status) updates.status = params.status;
  if (params.permissions) {
    updates.permissions = {
      ...(currentMember.permissions || {}),
      ...params.permissions,
    };
  }

  if (Object.keys(updates).length === 0) {
    return currentMember;
  }

  const { data, error } = await supabase
    .from('organization_members')
    .update(updates)
    .eq('id', params.member_id)
    .select()
    .single();

  if (error) throw error;

  // Log audit events for role change
  if (params.role && params.role !== currentMember.role) {
    await logAuditEvent({
      user_id: updatedBy,
      organization_id: currentMember.organization_id,
      action: 'member.role_change',
      resource_type: 'members',
      resource_id: params.member_id,
      previous_state: { role: currentMember.role },
      new_state: { role: params.role },
      details: { target_user_id: currentMember.user_id },
      status: 'success',
    });
  }

  // Log audit events for suspension
  if (params.status === 'suspended' && currentMember.status !== 'suspended') {
    await logAuditEvent({
      user_id: updatedBy,
      organization_id: currentMember.organization_id,
      action: 'member.suspend',
      resource_type: 'members',
      resource_id: params.member_id,
      details: { target_user_id: currentMember.user_id },
      status: 'success',
    });
  }

  const updatedMember = await getMember(params.member_id);
  if (!updatedMember) throw new Error('Failed to fetch updated member');

  return updatedMember;
}

/**
 * Remove a member from the organization
 */
export async function removeMember(
  memberId: string,
  removedBy: string
): Promise<void> {
  const supabase = createServerClient();

  // Get member info
  const member = await getMember(memberId);
  if (!member) {
    throw new Error('Member not found');
  }

  // Cannot remove owner
  if (member.role === 'owner') {
    throw new Error('Cannot remove the organization owner');
  }

  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId);

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: removedBy,
    organization_id: member.organization_id,
    action: 'member.remove',
    resource_type: 'members',
    resource_id: memberId,
    previous_state: { role: member.role, user_id: member.user_id },
    details: {
      removed_user_id: member.user_id,
      removed_role: member.role,
      self_removal: removedBy === member.user_id,
    },
    status: 'success',
  });
}

/**
 * Transfer organization ownership to another member
 */
export async function transferOwnership(
  organizationId: string,
  currentOwnerId: string,
  newOwnerId: string
): Promise<void> {
  const supabase = createServerClient();

  // Verify current owner
  const currentOwner = await getMemberByUser(organizationId, currentOwnerId);
  if (!currentOwner || currentOwner.role !== 'owner') {
    throw new Error('Only the current owner can transfer ownership');
  }

  // Verify new owner is a member
  const newOwner = await getMemberByUser(organizationId, newOwnerId);
  if (!newOwner) {
    throw new Error('New owner must be an existing member');
  }

  // Update roles in a transaction-like manner
  // First, demote current owner to admin
  const { error: demoteError } = await supabase
    .from('organization_members')
    .update({ role: 'admin' })
    .eq('id', currentOwner.id);

  if (demoteError) throw demoteError;

  // Then, promote new owner
  const { error: promoteError } = await supabase
    .from('organization_members')
    .update({ role: 'owner' })
    .eq('id', newOwner.id);

  if (promoteError) {
    // Rollback
    await supabase
      .from('organization_members')
      .update({ role: 'owner' })
      .eq('id', currentOwner.id);
    throw promoteError;
  }

  // Log audit events
  await logAuditEvent({
    user_id: currentOwnerId,
    organization_id: organizationId,
    action: 'member.role_change',
    resource_type: 'members',
    details: {
      action: 'ownership_transfer',
      from_user_id: currentOwnerId,
      to_user_id: newOwnerId,
    },
    status: 'success',
  });
}

// ============================================
// Member Statistics
// ============================================

/**
 * Get member activity statistics
 */
export async function getMemberActivity(
  memberId: string,
  startDate?: Date
): Promise<{
  api_calls: number;
  memories_created: number;
  last_active: string | null;
}> {
  const supabase = createServerClient();

  const member = await getMember(memberId);
  if (!member) {
    throw new Error('Member not found');
  }

  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [apiCalls, memories] = await Promise.all([
    supabase
      .from('usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', member.user_id)
      .eq('organization_id', member.organization_id)
      .gte('created_at', start.toISOString()),
    supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', member.user_id)
      .eq('organization_id', member.organization_id)
      .gte('created_at', start.toISOString()),
  ]);

  // Get last activity
  const { data: lastActivity } = await supabase
    .from('usage_logs')
    .select('created_at')
    .eq('user_id', member.user_id)
    .eq('organization_id', member.organization_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return {
    api_calls: apiCalls.count || 0,
    memories_created: memories.count || 0,
    last_active: lastActivity?.created_at || null,
  };
}
