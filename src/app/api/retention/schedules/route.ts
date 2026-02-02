/**
 * Retention Schedules API
 *
 * GET    /api/retention/schedules - List retention schedules
 * POST   /api/retention/schedules - Create retention schedule
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  listRetentionSchedules,
  createRetentionSchedule,
  type RetentionDataType,
  type DeletionType,
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

const VALID_DATA_TYPES: RetentionDataType[] = [
  'memories',
  'documents',
  'traces',
  'audit_logs',
  'api_keys',
  'sessions',
];

const VALID_DELETION_TYPES: DeletionType[] = ['soft', 'hard', 'anonymize'];

/**
 * GET /api/retention/schedules
 * List retention schedules for an organization
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

    const dataType = searchParams.get('data_type') as RetentionDataType | undefined;
    const isActive = searchParams.get('is_active');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const schedules = await listRetentionSchedules({
      organization_id: orgId,
      data_type: dataType,
      is_active: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      schedules: schedules.data,
      total: schedules.total,
      limit: schedules.limit,
      offset: schedules.offset,
      has_more: schedules.has_more,
    });
  } catch (error) {
    console.error('[Retention Schedules] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/retention/schedules
 * Create a new retention schedule
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
      data_type,
      retention_days,
      archive_days,
      deletion_type,
      conditions,
      notify_before_days,
      notify_emails,
      priority,
    } = body;

    // Validate required fields
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (!data_type) {
      return NextResponse.json({ error: 'data_type is required' }, { status: 400 });
    }

    if (!retention_days || retention_days < 1) {
      return NextResponse.json({ error: 'retention_days must be at least 1' }, { status: 400 });
    }

    // Check user is admin or owner
    const role = await getUserOrgRole(organization_id, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to manage retention schedules' }, { status: 403 });
    }

    // Validate data type
    if (!VALID_DATA_TYPES.includes(data_type)) {
      return NextResponse.json({
        error: 'Invalid data_type',
        valid_types: VALID_DATA_TYPES,
      }, { status: 400 });
    }

    // Validate deletion type
    if (deletion_type && !VALID_DELETION_TYPES.includes(deletion_type)) {
      return NextResponse.json({
        error: 'Invalid deletion_type',
        valid_types: VALID_DELETION_TYPES,
      }, { status: 400 });
    }

    // Validate retention days
    if (retention_days > 3650) {
      return NextResponse.json({ error: 'retention_days cannot exceed 3650 (10 years)' }, { status: 400 });
    }

    // Validate archive days
    if (archive_days !== undefined && archive_days !== null) {
      if (archive_days < 1) {
        return NextResponse.json({ error: 'archive_days must be at least 1' }, { status: 400 });
      }
      if (archive_days >= retention_days) {
        return NextResponse.json({ error: 'archive_days must be less than retention_days' }, { status: 400 });
      }
    }

    const schedule = await createRetentionSchedule({
      organization_id,
      name,
      description,
      data_type,
      retention_days,
      archive_days,
      deletion_type: deletion_type || 'soft',
      conditions,
      notify_before_days,
      notify_emails,
      priority,
      created_by: user.id,
    });

    return NextResponse.json({
      success: true,
      schedule,
    });
  } catch (error) {
    console.error('[Retention Schedules] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
