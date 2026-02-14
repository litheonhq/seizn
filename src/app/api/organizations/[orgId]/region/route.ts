import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getRequestUser } from '@/lib/api/request-user';
import {
  AuthErrors,
  ValidationErrors,
  ServerErrors,
  createApiError,
  ErrorCodes,
} from '@/lib/api-error';
import {
  getRegion,
  isRegionAvailableForPlan,
  getDataResidencyInfo,
  getRegionMigrationInfo,
  type RegionCode,
} from '@/config/regions';

interface RouteContext {
  params: Promise<{ orgId: string }>;
}

// GET /api/organizations/[orgId]/region - Get organization region info
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return AuthErrors.unauthorized('organization_region');
    }

    const { orgId } = await context.params;
    const supabase = createServerClient();

    // Check user is member
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return AuthErrors.unauthorized('organization_region');
    }

    // Get organization with region info
    const { data: org, error } = await supabase
      .from('organizations')
      .select('id, name, plan, data_region, region_locked, region_changed_at')
      .eq('id', orgId)
      .single();

    if (error || !org) {
      return createApiError({
        code: ErrorCodes.NOT_FOUND,
        message: 'Organization not found',
        status: 404,
      });
    }

    // Get region details
    const regionConfig = getRegion(org.data_region);
    const residencyInfo = getDataResidencyInfo(org.data_region);

    // Get region change history (last 5)
    const { data: history } = await supabase
      .from('organization_region_history')
      .select('id, from_region, to_region, reason, change_type, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      success: true,
      region: {
        current: org.data_region,
        locked: org.region_locked,
        lastChanged: org.region_changed_at,
        config: regionConfig,
        residency: residencyInfo,
      },
      history: history || [],
    });
  } catch (error) {
    console.error('Organization region GET error:', error);
    return ServerErrors.internal('get_organization_region');
  }
}

// PATCH /api/organizations/[orgId]/region - Change organization region
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return AuthErrors.unauthorized('organization_region');
    }

    const { orgId } = await context.params;
    const body = await request.json();
    const { region, reason } = body;

    // Validate region
    if (!region) {
      return ValidationErrors.missingField('region');
    }

    const regionConfig = getRegion(region);
    if (!regionConfig) {
      return ValidationErrors.invalidField('region', 'Invalid region code');
    }

    if (!regionConfig.available) {
      return createApiError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: `Region ${region} is not currently available`,
        status: 400,
        details: { region, available: false },
      });
    }

    const supabase = createServerClient();

    // Check user is owner or admin
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return AuthErrors.unauthorized('organization_region');
    }

    // Get current organization info
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, plan, data_region, region_locked')
      .eq('id', orgId)
      .single();

    if (!org) {
      return createApiError({
        code: ErrorCodes.NOT_FOUND,
        message: 'Organization not found',
        status: 404,
      });
    }

    // Check if region is locked
    if (org.region_locked) {
      return createApiError({
        code: ErrorCodes.AUTH_UNAUTHORIZED,
        message: 'Region is locked. Contact support to unlock.',
        status: 403,
        details: { locked: true },
      });
    }

    // Check if already in target region
    if (org.data_region === region) {
      return createApiError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Organization is already in this region',
        status: 400,
        details: { currentRegion: region },
      });
    }

    // Check region availability for plan
    const planType = org.plan as 'free' | 'starter' | 'plus' | 'pro' | 'enterprise';
    if (!isRegionAvailableForPlan(region, planType)) {
      return createApiError({
        code: ErrorCodes.AUTH_UNAUTHORIZED,
        message: `Region ${region} is not available for ${org.plan} plan. Please upgrade to access this region.`,
        status: 403,
        details: { region, plan: org.plan },
      });
    }

    // Call the database function to change region
    const { data: result, error } = await supabase.rpc('change_organization_region', {
      p_org_id: orgId,
      p_user_id: user.id,
      p_new_region: region,
      p_reason: reason || null,
    });

    if (error) {
      console.error('Change region error:', error);
      return ServerErrors.database('change_organization_region');
    }

    if (!result?.success) {
      return createApiError({
        code: ErrorCodes.INTERNAL_ERROR,
        message: result?.error || 'Failed to change region',
        status: 500,
      });
    }

    // Get migration info
    const migrationInfo = getRegionMigrationInfo(
      org.data_region as RegionCode,
      region as RegionCode
    );

    // Get updated region info
    const newRegionConfig = getRegion(region);
    const newResidencyInfo = getDataResidencyInfo(region);

    return NextResponse.json({
      success: true,
      previousRegion: result.previous_region,
      newRegion: result.new_region,
      region: {
        current: region,
        config: newRegionConfig,
        residency: newResidencyInfo,
      },
      migration: migrationInfo,
      message: `Region changed from ${result.previous_region} to ${result.new_region}`,
    });
  } catch (error) {
    console.error('Organization region PATCH error:', error);
    return ServerErrors.internal('change_organization_region');
  }
}

// POST /api/organizations/[orgId]/region/lock - Lock/unlock region
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return AuthErrors.unauthorized('organization_region');
    }

    const { orgId } = await context.params;
    const body = await request.json();
    const { lock } = body;

    if (typeof lock !== 'boolean') {
      return ValidationErrors.invalidField('lock', 'must be a boolean');
    }

    const supabase = createServerClient();

    // Check user is owner or admin (defense-in-depth; RPC should also enforce)
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return AuthErrors.unauthorized('organization_region');
    }

    // Call the database function to lock/unlock region
    const { data: result, error } = await supabase.rpc('lock_organization_region', {
      p_org_id: orgId,
      p_user_id: user.id,
      p_lock: lock,
    });

    if (error) {
      console.error('Lock region error:', error);
      return ServerErrors.database('lock_organization_region');
    }

    if (!result?.success) {
      return createApiError({
        code: ErrorCodes.AUTH_UNAUTHORIZED,
        message: result?.error || 'Failed to lock/unlock region',
        status: 403,
      });
    }

    return NextResponse.json({
      success: true,
      locked: result.locked,
      message: lock ? 'Region locked successfully' : 'Region unlocked successfully',
    });
  } catch (error) {
    console.error('Organization region POST error:', error);
    return ServerErrors.internal('lock_organization_region');
  }
}
