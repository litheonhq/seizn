/**
 * Retention Legal Holds API
 *
 * GET    /api/retention/holds - List legal holds
 * POST   /api/retention/holds - Create legal hold
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  listLegalHolds,
  createLegalHold,
  type LegalHoldScopeType,
  type LegalHoldScopeConfig,
} from '@/lib/winter/retention';
import { getUserOrgRole } from '@/lib/winter/org';


const VALID_SCOPE_TYPES: LegalHoldScopeType[] = ['all', 'collection', 'user', 'tag', 'date_range'];

/**
 * GET /api/retention/holds
 * List legal holds for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getSupabaseUserFromBearer(request);
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

    const scope_type = searchParams.get('scope_type') as LegalHoldScopeType | undefined;
    const status = searchParams.get('status') as 'active' | 'released' | 'expired' | undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const holds = await listLegalHolds({
      organization_id: orgId,
      scope_type,
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
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      organization_id,
      name,
      description,
      scope_type,
      scope_config,
      reason,
      legal_matter_id,
      custodian_email,
      effective_from,
      effective_until,
    } = body;

    // Validate required fields
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (!scope_type) {
      return NextResponse.json({ error: 'scope_type is required' }, { status: 400 });
    }

    if (!reason) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 });
    }

    // Check user is admin or owner
    const role = await getUserOrgRole(organization_id, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to manage legal holds' }, { status: 403 });
    }

    // Validate scope_type
    if (!VALID_SCOPE_TYPES.includes(scope_type)) {
      return NextResponse.json({
        error: 'Invalid scope_type',
        valid_scope_types: VALID_SCOPE_TYPES,
      }, { status: 400 });
    }

    // Validate scope_config based on scope_type
    const validatedScopeConfig: LegalHoldScopeConfig = scope_config || {};

    if (scope_type === 'collection' && (!validatedScopeConfig.collection_ids || validatedScopeConfig.collection_ids.length === 0)) {
      return NextResponse.json({ error: 'collection_ids is required for collection scope' }, { status: 400 });
    }

    if (scope_type === 'user' && (!validatedScopeConfig.user_ids || validatedScopeConfig.user_ids.length === 0)) {
      return NextResponse.json({ error: 'user_ids is required for user scope' }, { status: 400 });
    }

    if (scope_type === 'tag' && (!validatedScopeConfig.tags || validatedScopeConfig.tags.length === 0)) {
      return NextResponse.json({ error: 'tags is required for tag scope' }, { status: 400 });
    }

    if (scope_type === 'date_range' && (!validatedScopeConfig.start_date || !validatedScopeConfig.end_date)) {
      return NextResponse.json({ error: 'start_date and end_date are required for date_range scope' }, { status: 400 });
    }

    // Validate effective_until if provided
    if (effective_until) {
      const expiresDate = new Date(effective_until);
      if (isNaN(expiresDate.getTime())) {
        return NextResponse.json({ error: 'Invalid effective_until date format' }, { status: 400 });
      }
      if (expiresDate <= new Date()) {
        return NextResponse.json({ error: 'effective_until must be in the future' }, { status: 400 });
      }
    }

    const hold = await createLegalHold({
      organization_id,
      name,
      description,
      scope_type,
      scope_config: validatedScopeConfig,
      reason,
      legal_matter_id,
      custodian_email,
      effective_from,
      effective_until,
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
