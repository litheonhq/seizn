/**
 * RBAC (Role-Based Access Control) Types for Seizn
 *
 * Defines roles, permissions, and access control matrices for team management.
 */

/**
 * Available team roles in order of privilege (highest to lowest)
 */
export const TeamRoles = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const;

export type TeamRole = (typeof TeamRoles)[keyof typeof TeamRoles];

/**
 * All available permissions in the system
 */
export const Permissions = {
  // Team management
  TEAM_DELETE: 'team:delete',
  TEAM_UPDATE: 'team:update',
  TEAM_VIEW: 'team:view',

  // Member management
  MEMBER_INVITE: 'member:invite',
  MEMBER_REMOVE: 'member:remove',
  MEMBER_UPDATE_ROLE: 'member:update_role',
  MEMBER_VIEW: 'member:view',

  // API Key management
  API_KEY_CREATE: 'api_key:create',
  API_KEY_DELETE: 'api_key:delete',
  API_KEY_VIEW: 'api_key:view',

  // Collection management
  COLLECTION_CREATE: 'collection:create',
  COLLECTION_DELETE: 'collection:delete',
  COLLECTION_UPDATE: 'collection:update',
  COLLECTION_VIEW: 'collection:view',
  COLLECTION_SEARCH: 'collection:search',

  // Document management
  DOCUMENT_CREATE: 'document:create',
  DOCUMENT_DELETE: 'document:delete',
  DOCUMENT_UPDATE: 'document:update',
  DOCUMENT_VIEW: 'document:view',

  // Memory management
  MEMORY_CREATE: 'memory:create',
  MEMORY_DELETE: 'memory:delete',
  MEMORY_UPDATE: 'memory:update',
  MEMORY_VIEW: 'memory:view',
  MEMORY_SEARCH: 'memory:search',

  // Settings
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_VIEW: 'settings:view',

  // Billing
  BILLING_VIEW: 'billing:view',
  BILLING_UPDATE: 'billing:update',

  // Audit logs
  AUDIT_LOG_VIEW: 'audit_log:view',

  // Webhooks
  WEBHOOK_CREATE: 'webhook:create',
  WEBHOOK_DELETE: 'webhook:delete',
  WEBHOOK_UPDATE: 'webhook:update',
  WEBHOOK_VIEW: 'webhook:view',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

/**
 * Role-to-Permission mapping matrix
 * Defines which permissions each role has
 */
export const RolePermissions: Record<TeamRole, Permission[]> = {
  // Owner: All permissions including team deletion
  owner: [
    Permissions.TEAM_DELETE,
    Permissions.TEAM_UPDATE,
    Permissions.TEAM_VIEW,
    Permissions.MEMBER_INVITE,
    Permissions.MEMBER_REMOVE,
    Permissions.MEMBER_UPDATE_ROLE,
    Permissions.MEMBER_VIEW,
    Permissions.API_KEY_CREATE,
    Permissions.API_KEY_DELETE,
    Permissions.API_KEY_VIEW,
    Permissions.COLLECTION_CREATE,
    Permissions.COLLECTION_DELETE,
    Permissions.COLLECTION_UPDATE,
    Permissions.COLLECTION_VIEW,
    Permissions.COLLECTION_SEARCH,
    Permissions.DOCUMENT_CREATE,
    Permissions.DOCUMENT_DELETE,
    Permissions.DOCUMENT_UPDATE,
    Permissions.DOCUMENT_VIEW,
    Permissions.MEMORY_CREATE,
    Permissions.MEMORY_DELETE,
    Permissions.MEMORY_UPDATE,
    Permissions.MEMORY_VIEW,
    Permissions.MEMORY_SEARCH,
    Permissions.SETTINGS_UPDATE,
    Permissions.SETTINGS_VIEW,
    Permissions.BILLING_VIEW,
    Permissions.BILLING_UPDATE,
    Permissions.AUDIT_LOG_VIEW,
    Permissions.WEBHOOK_CREATE,
    Permissions.WEBHOOK_DELETE,
    Permissions.WEBHOOK_UPDATE,
    Permissions.WEBHOOK_VIEW,
  ],

  // Admin: Manage collections, members, API keys (no team deletion, no billing update)
  admin: [
    Permissions.TEAM_UPDATE,
    Permissions.TEAM_VIEW,
    Permissions.MEMBER_INVITE,
    Permissions.MEMBER_REMOVE,
    Permissions.MEMBER_UPDATE_ROLE,
    Permissions.MEMBER_VIEW,
    Permissions.API_KEY_CREATE,
    Permissions.API_KEY_DELETE,
    Permissions.API_KEY_VIEW,
    Permissions.COLLECTION_CREATE,
    Permissions.COLLECTION_DELETE,
    Permissions.COLLECTION_UPDATE,
    Permissions.COLLECTION_VIEW,
    Permissions.COLLECTION_SEARCH,
    Permissions.DOCUMENT_CREATE,
    Permissions.DOCUMENT_DELETE,
    Permissions.DOCUMENT_UPDATE,
    Permissions.DOCUMENT_VIEW,
    Permissions.MEMORY_CREATE,
    Permissions.MEMORY_DELETE,
    Permissions.MEMORY_UPDATE,
    Permissions.MEMORY_VIEW,
    Permissions.MEMORY_SEARCH,
    Permissions.SETTINGS_UPDATE,
    Permissions.SETTINGS_VIEW,
    Permissions.BILLING_VIEW,
    Permissions.AUDIT_LOG_VIEW,
    Permissions.WEBHOOK_CREATE,
    Permissions.WEBHOOK_DELETE,
    Permissions.WEBHOOK_UPDATE,
    Permissions.WEBHOOK_VIEW,
  ],

  // Member: View/search collections, add documents
  member: [
    Permissions.TEAM_VIEW,
    Permissions.MEMBER_VIEW,
    Permissions.API_KEY_VIEW,
    Permissions.COLLECTION_VIEW,
    Permissions.COLLECTION_SEARCH,
    Permissions.DOCUMENT_CREATE,
    Permissions.DOCUMENT_VIEW,
    Permissions.MEMORY_CREATE,
    Permissions.MEMORY_VIEW,
    Permissions.MEMORY_SEARCH,
    Permissions.SETTINGS_VIEW,
    Permissions.WEBHOOK_VIEW,
  ],

  // Viewer: Read-only access
  viewer: [
    Permissions.TEAM_VIEW,
    Permissions.MEMBER_VIEW,
    Permissions.COLLECTION_VIEW,
    Permissions.COLLECTION_SEARCH,
    Permissions.DOCUMENT_VIEW,
    Permissions.MEMORY_VIEW,
    Permissions.MEMORY_SEARCH,
    Permissions.SETTINGS_VIEW,
  ],
};

/**
 * Role hierarchy - higher index means higher privilege
 */
export const RoleHierarchy: TeamRole[] = ['viewer', 'member', 'admin', 'owner'];

/**
 * Check if a role has higher or equal privilege than another
 */
export function isRoleAtLeast(role: TeamRole, minimumRole: TeamRole): boolean {
  const roleIndex = RoleHierarchy.indexOf(role);
  const minimumIndex = RoleHierarchy.indexOf(minimumRole);
  return roleIndex >= minimumIndex;
}

/**
 * Get all roles that have a specific permission
 */
export function getRolesWithPermission(permission: Permission): TeamRole[] {
  return (Object.entries(RolePermissions) as [TeamRole, Permission[]][])
    .filter(([, permissions]) => permissions.includes(permission))
    .map(([role]) => role);
}

/**
 * Team member with role information
 */
export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  permissions?: Record<string, boolean>; // Custom permission overrides
  invitedBy?: string;
  invitedAt?: string;
  acceptedAt?: string;
  createdAt: string;
}

/**
 * Permission check result with context
 */
export interface PermissionCheckResult {
  allowed: boolean;
  role?: TeamRole;
  reason?: string;
}

/**
 * Resource types for audit logging
 */
export const ResourceTypes = {
  TEAM: 'team',
  MEMBER: 'member',
  API_KEY: 'api_key',
  COLLECTION: 'collection',
  DOCUMENT: 'document',
  MEMORY: 'memory',
  WEBHOOK: 'webhook',
  SETTINGS: 'settings',
} as const;

export type ResourceType = (typeof ResourceTypes)[keyof typeof ResourceTypes];

/**
 * Audit log action types
 */
export const AuditActionTypes = {
  // Team actions
  TEAM_CREATE: 'team.create',
  TEAM_UPDATE: 'team.update',
  TEAM_DELETE: 'team.delete',

  // Member actions
  MEMBER_INVITE: 'member.invite',
  MEMBER_JOIN: 'member.join',
  MEMBER_REMOVE: 'member.remove',
  MEMBER_ROLE_CHANGE: 'member.role_change',

  // API Key actions
  API_KEY_CREATE: 'api_key.create',
  API_KEY_REVOKE: 'api_key.revoke',
  API_KEY_DELETE: 'api_key.delete',

  // Collection actions
  COLLECTION_CREATE: 'collection.create',
  COLLECTION_UPDATE: 'collection.update',
  COLLECTION_DELETE: 'collection.delete',

  // Document actions
  DOCUMENT_CREATE: 'document.create',
  DOCUMENT_UPDATE: 'document.update',
  DOCUMENT_DELETE: 'document.delete',

  // Memory actions
  MEMORY_CREATE: 'memory.create',
  MEMORY_UPDATE: 'memory.update',
  MEMORY_DELETE: 'memory.delete',
  MEMORY_SEARCH: 'memory.search',

  // Settings actions
  SETTINGS_UPDATE: 'settings.update',

  // Webhook actions
  WEBHOOK_CREATE: 'webhook.create',
  WEBHOOK_UPDATE: 'webhook.update',
  WEBHOOK_DELETE: 'webhook.delete',
} as const;

export type AuditActionType = (typeof AuditActionTypes)[keyof typeof AuditActionTypes];
