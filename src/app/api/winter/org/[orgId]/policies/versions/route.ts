/**
 * Winter Governance - Policy Versions API
 *
 * GET    /api/winter/org/[orgId]/policies/versions - List versions for a policy
 * POST   /api/winter/org/[orgId]/policies/versions - Create a new draft version
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserOrgRole } from '@/lib/winter/org';
import {
  createPolicyVersion,
  listPolicyVersions,
  getDraftVersion,
  type PolicyVersionState,
} from '@/lib/winter/org/policy-versions';

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
 * GET /api/winter/org/[orgId]/policies/versions
 * List versions for a policy
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

    const { searchParams } = new URL(request.url);
    const policyId = searchParams.get('policy_id');
    const state = searchParams.get('state') as PolicyVersionState | undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!policyId) {
      return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
    }

    const versions = await listPolicyVersions({
      policy_id: policyId,
      state,
      limit,
      offset,
    });

    // Also get current draft if any
    const draft = await getDraftVersion(policyId);

    return NextResponse.json({
      success: true,
      versions: versions.data,
      total: versions.total,
      limit: versions.limit,
      offset: versions.offset,
      has_more: versions.has_more,
      has_draft: draft !== null,
      draft_id: draft?.id || null,
    });
  } catch (error) {
    console.error('[PolicyVersions] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/winter/org/[orgId]/policies/versions
 * Create a new draft version
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await context.params;

    // Check user is admin or owner
    const role = await getUserOrgRole(orgId, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to create policy versions' }, { status: 403 });
    }

    const body = await request.json();
    const { policy_id, change_summary, change_type } = body;

    if (!policy_id) {
      return NextResponse.json({ error: 'policy_id is required' }, { status: 400 });
    }

    // Check if there's already a draft
    const existingDraft = await getDraftVersion(policy_id);
    if (existingDraft) {
      return NextResponse.json({
        error: 'A draft version already exists for this policy',
        draft_id: existingDraft.id,
      }, { status: 409 });
    }

    const version = await createPolicyVersion({
      policy_id,
      created_by: user.id,
      change_summary,
      change_type: change_type || 'update',
    });

    return NextResponse.json({
      success: true,
      version,
    });
  } catch (error) {
    console.error('[PolicyVersions] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
