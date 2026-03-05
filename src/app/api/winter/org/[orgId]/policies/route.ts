/**
 * Winter Governance - Policies API
 *
 * GET    /api/winter/org/[orgId]/policies - List policies
 * POST   /api/winter/org/[orgId]/policies - Create policy
 * PATCH  /api/winter/org/[orgId]/policies - Update policy
 * DELETE /api/winter/org/[orgId]/policies - Delete policy
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  getUserOrgRole,
  listPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  activatePolicy,
  deactivatePolicy,
  getDefaultPolicyConfig,
  validatePolicyConfig,
  getPolicyTemplates,
  type PolicyType,
  type PolicyConfig,
} from '@/lib/winter/org';


interface RouteContext {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/winter/org/[orgId]/policies
 * List organization policies
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user has access
    const role = await getUserOrgRole(orgId, user.id);
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const policyType = searchParams.get('type') as PolicyType | undefined;
    const isActive = searchParams.get('is_active');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const includeTemplates = searchParams.get('include_templates') === 'true';

    const policies = await listPolicies({
      organization_id: orgId,
      policy_type: policyType,
      is_active: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      limit,
      offset,
    });

    // Include templates if requested
    let templates = null;
    if (includeTemplates) {
      templates = getPolicyTemplates();
    }

    return NextResponse.json({
      success: true,
      policies: policies.data,
      total: policies.total,
      limit: policies.limit,
      offset: policies.offset,
      has_more: policies.has_more,
      ...(templates && { templates }),
    });
  } catch (error) {
    console.error('[WinterOrg Policies] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/winter/org/[orgId]/policies
 * Create a new policy
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is admin or owner
    const role = await getUserOrgRole(orgId, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to create policies' }, { status: 403 });
    }

    const body = await request.json();
    const { policy_type, name, description, config, scope, priority } = body;

    if (!policy_type) {
      return NextResponse.json({ error: 'Policy type is required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: 'Policy name is required' }, { status: 400 });
    }

    // Validate policy type
    const validTypes: PolicyType[] = [
      'retention_policy',
      'pii_policy',
      'access_policy',
      'audit_policy',
      'security_policy',
    ];
    if (!validTypes.includes(policy_type)) {
      return NextResponse.json({ error: 'Invalid policy type' }, { status: 400 });
    }

    // Get default config and merge with provided config
    const defaultConfig = getDefaultPolicyConfig(policy_type);
    const mergedConfig = {
      ...defaultConfig,
      ...(config || {}),
    } as PolicyConfig;

    // Validate config
    const validation = validatePolicyConfig(policy_type, mergedConfig);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid policy configuration', details: validation.errors },
        { status: 400 }
      );
    }

    const policy = await createPolicy({
      organization_id: orgId,
      policy_type,
      name,
      description,
      config: mergedConfig,
      scope,
      priority,
      created_by: user.id,
    });

    return NextResponse.json({
      success: true,
      policy,
    });
  } catch (error) {
    console.error('[WinterOrg Policies] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/winter/org/[orgId]/policies
 * Update a policy
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is admin or owner
    const role = await getUserOrgRole(orgId, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to update policies' }, { status: 403 });
    }

    const body = await request.json();
    const { policy_id, name, description, config, scope, priority, is_active } = body;

    if (!policy_id) {
      return NextResponse.json({ error: 'Policy ID is required' }, { status: 400 });
    }

    // Handle activate/deactivate
    if (is_active !== undefined && Object.keys(body).length === 2) {
      const policy = is_active
        ? await activatePolicy(policy_id, user.id)
        : await deactivatePolicy(policy_id, user.id);

      return NextResponse.json({
        success: true,
        policy,
      });
    }

    const policy = await updatePolicy(
      {
        id: policy_id,
        name,
        description,
        config,
        scope,
        priority,
        is_active,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      policy,
    });
  } catch (error) {
    console.error('[WinterOrg Policies] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/winter/org/[orgId]/policies
 * Delete a policy
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is admin or owner
    const role = await getUserOrgRole(orgId, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to delete policies' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const policyId = searchParams.get('policy_id');

    if (!policyId) {
      return NextResponse.json({ error: 'Policy ID is required' }, { status: 400 });
    }

    await deletePolicy(policyId, user.id);

    return NextResponse.json({
      success: true,
      deleted: policyId,
    });
  } catch (error) {
    console.error('[WinterOrg Policies] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
