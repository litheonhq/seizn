/**
 * Seizn Winter - Permission Resolver
 *
 * Resolves effective permissions by analyzing permission hierarchies,
 * inheritance chains, and role-based access control.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  Permission,
  PermissionLevel,
  PermissionScope,
  InheritanceMode,
  EffectivePermission,
  PermissionLevelValue,
  GraphNode,
  GraphEdge,
} from './types';
import { PermissionLevelValue as LevelValues } from './types';

// ============================================
// Permission Resolution Types
// ============================================

/**
 * Context for permission resolution
 */
export interface PermissionContext {
  /** The subject requesting access */
  subjectId: string;
  /** Subject type */
  subjectType: 'user' | 'role' | 'group' | 'service';
  /** Target resource ID */
  resourceId: string;
  /** Resource type */
  resourceType: string;
  /** Current timestamp for time-based conditions */
  timestamp?: Date;
  /** Additional context for conditional permissions */
  context?: Record<string, unknown>;
}

/**
 * Result of permission resolution
 */
export interface PermissionResolutionResult {
  /** Whether access is allowed */
  allowed: boolean;
  /** The effective permission level */
  level: PermissionLevel;
  /** How the permission was determined */
  source: 'direct' | 'inherited' | 'role' | 'group' | 'default';
  /** The specific permission that granted access */
  grantingPermission?: Permission;
  /** Full inheritance path if inherited */
  inheritancePath?: string[];
  /** All permissions that were evaluated */
  evaluatedPermissions: Permission[];
  /** Reason for denial if not allowed */
  denialReason?: string;
}

/**
 * Permission hierarchy node
 */
export interface PermissionHierarchyNode {
  id: string;
  type: 'user' | 'role' | 'group' | 'resource';
  permissions: Permission[];
  parent?: PermissionHierarchyNode;
  children: PermissionHierarchyNode[];
}

// ============================================
// Permission Resolver Class
// ============================================

export class PermissionResolver {
  private permissionCache: Map<string, EffectivePermission> = new Map();
  private hierarchyCache: Map<string, PermissionHierarchyNode> = new Map();

  constructor(private readonly cacheEnabled: boolean = true) {}

  /**
   * Resolve the effective permission for a subject on a resource
   */
  async resolve(context: PermissionContext): Promise<PermissionResolutionResult> {
    const cacheKey = `${context.subjectId}:${context.resourceId}`;

    // Check cache first
    if (this.cacheEnabled) {
      const cached = this.permissionCache.get(cacheKey);
      if (cached) {
        return {
          allowed: cached.level !== 'none',
          level: cached.level,
          source: cached.source,
          grantingPermission: cached.sourcePermission,
          inheritancePath: cached.inheritancePath,
          evaluatedPermissions: [],
        };
      }
    }

    const supabase = createServerClient();
    const evaluatedPermissions: Permission[] = [];

    // 1. Check direct permissions on the resource
    const directPermission = await this.getDirectPermission(context, supabase);
    if (directPermission) {
      evaluatedPermissions.push(directPermission);
      if (this.isConditionMet(directPermission, context)) {
        const result = this.buildResult(directPermission, 'direct', evaluatedPermissions);
        this.cacheResult(cacheKey, result);
        return result;
      }
    }

    // 2. Check role-based permissions
    const rolePermissions = await this.getRolePermissions(context, supabase);
    evaluatedPermissions.push(...rolePermissions);
    const effectiveRolePermission = this.mergePermissions(rolePermissions);
    if (effectiveRolePermission && effectiveRolePermission.level !== 'none') {
      const result = this.buildResult(effectiveRolePermission, 'role', evaluatedPermissions);
      this.cacheResult(cacheKey, result);
      return result;
    }

    // 3. Check group-based permissions
    const groupPermissions = await this.getGroupPermissions(context, supabase);
    evaluatedPermissions.push(...groupPermissions);
    const effectiveGroupPermission = this.mergePermissions(groupPermissions);
    if (effectiveGroupPermission && effectiveGroupPermission.level !== 'none') {
      const result = this.buildResult(effectiveGroupPermission, 'group', evaluatedPermissions);
      this.cacheResult(cacheKey, result);
      return result;
    }

    // 4. Check inherited permissions from parent resources
    const inheritedResult = await this.resolveInheritedPermission(context, supabase);
    if (inheritedResult) {
      evaluatedPermissions.push(...(inheritedResult.evaluatedPermissions || []));
      if (inheritedResult.allowed) {
        this.cacheResult(cacheKey, inheritedResult);
        return inheritedResult;
      }
    }

    // 5. Return default (no access)
    return {
      allowed: false,
      level: 'none',
      source: 'default',
      evaluatedPermissions,
      denialReason: 'No matching permission found',
    };
  }

  /**
   * Get direct permission for a subject on a resource
   */
  private async getDirectPermission(
    context: PermissionContext,
    supabase: ReturnType<typeof createServerClient>
  ): Promise<Permission | null> {
    const { data } = await supabase
      .from('winter_permissions')
      .select('*')
      .eq('subject_id', context.subjectId)
      .eq('resource_id', context.resourceId)
      .eq('scope', 'node')
      .maybeSingle();

    return data ? this.mapToPermission(data) : null;
  }

  /**
   * Get role-based permissions for a user
   */
  private async getRolePermissions(
    context: PermissionContext,
    supabase: ReturnType<typeof createServerClient>
  ): Promise<Permission[]> {
    if (context.subjectType !== 'user') return [];

    // Get user's roles
    const { data: userRoles } = await supabase
      .from('winter_user_roles')
      .select('role_id')
      .eq('user_id', context.subjectId);

    if (!userRoles || userRoles.length === 0) return [];

    const roleIds = userRoles.map((r) => r.role_id);

    // Get permissions for those roles on this resource
    const { data: rolePermissions } = await supabase
      .from('winter_permissions')
      .select('*')
      .in('subject_id', roleIds)
      .eq('subject_type', 'role')
      .eq('resource_id', context.resourceId);

    return (rolePermissions || []).map(this.mapToPermission);
  }

  /**
   * Get group-based permissions for a user
   */
  private async getGroupPermissions(
    context: PermissionContext,
    supabase: ReturnType<typeof createServerClient>
  ): Promise<Permission[]> {
    if (context.subjectType !== 'user') return [];

    // Get user's groups
    const { data: userGroups } = await supabase
      .from('winter_group_members')
      .select('group_id')
      .eq('user_id', context.subjectId);

    if (!userGroups || userGroups.length === 0) return [];

    const groupIds = userGroups.map((g) => g.group_id);

    // Get permissions for those groups on this resource
    const { data: groupPermissions } = await supabase
      .from('winter_permissions')
      .select('*')
      .in('subject_id', groupIds)
      .eq('subject_type', 'group')
      .eq('resource_id', context.resourceId);

    return (groupPermissions || []).map(this.mapToPermission);
  }

  /**
   * Resolve inherited permissions from parent resources
   */
  private async resolveInheritedPermission(
    context: PermissionContext,
    supabase: ReturnType<typeof createServerClient>
  ): Promise<PermissionResolutionResult | null> {
    // Get parent resource
    const { data: resource } = await supabase
      .from('winter_resources')
      .select('parent_id')
      .eq('id', context.resourceId)
      .maybeSingle();

    if (!resource?.parent_id) return null;

    // Check for subtree permissions on parent
    const { data: parentPermissions } = await supabase
      .from('winter_permissions')
      .select('*')
      .eq('subject_id', context.subjectId)
      .eq('resource_id', resource.parent_id)
      .eq('scope', 'subtree');

    if (parentPermissions && parentPermissions.length > 0) {
      const permission = this.mapToPermission(parentPermissions[0]);
      if (permission.inheritance !== 'override' && this.isConditionMet(permission, context)) {
        return {
          allowed: permission.level !== 'none',
          level: permission.level,
          source: 'inherited',
          grantingPermission: permission,
          inheritancePath: [resource.parent_id],
          evaluatedPermissions: [permission],
        };
      }
    }

    // Recursively check parent's parent
    const parentResult = await this.resolveInheritedPermission(
      {
        ...context,
        resourceId: resource.parent_id,
      },
      supabase
    );

    if (parentResult?.allowed) {
      return {
        ...parentResult,
        inheritancePath: [resource.parent_id, ...(parentResult.inheritancePath || [])],
      };
    }

    return null;
  }

  /**
   * Merge multiple permissions into one effective permission
   */
  private mergePermissions(permissions: Permission[]): Permission | null {
    if (permissions.length === 0) return null;

    // Sort by level (highest first) and take the highest
    const sorted = [...permissions].sort(
      (a, b) => LevelValues[b.level] - LevelValues[a.level]
    );

    return sorted[0];
  }

  /**
   * Check if permission conditions are met
   */
  private isConditionMet(permission: Permission, context: PermissionContext): boolean {
    if (!permission.conditions || permission.conditions.length === 0) return true;

    const timestamp = context.timestamp || new Date();

    for (const condition of permission.conditions) {
      switch (condition.type) {
        case 'time_range': {
          const { start, end } = condition.config as { start?: string; end?: string };
          if (start && new Date(start) > timestamp) return false;
          if (end && new Date(end) < timestamp) return false;
          break;
        }
        case 'ip_range': {
          const { allowedIps } = condition.config as { allowedIps?: string[] };
          const clientIp = context.context?.clientIp as string | undefined;
          if (allowedIps && clientIp && !allowedIps.includes(clientIp)) return false;
          break;
        }
        case 'mfa_required': {
          const mfaVerified = context.context?.mfaVerified as boolean | undefined;
          if (!mfaVerified) return false;
          break;
        }
      }
    }

    return true;
  }

  /**
   * Check if a permission has expired
   */
  private isExpired(permission: Permission): boolean {
    if (!permission.expiresAt) return false;
    return new Date(permission.expiresAt) < new Date();
  }

  /**
   * Map database row to Permission type
   */
  private mapToPermission(data: Record<string, unknown>): Permission {
    return {
      id: data.id as string,
      subjectId: data.subject_id as string,
      subjectType: data.subject_type as 'user' | 'role' | 'group' | 'service',
      level: data.level as PermissionLevel,
      scope: data.scope as PermissionScope,
      inheritance: (data.inheritance as InheritanceMode) || 'inherit',
      conditions: (data.conditions as Permission['conditions']) || [],
      grantedAt: data.granted_at as string,
      expiresAt: data.expires_at as string | null,
      grantedBy: data.granted_by as string | undefined,
    };
  }

  /**
   * Build result from permission
   */
  private buildResult(
    permission: Permission,
    source: 'direct' | 'inherited' | 'role' | 'group',
    evaluatedPermissions: Permission[]
  ): PermissionResolutionResult {
    return {
      allowed: permission.level !== 'none' && !this.isExpired(permission),
      level: permission.level,
      source,
      grantingPermission: permission,
      evaluatedPermissions,
    };
  }

  /**
   * Cache the result
   */
  private cacheResult(key: string, result: PermissionResolutionResult): void {
    if (!this.cacheEnabled) return;

    this.permissionCache.set(key, {
      level: result.level,
      source: result.source,
      sourcePermission: result.grantingPermission,
      inheritancePath: result.inheritancePath,
    });
  }

  /**
   * Clear the permission cache
   */
  clearCache(): void {
    this.permissionCache.clear();
    this.hierarchyCache.clear();
  }

  /**
   * Invalidate cache for a specific subject or resource
   */
  invalidateCache(id: string): void {
    for (const key of this.permissionCache.keys()) {
      if (key.includes(id)) {
        this.permissionCache.delete(key);
      }
    }
    this.hierarchyCache.delete(id);
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Compare two permission levels
 * Returns: positive if a > b, negative if a < b, 0 if equal
 */
export function comparePermissionLevels(a: PermissionLevel, b: PermissionLevel): number {
  return LevelValues[a] - LevelValues[b];
}

/**
 * Check if a permission level grants at least the required level
 */
export function hasPermissionLevel(
  actual: PermissionLevel,
  required: PermissionLevel
): boolean {
  return LevelValues[actual] >= LevelValues[required];
}

/**
 * Get the highest permission level from a list
 */
export function getHighestPermissionLevel(levels: PermissionLevel[]): PermissionLevel {
  if (levels.length === 0) return 'none';
  return levels.reduce((highest, current) =>
    LevelValues[current] > LevelValues[highest] ? current : highest
  );
}

/**
 * Create a permission resolver instance
 */
export function createPermissionResolver(cacheEnabled: boolean = true): PermissionResolver {
  return new PermissionResolver(cacheEnabled);
}

// ============================================
// Default Export
// ============================================

let defaultResolver: PermissionResolver | null = null;

export function getPermissionResolver(): PermissionResolver {
  if (!defaultResolver) {
    defaultResolver = new PermissionResolver(true);
  }
  return defaultResolver;
}
