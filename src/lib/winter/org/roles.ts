/**
 * Seizn Winter - Role & Permission Management
 *
 * RBAC (Role-Based Access Control) implementation:
 * - Role definitions with default permissions
 * - Permission checking
 * - Custom role support
 */

import { createServerClient } from '@/lib/supabase';
import type {
  OrgRole,
  TeamRole,
  RoleDefinition,
  Permission,
  ResourceType,
  ActionType,
  PermissionCheck,
  PermissionOverrides,
  OrgMember,
} from './types';
import { getMemberByUser } from './members';

// ============================================
// Default Role Definitions
// ============================================

/**
 * Default permissions for organization roles
 */
export const DEFAULT_ORG_ROLES: Record<OrgRole, RoleDefinition> = {
  owner: {
    role: 'owner',
    name: 'Owner',
    description: 'Full access to all resources. Can transfer ownership and delete organization.',
    permissions: [
      { resource: 'memories', actions: ['create', 'read', 'update', 'delete', 'admin', 'export', 'import'] },
      { resource: 'collections', actions: ['create', 'read', 'update', 'delete', 'admin'] },
      { resource: 'documents', actions: ['create', 'read', 'update', 'delete', 'admin', 'export', 'import'] },
      { resource: 'api_keys', actions: ['create', 'read', 'update', 'delete', 'admin'] },
      { resource: 'webhooks', actions: ['create', 'read', 'update', 'delete', 'admin'] },
      { resource: 'settings', actions: ['read', 'update', 'admin'] },
      { resource: 'members', actions: ['create', 'read', 'update', 'delete', 'admin'] },
      { resource: 'teams', actions: ['create', 'read', 'update', 'delete', 'admin'] },
      { resource: 'policies', actions: ['create', 'read', 'update', 'delete', 'admin'] },
      { resource: 'audit_logs', actions: ['read', 'export'] },
      { resource: 'reports', actions: ['create', 'read', 'export'] },
      { resource: 'billing', actions: ['read', 'update', 'admin'] },
    ],
  },
  admin: {
    role: 'admin',
    name: 'Admin',
    description: 'Can manage members, settings, and all resources except billing and ownership.',
    permissions: [
      { resource: 'memories', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
      { resource: 'collections', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'documents', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
      { resource: 'api_keys', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'webhooks', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'settings', actions: ['read', 'update'] },
      { resource: 'members', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'teams', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'policies', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'audit_logs', actions: ['read', 'export'] },
      { resource: 'reports', actions: ['create', 'read', 'export'] },
      { resource: 'billing', actions: ['read'] },
    ],
  },
  member: {
    role: 'member',
    name: 'Member',
    description: 'Can use all features and manage own resources.',
    permissions: [
      { resource: 'memories', actions: ['create', 'read', 'update', 'delete', 'export'] },
      { resource: 'collections', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'documents', actions: ['create', 'read', 'update', 'delete', 'export'] },
      { resource: 'api_keys', actions: ['create', 'read', 'delete'] }, // Own keys only
      { resource: 'webhooks', actions: ['create', 'read', 'delete'] }, // Own webhooks only
      { resource: 'settings', actions: ['read'] },
      { resource: 'members', actions: ['read'] },
      { resource: 'teams', actions: ['read'] },
      { resource: 'policies', actions: ['read'] },
      { resource: 'audit_logs', actions: ['read'] }, // Own logs only
      { resource: 'reports', actions: ['read'] },
      { resource: 'billing', actions: [] },
    ],
  },
  viewer: {
    role: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to resources.',
    permissions: [
      { resource: 'memories', actions: ['read'] },
      { resource: 'collections', actions: ['read'] },
      { resource: 'documents', actions: ['read'] },
      { resource: 'api_keys', actions: [] },
      { resource: 'webhooks', actions: [] },
      { resource: 'settings', actions: ['read'] },
      { resource: 'members', actions: ['read'] },
      { resource: 'teams', actions: ['read'] },
      { resource: 'policies', actions: ['read'] },
      { resource: 'audit_logs', actions: [] },
      { resource: 'reports', actions: ['read'] },
      { resource: 'billing', actions: [] },
    ],
  },
};

/**
 * Default permissions for team roles
 */
export const DEFAULT_TEAM_ROLES: Record<TeamRole, RoleDefinition> = {
  lead: {
    role: 'lead',
    name: 'Team Lead',
    description: 'Can manage team members and resources.',
    permissions: [
      { resource: 'memories', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'collections', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'documents', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'members', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'settings', actions: ['read', 'update'] },
    ],
  },
  member: {
    role: 'member',
    name: 'Team Member',
    description: 'Can contribute to team resources.',
    permissions: [
      { resource: 'memories', actions: ['create', 'read', 'update'] },
      { resource: 'collections', actions: ['create', 'read', 'update'] },
      { resource: 'documents', actions: ['create', 'read', 'update'] },
      { resource: 'members', actions: ['read'] },
      { resource: 'settings', actions: ['read'] },
    ],
  },
  viewer: {
    role: 'viewer',
    name: 'Team Viewer',
    description: 'Read-only access to team resources.',
    permissions: [
      { resource: 'memories', actions: ['read'] },
      { resource: 'collections', actions: ['read'] },
      { resource: 'documents', actions: ['read'] },
      { resource: 'members', actions: ['read'] },
      { resource: 'settings', actions: ['read'] },
    ],
  },
};

// ============================================
// Permission Checking
// ============================================

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: OrgRole | TeamRole): Permission[] {
  if (role in DEFAULT_ORG_ROLES) {
    return DEFAULT_ORG_ROLES[role as OrgRole].permissions;
  }
  if (role in DEFAULT_TEAM_ROLES) {
    return DEFAULT_TEAM_ROLES[role as TeamRole].permissions;
  }
  return [];
}

/**
 * Get effective permissions for a member (role + overrides)
 */
export function getEffectivePermissions(
  role: OrgRole,
  overrides?: PermissionOverrides
): Permission[] {
  const basePermissions = getRolePermissions(role);

  if (!overrides) {
    return basePermissions;
  }

  // Clone permissions map for modification
  const permMap = new Map<ResourceType, Set<ActionType>>();

  for (const perm of basePermissions) {
    permMap.set(perm.resource, new Set(perm.actions));
  }

  // Apply grants
  if (overrides.grant) {
    for (const grant of overrides.grant) {
      const existing = permMap.get(grant.resource) || new Set();
      for (const action of grant.actions) {
        existing.add(action);
      }
      permMap.set(grant.resource, existing);
    }
  }

  // Apply denials
  if (overrides.deny) {
    for (const deny of overrides.deny) {
      const existing = permMap.get(deny.resource);
      if (existing) {
        for (const action of deny.actions) {
          existing.delete(action);
        }
      }
    }
  }

  // Convert back to Permission array
  const result: Permission[] = [];
  for (const [resource, actions] of permMap.entries()) {
    if (actions.size > 0) {
      result.push({ resource, actions: Array.from(actions) });
    }
  }

  return result;
}

/**
 * Check if permissions include a specific action on a resource
 */
export function hasPermission(
  permissions: Permission[],
  check: PermissionCheck
): boolean {
  const resourcePerm = permissions.find((p) => p.resource === check.resource);
  if (!resourcePerm) return false;

  return resourcePerm.actions.includes(check.action);
}

/**
 * Check if a member has permission for an action
 */
export function checkMemberPermission(
  member: OrgMember,
  check: PermissionCheck
): boolean {
  const permissions = getEffectivePermissions(
    member.role,
    member.permissions as PermissionOverrides
  );
  return hasPermission(permissions, check);
}

/**
 * Check if a user has permission in an organization
 */
export async function checkUserPermission(
  organizationId: string,
  userId: string,
  check: PermissionCheck
): Promise<boolean> {
  const member = await getMemberByUser(organizationId, userId);

  if (!member) {
    return false;
  }

  if (member.status !== 'active') {
    return false;
  }

  return checkMemberPermission(member, check);
}

/**
 * Require permission or throw an error
 */
export async function requirePermission(
  organizationId: string,
  userId: string,
  check: PermissionCheck
): Promise<void> {
  const hasAccess = await checkUserPermission(organizationId, userId, check);

  if (!hasAccess) {
    throw new Error(
      `Permission denied: ${check.action} on ${check.resource}`
    );
  }
}

// ============================================
// Role Hierarchy
// ============================================

const ROLE_HIERARCHY: Record<OrgRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

/**
 * Check if role1 is higher than or equal to role2
 */
export function isRoleHigherOrEqual(role1: OrgRole, role2: OrgRole): boolean {
  return ROLE_HIERARCHY[role1] >= ROLE_HIERARCHY[role2];
}

/**
 * Check if a user can manage another user based on role hierarchy
 */
export function canManageRole(managerRole: OrgRole, targetRole: OrgRole): boolean {
  // Owner can manage anyone except themselves
  if (managerRole === 'owner') return targetRole !== 'owner';

  // Admin can manage members and viewers
  if (managerRole === 'admin') return ROLE_HIERARCHY[targetRole] < ROLE_HIERARCHY.admin;

  // Others cannot manage
  return false;
}

// ============================================
// Custom Role Management
// ============================================

export interface CustomRole {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  base_role: OrgRole;
  permissions: Permission[];
  created_at: string;
  updated_at: string;
}

/**
 * Create a custom role for an organization
 */
export async function createCustomRole(params: {
  organization_id: string;
  name: string;
  description?: string;
  base_role: OrgRole;
  permissions: Permission[];
}): Promise<CustomRole> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_org_custom_roles')
    .insert({
      organization_id: params.organization_id,
      name: params.name,
      description: params.description,
      base_role: params.base_role,
      permissions: params.permissions,
    })
    .select()
    .single();

  if (error) throw error;

  return data as CustomRole;
}

/**
 * Get custom roles for an organization
 */
export async function getCustomRoles(organizationId: string): Promise<CustomRole[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_org_custom_roles')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name');

  if (error) {
    // Table might not exist yet
    if (error.code === '42P01') return [];
    throw error;
  }

  return (data || []) as CustomRole[];
}

/**
 * Update a custom role
 */
export async function updateCustomRole(
  roleId: string,
  updates: {
    name?: string;
    description?: string;
    permissions?: Permission[];
  }
): Promise<CustomRole> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_org_custom_roles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', roleId)
    .select()
    .single();

  if (error) throw error;

  return data as CustomRole;
}

/**
 * Delete a custom role
 */
export async function deleteCustomRole(roleId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('winter_org_custom_roles')
    .delete()
    .eq('id', roleId);

  if (error) throw error;
}

// ============================================
// Permission Templates
// ============================================

/**
 * Get a read-only permission set for a resource
 */
export function getReadOnlyPermissions(resources: ResourceType[]): Permission[] {
  return resources.map((resource) => ({
    resource,
    actions: ['read'] as ActionType[],
  }));
}

/**
 * Get full access permissions for a resource
 */
export function getFullAccessPermissions(resources: ResourceType[]): Permission[] {
  return resources.map((resource) => ({
    resource,
    actions: ['create', 'read', 'update', 'delete'] as ActionType[],
  }));
}

/**
 * Create a permission override to grant additional access
 */
export function grantPermission(
  resource: ResourceType,
  actions: ActionType[]
): PermissionOverrides {
  return {
    grant: [{ resource, actions }],
  };
}

/**
 * Create a permission override to deny access
 */
export function denyPermission(
  resource: ResourceType,
  actions: ActionType[]
): PermissionOverrides {
  return {
    deny: [{ resource, actions }],
  };
}

// ============================================
// Role Utilities
// ============================================

/**
 * Get all available organization roles
 */
export function getAllOrgRoles(): RoleDefinition[] {
  return Object.values(DEFAULT_ORG_ROLES);
}

/**
 * Get all available team roles
 */
export function getAllTeamRoles(): RoleDefinition[] {
  return Object.values(DEFAULT_TEAM_ROLES);
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: OrgRole | TeamRole): string {
  if (role in DEFAULT_ORG_ROLES) {
    return DEFAULT_ORG_ROLES[role as OrgRole].name;
  }
  if (role in DEFAULT_TEAM_ROLES) {
    return DEFAULT_TEAM_ROLES[role as TeamRole].name;
  }
  return role;
}

/**
 * Get role description
 */
export function getRoleDescription(role: OrgRole | TeamRole): string {
  if (role in DEFAULT_ORG_ROLES) {
    return DEFAULT_ORG_ROLES[role as OrgRole].description;
  }
  if (role in DEFAULT_TEAM_ROLES) {
    return DEFAULT_TEAM_ROLES[role as TeamRole].description;
  }
  return '';
}
