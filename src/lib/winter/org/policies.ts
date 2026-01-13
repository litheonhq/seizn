/**
 * Seizn Winter - Organization Policy Management
 *
 * Policy management for organizations including:
 * - Retention policies (data lifecycle)
 * - PII policies (data handling)
 * - Access policies (security controls)
 * - Audit policies (logging configuration)
 * - Security policies (authentication/authorization)
 */

import { createServerClient } from '@/lib/supabase';
import type {
  OrgPolicy,
  PolicyType,
  PolicyConfig,
  PolicyScope,
  RetentionPolicyConfig,
  PiiPolicyConfig,
  AccessPolicyConfig,
  AuditPolicyConfig,
  SecurityPolicyConfig,
  PaginatedResult,
} from './types';
import { logAuditEvent } from './audit-log';

// ============================================
// Types
// ============================================

export interface CreatePolicyParams {
  organization_id: string;
  policy_type: PolicyType;
  name: string;
  description?: string;
  config: PolicyConfig;
  scope?: PolicyScope;
  priority?: number;
  created_by: string;
}

export interface UpdatePolicyParams {
  id: string;
  name?: string;
  description?: string;
  config?: Partial<PolicyConfig>;
  scope?: PolicyScope;
  priority?: number;
  is_active?: boolean;
}

export interface ListPoliciesParams {
  organization_id: string;
  policy_type?: PolicyType;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

// ============================================
// Default Policy Configurations
// ============================================

export const DEFAULT_RETENTION_POLICY: RetentionPolicyConfig = {
  type: 'retention_policy',
  retention_days: 90,
  grace_period_days: 30,
  data_types: ['memories', 'traces', 'documents'],
  exempt_tags: [],
};

export const DEFAULT_PII_POLICY: PiiPolicyConfig = {
  type: 'pii_policy',
  default_action: 'mask',
  auto_detect: true,
  notify_on_detection: false,
};

export const DEFAULT_ACCESS_POLICY: AccessPolicyConfig = {
  type: 'access_policy',
  require_2fa: false,
  session_timeout_minutes: 1440, // 24 hours
  max_sessions: 10,
};

export const DEFAULT_AUDIT_POLICY: AuditPolicyConfig = {
  type: 'audit_policy',
  log_all_api_calls: true,
  log_reads: false,
  log_writes: true,
  log_auth_events: true,
  log_admin_actions: true,
  log_retention_days: 90,
};

export const DEFAULT_SECURITY_POLICY: SecurityPolicyConfig = {
  type: 'security_policy',
  password_policy: {
    min_length: 8,
    require_uppercase: true,
    require_lowercase: true,
    require_numbers: true,
    require_special: false,
  },
  api_key_policy: {
    max_keys_per_user: 10,
    require_rotation: false,
  },
  webhook_policy: {
    require_https: true,
    require_signature: true,
  },
};

/**
 * Get default policy configuration for a policy type
 */
export function getDefaultPolicyConfig(policyType: PolicyType): PolicyConfig {
  switch (policyType) {
    case 'retention_policy':
      return DEFAULT_RETENTION_POLICY;
    case 'pii_policy':
      return DEFAULT_PII_POLICY;
    case 'access_policy':
      return DEFAULT_ACCESS_POLICY;
    case 'audit_policy':
      return DEFAULT_AUDIT_POLICY;
    case 'security_policy':
      return DEFAULT_SECURITY_POLICY;
    default:
      throw new Error(`Unknown policy type: ${policyType}`);
  }
}

// ============================================
// Policy CRUD Operations
// ============================================

/**
 * Create a new organization policy
 */
export async function createPolicy(params: CreatePolicyParams): Promise<OrgPolicy> {
  const supabase = createServerClient();

  // Merge with default config
  const defaultConfig = getDefaultPolicyConfig(params.policy_type);
  const mergedConfig = {
    ...defaultConfig,
    ...params.config,
  };

  const { data, error } = await supabase
    .from('winter_org_policies')
    .insert({
      organization_id: params.organization_id,
      policy_type: params.policy_type,
      name: params.name,
      description: params.description,
      config: mergedConfig,
      scope: params.scope || { all: true },
      priority: params.priority || 0,
      is_active: true,
      created_by: params.created_by,
    })
    .select()
    .single();

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: params.created_by,
    organization_id: params.organization_id,
    action: 'policy.create',
    resource_type: 'policies',
    resource_id: data.id,
    details: {
      policy_type: params.policy_type,
      name: params.name,
    },
    new_state: mergedConfig,
    status: 'success',
  });

  return data as OrgPolicy;
}

/**
 * Get a policy by ID
 */
export async function getPolicy(policyId: string): Promise<OrgPolicy | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_org_policies')
    .select('*')
    .eq('id', policyId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as OrgPolicy;
}

/**
 * List policies for an organization
 */
export async function listPolicies(
  params: ListPoliciesParams
): Promise<PaginatedResult<OrgPolicy>> {
  const supabase = createServerClient();

  const limit = params.limit || 50;
  const offset = params.offset || 0;

  let query = supabase
    .from('winter_org_policies')
    .select('*', { count: 'exact' })
    .eq('organization_id', params.organization_id)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.policy_type) {
    query = query.eq('policy_type', params.policy_type);
  }

  if (params.is_active !== undefined) {
    query = query.eq('is_active', params.is_active);
  }

  const { data, error, count } = await query;

  if (error) {
    // Table might not exist yet
    if (error.code === '42P01') {
      return { data: [], total: 0, limit, offset, has_more: false };
    }
    throw error;
  }

  return {
    data: (data || []) as OrgPolicy[],
    total: count || 0,
    limit,
    offset,
    has_more: (count || 0) > offset + limit,
  };
}

/**
 * Update a policy
 */
export async function updatePolicy(
  params: UpdatePolicyParams,
  updatedBy: string
): Promise<OrgPolicy> {
  const supabase = createServerClient();

  // Get current state
  const current = await getPolicy(params.id);
  if (!current) {
    throw new Error('Policy not found');
  }

  // Build update object
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.scope !== undefined) updates.scope = params.scope;
  if (params.priority !== undefined) updates.priority = params.priority;
  if (params.is_active !== undefined) updates.is_active = params.is_active;

  if (params.config) {
    updates.config = {
      ...current.config,
      ...params.config,
    };
  }

  const { data, error } = await supabase
    .from('winter_org_policies')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: updatedBy,
    organization_id: current.organization_id,
    action: 'policy.update',
    resource_type: 'policies',
    resource_id: params.id,
    previous_state: current.config as unknown as Record<string, unknown>,
    new_state: (updates.config || current.config) as unknown as Record<string, unknown>,
    details: {
      updated_fields: Object.keys(params).filter((k) => k !== 'id'),
    },
    status: 'success',
  });

  return data as OrgPolicy;
}

/**
 * Delete a policy
 */
export async function deletePolicy(
  policyId: string,
  deletedBy: string
): Promise<void> {
  const supabase = createServerClient();

  // Get policy for audit log
  const policy = await getPolicy(policyId);
  if (!policy) {
    throw new Error('Policy not found');
  }

  const { error } = await supabase
    .from('winter_org_policies')
    .delete()
    .eq('id', policyId);

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: deletedBy,
    organization_id: policy.organization_id,
    action: 'policy.delete',
    resource_type: 'policies',
    resource_id: policyId,
    previous_state: policy.config as unknown as Record<string, unknown>,
    details: {
      policy_type: policy.policy_type,
      name: policy.name,
    },
    status: 'success',
  });
}

/**
 * Activate a policy
 */
export async function activatePolicy(
  policyId: string,
  activatedBy: string
): Promise<OrgPolicy> {
  const policy = await updatePolicy(
    { id: policyId, is_active: true },
    activatedBy
  );

  await logAuditEvent({
    user_id: activatedBy,
    organization_id: policy.organization_id,
    action: 'policy.activate',
    resource_type: 'policies',
    resource_id: policyId,
    details: {
      policy_type: policy.policy_type,
      name: policy.name,
    },
    status: 'success',
  });

  return policy;
}

/**
 * Deactivate a policy
 */
export async function deactivatePolicy(
  policyId: string,
  deactivatedBy: string
): Promise<OrgPolicy> {
  const policy = await updatePolicy(
    { id: policyId, is_active: false },
    deactivatedBy
  );

  await logAuditEvent({
    user_id: deactivatedBy,
    organization_id: policy.organization_id,
    action: 'policy.deactivate',
    resource_type: 'policies',
    resource_id: policyId,
    details: {
      policy_type: policy.policy_type,
      name: policy.name,
    },
    status: 'success',
  });

  return policy;
}

// ============================================
// Policy Resolution
// ============================================

/**
 * Get the effective policy for a specific type in an organization
 * Returns the highest priority active policy matching the scope
 */
export async function getEffectivePolicy<T extends PolicyConfig>(
  organizationId: string,
  policyType: PolicyType,
  context?: { team_id?: string; user_id?: string }
): Promise<T | null> {
  const supabase = createServerClient();

  // Get all active policies of this type, ordered by priority
  const { data: policies, error } = await supabase
    .from('winter_org_policies')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('policy_type', policyType)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error) {
    if (error.code === '42P01') return null;
    throw error;
  }

  if (!policies || policies.length === 0) {
    return null;
  }

  // Find the first policy that matches the scope
  for (const policy of policies) {
    const scope = policy.scope as PolicyScope;

    // Check if policy applies to all
    if (scope.all) {
      return policy.config as T;
    }

    // Check if policy applies to specific team
    if (context?.team_id && scope.team_ids?.includes(context.team_id)) {
      return policy.config as T;
    }

    // Check if policy applies to specific user
    if (context?.user_id && scope.user_ids?.includes(context.user_id)) {
      return policy.config as T;
    }
  }

  // Return the first policy (highest priority) as fallback
  return (policies[0]?.config as T) || null;
}

/**
 * Get effective retention policy for an organization
 */
export async function getRetentionPolicy(
  organizationId: string,
  context?: { team_id?: string; user_id?: string }
): Promise<RetentionPolicyConfig> {
  const policy = await getEffectivePolicy<RetentionPolicyConfig>(
    organizationId,
    'retention_policy',
    context
  );
  return policy || DEFAULT_RETENTION_POLICY;
}

/**
 * Get effective PII policy for an organization
 */
export async function getPiiPolicy(
  organizationId: string,
  context?: { team_id?: string; user_id?: string }
): Promise<PiiPolicyConfig> {
  const policy = await getEffectivePolicy<PiiPolicyConfig>(
    organizationId,
    'pii_policy',
    context
  );
  return policy || DEFAULT_PII_POLICY;
}

/**
 * Get effective access policy for an organization
 */
export async function getAccessPolicy(
  organizationId: string,
  context?: { team_id?: string; user_id?: string }
): Promise<AccessPolicyConfig> {
  const policy = await getEffectivePolicy<AccessPolicyConfig>(
    organizationId,
    'access_policy',
    context
  );
  return policy || DEFAULT_ACCESS_POLICY;
}

/**
 * Get effective audit policy for an organization
 */
export async function getAuditPolicy(
  organizationId: string,
  context?: { team_id?: string; user_id?: string }
): Promise<AuditPolicyConfig> {
  const policy = await getEffectivePolicy<AuditPolicyConfig>(
    organizationId,
    'audit_policy',
    context
  );
  return policy || DEFAULT_AUDIT_POLICY;
}

/**
 * Get effective security policy for an organization
 */
export async function getSecurityPolicy(
  organizationId: string,
  context?: { team_id?: string; user_id?: string }
): Promise<SecurityPolicyConfig> {
  const policy = await getEffectivePolicy<SecurityPolicyConfig>(
    organizationId,
    'security_policy',
    context
  );
  return policy || DEFAULT_SECURITY_POLICY;
}

// ============================================
// Policy Validation
// ============================================

/**
 * Validate a policy configuration
 */
export function validatePolicyConfig(
  policyType: PolicyType,
  config: PolicyConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (policyType) {
    case 'retention_policy': {
      const c = config as RetentionPolicyConfig;
      if (c.retention_days < 1) {
        errors.push('Retention days must be at least 1');
      }
      if (c.retention_days > 3650) {
        errors.push('Retention days cannot exceed 10 years (3650 days)');
      }
      if (c.grace_period_days < 0) {
        errors.push('Grace period cannot be negative');
      }
      if (c.data_types.length === 0) {
        errors.push('At least one data type must be selected');
      }
      break;
    }
    case 'pii_policy': {
      const c = config as PiiPolicyConfig;
      const validActions = ['allow', 'mask', 'deny', 'encrypt'];
      if (!validActions.includes(c.default_action)) {
        errors.push(`Invalid default action: ${c.default_action}`);
      }
      break;
    }
    case 'access_policy': {
      const c = config as AccessPolicyConfig;
      if (c.session_timeout_minutes < 5) {
        errors.push('Session timeout must be at least 5 minutes');
      }
      if (c.max_sessions < 1) {
        errors.push('Max sessions must be at least 1');
      }
      break;
    }
    case 'audit_policy': {
      const c = config as AuditPolicyConfig;
      if (c.log_retention_days < 7) {
        errors.push('Audit log retention must be at least 7 days');
      }
      break;
    }
    case 'security_policy': {
      const c = config as SecurityPolicyConfig;
      if (c.password_policy.min_length < 8) {
        errors.push('Password minimum length must be at least 8');
      }
      if (c.api_key_policy.max_keys_per_user < 1) {
        errors.push('Max API keys per user must be at least 1');
      }
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// Policy Templates
// ============================================

export interface PolicyTemplate {
  name: string;
  description: string;
  policy_type: PolicyType;
  config: PolicyConfig;
}

/**
 * Get predefined policy templates
 */
export function getPolicyTemplates(): PolicyTemplate[] {
  return [
    {
      name: 'GDPR Compliant Retention',
      description: 'Retain data for maximum required period with proper deletion',
      policy_type: 'retention_policy',
      config: {
        type: 'retention_policy',
        retention_days: 365,
        grace_period_days: 30,
        data_types: ['memories', 'traces', 'documents', 'audit_logs'],
        exempt_tags: ['legal_hold'],
      } as RetentionPolicyConfig,
    },
    {
      name: 'Strict PII Protection',
      description: 'Deny any data containing PII',
      policy_type: 'pii_policy',
      config: {
        type: 'pii_policy',
        default_action: 'deny',
        auto_detect: true,
        notify_on_detection: true,
        type_actions: {
          email: 'mask',
          phone: 'mask',
        },
      } as PiiPolicyConfig,
    },
    {
      name: 'Enterprise Security',
      description: 'Strict security controls for enterprise customers',
      policy_type: 'access_policy',
      config: {
        type: 'access_policy',
        require_2fa: true,
        session_timeout_minutes: 480, // 8 hours
        max_sessions: 3,
        allowed_domains: [],
      } as AccessPolicyConfig,
    },
    {
      name: 'Full Audit Trail',
      description: 'Log all activities for compliance',
      policy_type: 'audit_policy',
      config: {
        type: 'audit_policy',
        log_all_api_calls: true,
        log_reads: true,
        log_writes: true,
        log_auth_events: true,
        log_admin_actions: true,
        log_retention_days: 365,
      } as AuditPolicyConfig,
    },
    {
      name: 'SOC2 Security',
      description: 'Security policy meeting SOC2 requirements',
      policy_type: 'security_policy',
      config: {
        type: 'security_policy',
        password_policy: {
          min_length: 12,
          require_uppercase: true,
          require_lowercase: true,
          require_numbers: true,
          require_special: true,
          max_age_days: 90,
        },
        api_key_policy: {
          max_keys_per_user: 5,
          max_age_days: 365,
          require_rotation: true,
        },
        webhook_policy: {
          require_https: true,
          require_signature: true,
        },
      } as SecurityPolicyConfig,
    },
  ];
}
