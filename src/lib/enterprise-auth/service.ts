/**
 * Enterprise Authentication Service
 *
 * SSO/SAML/SCIM management and advanced RBAC.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  SSOConnection,
  SAMLConfig,
  OIDCConfig,
  SCIMConfig,
  Permission,
  Role,
  CustomRole,
  AccessPolicy,
  AuthAuditEvent,
  AuthEventType,
  hasPermission,
  getPermissionsForRole,
  validateSAMLConfig,
} from './types';

export class EnterpriseAuthService {
  constructor(private supabase: SupabaseClient) {}

  // ============================================
  // SSO Connection Management
  // ============================================

  async listSSOConnections(organizationId: string): Promise<SSOConnection[]> {
    const { data, error } = await this.supabase
      .from('sso_connections')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to list SSO connections: ${error.message}`);

    return (data || []).map(this.mapSSOConnection);
  }

  async getSSOConnection(connectionId: string): Promise<SSOConnection | null> {
    const { data, error } = await this.supabase
      .from('sso_connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (error) return null;
    return this.mapSSOConnection(data);
  }

  async createSSOConnection(
    organizationId: string,
    connection: Omit<SSOConnection, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
  ): Promise<SSOConnection> {
    // Validate SAML config if applicable
    if (connection.config.type === 'saml') {
      const validation = validateSAMLConfig(connection.config);
      if (!validation.valid) {
        throw new Error(`Invalid SAML config: ${validation.errors.join(', ')}`);
      }
    }

    const { data, error } = await this.supabase
      .from('sso_connections')
      .insert({
        organization_id: organizationId,
        provider: connection.provider,
        name: connection.name,
        enabled: connection.enabled,
        domains: connection.domains,
        config: connection.config,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create SSO connection: ${error.message}`);

    return this.mapSSOConnection(data);
  }

  async updateSSOConnection(
    connectionId: string,
    updates: Partial<SSOConnection>
  ): Promise<SSOConnection> {
    const { data, error } = await this.supabase
      .from('sso_connections')
      .update({
        name: updates.name,
        enabled: updates.enabled,
        domains: updates.domains,
        config: updates.config,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update SSO connection: ${error.message}`);

    return this.mapSSOConnection(data);
  }

  async deleteSSOConnection(connectionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('sso_connections')
      .delete()
      .eq('id', connectionId);

    if (error) throw new Error(`Failed to delete SSO connection: ${error.message}`);
  }

  async getSSOConnectionByDomain(domain: string): Promise<SSOConnection | null> {
    const { data, error } = await this.supabase
      .from('sso_connections')
      .select('*')
      .contains('domains', [domain])
      .eq('enabled', true)
      .single();

    if (error) return null;
    return this.mapSSOConnection(data);
  }

  // ============================================
  // SCIM Configuration
  // ============================================

  async getSCIMConfig(organizationId: string): Promise<SCIMConfig | null> {
    const { data, error } = await this.supabase
      .from('scim_configs')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (error) return null;

    return {
      id: data.id,
      organizationId: data.organization_id,
      enabled: data.enabled,
      baseUrl: data.base_url,
      bearerToken: data.bearer_token,
      provisioningEnabled: data.provisioning_enabled,
      deprovisioningEnabled: data.deprovisioning_enabled,
      groupSyncEnabled: data.group_sync_enabled,
      syncInterval: data.sync_interval,
      lastSyncAt: data.last_sync_at,
      lastSyncStatus: data.last_sync_status,
    };
  }

  async updateSCIMConfig(
    organizationId: string,
    config: Partial<SCIMConfig>
  ): Promise<SCIMConfig> {
    const { data, error } = await this.supabase
      .from('scim_configs')
      .upsert({
        organization_id: organizationId,
        enabled: config.enabled,
        base_url: config.baseUrl,
        bearer_token: config.bearerToken,
        provisioning_enabled: config.provisioningEnabled,
        deprovisioning_enabled: config.deprovisioningEnabled,
        group_sync_enabled: config.groupSyncEnabled,
        sync_interval: config.syncInterval,
      }, {
        onConflict: 'organization_id',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to update SCIM config: ${error.message}`);

    return {
      id: data.id,
      organizationId: data.organization_id,
      enabled: data.enabled,
      baseUrl: data.base_url,
      bearerToken: data.bearer_token,
      provisioningEnabled: data.provisioning_enabled,
      deprovisioningEnabled: data.deprovisioning_enabled,
      groupSyncEnabled: data.group_sync_enabled,
      syncInterval: data.sync_interval,
      lastSyncAt: data.last_sync_at,
      lastSyncStatus: data.last_sync_status,
    };
  }

  async generateSCIMToken(organizationId: string): Promise<string> {
    // Generate a secure random token
    const token = crypto.randomUUID() + crypto.randomUUID();

    // Update SCIM config with new token
    await this.supabase
      .from('scim_configs')
      .update({
        bearer_token: token,
      })
      .eq('organization_id', organizationId);

    return token;
  }

  // ============================================
  // Custom Roles
  // ============================================

  async listCustomRoles(organizationId: string): Promise<CustomRole[]> {
    const { data, error } = await this.supabase
      .from('custom_roles')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');

    if (error) throw new Error(`Failed to list custom roles: ${error.message}`);

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      permissions: row.permissions,
      isSystem: false,
      organizationId: row.organization_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));
  }

  async createCustomRole(
    organizationId: string,
    role: Omit<CustomRole, 'id' | 'organizationId' | 'isSystem' | 'createdAt'>,
    createdBy: string
  ): Promise<CustomRole> {
    const { data, error } = await this.supabase
      .from('custom_roles')
      .insert({
        organization_id: organizationId,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create custom role: ${error.message}`);

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      permissions: data.permissions,
      isSystem: false,
      organizationId: data.organization_id,
      createdBy: data.created_by,
      createdAt: data.created_at,
    };
  }

  async updateCustomRole(
    roleId: string,
    updates: Partial<CustomRole>
  ): Promise<CustomRole> {
    const { data, error } = await this.supabase
      .from('custom_roles')
      .update({
        name: updates.name,
        description: updates.description,
        permissions: updates.permissions,
      })
      .eq('id', roleId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update custom role: ${error.message}`);

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      permissions: data.permissions,
      isSystem: false,
      organizationId: data.organization_id,
      createdBy: data.created_by,
      createdAt: data.created_at,
    };
  }

  async deleteCustomRole(roleId: string): Promise<void> {
    // Check if any users are assigned this role
    const { data: users } = await this.supabase
      .from('organization_members')
      .select('id')
      .eq('custom_role_id', roleId)
      .limit(1);

    if (users && users.length > 0) {
      throw new Error('Cannot delete role with assigned users');
    }

    const { error } = await this.supabase
      .from('custom_roles')
      .delete()
      .eq('id', roleId);

    if (error) throw new Error(`Failed to delete custom role: ${error.message}`);
  }

  // ============================================
  // Permission Checking
  // ============================================

  async checkPermission(
    userId: string,
    organizationId: string,
    permission: Permission
  ): Promise<boolean> {
    // Get user's role and custom role if applicable
    const { data: membership } = await this.supabase
      .from('organization_members')
      .select('role, custom_role_id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .single();

    if (!membership) return false;

    let customRole: CustomRole | undefined;
    if (membership.custom_role_id) {
      const { data: roleData } = await this.supabase
        .from('custom_roles')
        .select('*')
        .eq('id', membership.custom_role_id)
        .single();

      if (roleData) {
        customRole = {
          id: roleData.id,
          name: roleData.name,
          description: roleData.description,
          permissions: roleData.permissions,
          isSystem: false,
          organizationId: roleData.organization_id,
          createdBy: roleData.created_by,
          createdAt: roleData.created_at,
        };
      }
    }

    const permissions = getPermissionsForRole(membership.role, customRole);
    return hasPermission(permissions, permission);
  }

  async getUserPermissions(
    userId: string,
    organizationId: string
  ): Promise<Permission[]> {
    const { data: membership } = await this.supabase
      .from('organization_members')
      .select('role, custom_role_id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .single();

    if (!membership) return [];

    let customRole: CustomRole | undefined;
    if (membership.custom_role_id) {
      const { data: roleData } = await this.supabase
        .from('custom_roles')
        .select('*')
        .eq('id', membership.custom_role_id)
        .single();

      if (roleData) {
        customRole = {
          id: roleData.id,
          name: roleData.name,
          description: roleData.description,
          permissions: roleData.permissions,
          isSystem: false,
          organizationId: roleData.organization_id,
          createdBy: roleData.created_by,
          createdAt: roleData.created_at,
        };
      }
    }

    return getPermissionsForRole(membership.role, customRole);
  }

  // ============================================
  // Audit Logging
  // ============================================

  async logAuthEvent(event: Omit<AuthAuditEvent, 'id' | 'timestamp'>): Promise<void> {
    await this.supabase.from('auth_audit_events').insert({
      organization_id: event.organizationId,
      user_id: event.userId,
      event_type: event.eventType,
      ip_address: event.ipAddress,
      user_agent: event.userAgent,
      success: event.success,
      error_message: event.errorMessage,
      metadata: event.metadata,
    });
  }

  async getAuthAuditLog(
    organizationId: string,
    options?: {
      userId?: string;
      eventType?: AuthEventType;
      startDate?: string;
      endDate?: string;
      limit?: number;
    }
  ): Promise<AuthAuditEvent[]> {
    let query = this.supabase
      .from('auth_audit_events')
      .select('*')
      .eq('organization_id', organizationId)
      .order('timestamp', { ascending: false });

    if (options?.userId) {
      query = query.eq('user_id', options.userId);
    }
    if (options?.eventType) {
      query = query.eq('event_type', options.eventType);
    }
    if (options?.startDate) {
      query = query.gte('timestamp', options.startDate);
    }
    if (options?.endDate) {
      query = query.lte('timestamp', options.endDate);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data } = await query;

    return (data || []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      eventType: row.event_type,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      success: row.success,
      errorMessage: row.error_message,
      metadata: row.metadata,
      timestamp: row.timestamp,
    }));
  }

  // ============================================
  // Helper Methods
  // ============================================

  private mapSSOConnection(row: Record<string, unknown>): SSOConnection {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      provider: row.provider as SSOConnection['provider'],
      name: row.name as string,
      enabled: row.enabled as boolean,
      domains: row.domains as string[],
      config: row.config as SAMLConfig | OIDCConfig,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export function createEnterpriseAuthService(supabase: SupabaseClient): EnterpriseAuthService {
  return new EnterpriseAuthService(supabase);
}
