/**
 * Enterprise Authentication Types
 *
 * SSO, SAML, SCIM, and advanced RBAC configuration types.
 */

// ============================================
// SSO/SAML Types
// ============================================

export type SSOProvider = 'okta' | 'azure-ad' | 'google-workspace' | 'onelogin' | 'custom-saml';

export interface SSOConnection {
  id: string;
  organizationId: string;
  provider: SSOProvider;
  name: string;
  enabled: boolean;
  domains: string[]; // Email domains for this connection
  config: SAMLConfig | OIDCConfig;
  createdAt: string;
  updatedAt: string;
}

export interface SAMLConfig {
  type: 'saml';
  entityId: string;
  ssoUrl: string;
  certificate: string;
  signatureAlgorithm: 'sha256' | 'sha512';
  digestAlgorithm: 'sha256' | 'sha512';
  nameIdFormat: 'email' | 'persistent' | 'transient';
  attributeMapping: SAMLAttributeMapping;
  spEntityId: string;
  spAcsUrl: string;
  spMetadataUrl: string;
}

export interface SAMLAttributeMapping {
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  groups?: string;
  role?: string;
}

export interface OIDCConfig {
  type: 'oidc';
  clientId: string;
  clientSecret: string; // Encrypted
  issuerUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  attributeMapping: OIDCAttributeMapping;
}

export interface OIDCAttributeMapping {
  email: string;
  name?: string;
  picture?: string;
  groups?: string;
}

// ============================================
// SCIM Types
// ============================================

export interface SCIMConfig {
  id: string;
  organizationId: string;
  enabled: boolean;
  baseUrl: string;
  bearerToken: string; // Encrypted
  provisioningEnabled: boolean;
  deprovisioningEnabled: boolean;
  groupSyncEnabled: boolean;
  syncInterval: number; // Minutes
  lastSyncAt: string | null;
  lastSyncStatus: 'success' | 'partial' | 'failed' | null;
}

export interface SCIMUser {
  id: string;
  externalId: string;
  userName: string;
  active: boolean;
  name: {
    givenName: string;
    familyName: string;
  };
  emails: Array<{
    value: string;
    primary: boolean;
  }>;
  groups: string[];
  meta: {
    resourceType: 'User';
    created: string;
    lastModified: string;
  };
}

export interface SCIMGroup {
  id: string;
  externalId: string;
  displayName: string;
  members: Array<{
    value: string;
    display: string;
  }>;
  meta: {
    resourceType: 'Group';
    created: string;
    lastModified: string;
  };
}

// ============================================
// Enhanced RBAC Types
// ============================================

export type Permission =
  // Memory operations
  | 'memory:read'
  | 'memory:write'
  | 'memory:delete'
  | 'memory:admin'
  // Trace operations
  | 'traces:read'
  | 'traces:write'
  | 'traces:delete'
  // API key management
  | 'keys:read'
  | 'keys:create'
  | 'keys:delete'
  | 'keys:admin'
  // Organization management
  | 'org:read'
  | 'org:settings'
  | 'org:members'
  | 'org:billing'
  | 'org:admin'
  // Security & Compliance
  | 'security:audit'
  | 'security:sso'
  | 'security:scim'
  // Privacy
  | 'privacy:rtbf'
  | 'privacy:settings'
  // Tool gating
  | 'tools:read'
  | 'tools:approve'
  | 'tools:admin'
  // Policy packs
  | 'policies:read'
  | 'policies:install'
  | 'policies:admin'
  // Wildcard
  | '*';

export type Role = 'owner' | 'admin' | 'member' | 'viewer' | 'api_only' | 'custom';

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean; // System roles cannot be modified
}

export interface CustomRole extends RoleDefinition {
  organizationId: string;
  createdBy: string;
  createdAt: string;
}

// Default role permissions
export const ROLE_PERMISSIONS: Record<Exclude<Role, 'custom'>, Permission[]> = {
  owner: ['*'],
  admin: [
    'memory:read', 'memory:write', 'memory:delete', 'memory:admin',
    'traces:read', 'traces:write', 'traces:delete',
    'keys:read', 'keys:create', 'keys:delete', 'keys:admin',
    'org:read', 'org:settings', 'org:members',
    'security:audit', 'security:sso', 'security:scim',
    'privacy:rtbf', 'privacy:settings',
    'tools:read', 'tools:approve', 'tools:admin',
    'policies:read', 'policies:install', 'policies:admin',
  ],
  member: [
    'memory:read', 'memory:write',
    'traces:read', 'traces:write',
    'keys:read', 'keys:create',
    'org:read',
    'tools:read',
    'policies:read', 'policies:install',
  ],
  viewer: [
    'memory:read',
    'traces:read',
    'keys:read',
    'org:read',
    'tools:read',
    'policies:read',
  ],
  api_only: [
    'memory:read', 'memory:write',
    'traces:read', 'traces:write',
    'keys:read',
  ],
};

// ============================================
// Access Control Types
// ============================================

export interface AccessPolicy {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  conditions: AccessCondition[];
  effect: 'allow' | 'deny';
  permissions: Permission[];
  resources: ResourcePattern[];
  enabled: boolean;
}

export interface AccessCondition {
  type: 'ip' | 'time' | 'mfa' | 'location' | 'device';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'between';
  value: string | string[] | { from: string; to: string };
}

export interface ResourcePattern {
  type: 'namespace' | 'api_key' | 'organization' | 'user';
  pattern: string; // Glob pattern, e.g., "prod:*", "user:123"
}

// ============================================
// Session Types
// ============================================

export interface SessionConfig {
  maxAge: number; // Seconds
  idleTimeout: number; // Seconds
  singleSessionPerUser: boolean;
  requireMFA: boolean;
  mfaMethods: MFAMethod[];
  trustedDevices: boolean;
  trustedDeviceMaxAge: number; // Days
}

export type MFAMethod = 'totp' | 'sms' | 'email' | 'webauthn' | 'backup_codes';

export interface UserSession {
  id: string;
  userId: string;
  organizationId: string;
  deviceId?: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  mfaVerified: boolean;
  ssoSessionId?: string;
}

// ============================================
// Audit Types
// ============================================

export interface AuthAuditEvent {
  id: string;
  organizationId: string;
  userId?: string;
  eventType: AuthEventType;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export type AuthEventType =
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'mfa_challenge'
  | 'mfa_success'
  | 'mfa_failed'
  | 'sso_login'
  | 'sso_logout'
  | 'password_changed'
  | 'password_reset'
  | 'session_expired'
  | 'session_revoked'
  | 'api_key_used'
  | 'permission_denied';

// ============================================
// Helper Functions
// ============================================

export function hasPermission(
  userPermissions: Permission[],
  requiredPermission: Permission
): boolean {
  // Wildcard grants all permissions
  if (userPermissions.includes('*')) return true;

  // Check for exact match
  if (userPermissions.includes(requiredPermission)) return true;

  // Check for category admin permission
  const [category, action] = requiredPermission.split(':');
  if (userPermissions.includes(`${category}:admin` as Permission)) return true;

  return false;
}

export function getPermissionsForRole(role: Role, customRole?: CustomRole): Permission[] {
  if (role === 'custom' && customRole) {
    return customRole.permissions;
  }
  return ROLE_PERMISSIONS[role as Exclude<Role, 'custom'>] || [];
}

export function validateSAMLConfig(config: SAMLConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.entityId) errors.push('Entity ID is required');
  if (!config.ssoUrl) errors.push('SSO URL is required');
  if (!config.certificate) errors.push('Certificate is required');
  if (!config.ssoUrl.startsWith('https://')) {
    errors.push('SSO URL must use HTTPS');
  }

  // Validate certificate format
  if (config.certificate && !config.certificate.includes('BEGIN CERTIFICATE')) {
    errors.push('Invalid certificate format');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
