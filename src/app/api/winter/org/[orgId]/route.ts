/**
 * Winter Governance - Single Organization API
 *
 * GET    /api/winter/org/[orgId] - Get organization details
 * PATCH  /api/winter/org/[orgId] - Update organization
 * DELETE /api/winter/org/[orgId] - Delete organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getOrganization,
  updateOrganization,
  deleteOrganization,
  getUserOrgRole,
  getOrganizationUsage,
  checkOrganizationLimits,
} from '@/lib/winter/org';

// Helper to get user from session token
async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

interface RouteContext {
  params: Promise<{ orgId: string }>;
}

/**
 * GET /api/winter/org/[orgId]
 * Get organization details with usage stats
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user has access
    const role = await getUserOrgRole(orgId, user.id);
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    const organization = await getOrganization(orgId);
    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Get usage stats
    const { searchParams } = new URL(request.url);
    const includeUsage = searchParams.get('include_usage') === 'true';
    const includeLimits = searchParams.get('include_limits') === 'true';

    let usage = null;
    let limits = null;

    if (includeUsage) {
      usage = await getOrganizationUsage(orgId);
    }

    if (includeLimits) {
      limits = await checkOrganizationLimits(orgId);
    }

    return NextResponse.json({
      success: true,
      organization,
      role,
      ...(usage && { usage }),
      ...(limits && { limits }),
    });
  } catch (error) {
    console.error('[WinterOrg] GET [orgId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/winter/org/[orgId]
 * Update organization settings
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is admin or owner
    const role = await getUserOrgRole(orgId, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Not authorized to update this organization' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, settings, memory_limit, api_calls_limit } = body;

    const organization = await updateOrganization(
      {
        id: orgId,
        name,
        settings,
        memory_limit,
        api_calls_limit,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      organization,
    });
  } catch (error) {
    console.error('[WinterOrg] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/winter/org/[orgId]
 * Delete organization (owner only)
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is owner
    const role = await getUserOrgRole(orgId, user.id);
    if (role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the owner can delete the organization' },
        { status: 403 }
      );
    }

    await deleteOrganization(orgId, user.id);

    return NextResponse.json({
      success: true,
      deleted: orgId,
    });
  } catch (error) {
    console.error('[WinterOrg] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
