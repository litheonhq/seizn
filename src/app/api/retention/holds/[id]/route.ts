/**
 * Retention Legal Holds API - Single Hold Operations
 *
 * GET    /api/retention/holds/[id] - Get legal hold
 * PATCH  /api/retention/holds/[id] - Update legal hold
 * DELETE /api/retention/holds/[id] - Release legal hold
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  getLegalHold,
  updateLegalHold,
  releaseLegalHold,
} from '@/lib/winter/retention';
import { getUserOrgRole } from '@/lib/winter/org';
import { logServerError, logServerWarn } from '@/lib/server/logger';


interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/retention/holds/[id]
 * Get a single legal hold
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const hold = await getLegalHold(id);
    if (!hold) {
      return NextResponse.json({ error: 'Legal hold not found' }, { status: 404 });
    }

    // Check user has access
    const role = await getUserOrgRole(hold.organization_id, user.id);
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      hold,
    });
  } catch (error) {
    logServerError('[Retention Holds] GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/retention/holds/[id]
 * Update a legal hold
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Get existing hold
    const existing = await getLegalHold(id);
    if (!existing) {
      return NextResponse.json({ error: 'Legal hold not found' }, { status: 404 });
    }

    // Check hold is still active
    if (existing.status !== 'active') {
      return NextResponse.json({ error: 'Cannot update a released or expired hold' }, { status: 400 });
    }

    // Check user is admin or owner
    const role = await getUserOrgRole(existing.organization_id, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to update legal holds' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      description,
      reason,
      legal_matter_id,
      custodian_email,
      effective_until,
    } = body;

    // Validate effective_until if provided
    if (effective_until !== undefined && effective_until !== null) {
      const expiresDate = new Date(effective_until);
      if (isNaN(expiresDate.getTime())) {
        return NextResponse.json({ error: 'Invalid effective_until date format' }, { status: 400 });
      }
      if (expiresDate <= new Date()) {
        return NextResponse.json({ error: 'effective_until must be in the future' }, { status: 400 });
      }
    }

    const hold = await updateLegalHold(
      {
        id,
        name,
        description,
        reason,
        legal_matter_id,
        custodian_email,
        effective_until,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      hold,
    });
  } catch (error) {
    logServerError('[Retention Holds] PATCH error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/retention/holds/[id]
 * Release a legal hold
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Get existing hold
    const existing = await getLegalHold(id);
    if (!existing) {
      return NextResponse.json({ error: 'Legal hold not found' }, { status: 404 });
    }

    // Check hold is still active
    if (existing.status !== 'active') {
      return NextResponse.json({ error: 'Legal hold is already released or expired' }, { status: 400 });
    }

    // Check user is admin or owner
    const role = await getUserOrgRole(existing.organization_id, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to release legal holds' }, { status: 403 });
    }

    // Get release reason from body
    const body = await request.json().catch((e: unknown) => {
      logServerWarn('[Retention Hold] Failed to parse request body', e);
      return {} as Record<string, unknown>;
    });
    const releaseReason = body.release_reason || 'Released via API';

    await releaseLegalHold(id, user.id, releaseReason);

    return NextResponse.json({
      success: true,
      released: id,
      message: 'Legal hold released successfully',
    });
  } catch (error) {
    logServerError('[Retention Holds] DELETE error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
