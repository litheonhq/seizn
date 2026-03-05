/**
 * Retention Schedules API - Single Schedule Operations
 *
 * GET    /api/retention/schedules/[id] - Get retention schedule
 * PATCH  /api/retention/schedules/[id] - Update retention schedule
 * DELETE /api/retention/schedules/[id] - Delete retention schedule
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  getRetentionSchedule,
  updateRetentionSchedule,
  deleteRetentionSchedule,
} from '@/lib/winter/retention';
import { getUserOrgRole } from '@/lib/winter/org';


interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/retention/schedules/[id]
 * Get a single retention schedule
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const schedule = await getRetentionSchedule(id);
    if (!schedule) {
      return NextResponse.json({ error: 'Retention schedule not found' }, { status: 404 });
    }

    // Check user has access
    const role = await getUserOrgRole(schedule.organization_id, user.id);
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      schedule,
    });
  } catch (error) {
    console.error('[Retention Schedules] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/retention/schedules/[id]
 * Update a retention schedule
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Get existing schedule
    const existing = await getRetentionSchedule(id);
    if (!existing) {
      return NextResponse.json({ error: 'Retention schedule not found' }, { status: 404 });
    }

    // Check user is admin or owner
    const role = await getUserOrgRole(existing.organization_id, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to update retention schedules' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      description,
      retention_days,
      archive_days,
      deletion_type,
      conditions,
      notify_before_days,
      notify_emails,
      is_active,
      priority,
    } = body;

    // Validate retention days if provided
    if (retention_days !== undefined) {
      if (retention_days < 1) {
        return NextResponse.json({ error: 'retention_days must be at least 1' }, { status: 400 });
      }
      if (retention_days > 3650) {
        return NextResponse.json({ error: 'retention_days cannot exceed 3650' }, { status: 400 });
      }
    }

    // Validate archive days if provided
    if (archive_days !== undefined && archive_days !== null) {
      const effectiveRetentionDays = retention_days || existing.retention_days;
      if (archive_days >= effectiveRetentionDays) {
        return NextResponse.json({ error: 'archive_days must be less than retention_days' }, { status: 400 });
      }
    }

    const schedule = await updateRetentionSchedule(
      {
        id,
        name,
        description,
        retention_days,
        archive_days,
        deletion_type,
        conditions,
        notify_before_days,
        notify_emails,
        is_active,
        priority,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      schedule,
    });
  } catch (error) {
    console.error('[Retention Schedules] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/retention/schedules/[id]
 * Delete a retention schedule
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Get existing schedule
    const existing = await getRetentionSchedule(id);
    if (!existing) {
      return NextResponse.json({ error: 'Retention schedule not found' }, { status: 404 });
    }

    // Check user is admin or owner
    const role = await getUserOrgRole(existing.organization_id, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to delete retention schedules' }, { status: 403 });
    }

    await deleteRetentionSchedule(id, user.id);

    return NextResponse.json({
      success: true,
      deleted: id,
    });
  } catch (error) {
    console.error('[Retention Schedules] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
