/**
 * Retention Legal Holds API
 *
 * GET    /api/retention/holds - List legal holds
 * POST   /api/retention/holds - Create legal hold
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  listLegalHolds,
  createLegalHold,
  type LegalHoldScope,
} from '@/lib/winter/retention';
import { getUserOrgRole } from '@/lib/winter/org';

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

const VALID_SCOPES: LegalHoldScope[] = ['organization', 'user', 'data_type', 'specific_record'];

/**
 * GET /api/retention/holds
 * List legal holds for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }

    // Check user has access to org
    const role = await getUserOrgRole(orgId, user.id);
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    const scope = searchParams.get('scope') as LegalHoldScope | undefined;
    const status = searchParams.get('status') as 'active' | 'released' | 'expired' | undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const holds = await listLegalHolds({
      organization_id: orgId,
      scope,
      status,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      holds: holds.data,
      total: holds.total,
      limit: holds.limit,
      offset: holds.offset,
      has_more: holds.has_more,
    });
  } catch (error) {
    console.error('[Retention Holds] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/retention/holds
 * Create a new legal hold
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      organization_id,
      name,
      description,
      scope,
      target_user_id,
      target_data_type,
      target_record_id,
      reason,
      legal_case_id,
      custodian_email,
      expires_at,
    } = body;

    // Validate required fields
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (!scope) {
      return NextResponse.json({ error: 'scope is required' }, { status: 400 });
    }

    if (!reason) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 });
    }

    // Check user is admin or owner
    const role = await getUserOrgRole(organization_id, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to manage legal holds' }, { status: 403 });
    }

    // Validate scope
    if (!VALID_SCOPES.includes(scope)) {
      return NextResponse.json({
        error: 'Invalid scope',
        valid_scopes: VALID_SCOPES,
      }, { status: 400 });
    }

    // Validate scope-specific requirements
    if (scope === 'user' && !target_user_id) {
      return NextResponse.json({ error: 'target_user_id is required for user scope' }, { status: 400 });
    }

    if (scope === 'data_type' && !target_data_type) {
      return NextResponse.json({ error: 'target_data_type is required for data_type scope' }, { status: 400 });
    }

    if (scope === 'specific_record' && !target_record_id) {
      return NextResponse.json({ error: 'target_record_id is required for specific_record scope' }, { status: 400 });
    }

    // Validate expires_at if provided
    if (expires_at) {
      const expiresDate = new Date(expires_at);
      if (isNaN(expiresDate.getTime())) {
        return NextResponse.json({ error: 'Invalid expires_at date format' }, { status: 400 });
      }
      if (expiresDate <= new Date()) {
        return NextResponse.json({ error: 'expires_at must be in the future' }, { status: 400 });
      }
    }

    const hold = await createLegalHold({
      organization_id,
      name,
      description,
      scope,
      target_user_id,
      target_data_type,
      target_record_id,
      reason,
      legal_case_id,
      custodian_email,
      expires_at,
      created_by: user.id,
    });

    return NextResponse.json({
      success: true,
      hold,
    });
  } catch (error) {
    console.error('[Retention Holds] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
