import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ServerErrors, NotFoundErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import {
  getPermissionResolver,
  type PermissionContext,
  type EffectivePermission,
} from '@/lib/winter/graph';
import type { Permission, PermissionLevel, PermissionScope, InheritanceMode } from '@/lib/winter/graph/types';

/**
 * GET /api/winter/graph/permissions/:nodeId
 *
 * Retrieve permissions for a specific node.
 *
 * Returns:
 * - directPermissions: Permissions directly assigned to this node
 * - inheritedPermissions: Permissions inherited from parent nodes
 * - effectivePermissions: Resolved effective permissions per subject
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  try {
    // Validate API key
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { nodeId } = await params;

    if (!nodeId) {
      return NotFoundErrors.resource('node');
    }

    const supabase = createServerClient();
    const userId = authResult.userId;

    // Fetch direct permissions on this node
    const { data: directPerms, error: directError } = await supabase
      .from('winter_permissions')
      .select('*')
      .eq('resource_id', nodeId)
      .eq('scope', 'node');

    if (directError) {
      console.error('Direct permissions error:', directError);
    }

    const directPermissions: Permission[] = (directPerms || []).map(mapToPermission);

    // Fetch inherited permissions (from parent resources with subtree scope)
    const { data: resourceData } = await supabase
      .from('winter_resources')
      .select('parent_id')
      .eq('id', nodeId)
      .maybeSingle();

    const inheritedPermissions: Permission[] = [];

    if (resourceData?.parent_id) {
      // Get all subtree permissions from ancestors
      const ancestors = await getAncestorIds(resourceData.parent_id, supabase);

      if (ancestors.length > 0) {
        const { data: inheritedPerms } = await supabase
          .from('winter_permissions')
          .select('*')
          .in('resource_id', ancestors)
          .eq('scope', 'subtree');

        if (inheritedPerms) {
          inheritedPermissions.push(...inheritedPerms.map(mapToPermission));
        }
      }
    }

    // Calculate effective permissions
    const effectivePermissions: Record<string, EffectivePermission> = {};

    // Combine direct and inherited permissions by subject
    const allPermissions = [...directPermissions, ...inheritedPermissions];
    const permissionsBySubject = new Map<string, Permission[]>();

    for (const perm of allPermissions) {
      const existing = permissionsBySubject.get(perm.subjectId) || [];
      existing.push(perm);
      permissionsBySubject.set(perm.subjectId, existing);
    }

    // Resolve effective permission for each subject
    const resolver = getPermissionResolver();

    for (const [subjectId, permissions] of permissionsBySubject) {
      // Sort by level (highest first) and source (direct > inherited)
      const sorted = permissions.sort((a, b) => {
        const levelDiff = getLevelValue(b.level) - getLevelValue(a.level);
        if (levelDiff !== 0) return levelDiff;
        return a.scope === 'node' ? -1 : 1;
      });

      const highestPerm = sorted[0];
      const isDirect = directPermissions.some((p) => p.id === highestPerm.id);

      effectivePermissions[subjectId] = {
        level: highestPerm.level,
        source: isDirect ? 'direct' : 'inherited',
        sourcePermission: highestPerm,
        inheritancePath: isDirect ? undefined : getInheritancePath(highestPerm, inheritedPermissions),
      };
    }

    // Add requesting user's effective permission if not already included
    if (!effectivePermissions[userId]) {
      const context: PermissionContext = {
        subjectId: userId,
        subjectType: 'user',
        resourceId: nodeId,
        resourceType: 'node',
      };

      try {
        const userResult = await resolver.resolve(context);
        effectivePermissions[userId] = {
          level: userResult.level,
          source: userResult.source,
          sourcePermission: userResult.grantingPermission,
          inheritancePath: userResult.inheritancePath,
        };
      } catch {
        // User has no permission
        effectivePermissions[userId] = {
          level: 'none',
          source: 'default',
        };
      }
    }

    return NextResponse.json({
      success: true,
      nodeId,
      directPermissions,
      inheritedPermissions,
      effectivePermissions,
    });
  } catch (error) {
    console.error('Node permissions error:', error);
    return ServerErrors.internal('node_permissions');
  }
}

// ============================================
// Helper Functions
// ============================================

function mapToPermission(data: Record<string, unknown>): Permission {
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

function getLevelValue(level: PermissionLevel): number {
  const values: Record<PermissionLevel, number> = {
    none: 0,
    read: 1,
    write: 2,
    admin: 3,
    owner: 4,
  };
  return values[level];
}

async function getAncestorIds(
  parentId: string,
  supabase: ReturnType<typeof createServerClient>
): Promise<string[]> {
  const ancestors: string[] = [parentId];

  let currentParentId: string | null = parentId;

  while (currentParentId) {
    const result = await supabase
      .from('winter_resources')
      .select('parent_id')
      .eq('id', currentParentId)
      .maybeSingle();

    const parentData = result.data as { parent_id: string | null } | null;

    if (parentData?.parent_id) {
      ancestors.push(parentData.parent_id);
      currentParentId = parentData.parent_id;
    } else {
      currentParentId = null;
    }
  }

  return ancestors;
}

function getInheritancePath(
  permission: Permission,
  inheritedPermissions: Permission[]
): string[] {
  // Find the resource this permission is from
  const sourceResource = inheritedPermissions.find(
    (p) => p.id === permission.id
  );

  if (sourceResource) {
    // In a real implementation, this would trace back through the hierarchy
    return [permission.subjectId];
  }

  return [];
}
