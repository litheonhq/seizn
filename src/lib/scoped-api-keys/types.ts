/**
 * Scoped API Keys Types
 *
 * Defines types for API keys with fine-grained access control:
 * - Organization/project scoping
 * - Action-based permissions (read, write, admin)
 * - IP range restrictions
 */

import { Permission } from '../rbac/types';

/**
 * Scope levels for API keys
 */
export const ScopeLevel = {
  /** Global access (user's personal keys) */
  USER: 'user',
  /** Organization-wide access */
  ORGANIZATION: 'organization',
  /** Limited to specific project/collection */
  PROJECT: 'project',
} as const;

export type ScopeLevel = (typeof ScopeLevel)[keyof typeof ScopeLevel];

/**
 * Action types for scoped permissions
 */
export const ActionType = {
  /** Read-only access */
  READ: 'read',
  /** Read and write access */
  WRITE: 'write',
  /** Full admin access including management operations */
  ADMIN: 'admin',
} as const;

export type ActionType = (typeof ActionType)[keyof typeof ActionType];

/**
 * Maps action types to RBAC permissions
 */
export const ActionPermissionMap: Record<ActionType, Permission[]> = {
  read: [
    'team:view',
    'member:view',
    'collection:view',
    'collection:search',
    'document:view',
    'memory:view',
    'memory:search',
    'settings:view',
    'webhook:view',
  ],
  write: [
    'team:view',
    'member:view',
    'collection:view',
    'collection:search',
    'collection:create',
    'collection:update',
    'document:view',
    'document:create',
    'document:update',
    'memory:view',
    'memory:search',
    'memory:create',
    'memory:update',
    'settings:view',
    'webhook:view',
    'webhook:create',
    'webhook:update',
  ],
  admin: [
    'team:view',
    'team:update',
    'member:view',
    'member:invite',
    'member:remove',
    'member:update_role',
    'api_key:view',
    'api_key:create',
    'api_key:delete',
    'collection:view',
    'collection:search',
    'collection:create',
    'collection:update',
    'collection:delete',
    'document:view',
    'document:create',
    'document:update',
    'document:delete',
    'memory:view',
    'memory:search',
    'memory:create',
    'memory:update',
    'memory:delete',
    'settings:view',
    'settings:update',
    'audit_log:view',
    'webhook:view',
    'webhook:create',
    'webhook:update',
    'webhook:delete',
  ],
};

/**
 * IP restriction configuration
 */
export interface IpRestriction {
  /** Allowed IP addresses or CIDR ranges */
  allowedIps?: string[];
  /** Blocked IP addresses or CIDR ranges */
  blockedIps?: string[];
  /** Whether to enforce IP restrictions (false = log only) */
  enforce?: boolean;
}

/**
 * Scope configuration for an API key
 */
export interface ApiKeyScope {
  /** The level of scope */
  level: ScopeLevel;
  /** Organization ID (required for organization/project level) */
  organizationId?: string;
  /** Project/collection IDs (required for project level) */
  projectIds?: string[];
  /** Allowed actions */
  actions: ActionType[];
  /** Additional granular permissions (override action defaults) */
  customPermissions?: Permission[];
  /** Denied permissions (override action defaults) */
  deniedPermissions?: Permission[];
}

/**
 * Full scoped API key configuration
 */
export interface ScopedApiKey {
  id: string;
  userId: string;
  name: string;
  /** Key prefix for identification (szn_xxx...) */
  keyPrefix: string;
  /** Scope configuration */
  scope: ApiKeyScope;
  /** IP restrictions */
  ipRestriction?: IpRestriction;
  /** Rate limit override (requests per minute) */
  rateLimitOverride?: number;
  /** Expiration date */
  expiresAt?: Date;
  /** Whether the key is active */
  isActive: boolean;
  /** Last used timestamp */
  lastUsedAt?: Date;
  /** Creation timestamp */
  createdAt: Date;
  /** Optional description */
  description?: string;
  /** Usage metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Request to create a scoped API key
 */
export interface CreateScopedApiKeyRequest {
  name: string;
  description?: string;
  scope: {
    level: ScopeLevel;
    organizationId?: string;
    projectIds?: string[];
    actions: ActionType[];
    customPermissions?: string[];
    deniedPermissions?: string[];
  };
  ipRestriction?: IpRestriction;
  rateLimitOverride?: number;
  /** Expiration in days (default: 90) */
  expiresInDays?: number;
}

/**
 * Response when creating a scoped API key
 */
export interface CreateScopedApiKeyResponse {
  /** The full API key (only shown once!) */
  key: string;
  /** The created key record (without hash) */
  keyRecord: Omit<ScopedApiKey, 'keyHash'>;
  message: string;
}

/**
 * Scoped API key validation result
 */
export interface ScopedKeyValidationResult {
  valid: boolean;
  key?: ScopedApiKey;
  userId?: string;
  orgId?: string;
  /** Effective permissions after scope resolution */
  effectivePermissions?: Permission[];
  /** Reason for validation failure */
  failureReason?: string;
  /** Whether IP restriction was applied */
  ipRestrictionApplied?: boolean;
}

/**
 * Permission check request for scoped keys
 */
export interface ScopedPermissionCheckRequest {
  keyId: string;
  permission: Permission;
  /** Resource context for project-level checks */
  resourceContext?: {
    organizationId?: string;
    projectId?: string;
    resourceType?: string;
    resourceId?: string;
  };
  /** Client IP for IP restriction check */
  clientIp?: string;
}

/**
 * Permission check result for scoped keys
 */
export interface ScopedPermissionCheckResult {
  allowed: boolean;
  reason: string;
  /** Matched scope level */
  scopeLevel?: ScopeLevel;
  /** Matched action type */
  actionType?: ActionType;
  /** IP check result */
  ipCheckPassed?: boolean;
}

/**
 * Scoped API key list query options
 */
export interface ListScopedKeysOptions {
  /** Filter by organization */
  organizationId?: string;
  /** Filter by scope level */
  scopeLevel?: ScopeLevel;
  /** Include inactive keys */
  includeInactive?: boolean;
  /** Pagination offset */
  offset?: number;
  /** Pagination limit */
  limit?: number;
}

/**
 * Database schema for scoped API keys
 * (Maps to api_keys table with additional columns)
 */
export interface ScopedApiKeyDbRecord {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  organization_id?: string;
  /** JSON column for scope configuration */
  scope_config: ApiKeyScope;
  /** JSON column for IP restrictions */
  ip_restriction?: IpRestriction;
  rate_limit_override?: number;
  description?: string;
  metadata?: Record<string, unknown>;
  last_used_at?: string;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Convert database record to ScopedApiKey
 */
export function dbRecordToScopedApiKey(record: ScopedApiKeyDbRecord): ScopedApiKey {
  return {
    id: record.id,
    userId: record.user_id,
    name: record.name,
    keyPrefix: record.key_prefix,
    scope: record.scope_config,
    ipRestriction: record.ip_restriction,
    rateLimitOverride: record.rate_limit_override,
    description: record.description,
    metadata: record.metadata,
    lastUsedAt: record.last_used_at ? new Date(record.last_used_at) : undefined,
    expiresAt: record.expires_at ? new Date(record.expires_at) : undefined,
    isActive: record.is_active,
    createdAt: new Date(record.created_at),
  };
}

/**
 * Get default scope for a given level
 */
export function getDefaultScope(level: ScopeLevel): ApiKeyScope {
  return {
    level,
    actions: level === 'user' ? ['write'] : ['read'],
  };
}

/**
 * Check if an action type includes another
 */
export function actionIncludes(action: ActionType, requiredAction: ActionType): boolean {
  const hierarchy: ActionType[] = ['read', 'write', 'admin'];
  const actionIndex = hierarchy.indexOf(action);
  const requiredIndex = hierarchy.indexOf(requiredAction);
  return actionIndex >= requiredIndex;
}
