/**
 * Seizn Winter - OPA Policy Storage
 *
 * Database operations for Rego policy management:
 * - CRUD operations for policies
 * - Policy versioning
 * - Policy scope management
 */

import { createServerClient } from '@/lib/supabase';
import type {
  RegoPolicy,
  RegoPolicyCategory,
  RegoPolicyScope,
  CreateRegoPolicyParams,
  UpdateRegoPolicyParams,
  ListRegoPoliciesParams,
  PolicyValidationResult,
} from './types';
import { getOpaPolicyEngine } from './engine';
import { logAuditEvent } from '../org/audit-log';

// ============================================
// Types
// ============================================

interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================
// Policy CRUD Operations
// ============================================

/**
 * Create a new Rego policy
 */
export async function createRegoPolicy(params: CreateRegoPolicyParams): Promise<RegoPolicy> {
  const supabase = createServerClient();
  const engine = getOpaPolicyEngine();

  // Validate policy syntax
  const validation = engine.validatePolicy(params.regoCode);
  if (!validation.valid) {
    throw new Error(`Invalid policy syntax: ${validation.errors.map((e) => e.message).join(', ')}`);
  }

  const { data, error } = await supabase
    .from('opa_policies')
    .insert({
      organization_id: params.organizationId,
      name: params.name,
      description: params.description,
      category: params.category,
      rego_code: params.regoCode,
      version: 1,
      is_active: false, // Policies start inactive
      priority: params.priority || 0,
      scope: params.scope || { all: true },
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: params.createdBy,
    organization_id: params.organizationId,
    action: 'policy.create',
    resource_type: 'policies',
    resource_id: data.id,
    details: {
      policy_name: params.name,
      category: params.category,
    },
    status: 'success',
  });

  return mapPolicyFromDb(data);
}

/**
 * Get a policy by ID
 */
export async function getRegoPolicy(policyId: string): Promise<RegoPolicy | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('opa_policies')
    .select('*')
    .eq('id', policyId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return mapPolicyFromDb(data);
}

/**
 * List policies for an organization
 */
export async function listRegoPolicies(
  params: ListRegoPoliciesParams
): Promise<PaginatedResult<RegoPolicy>> {
  const supabase = createServerClient();

  const limit = params.limit || 50;
  const offset = params.offset || 0;

  let query = supabase
    .from('opa_policies')
    .select('*', { count: 'exact' })
    .eq('organization_id', params.organizationId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.category) {
    query = query.eq('category', params.category);
  }

  if (params.isActive !== undefined) {
    query = query.eq('is_active', params.isActive);
  }

  const { data, error, count } = await query;

  if (error) {
    // Handle table not existing yet
    if (error.code === '42P01') {
      return { data: [], total: 0, limit, offset, hasMore: false };
    }
    throw error;
  }

  return {
    data: (data || []).map(mapPolicyFromDb),
    total: count || 0,
    limit,
    offset,
    hasMore: (count || 0) > offset + limit,
  };
}

/**
 * Update a policy
 */
export async function updateRegoPolicy(
  params: UpdateRegoPolicyParams,
  updatedBy: string
): Promise<RegoPolicy> {
  const supabase = createServerClient();
  const engine = getOpaPolicyEngine();

  // Get current policy
  const current = await getRegoPolicy(params.id);
  if (!current) {
    throw new Error('Policy not found');
  }

  // Validate new code if provided
  if (params.regoCode) {
    const validation = engine.validatePolicy(params.regoCode);
    if (!validation.valid) {
      throw new Error(
        `Invalid policy syntax: ${validation.errors.map((e) => e.message).join(', ')}`
      );
    }
  }

  // Build update object
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.regoCode !== undefined) {
    updates.rego_code = params.regoCode;
    updates.version = current.version + 1; // Increment version on code change
  }
  if (params.priority !== undefined) updates.priority = params.priority;
  if (params.scope !== undefined) updates.scope = params.scope;
  if (params.isActive !== undefined) updates.is_active = params.isActive;

  const { data, error } = await supabase
    .from('opa_policies')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) throw error;

  // Reload policy in engine if active
  if (data.is_active) {
    engine.unloadPolicy(data.id);
    engine.loadPolicies([mapPolicyFromDb(data)]);
  } else {
    engine.unloadPolicy(data.id);
  }

  // Log audit event
  await logAuditEvent({
    user_id: updatedBy,
    organization_id: current.organizationId,
    action: 'policy.update',
    resource_type: 'policies',
    resource_id: params.id,
    previous_state: {
      name: current.name,
      version: current.version,
      isActive: current.isActive,
    },
    new_state: {
      name: data.name,
      version: data.version,
      isActive: data.is_active,
    },
    details: {
      updated_fields: Object.keys(params).filter((k) => k !== 'id'),
    },
    status: 'success',
  });

  return mapPolicyFromDb(data);
}

/**
 * Delete a policy
 */
export async function deleteRegoPolicy(policyId: string, deletedBy: string): Promise<void> {
  const supabase = createServerClient();
  const engine = getOpaPolicyEngine();

  // Get policy for audit log
  const policy = await getRegoPolicy(policyId);
  if (!policy) {
    throw new Error('Policy not found');
  }

  const { error } = await supabase.from('opa_policies').delete().eq('id', policyId);

  if (error) throw error;

  // Unload from engine
  engine.unloadPolicy(policyId);

  // Log audit event
  await logAuditEvent({
    user_id: deletedBy,
    organization_id: policy.organizationId,
    action: 'policy.delete',
    resource_type: 'policies',
    resource_id: policyId,
    previous_state: {
      name: policy.name,
      category: policy.category,
    },
    details: {
      policy_name: policy.name,
    },
    status: 'success',
  });
}

/**
 * Activate a policy
 */
export async function activateRegoPolicy(policyId: string, activatedBy: string): Promise<RegoPolicy> {
  const policy = await updateRegoPolicy({ id: policyId, isActive: true }, activatedBy);

  // Log specific activation event
  await logAuditEvent({
    user_id: activatedBy,
    organization_id: policy.organizationId,
    action: 'policy.activate',
    resource_type: 'policies',
    resource_id: policyId,
    details: {
      policy_name: policy.name,
      category: policy.category,
    },
    status: 'success',
  });

  return policy;
}

/**
 * Deactivate a policy
 */
export async function deactivateRegoPolicy(
  policyId: string,
  deactivatedBy: string
): Promise<RegoPolicy> {
  const policy = await updateRegoPolicy({ id: policyId, isActive: false }, deactivatedBy);

  // Log specific deactivation event
  await logAuditEvent({
    user_id: deactivatedBy,
    organization_id: policy.organizationId,
    action: 'policy.deactivate',
    resource_type: 'policies',
    resource_id: policyId,
    details: {
      policy_name: policy.name,
      category: policy.category,
    },
    status: 'success',
  });

  return policy;
}

// ============================================
// Policy Loading
// ============================================

/**
 * Load all active policies for an organization into the engine
 */
export async function loadOrganizationPolicies(organizationId: string): Promise<number> {
  const engine = getOpaPolicyEngine();

  const { data: policies } = await listRegoPolicies({
    organizationId,
    isActive: true,
    limit: 1000,
  });

  engine.loadPolicies(policies);

  return policies.length;
}

/**
 * Reload a specific policy in the engine
 */
export async function reloadPolicy(policyId: string): Promise<void> {
  const engine = getOpaPolicyEngine();
  const policy = await getRegoPolicy(policyId);

  if (policy && policy.isActive) {
    engine.unloadPolicy(policyId);
    engine.loadPolicies([policy]);
  } else {
    engine.unloadPolicy(policyId);
  }
}

// ============================================
// Policy Versioning
// ============================================

/**
 * Get policy version history
 */
export async function getPolicyVersionHistory(
  policyId: string,
  limit: number = 10
): Promise<
  Array<{
    version: number;
    regoCode: string;
    updatedAt: string;
    updatedBy: string;
  }>
> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('opa_policy_versions')
    .select('*')
    .eq('policy_id', policyId)
    .order('version', { ascending: false })
    .limit(limit);

  if (error) {
    // Table might not exist
    if (error.code === '42P01') return [];
    throw error;
  }

  return (data || []).map((v) => ({
    version: v.version,
    regoCode: v.rego_code,
    updatedAt: v.created_at,
    updatedBy: v.created_by,
  }));
}

/**
 * Rollback policy to a previous version
 */
export async function rollbackPolicy(
  policyId: string,
  targetVersion: number,
  rolledBackBy: string
): Promise<RegoPolicy> {
  const supabase = createServerClient();

  // Get the target version
  const { data: versionData, error: versionError } = await supabase
    .from('opa_policy_versions')
    .select('rego_code')
    .eq('policy_id', policyId)
    .eq('version', targetVersion)
    .single();

  if (versionError || !versionData) {
    throw new Error(`Version ${targetVersion} not found`);
  }

  // Update with the old code
  return updateRegoPolicy(
    {
      id: policyId,
      regoCode: versionData.rego_code,
    },
    rolledBackBy
  );
}

// ============================================
// Policy Testing
// ============================================

/**
 * Test a policy against sample inputs
 */
export async function testPolicy(
  regoCode: string,
  testCases: Array<{
    name: string;
    input: Record<string, unknown>;
    expectedAllow: boolean;
  }>
): Promise<{
  passed: number;
  failed: number;
  results: Array<{
    name: string;
    passed: boolean;
    expectedAllow: boolean;
    actualAllow: boolean;
    error?: string;
  }>;
}> {
  const engine = getOpaPolicyEngine();

  // Validate policy first
  const validation = engine.validatePolicy(regoCode);
  if (!validation.valid) {
    return {
      passed: 0,
      failed: testCases.length,
      results: testCases.map((tc) => ({
        name: tc.name,
        passed: false,
        expectedAllow: tc.expectedAllow,
        actualAllow: false,
        error: `Policy validation failed: ${validation.errors.map((e) => e.message).join(', ')}`,
      })),
    };
  }

  // Create a temporary policy for testing
  const testPolicy: RegoPolicy = {
    id: 'test-policy',
    organizationId: 'test',
    name: 'Test Policy',
    category: 'custom',
    regoCode,
    version: 1,
    isActive: true,
    priority: 100,
    scope: { all: true },
    createdBy: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Create a separate engine instance for testing
  const testEngine = new (engine.constructor as typeof import('./engine').OpaPolicyEngine)();
  testEngine.loadPolicies([testPolicy]);

  const results = testCases.map((tc) => {
    try {
      const response = testEngine.evaluate({
        input: {
          principal: (tc.input.principal as import('./types').OpaPrincipal) || {
            type: 'user',
            id: 'test-user',
          },
          resource: tc.input.resource as import('./types').OpaResource | undefined,
          action: (tc.input.action as import('./types').OpaAction) || { operation: 'read' },
          context: tc.input.context as import('./types').OpaContext | undefined,
          data: tc.input.data as Record<string, unknown> | undefined,
        },
      });

      return {
        name: tc.name,
        passed: response.decision.allow === tc.expectedAllow,
        expectedAllow: tc.expectedAllow,
        actualAllow: response.decision.allow,
      };
    } catch (error) {
      return {
        name: tc.name,
        passed: false,
        expectedAllow: tc.expectedAllow,
        actualAllow: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  return {
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}

// ============================================
// Policy Import/Export
// ============================================

/**
 * Export policies as JSON
 */
export async function exportPolicies(
  organizationId: string,
  options?: {
    categories?: RegoPolicyCategory[];
    includeInactive?: boolean;
  }
): Promise<{
  exportedAt: string;
  organizationId: string;
  policies: Array<{
    name: string;
    description?: string;
    category: RegoPolicyCategory;
    regoCode: string;
    priority: number;
    scope: RegoPolicyScope;
  }>;
}> {
  const { data: policies } = await listRegoPolicies({
    organizationId,
    category: options?.categories?.[0], // Simplified for now
    isActive: options?.includeInactive ? undefined : true,
    limit: 1000,
  });

  return {
    exportedAt: new Date().toISOString(),
    organizationId,
    policies: policies.map((p) => ({
      name: p.name,
      description: p.description,
      category: p.category,
      regoCode: p.regoCode,
      priority: p.priority,
      scope: p.scope,
    })),
  };
}

/**
 * Import policies from JSON
 */
export async function importPolicies(
  organizationId: string,
  importData: {
    policies: Array<{
      name: string;
      description?: string;
      category: RegoPolicyCategory;
      regoCode: string;
      priority?: number;
      scope?: RegoPolicyScope;
    }>;
  },
  importedBy: string
): Promise<{
  imported: number;
  failed: number;
  errors: Array<{ name: string; error: string }>;
}> {
  let imported = 0;
  let failed = 0;
  const errors: Array<{ name: string; error: string }> = [];

  for (const policyData of importData.policies) {
    try {
      await createRegoPolicy({
        organizationId,
        name: policyData.name,
        description: policyData.description,
        category: policyData.category,
        regoCode: policyData.regoCode,
        priority: policyData.priority,
        scope: policyData.scope,
        createdBy: importedBy,
      });
      imported++;
    } catch (error) {
      failed++;
      errors.push({
        name: policyData.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { imported, failed, errors };
}

// ============================================
// Helper Functions
// ============================================

interface DbPolicy {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  category: RegoPolicyCategory;
  rego_code: string;
  compiled_policy?: Record<string, unknown>;
  version: number;
  is_active: boolean;
  priority: number;
  scope: RegoPolicyScope;
  metadata?: RegoPolicy['metadata'];
  created_by: string;
  created_at: string;
  updated_at: string;
}

function mapPolicyFromDb(data: DbPolicy): RegoPolicy {
  return {
    id: data.id,
    organizationId: data.organization_id,
    name: data.name,
    description: data.description,
    category: data.category,
    regoCode: data.rego_code,
    compiledPolicy: data.compiled_policy,
    version: data.version,
    isActive: data.is_active,
    priority: data.priority,
    scope: data.scope,
    metadata: data.metadata,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
