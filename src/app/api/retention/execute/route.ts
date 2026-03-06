/**
 * Retention Execution API
 *
 * GET  /api/retention/execute - Get execution history
 * POST /api/retention/execute - Execute retention for a schedule
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  executeRetention,
  getExecutionHistory,
  getRetentionSchedule,
  checkRetentionStatus,
  previewRetention,
} from '@/lib/winter/retention';
import { getUserOrgRole } from '@/lib/winter/org';
import { logServerError } from '@/lib/server/logger';


/**
 * GET /api/retention/execute
 * Get execution history for an organization or schedule
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    const scheduleId = searchParams.get('schedule_id');

    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }

    // Check user has access to org
    const role = await getUserOrgRole(orgId, user.id);
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    // If schedule_id is provided, verify it belongs to the org
    if (scheduleId) {
      const schedule = await getRetentionSchedule(scheduleId);
      if (!schedule || schedule.organization_id !== orgId) {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
      }
    }

    const limit = parseInt(searchParams.get('limit') || '50');

    const history = await getExecutionHistory(orgId, { limit });

    return NextResponse.json({
      success: true,
      executions: history,
    });
  } catch (error) {
    logServerError('[Retention Execute] GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/retention/execute
 * Execute retention for a specific schedule
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { schedule_id, preview_only, batch_size } = body;

    if (!schedule_id) {
      return NextResponse.json({ error: 'schedule_id is required' }, { status: 400 });
    }

    // Get the schedule
    const schedule = await getRetentionSchedule(schedule_id);
    if (!schedule) {
      return NextResponse.json({ error: 'Retention schedule not found' }, { status: 404 });
    }

    // Check user is admin or owner
    const role = await getUserOrgRole(schedule.organization_id, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to execute retention' }, { status: 403 });
    }

    // Check schedule is active
    if (!schedule.is_active) {
      return NextResponse.json({ error: 'Cannot execute inactive retention schedule' }, { status: 400 });
    }

    // Preview mode - just show what would be affected
    if (preview_only) {
      const preview = await previewRetention(schedule.organization_id, schedule.data_type);
      return NextResponse.json({
        success: true,
        preview: true,
        affected_count: preview.eligible_for_deletion,
        data_type: schedule.data_type,
        deletion_type: schedule.deletion_type,
        message: `Would process ${preview.eligible_for_deletion} records`,
      });
    }

    // Check retention status before executing
    const status = await checkRetentionStatus({
      organization_id: schedule.organization_id,
      data_type: schedule.data_type,
    });

    if (!status.can_delete && status.legal_holds.length > 0) {
      return NextResponse.json({
        error: 'Cannot execute retention - organization or data type is under legal hold',
        legal_hold_info: status.legal_holds,
      }, { status: 400 });
    }

    // Execute retention
    const result = await executeRetention({
      organization_id: schedule.organization_id,
      data_type: schedule.data_type,
      triggered_by: user.id,
      batch_size: batch_size || 1000,
    });

    return NextResponse.json({
      success: true,
      execution: result,
      message: `Retention executed: ${result.records_processed} records processed`,
    });
  } catch (error) {
    logServerError('[Retention Execute] POST error', error);

    if (error instanceof Error) {
      if (error.message.includes('legal hold')) {
        return NextResponse.json({
          error: 'Retention blocked by legal hold',
          details: error.message,
        }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
