/**
 * RBAC Permission Checking Utilities
 *
 * Provides functions to check user permissions within teams/organizations.
 */

import { createServerClient } from '@/lib/supabase';
import {
  TeamRole,
  Permission,
  RolePermissions,
  PermissionCheckResult,
  isRoleAtLeast,
} from './types';

/**
 * Error thrown when user lacks required permission
 */
export class PermissionDeniedError extends Error {
  public readonly code = 'PERMISSION_DENIED';
  public readonly status = 403;
  public readonly permission: Permission;
  public readonly teamId: string;
  public readonly userId: string;

  constructor(
    permission: Permission,
    teamId: string,
    userId: string,
    userRole?: TeamRole
  ) {
    const roleInfo = userRole ? ` (current role: ${userRole})` : '';
    super(`Permission denied: ${permission} for team ${teamId}${roleInfo}`);
    this.name = 'PermissionDeniedError';
    this.permission = permission;
    this.teamId = teamId;
    this.userId = userId;
  }
}

/**
 * Error thrown when user is not a member of the team
 */
export class NotTeamMemberError extends Error {
  public readonly code = 'NOT_TEAM_MEMBER';
  public readonly status = 403;
  public readonly teamId: string;
  public readonly userId: string;

  constructor(teamId: string, userId: string) {
    super(`User ${userId} is not a member of team ${teamId}`);
    this.name = 'NotTeamMemberError';
    this.teamId = teamId;
    this.userId = userId;
  }
}

/**
 * Get user's role in a team
 *
 * @param userId - The user ID to check
 * @param teamId - The team/organization ID
 * @returns The user's role or null if not a member
 */
export async function getUserRole(
  userId: string,
  teamId: string
): Promise<TeamRole | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('organization_members')
    .select('role, permissions')
    .eq('organization_id', teamId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.role as TeamRole;
}

/**
 * Get user's membership info including custom permissions
 */
export async function getUserMembership(
  userId: string,
  teamId: string
): Promise<{
  role: TeamRole;
  customPermissions: Record<string, boolean>;
} | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('organization_members')
    .select('role, permissions')
    .eq('organization_id', teamId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    role: data.role as TeamRole,
    customPermissions: (data.permissions as Record<string, boolean>) || {},
  };
}

/**
 * Check if a user has a specific permission in a team
 *
 * @param userId - The user ID to check
 * @param teamId - The team/organization ID
 * @param permission - The permission to check
 * @returns PermissionCheckResult with allowed status and context
 */
export async function hasPermission(
  userId: string,
  teamId: string,
  permission: Permission
): Promise<PermissionCheckResult> {
  const membership = await getUserMembership(userId, teamId);

  if (!membership) {
    return {
      allowed: false,
      reason: 'User is not a member of this team',
    };
  }

  const { role, customPermissions } = membership;

  // Check for custom permission override first
  if (permission in customPermissions) {
    return {
      allowed: customPermissions[permission],
      role,
      reason: customPermissions[permission]
        ? 'Granted by custom permission'
        : 'Denied by custom permission',
    };
  }

  // Check role-based permissions
  const rolePermissions = RolePermissions[role];
  const allowed = rolePermissions.includes(permission);

  return {
    allowed,
    role,
    reason: allowed
      ? `Granted by role: ${role}`
      : `Permission ${permission} not available for role: ${role}`,
  };
}

/**
 * Check if user has permission and throw error if not
 *
 * @param userId - The user ID to check
 * @param teamId - The team/organization ID
 * @param permission - The permission required
 * @throws PermissionDeniedError if permission is denied
 * @throws NotTeamMemberError if user is not a team member
 */
export async function requirePermission(
  userId: string,
  teamId: string,
  permission: Permission
): Promise<TeamRole> {
  const result = await hasPermission(userId, teamId, permission);

  if (!result.role) {
    throw new NotTeamMemberError(teamId, userId);
  }

  if (!result.allowed) {
    throw new PermissionDeniedError(permission, teamId, userId, result.role);
  }

  return result.role;
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(
  userId: string,
  teamId: string,
  permissions: Permission[]
): Promise<PermissionCheckResult> {
  const membership = await getUserMembership(userId, teamId);

  if (!membership) {
    return {
      allowed: false,
      reason: 'User is not a member of this team',
    };
  }

  const { role, customPermissions } = membership;
  const rolePermissions = RolePermissions[role];

  for (const permission of permissions) {
    // Check custom override
    if (permission in customPermissions && customPermissions[permission]) {
      return {
        allowed: true,
        role,
        reason: `Granted by custom permission: ${permission}`,
      };
    }

    // Check role permission
    if (rolePermissions.includes(permission)) {
      return {
        allowed: true,
        role,
        reason: `Granted by role ${role}: ${permission}`,
      };
    }
  }

  return {
    allowed: false,
    role,
    reason: `None of the required permissions are available for role: ${role}`,
  };
}

/**
 * Check if user has all specified permissions
 */
export async function hasAllPermissions(
  userId: string,
  teamId: string,
  permissions: Permission[]
): Promise<PermissionCheckResult> {
  const membership = await getUserMembership(userId, teamId);

  if (!membership) {
    return {
      allowed: false,
      reason: 'User is not a member of this team',
    };
  }

  const { role, customPermissions } = membership;
  const rolePermissions = RolePermissions[role];

  const missingPermissions: Permission[] = [];

  for (const permission of permissions) {
    const hasCustom =
      permission in customPermissions && customPermissions[permission];
    const hasRole = rolePermissions.includes(permission);

    if (!hasCustom && !hasRole) {
      missingPermissions.push(permission);
    }
  }

  if (missingPermissions.length > 0) {
    return {
      allowed: false,
      role,
      reason: `Missing permissions: ${missingPermissions.join(', ')}`,
    };
  }

  return {
    allowed: true,
    role,
    reason: 'All required permissions granted',
  };
}

/**
 * Check if user has at least the specified role level
 */
export async function requireRole(
  userId: string,
  teamId: string,
  minimumRole: TeamRole
): Promise<TeamRole> {
  const role = await getUserRole(userId, teamId);

  if (!role) {
    throw new NotTeamMemberError(teamId, userId);
  }

  if (!isRoleAtLeast(role, minimumRole)) {
    throw new PermissionDeniedError(
      `role:${minimumRole}` as Permission,
      teamId,
      userId,
      role
    );
  }

  return role;
}

/**
 * Get all permissions for a user in a team
 */
export async function getUserPermissions(
  userId: string,
  teamId: string
): Promise<Permission[]> {
  const membership = await getUserMembership(userId, teamId);

  if (!membership) {
    return [];
  }

  const { role, customPermissions } = membership;
  const rolePermissions = [...RolePermissions[role]];

  // Apply custom permission overrides
  for (const [permission, granted] of Object.entries(customPermissions)) {
    const perm = permission as Permission;
    const index = rolePermissions.indexOf(perm);

    if (granted && index === -1) {
      // Add custom permission
      rolePermissions.push(perm);
    } else if (!granted && index !== -1) {
      // Remove denied permission
      rolePermissions.splice(index, 1);
    }
  }

  return rolePermissions;
}

/**
 * Check if user can manage another user's role
 * (e.g., admins can't demote owners)
 */
export async function canManageRole(
  actorId: string,
  teamId: string,
  targetRole: TeamRole
): Promise<boolean> {
  const actorRole = await getUserRole(actorId, teamId);

  if (!actorRole) {
    return false;
  }

  // Only owners can manage other owners
  if (targetRole === 'owner' && actorRole !== 'owner') {
    return false;
  }

  // Admins can manage members and viewers
  if (actorRole === 'admin') {
    return targetRole === 'member' || targetRole === 'viewer';
  }

  // Owners can manage all roles
  return actorRole === 'owner';
}

/**
 * Batch check permissions for multiple teams
 * Useful for listing resources across teams
 */
export async function batchHasPermission(
  userId: string,
  teamPermissions: Array<{ teamId: string; permission: Permission }>
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  // Group by team to minimize queries
  const teamIds = [...new Set(teamPermissions.map((tp) => tp.teamId))];

  const supabase = createServerClient();

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id, role, permissions')
    .eq('user_id', userId)
    .in('organization_id', teamIds);

  const membershipMap = new Map(
    memberships?.map((m) => [
      m.organization_id,
      {
        role: m.role as TeamRole,
        customPermissions: (m.permissions as Record<string, boolean>) || {},
      },
    ]) || []
  );

  for (const { teamId, permission } of teamPermissions) {
    const key = `${teamId}:${permission}`;
    const membership = membershipMap.get(teamId);

    if (!membership) {
      results.set(key, false);
      continue;
    }

    const { role, customPermissions } = membership;

    // Check custom override
    if (permission in customPermissions) {
      results.set(key, customPermissions[permission]);
      continue;
    }

    // Check role permission
    results.set(key, RolePermissions[role].includes(permission));
  }

  return results;
}
