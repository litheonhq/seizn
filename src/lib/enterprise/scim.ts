/**
 * SCIM Service
 *
 * System for Cross-domain Identity Management
 * RFC 7643 (Core Schema) and RFC 7644 (Protocol)
 */

import type {
  SCIMConfig,
  SCIMUser,
  SCIMGroup,
  SCIMListResponse,
  SCIMError,
} from './types';

const SCIM_SCHEMAS = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  LIST: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
};

export class SCIMService {
  private configs: Map<string, SCIMConfig> = new Map();
  private users: Map<string, SCIMUser> = new Map();
  private groups: Map<string, SCIMGroup> = new Map();

  /**
   * Register SCIM configuration for an organization
   */
  async registerConfig(config: SCIMConfig): Promise<void> {
    this.configs.set(config.orgId, config);
  }

  /**
   * Get SCIM config by organization ID
   */
  getConfig(orgId: string): SCIMConfig | undefined {
    return this.configs.get(orgId);
  }

  /**
   * Validate SCIM bearer token
   */
  validateToken(orgId: string, token: string): boolean {
    const config = this.configs.get(orgId);
    if (!config || !config.enabled) {
      return false;
    }
    return config.bearerToken === token;
  }

  /**
   * List users (GET /scim/v2/Users)
   */
  listUsers(
    orgId: string,
    options: { startIndex?: number; count?: number; filter?: string }
  ): SCIMListResponse<SCIMUser> {
    const { startIndex = 1, count = 100, filter } = options;

    let users = Array.from(this.users.values()).filter(
      (u) => (u as SCIMUser & { orgId?: string }).orgId === orgId
    );

    // Apply filter if provided
    if (filter) {
      users = this.applyUserFilter(users, filter);
    }

    const totalResults = users.length;
    const pagedUsers = users.slice(startIndex - 1, startIndex - 1 + count);

    return {
      schemas: [SCIM_SCHEMAS.LIST],
      totalResults,
      startIndex,
      itemsPerPage: pagedUsers.length,
      Resources: pagedUsers,
    };
  }

  /**
   * Get user by ID (GET /scim/v2/Users/:id)
   */
  getUser(userId: string): SCIMUser | undefined {
    return this.users.get(userId);
  }

  /**
   * Create user (POST /scim/v2/Users)
   */
  createUser(orgId: string, userData: Partial<SCIMUser>): SCIMUser {
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();

    const user: SCIMUser = {
      schemas: [SCIM_SCHEMAS.USER],
      id: userId,
      externalId: userData.externalId,
      userName: userData.userName || '',
      name: userData.name || { givenName: '', familyName: '' },
      displayName: userData.displayName || `${userData.name?.givenName} ${userData.name?.familyName}`,
      emails: userData.emails || [],
      active: userData.active !== false,
      groups: userData.groups,
      meta: {
        resourceType: 'User',
        created: now,
        lastModified: now,
        location: `/scim/v2/Users/${userId}`,
      },
    };

    // Store with orgId for filtering
    (user as SCIMUser & { orgId: string }).orgId = orgId;
    this.users.set(userId, user);

    // Provision user in the system
    this.provisionUser(orgId, user);

    return user;
  }

  /**
   * Update user (PUT /scim/v2/Users/:id)
   */
  updateUser(userId: string, userData: Partial<SCIMUser>): SCIMUser | undefined {
    const existing = this.users.get(userId);
    if (!existing) {
      return undefined;
    }

    const updated: SCIMUser = {
      ...existing,
      ...userData,
      id: existing.id,
      schemas: existing.schemas,
      meta: {
        ...existing.meta,
        lastModified: new Date().toISOString(),
      },
    };

    this.users.set(userId, updated);

    // Update user in the system
    const orgId = (existing as SCIMUser & { orgId?: string }).orgId;
    if (orgId) {
      this.updateProvisionedUser(orgId, updated);
    }

    return updated;
  }

  /**
   * Patch user (PATCH /scim/v2/Users/:id)
   */
  patchUser(
    userId: string,
    operations: Array<{ op: 'add' | 'replace' | 'remove'; path: string; value?: unknown }>
  ): SCIMUser | undefined {
    const user = this.users.get(userId);
    if (!user) {
      return undefined;
    }

    for (const op of operations) {
      this.applyPatchOperation(user, op);
    }

    user.meta.lastModified = new Date().toISOString();
    this.users.set(userId, user);

    return user;
  }

  /**
   * Delete user (DELETE /scim/v2/Users/:id)
   */
  deleteUser(userId: string): boolean {
    const user = this.users.get(userId);
    if (!user) {
      return false;
    }

    // Deprovision user from the system
    const orgId = (user as SCIMUser & { orgId?: string }).orgId;
    if (orgId) {
      this.deprovisionUser(orgId, user);
    }

    return this.users.delete(userId);
  }

  /**
   * List groups (GET /scim/v2/Groups)
   */
  listGroups(
    orgId: string,
    options: { startIndex?: number; count?: number; filter?: string }
  ): SCIMListResponse<SCIMGroup> {
    const { startIndex = 1, count = 100, filter } = options;

    let groups = Array.from(this.groups.values()).filter(
      (g) => (g as SCIMGroup & { orgId?: string }).orgId === orgId
    );

    // Apply filter if provided
    if (filter) {
      groups = this.applyGroupFilter(groups, filter);
    }

    const totalResults = groups.length;
    const pagedGroups = groups.slice(startIndex - 1, startIndex - 1 + count);

    return {
      schemas: [SCIM_SCHEMAS.LIST],
      totalResults,
      startIndex,
      itemsPerPage: pagedGroups.length,
      Resources: pagedGroups,
    };
  }

  /**
   * Get group by ID (GET /scim/v2/Groups/:id)
   */
  getGroup(groupId: string): SCIMGroup | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Create group (POST /scim/v2/Groups)
   */
  createGroup(orgId: string, groupData: Partial<SCIMGroup>): SCIMGroup {
    const now = new Date().toISOString();
    const groupId = crypto.randomUUID();

    const group: SCIMGroup = {
      schemas: [SCIM_SCHEMAS.GROUP],
      id: groupId,
      externalId: groupData.externalId,
      displayName: groupData.displayName || '',
      members: groupData.members,
      meta: {
        resourceType: 'Group',
        created: now,
        lastModified: now,
        location: `/scim/v2/Groups/${groupId}`,
      },
    };

    (group as SCIMGroup & { orgId: string }).orgId = orgId;
    this.groups.set(groupId, group);

    return group;
  }

  /**
   * Update group (PUT /scim/v2/Groups/:id)
   */
  updateGroup(groupId: string, groupData: Partial<SCIMGroup>): SCIMGroup | undefined {
    const existing = this.groups.get(groupId);
    if (!existing) {
      return undefined;
    }

    const updated: SCIMGroup = {
      ...existing,
      ...groupData,
      id: existing.id,
      schemas: existing.schemas,
      meta: {
        ...existing.meta,
        lastModified: new Date().toISOString(),
      },
    };

    this.groups.set(groupId, updated);
    return updated;
  }

  /**
   * Delete group (DELETE /scim/v2/Groups/:id)
   */
  deleteGroup(groupId: string): boolean {
    return this.groups.delete(groupId);
  }

  /**
   * Generate SCIM error response
   */
  static createError(status: number, detail: string): SCIMError {
    return {
      schemas: [SCIM_SCHEMAS.ERROR],
      status: String(status),
      detail,
    };
  }

  // Private methods

  private applyUserFilter(users: SCIMUser[], filter: string): SCIMUser[] {
    // Parse simple SCIM filter expressions
    // e.g., userName eq "john@example.com"
    const match = filter.match(/(\w+)\s+(eq|ne|co|sw)\s+"([^"]+)"/i);
    if (!match) return users;

    const [, attr, op, value] = match;

    return users.filter((user) => {
      let attrValue: string;

      switch (attr.toLowerCase()) {
        case 'username':
          attrValue = user.userName;
          break;
        case 'displayname':
          attrValue = user.displayName || '';
          break;
        case 'externalid':
          attrValue = user.externalId || '';
          break;
        default:
          return true;
      }

      switch (op.toLowerCase()) {
        case 'eq':
          return attrValue.toLowerCase() === value.toLowerCase();
        case 'ne':
          return attrValue.toLowerCase() !== value.toLowerCase();
        case 'co':
          return attrValue.toLowerCase().includes(value.toLowerCase());
        case 'sw':
          return attrValue.toLowerCase().startsWith(value.toLowerCase());
        default:
          return true;
      }
    });
  }

  private applyGroupFilter(groups: SCIMGroup[], filter: string): SCIMGroup[] {
    const match = filter.match(/(\w+)\s+(eq|ne|co|sw)\s+"([^"]+)"/i);
    if (!match) return groups;

    const [, attr, op, value] = match;

    return groups.filter((group) => {
      let attrValue: string;

      switch (attr.toLowerCase()) {
        case 'displayname':
          attrValue = group.displayName;
          break;
        case 'externalid':
          attrValue = group.externalId || '';
          break;
        default:
          return true;
      }

      switch (op.toLowerCase()) {
        case 'eq':
          return attrValue.toLowerCase() === value.toLowerCase();
        case 'ne':
          return attrValue.toLowerCase() !== value.toLowerCase();
        case 'co':
          return attrValue.toLowerCase().includes(value.toLowerCase());
        case 'sw':
          return attrValue.toLowerCase().startsWith(value.toLowerCase());
        default:
          return true;
      }
    });
  }

  private applyPatchOperation(
    user: SCIMUser,
    op: { op: 'add' | 'replace' | 'remove'; path: string; value?: unknown }
  ): void {
    const { op: operation, path, value } = op;

    switch (path.toLowerCase()) {
      case 'active':
        if (operation === 'replace' && typeof value === 'boolean') {
          user.active = value;
        }
        break;
      case 'displayname':
        if ((operation === 'replace' || operation === 'add') && typeof value === 'string') {
          user.displayName = value;
        }
        break;
      case 'name.givenname':
        if ((operation === 'replace' || operation === 'add') && typeof value === 'string') {
          user.name.givenName = value;
        }
        break;
      case 'name.familyname':
        if ((operation === 'replace' || operation === 'add') && typeof value === 'string') {
          user.name.familyName = value;
        }
        break;
    }
  }

  private provisionUser(orgId: string, user: SCIMUser): void {
    // In production, this would create the user in Supabase
    console.log(`Provisioning user ${user.userName} for org ${orgId}`);
  }

  private updateProvisionedUser(orgId: string, user: SCIMUser): void {
    // In production, this would update the user in Supabase
    console.log(`Updating provisioned user ${user.userName} for org ${orgId}`);
  }

  private deprovisionUser(orgId: string, user: SCIMUser): void {
    // In production, this would deactivate/delete the user
    console.log(`Deprovisioning user ${user.userName} for org ${orgId}`);
  }
}

// Singleton instance
let scimInstance: SCIMService | null = null;

export function getSCIMService(): SCIMService {
  if (!scimInstance) {
    scimInstance = new SCIMService();
  }
  return scimInstance;
}
