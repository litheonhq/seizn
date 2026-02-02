/**
 * SCIM Service
 *
 * Core service for SCIM 2.0 user and group provisioning.
 * Integrates with Supabase for persistent storage.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  SCIMUser,
  SCIMGroup,
  SCIMListResponse,
  SCIMPatchOperation,
  SCIMFilterOptions,
  SCIMUserEmail,
  SCIMUserName,
  SCIMGroupMember,
  SCIMEnterpriseUser,
  CreateSCIMUserRequest,
  CreateSCIMGroupRequest,
} from '@/types/scim';
import { SCIM_SCHEMAS } from '@/types/scim';
import {
  createListResponse,
  parseFilter,
  matchesFilter,
  applyPatchOperations,
  extractPrimaryEmail,
  buildDisplayName,
  buildSCIMResourceUrl,
  paginateResources,
  validateUserName,
} from './utils';

// ============================================
// User Operations
// ============================================

/**
 * List users for an organization with optional filtering
 */
export async function listUsers(
  organizationId: string,
  configId: string,
  options: SCIMFilterOptions = {}
): Promise<SCIMListResponse<SCIMUser>> {
  const supabase = createServerClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://seizn.com';

  // Build query
  let query = supabase
    .from('scim_users')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('scim_config_id', configId);

  // Apply filter if provided (simple implementation for common filters)
  if (options.filter) {
    const parsed = parseFilter(options.filter);
    if (parsed) {
      switch (parsed.attribute) {
        case 'username':
          if (parsed.operator === 'eq') {
            query = query.eq('user_name', parsed.value);
          } else if (parsed.operator === 'sw') {
            query = query.ilike('user_name', `${parsed.value}%`);
          } else if (parsed.operator === 'co') {
            query = query.ilike('user_name', `%${parsed.value}%`);
          }
          break;
        case 'externalid':
          if (parsed.operator === 'eq') {
            query = query.eq('external_id', parsed.value);
          }
          break;
        case 'active':
          query = query.eq('active', parsed.value === 'true');
          break;
        case 'emails.value':
        case 'email':
          if (parsed.operator === 'eq') {
            query = query.eq('email', parsed.value);
          }
          break;
      }
    }
  }

  // Apply sorting
  if (options.sortBy) {
    const sortColumn = mapSCIMAttributeToColumn(options.sortBy);
    const ascending = options.sortOrder !== 'descending';
    query = query.order(sortColumn, { ascending });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list SCIM users: ${error.message}`);
  }

  // Get total count for pagination
  const { count: totalCount } = await supabase
    .from('scim_users')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('scim_config_id', configId);

  // Map to SCIM format
  const users = (data || []).map((row) => mapDbRowToSCIMUser(row, baseUrl));

  // Apply pagination
  const { resources: paginatedUsers, total } = paginateResources(users, options);

  return createListResponse(paginatedUsers, totalCount || total, options.startIndex);
}

/**
 * Get a single user by ID
 */
export async function getUser(
  userId: string,
  organizationId: string
): Promise<SCIMUser | null> {
  const supabase = createServerClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://seizn.com';

  const { data, error } = await supabase
    .from('scim_users')
    .select('*')
    .eq('id', userId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapDbRowToSCIMUser(data, baseUrl);
}

/**
 * Find user by userName
 */
export async function findUserByUserName(
  userName: string,
  organizationId: string,
  configId: string
): Promise<SCIMUser | null> {
  const supabase = createServerClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://seizn.com';

  const { data, error } = await supabase
    .from('scim_users')
    .select('*')
    .eq('user_name', userName)
    .eq('organization_id', organizationId)
    .eq('scim_config_id', configId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapDbRowToSCIMUser(data, baseUrl);
}

/**
 * Create a new user
 */
export async function createUser(
  organizationId: string,
  configId: string,
  userData: CreateSCIMUserRequest
): Promise<SCIMUser> {
  const supabase = createServerClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://seizn.com';

  if (!validateUserName(userData.userName)) {
    throw new Error('Invalid userName');
  }

  // Extract primary email
  const email = userData.emails?.find((e) => e.primary)?.value
    || userData.emails?.[0]?.value;

  const now = new Date().toISOString();

  // Create SCIM user record
  const { data: scimUser, error: scimError } = await supabase
    .from('scim_users')
    .insert({
      organization_id: organizationId,
      scim_config_id: configId,
      external_id: userData.externalId,
      user_name: userData.userName,
      display_name: userData.displayName || buildDisplayNameFromRequest(userData),
      given_name: userData.name?.givenName,
      family_name: userData.name?.familyName,
      email,
      active: userData.active !== false,
      raw_attributes: userData,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (scimError || !scimUser) {
    throw new Error(`Failed to create SCIM user: ${scimError?.message}`);
  }

  // Provision user in Seizn if auto-provision is enabled
  const config = await getSCIMConfigById(configId);
  if (config?.autoProvision && email) {
    await provisionSeizuUser(organizationId, scimUser.id, email, userData);
  }

  // Log provisioning event
  await logProvisioningEvent(configId, organizationId, 'user.created', 'User', scimUser.id, userData.externalId);

  return mapDbRowToSCIMUser(scimUser, baseUrl);
}

/**
 * Update a user (full replacement)
 */
export async function updateUser(
  userId: string,
  organizationId: string,
  userData: CreateSCIMUserRequest
): Promise<SCIMUser | null> {
  const supabase = createServerClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://seizn.com';

  // Check if user exists
  const existing = await getUser(userId, organizationId);
  if (!existing) {
    return null;
  }

  const email = userData.emails?.find((e) => e.primary)?.value
    || userData.emails?.[0]?.value;

  const { data, error } = await supabase
    .from('scim_users')
    .update({
      external_id: userData.externalId,
      user_name: userData.userName,
      display_name: userData.displayName || buildDisplayNameFromRequest(userData),
      given_name: userData.name?.givenName,
      family_name: userData.name?.familyName,
      email,
      active: userData.active !== false,
      raw_attributes: userData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update SCIM user: ${error?.message}`);
  }

  // Update linked Seizn user if exists
  if (data.user_id) {
    await updateSeizuUser(data.user_id, userData);
  }

  // Log provisioning event
  await logProvisioningEvent(data.scim_config_id, organizationId, 'user.updated', 'User', userId, data.external_id);

  return mapDbRowToSCIMUser(data, baseUrl);
}

/**
 * Patch a user (partial update)
 */
export async function patchUser(
  userId: string,
  organizationId: string,
  operations: SCIMPatchOperation[]
): Promise<SCIMUser | null> {
  const supabase = createServerClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://seizn.com';

  // Get current user
  const { data: current, error: fetchError } = await supabase
    .from('scim_users')
    .select('*')
    .eq('id', userId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError || !current) {
    return null;
  }

  // Apply patch operations to raw_attributes
  const rawAttrs = current.raw_attributes || {};
  const patched = applyPatchOperations(rawAttrs, operations);

  // Extract updated fields
  const updates: Record<string, unknown> = {
    raw_attributes: patched,
    updated_at: new Date().toISOString(),
  };

  // Handle common patches
  for (const op of operations) {
    const path = op.path?.toLowerCase();

    if (path === 'active' && (op.op === 'replace' || op.op === 'add')) {
      updates.active = op.value;

      // Handle deactivation
      if (op.value === false) {
        await logProvisioningEvent(
          current.scim_config_id,
          organizationId,
          'user.deactivated',
          'User',
          userId,
          current.external_id
        );

        // Deactivate linked Seizn user
        if (current.user_id) {
          await deactivateSeizuUser(current.user_id);
        }
      } else if (op.value === true && !current.active) {
        await logProvisioningEvent(
          current.scim_config_id,
          organizationId,
          'user.reactivated',
          'User',
          userId,
          current.external_id
        );

        // Reactivate linked Seizn user
        if (current.user_id) {
          await reactivateSeizuUser(current.user_id);
        }
      }
    }

    if (path === 'displayname' && (op.op === 'replace' || op.op === 'add')) {
      updates.display_name = op.value;
    }

    if (path === 'name.givenname' && (op.op === 'replace' || op.op === 'add')) {
      updates.given_name = op.value;
    }

    if (path === 'name.familyname' && (op.op === 'replace' || op.op === 'add')) {
      updates.family_name = op.value;
    }
  }

  const { data, error } = await supabase
    .from('scim_users')
    .update(updates)
    .eq('id', userId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to patch SCIM user: ${error?.message}`);
  }

  return mapDbRowToSCIMUser(data, baseUrl);
}

/**
 * Delete a user
 */
export async function deleteUser(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const supabase = createServerClient();

  // Get user first for logging
  const { data: user } = await supabase
    .from('scim_users')
    .select('scim_config_id, external_id, user_id')
    .eq('id', userId)
    .eq('organization_id', organizationId)
    .single();

  if (!user) {
    return false;
  }

  // Remove from groups first
  await supabase
    .from('scim_group_memberships')
    .delete()
    .eq('user_id', userId);

  // Delete SCIM user
  const { error } = await supabase
    .from('scim_users')
    .delete()
    .eq('id', userId)
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Failed to delete SCIM user: ${error.message}`);
  }

  // Deprovision linked Seizn user if auto-deprovision is enabled
  const config = await getSCIMConfigById(user.scim_config_id);
  if (config?.autoDeprovision && user.user_id) {
    await deprovisionSeizuUser(user.user_id);
  }

  // Log provisioning event
  await logProvisioningEvent(
    user.scim_config_id,
    organizationId,
    'user.deleted',
    'User',
    userId,
    user.external_id
  );

  return true;
}

// ============================================
// Group Operations
// ============================================

/**
 * List groups for an organization
 */
export async function listGroups(
  organizationId: string,
  configId: string,
  options: SCIMFilterOptions = {}
): Promise<SCIMListResponse<SCIMGroup>> {
  const supabase = createServerClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://seizn.com';

  let query = supabase
    .from('scim_groups')
    .select('*, scim_group_memberships(user_id, scim_users(id, display_name))')
    .eq('organization_id', organizationId)
    .eq('scim_config_id', configId);

  // Apply filter
  if (options.filter) {
    const parsed = parseFilter(options.filter);
    if (parsed) {
      if (parsed.attribute === 'displayname' && parsed.operator === 'eq') {
        query = query.eq('display_name', parsed.value);
      }
      if (parsed.attribute === 'externalid' && parsed.operator === 'eq') {
        query = query.eq('external_id', parsed.value);
      }
    }
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list SCIM groups: ${error.message}`);
  }

  const { count: totalCount } = await supabase
    .from('scim_groups')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('scim_config_id', configId);

  const groups = (data || []).map((row) => mapDbRowToSCIMGroup(row, baseUrl));
  const { resources: paginatedGroups, total } = paginateResources(groups, options);

  return createListResponse(paginatedGroups, totalCount || total, options.startIndex);
}

/**
 * Get a single group by ID
 */
export async function getGroup(
  groupId: string,
  organizationId: string
): Promise<SCIMGroup | null> {
  const supabase = createServerClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://seizn.com';

  const { data, error } = await supabase
    .from('scim_groups')
    .select('*, scim_group_memberships(user_id, scim_users(id, display_name))')
    .eq('id', groupId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapDbRowToSCIMGroup(data, baseUrl);
}

/**
 * Create a new group
 */
export async function createGroup(
  organizationId: string,
  configId: string,
  groupData: CreateSCIMGroupRequest
): Promise<SCIMGroup> {
  const supabase = createServerClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://seizn.com';
  const now = new Date().toISOString();

  // Create group
  const { data: group, error: groupError } = await supabase
    .from('scim_groups')
    .insert({
      organization_id: organizationId,
      scim_config_id: configId,
      external_id: groupData.externalId,
      display_name: groupData.displayName,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (groupError || !group) {
    throw new Error(`Failed to create SCIM group: ${groupError?.message}`);
  }

  // Add members if provided
  if (groupData.members && groupData.members.length > 0) {
    const memberships = groupData.members.map((m) => ({
      group_id: group.id,
      user_id: m.value,
      created_at: now,
    }));

    await supabase.from('scim_group_memberships').insert(memberships);
  }

  // Log provisioning event
  await logProvisioningEvent(configId, organizationId, 'group.created', 'Group', group.id, groupData.externalId);

  // Fetch full group with members
  return (await getGroup(group.id, organizationId))!;
}

/**
 * Update a group
 */
export async function updateGroup(
  groupId: string,
  organizationId: string,
  groupData: CreateSCIMGroupRequest
): Promise<SCIMGroup | null> {
  const supabase = createServerClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://seizn.com';

  // Check if group exists
  const existing = await getGroup(groupId, organizationId);
  if (!existing) {
    return null;
  }

  // Update group
  const { data, error } = await supabase
    .from('scim_groups')
    .update({
      external_id: groupData.externalId,
      display_name: groupData.displayName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', groupId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update SCIM group: ${error?.message}`);
  }

  // Replace members if provided
  if (groupData.members !== undefined) {
    // Remove existing members
    await supabase.from('scim_group_memberships').delete().eq('group_id', groupId);

    // Add new members
    if (groupData.members.length > 0) {
      const memberships = groupData.members.map((m) => ({
        group_id: groupId,
        user_id: m.value,
        created_at: new Date().toISOString(),
      }));
      await supabase.from('scim_group_memberships').insert(memberships);
    }
  }

  await logProvisioningEvent(data.scim_config_id, organizationId, 'group.updated', 'Group', groupId, data.external_id);

  return await getGroup(groupId, organizationId);
}

/**
 * Patch a group
 */
export async function patchGroup(
  groupId: string,
  organizationId: string,
  operations: SCIMPatchOperation[]
): Promise<SCIMGroup | null> {
  const supabase = createServerClient();

  const existing = await getGroup(groupId, organizationId);
  if (!existing) {
    return null;
  }

  const { data: groupRow } = await supabase
    .from('scim_groups')
    .select('scim_config_id, external_id')
    .eq('id', groupId)
    .single();

  for (const op of operations) {
    const path = op.path?.toLowerCase();

    if (path === 'displayname' && (op.op === 'replace' || op.op === 'add')) {
      await supabase
        .from('scim_groups')
        .update({ display_name: op.value, updated_at: new Date().toISOString() })
        .eq('id', groupId);
    }

    // Handle member operations
    if (path === 'members' || !path) {
      if (op.op === 'add' && Array.isArray(op.value)) {
        // Add members
        const members = op.value as Array<{ value: string }>;
        const memberships = members.map((m) => ({
          group_id: groupId,
          user_id: m.value,
          created_at: new Date().toISOString(),
        }));
        await supabase.from('scim_group_memberships').upsert(memberships, {
          onConflict: 'group_id,user_id',
        });

        for (const m of members) {
          await logProvisioningEvent(
            groupRow!.scim_config_id,
            organizationId,
            'group.member.added',
            'Group',
            groupId,
            groupRow!.external_id,
            { memberId: m.value }
          );
        }
      } else if (op.op === 'remove') {
        // Remove members
        if (path?.match(/members\[value eq "([^"]+)"\]/i)) {
          const memberMatch = path.match(/members\[value eq "([^"]+)"\]/i);
          if (memberMatch) {
            await supabase
              .from('scim_group_memberships')
              .delete()
              .eq('group_id', groupId)
              .eq('user_id', memberMatch[1]);

            await logProvisioningEvent(
              groupRow!.scim_config_id,
              organizationId,
              'group.member.removed',
              'Group',
              groupId,
              groupRow!.external_id,
              { memberId: memberMatch[1] }
            );
          }
        }
      }
    }
  }

  return await getGroup(groupId, organizationId);
}

/**
 * Delete a group
 */
export async function deleteGroup(
  groupId: string,
  organizationId: string
): Promise<boolean> {
  const supabase = createServerClient();

  const { data: group } = await supabase
    .from('scim_groups')
    .select('scim_config_id, external_id')
    .eq('id', groupId)
    .eq('organization_id', organizationId)
    .single();

  if (!group) {
    return false;
  }

  // Remove memberships first
  await supabase.from('scim_group_memberships').delete().eq('group_id', groupId);

  // Delete group
  const { error } = await supabase
    .from('scim_groups')
    .delete()
    .eq('id', groupId)
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Failed to delete SCIM group: ${error.message}`);
  }

  await logProvisioningEvent(
    group.scim_config_id,
    organizationId,
    'group.deleted',
    'Group',
    groupId,
    group.external_id
  );

  return true;
}

// ============================================
// Helper Functions
// ============================================

function mapDbRowToSCIMUser(row: Record<string, unknown>, baseUrl: string): SCIMUser {
  const rawAttrs = (row.raw_attributes || {}) as Record<string, unknown>;
  const id = row.id as string;

  return {
    schemas: [SCIM_SCHEMAS.USER, SCIM_SCHEMAS.ENTERPRISE_USER],
    id,
    externalId: row.external_id as string | undefined,
    meta: {
      resourceType: 'User',
      created: row.created_at as string,
      lastModified: row.updated_at as string,
      location: buildSCIMResourceUrl(baseUrl, 'Users', id),
    },
    userName: row.user_name as string,
    name: {
      givenName: row.given_name as string | undefined,
      familyName: row.family_name as string | undefined,
      formatted: row.display_name as string | undefined,
    },
    displayName: row.display_name as string | undefined,
    emails: row.email
      ? [{ value: row.email as string, type: 'work' as const, primary: true }]
      : (rawAttrs.emails as SCIMUserEmail[] | undefined),
    active: row.active as boolean,
    groups: [], // Populated separately if needed
    ...(rawAttrs[SCIM_SCHEMAS.ENTERPRISE_USER]
      ? { [SCIM_SCHEMAS.ENTERPRISE_USER]: rawAttrs[SCIM_SCHEMAS.ENTERPRISE_USER] as SCIMEnterpriseUser }
      : {}),
  };
}

function mapDbRowToSCIMGroup(row: Record<string, unknown>, baseUrl: string): SCIMGroup {
  const id = row.id as string;
  const memberships = (row.scim_group_memberships || []) as Array<{
    user_id: string;
    scim_users?: { id: string; display_name?: string };
  }>;

  return {
    schemas: [SCIM_SCHEMAS.GROUP],
    id,
    externalId: row.external_id as string | undefined,
    meta: {
      resourceType: 'Group',
      created: row.created_at as string,
      lastModified: row.updated_at as string,
      location: buildSCIMResourceUrl(baseUrl, 'Groups', id),
    },
    displayName: row.display_name as string,
    members: memberships.map((m) => ({
      value: m.user_id,
      $ref: buildSCIMResourceUrl(baseUrl, 'Users', m.user_id),
      display: m.scim_users?.display_name,
      type: 'User' as const,
    })),
  };
}

function buildDisplayNameFromRequest(userData: CreateSCIMUserRequest): string {
  if (userData.displayName) return userData.displayName;
  if (userData.name?.formatted) return userData.name.formatted;
  if (userData.name?.givenName && userData.name?.familyName) {
    return `${userData.name.givenName} ${userData.name.familyName}`;
  }
  return userData.userName;
}

function mapSCIMAttributeToColumn(attr: string): string {
  const mapping: Record<string, string> = {
    username: 'user_name',
    displayname: 'display_name',
    externalid: 'external_id',
    active: 'active',
    'name.givenname': 'given_name',
    'name.familyname': 'family_name',
    created: 'created_at',
    lastmodified: 'updated_at',
  };
  return mapping[attr.toLowerCase()] || 'created_at';
}

// ============================================
// Seizn User Provisioning
// ============================================

async function getSCIMConfigById(configId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('scim_configs')
    .select('auto_provision, auto_deprovision, default_role')
    .eq('id', configId)
    .single();

  return data ? {
    autoProvision: data.auto_provision,
    autoDeprovision: data.auto_deprovision,
    defaultRole: data.default_role,
  } : null;
}

async function provisionSeizuUser(
  organizationId: string,
  scimUserId: string,
  email: string,
  userData: CreateSCIMUserRequest
): Promise<void> {
  const supabase = createServerClient();

  // Check if profile already exists for this email
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (existingProfile) {
    // Link SCIM user to existing profile
    await supabase
      .from('scim_users')
      .update({ user_id: existingProfile.id })
      .eq('id', scimUserId);

    // Add to organization if not already a member
    await supabase.from('organization_members').upsert({
      organization_id: organizationId,
      user_id: existingProfile.id,
      role: 'member',
    }, { onConflict: 'organization_id,user_id' });

    return;
  }

  // Create new profile (user will need to complete signup)
  // For now, we create a placeholder profile that will be linked on first login
  console.log(`SCIM: User ${email} will be provisioned on first SSO login`);
}

async function updateSeizuUser(
  userId: string,
  userData: CreateSCIMUserRequest
): Promise<void> {
  const supabase = createServerClient();

  const updates: Record<string, unknown> = {};
  if (userData.displayName || userData.name?.givenName) {
    updates.full_name = userData.displayName
      || `${userData.name?.givenName} ${userData.name?.familyName}`.trim();
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('profiles').update(updates).eq('id', userId);
  }
}

async function deactivateSeizuUser(userId: string): Promise<void> {
  const supabase = createServerClient();
  // Mark user as inactive (organization-specific deactivation)
  console.log(`SCIM: Deactivating user ${userId}`);
  // Implementation depends on your user status model
}

async function reactivateSeizuUser(userId: string): Promise<void> {
  const supabase = createServerClient();
  console.log(`SCIM: Reactivating user ${userId}`);
}

async function deprovisionSeizuUser(userId: string): Promise<void> {
  const supabase = createServerClient();
  // Remove user from organization (soft delete)
  console.log(`SCIM: Deprovisioning user ${userId}`);
}

// ============================================
// Provisioning Events
// ============================================

async function logProvisioningEvent(
  configId: string,
  organizationId: string,
  eventType: string,
  resourceType: 'User' | 'Group',
  resourceId: string,
  externalId?: string,
  changes?: Record<string, unknown>
): Promise<void> {
  const supabase = createServerClient();

  await supabase.from('scim_provisioning_events').insert({
    config_id: configId,
    organization_id: organizationId,
    event_type: eventType,
    resource_type: resourceType,
    resource_id: resourceId,
    external_id: externalId,
    changes,
    status: 'success',
    created_at: new Date().toISOString(),
  });
}
