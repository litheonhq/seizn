/**
 * Policy Pack Audit API
 *
 * Query audit logs for policy pack operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    // Only admins can view audit logs
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const packId = searchParams.get('packId');
    const _eventType = searchParams.get('eventType');
    const _startDate = searchParams.get('startDate');
    const _endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query from installations and related data
    // In a full implementation, this would query a dedicated audit_logs table
    let query = supabase
      .from('policy_pack_installations')
      .select(`
        id,
        pack_id,
        version_id,
        config,
        enabled,
        status,
        installed_by,
        installed_at,
        updated_at,
        policy_packs (
          id,
          name,
          display_name
        ),
        policy_pack_versions (
          version,
          status
        )
      `)
      .eq('organization_id', membership.organization_id)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (packId) {
      query = query.eq('pack_id', packId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Transform to audit event format
    const auditEvents = (data || []).map((row) => {
      const policyPack = Array.isArray(row.policy_packs) ? row.policy_packs[0] : row.policy_packs;
      const version = Array.isArray(row.policy_pack_versions) ? row.policy_pack_versions[0] : row.policy_pack_versions;
      return {
        id: row.id,
        eventType: 'pack_installed' as const,
        packId: row.pack_id,
        packName: policyPack?.name,
        displayName: policyPack?.display_name,
        version: version?.version,
        organizationId: membership.organization_id,
        userId: row.installed_by,
        details: {
          config: row.config,
          enabled: row.enabled,
          status: row.status,
        },
        timestamp: row.updated_at || row.installed_at,
      };
    });

    return NextResponse.json({
      events: auditEvents,
      total: auditEvents.length,
      offset,
      limit,
    });
  } catch (error) {
    logServerError('Policy audit error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
