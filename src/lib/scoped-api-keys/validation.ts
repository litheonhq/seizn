/**
 * Scoped API Key Validation
 *
 * Validates API keys with scope-based permission checking:
 * - Organization/project scope verification
 * - Action-based permission resolution
 * - IP range restriction enforcement
 */

import { createServerClient } from '../supabase';
import { hashApiKey } from '../api-key';
import { Permission, RolePermissions, TeamRole } from '../rbac/types';
import {
  ScopedApiKey,
  ApiKeyScope,
  IpRestriction,
  ScopeLevel,
  ActionType,
  ActionPermissionMap,
  ScopedKeyValidationResult,
  ScopedPermissionCheckRequest,
  ScopedPermissionCheckResult,
  dbRecordToScopedApiKey,
  actionIncludes,
} from './types';

/**
 * Validate an API key and return scope information
 */
export async function validateScopedApiKey(
  apiKey: string,
  clientIp?: string
): Promise<ScopedKeyValidationResult> {
  const supabase = createServerClient();
  const keyHash = hashApiKey(apiKey);

  // Fetch the key with scope configuration
  const { data: keyData, error } = await supabase
    .from('api_keys')
    .select(`
      id,
      user_id,
      name,
      key_prefix,
      organization_id,
      scope_config,
      ip_restriction,
      rate_limit_override,
      description,
      metadata,
      last_used_at,
      expires_at,
      is_active,
      created_at,
      scopes
    `)
    .eq('key_hash', keyHash)
    .single();

  if (error || !keyData) {
    return {
      valid: false,
      failureReason: 'Invalid or inactive API key',
    };
  }

  // Check if key is active
  if (!keyData.is_active) {
    return {
      valid: false,
      failureReason: 'API key is inactive',
    };
  }

  // Check expiration
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return {
      valid: false,
      failureReason: 'API key has expired',
    };
  }

  // Parse scope configuration (support both old scopes array and new scope_config)
  const scopeConfig: ApiKeyScope = keyData.scope_config || parseLegacyScopes(keyData.scopes);

  // Check IP restriction
  const ipRestriction = keyData.ip_restriction as IpRestriction | undefined;
  let ipRestrictionApplied = false;

  if (ipRestriction && clientIp) {
    const ipCheckResult = checkIpRestriction(clientIp, ipRestriction);
    ipRestrictionApplied = true;

    if (!ipCheckResult.allowed && ipRestriction.enforce !== false) {
      return {
        valid: false,
        failureReason: `IP address ${clientIp} is not allowed`,
        ipRestrictionApplied: true,
      };
    }
  }

  // Build the ScopedApiKey object
  const scopedKey: ScopedApiKey = {
    id: keyData.id,
    userId: keyData.user_id,
    name: keyData.name,
    keyPrefix: keyData.key_prefix,
    scope: scopeConfig,
    ipRestriction,
    rateLimitOverride: keyData.rate_limit_override,
    description: keyData.description,
    metadata: keyData.metadata,
    lastUsedAt: keyData.last_used_at ? new Date(keyData.last_used_at) : undefined,
    expiresAt: keyData.expires_at ? new Date(keyData.expires_at) : undefined,
    isActive: keyData.is_active,
    createdAt: new Date(keyData.created_at),
  };

  // Calculate effective permissions
  const effectivePermissions = resolveEffectivePermissions(scopeConfig);

  return {
    valid: true,
    key: scopedKey,
    userId: keyData.user_id,
    orgId: keyData.organization_id || scopeConfig.organizationId,
    effectivePermissions,
    ipRestrictionApplied,
  };
}

/**
 * Check if an API key has a specific permission
 */
export async function checkScopedPermission(
  request: ScopedPermissionCheckRequest
): Promise<ScopedPermissionCheckResult> {
  const supabase = createServerClient();

  // Fetch the key
  const { data: keyData, error } = await supabase
    .from('api_keys')
    .select(`
      id,
      user_id,
      organization_id,
      scope_config,
      ip_restriction,
      is_active,
      expires_at,
      scopes
    `)
    .eq('id', request.keyId)
    .single();

  if (error || !keyData) {
    return {
      allowed: false,
      reason: 'API key not found',
    };
  }

  if (!keyData.is_active) {
    return {
      allowed: false,
      reason: 'API key is inactive',
    };
  }

  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return {
      allowed: false,
      reason: 'API key has expired',
    };
  }

  // Parse scope configuration
  const scopeConfig: ApiKeyScope = keyData.scope_config || parseLegacyScopes(keyData.scopes);

  // Check IP restriction if client IP provided
  if (request.clientIp && keyData.ip_restriction) {
    const ipCheck = checkIpRestriction(request.clientIp, keyData.ip_restriction as IpRestriction);
    if (!ipCheck.allowed && (keyData.ip_restriction as IpRestriction).enforce !== false) {
      return {
        allowed: false,
        reason: `IP address ${request.clientIp} is not allowed`,
        ipCheckPassed: false,
      };
    }
  }

  // Check scope level constraints
  const scopeCheck = checkScopeConstraints(scopeConfig, request.resourceContext);
  if (!scopeCheck.allowed) {
    return {
      allowed: false,
      reason: scopeCheck.reason,
      scopeLevel: scopeConfig.level,
    };
  }

  // Check if permission is in effective permissions
  const effectivePermissions = resolveEffectivePermissions(scopeConfig);
  const hasPermission = effectivePermissions.includes(request.permission);

  if (!hasPermission) {
    // Find which action would grant this permission
    const requiredAction = findRequiredAction(request.permission);
    return {
      allowed: false,
      reason: `Permission '${request.permission}' requires '${requiredAction}' action level`,
      scopeLevel: scopeConfig.level,
      actionType: scopeConfig.actions[0],
    };
  }

  return {
    allowed: true,
    reason: 'Permission granted by API key scope',
    scopeLevel: scopeConfig.level,
    actionType: findGrantingAction(request.permission, scopeConfig.actions),
    ipCheckPassed: true,
  };
}

/**
 * Resolve effective permissions from scope configuration
 */
export function resolveEffectivePermissions(scope: ApiKeyScope): Permission[] {
  // Start with permissions from action types
  const permissions = new Set<Permission>();

  for (const action of scope.actions) {
    const actionPermissions = ActionPermissionMap[action];
    if (actionPermissions) {
      actionPermissions.forEach(p => permissions.add(p));
    }
  }

  // Add custom permissions
  if (scope.customPermissions) {
    scope.customPermissions.forEach(p => permissions.add(p));
  }

  // Remove denied permissions
  if (scope.deniedPermissions) {
    scope.deniedPermissions.forEach(p => permissions.delete(p));
  }

  return Array.from(permissions);
}

/**
 * Check IP against restriction rules
 */
export function checkIpRestriction(
  clientIp: string,
  restriction: IpRestriction
): { allowed: boolean; reason?: string } {
  // Check blocked IPs first
  if (restriction.blockedIps?.length) {
    for (const blocked of restriction.blockedIps) {
      if (ipMatches(clientIp, blocked)) {
        return { allowed: false, reason: `IP ${clientIp} is blocked` };
      }
    }
  }

  // If no allowed IPs specified, allow all (except blocked)
  if (!restriction.allowedIps?.length) {
    return { allowed: true };
  }

  // Check if IP is in allowed list
  for (const allowed of restriction.allowedIps) {
    if (ipMatches(clientIp, allowed)) {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: `IP ${clientIp} is not in allowed list` };
}

/**
 * Check if an IP matches a pattern (supports CIDR notation)
 */
function ipMatches(ip: string, pattern: string): boolean {
  // Exact match
  if (ip === pattern) {
    return true;
  }

  // CIDR notation check
  if (pattern.includes('/')) {
    return ipInCidr(ip, pattern);
  }

  // Wildcard pattern (e.g., 192.168.1.*)
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '\\d+') + '$');
    return regex.test(ip);
  }

  return false;
}

/**
 * Check if IP is within CIDR range
 */
function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);

  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);

  if (ipNum === null || rangeNum === null) {
    return false;
  }

  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Convert IP address to number
 */
function ipToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }

  let num = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) {
      return null;
    }
    num = (num << 8) + n;
  }

  return num >>> 0; // Ensure unsigned
}

/**
 * Check scope constraints against resource context
 */
function checkScopeConstraints(
  scope: ApiKeyScope,
  context?: {
    organizationId?: string;
    projectId?: string;
    resourceType?: string;
    resourceId?: string;
  }
): { allowed: boolean; reason: string } {
  // User-level scope has no constraints
  if (scope.level === 'user') {
    return { allowed: true, reason: 'User-level scope has full access' };
  }

  // Organization-level scope
  if (scope.level === 'organization') {
    if (!scope.organizationId) {
      return { allowed: false, reason: 'Organization scope requires organizationId' };
    }
    if (context?.organizationId && context.organizationId !== scope.organizationId) {
      return {
        allowed: false,
        reason: `API key is scoped to organization ${scope.organizationId}`,
      };
    }
    return { allowed: true, reason: 'Organization scope matched' };
  }

  // Project-level scope
  if (scope.level === 'project') {
    if (!scope.organizationId) {
      return { allowed: false, reason: 'Project scope requires organizationId' };
    }
    if (!scope.projectIds?.length) {
      return { allowed: false, reason: 'Project scope requires projectIds' };
    }
    if (context?.organizationId && context.organizationId !== scope.organizationId) {
      return {
        allowed: false,
        reason: `API key is scoped to organization ${scope.organizationId}`,
      };
    }
    if (context?.projectId && !scope.projectIds.includes(context.projectId)) {
      return {
        allowed: false,
        reason: `API key is not scoped to project ${context.projectId}`,
      };
    }
    return { allowed: true, reason: 'Project scope matched' };
  }

  return { allowed: false, reason: 'Unknown scope level' };
}

/**
 * Parse legacy scopes array to scope configuration
 */
function parseLegacyScopes(scopes?: string[]): ApiKeyScope {
  if (!scopes?.length) {
    return {
      level: 'user',
      actions: ['write'],
    };
  }

  // Determine action level from legacy scopes
  const hasWrite = scopes.some(s => s.includes(':write') || s.includes(':create'));
  const hasDelete = scopes.some(s => s.includes(':delete'));

  let actions: ActionType[];
  if (hasDelete) {
    actions = ['admin'];
  } else if (hasWrite) {
    actions = ['write'];
  } else {
    actions = ['read'];
  }

  return {
    level: 'user',
    actions,
  };
}

/**
 * Find which action type would grant a permission
 */
function findRequiredAction(permission: Permission): ActionType {
  // Check in order from least to most privileged
  for (const action of ['read', 'write', 'admin'] as ActionType[]) {
    if (ActionPermissionMap[action].includes(permission)) {
      return action;
    }
  }
  return 'admin';
}

/**
 * Find which action in the list grants a permission
 */
function findGrantingAction(
  permission: Permission,
  actions: ActionType[]
): ActionType | undefined {
  for (const action of actions) {
    if (ActionPermissionMap[action].includes(permission)) {
      return action;
    }
  }
  return undefined;
}

/**
 * Validate scope configuration
 */
export function validateScopeConfig(scope: ApiKeyScope): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!scope.level) {
    errors.push('Scope level is required');
  } else if (!['user', 'organization', 'project'].includes(scope.level)) {
    errors.push(`Invalid scope level: ${scope.level}`);
  }

  if (!scope.actions?.length) {
    errors.push('At least one action is required');
  } else {
    for (const action of scope.actions) {
      if (!['read', 'write', 'admin'].includes(action)) {
        errors.push(`Invalid action: ${action}`);
      }
    }
  }

  if (scope.level === 'organization' && !scope.organizationId) {
    errors.push('Organization ID is required for organization-level scope');
  }

  if (scope.level === 'project') {
    if (!scope.organizationId) {
      errors.push('Organization ID is required for project-level scope');
    }
    if (!scope.projectIds?.length) {
      errors.push('At least one project ID is required for project-level scope');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate IP restriction configuration
 */
export function validateIpRestriction(
  restriction: IpRestriction
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const validateIpList = (ips: string[] | undefined, listName: string) => {
    if (!ips) return;

    for (const ip of ips) {
      if (!isValidIpOrCidr(ip)) {
        errors.push(`Invalid IP/CIDR in ${listName}: ${ip}`);
      }
    }
  };

  validateIpList(restriction.allowedIps, 'allowedIps');
  validateIpList(restriction.blockedIps, 'blockedIps');

  return { valid: errors.length === 0, errors };
}

/**
 * Validate IP address or CIDR notation
 */
function isValidIpOrCidr(value: string): boolean {
  // IPv4 regex
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // CIDR regex
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  // Wildcard regex
  const wildcardRegex = /^(\d{1,3}|\*)(\.(\d{1,3}|\*)){3}$/;

  if (cidrRegex.test(value)) {
    const [ip, bits] = value.split('/');
    const bitsNum = parseInt(bits, 10);
    if (bitsNum < 0 || bitsNum > 32) return false;
    return isValidIp(ip);
  }

  if (wildcardRegex.test(value)) {
    return true;
  }

  return ipv4Regex.test(value) && isValidIp(value);
}

/**
 * Validate IP address octets
 */
function isValidIp(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return false;
  }

  return true;
}
