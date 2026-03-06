/**
 * Control Tower - Cost Attribution API
 *
 * GET /api/control-tower/costs - Get cost breakdown
 * GET /api/control-tower/costs?budget=true - Get budget status
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { normalizeSessionOrganizationId } from '@/lib/profile/organization';
import {
  getCostBreakdown,
  getBudgetStatus,
  setBudgetLimit,
  checkCostAlerts,
  exportCostBreakdownToCSV,
  type CostQueryParams,
} from '@/lib/control-tower/cost-attribution';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    let orgId = searchParams.get('orgId') || session.user.organizationId;

    if (!orgId) {
      orgId =
        (await normalizeSessionOrganizationId({
          userId: session.user.id,
          email: session.user.email ?? null,
        })) ??
        undefined;
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization ID required' },
        { status: 400 }
      );
    }

    const type = searchParams.get('type');

    // Check if requesting budget status
    if (type === 'budget' || searchParams.get('budget') === 'true') {
      const budget = await getBudgetStatus(orgId);
      return NextResponse.json({ budget });
    }

    // Check if requesting alerts
    if (type === 'alerts' || searchParams.get('alerts') === 'true') {
      const alerts = await checkCostAlerts(orgId);
      return NextResponse.json({ alerts });
    }

    // Get cost breakdown
    const params: CostQueryParams = {
      orgId,
      userId: searchParams.get('userId') || undefined,
      routeId: searchParams.get('routeId') || undefined,
      model: searchParams.get('model') || undefined,
      provider: searchParams.get('provider') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    };

    const breakdown = await getCostBreakdown(params);

    // Check if CSV export requested
    if (searchParams.get('format') === 'csv') {
      const csv = exportCostBreakdownToCSV(breakdown);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="cost-breakdown-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({ breakdown });
  } catch (error) {
    logServerError('Cost attribution error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get cost breakdown' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { orgId, action, ...params } = body;

    let targetOrgId = orgId || session.user.organizationId;
    if (!targetOrgId) {
      targetOrgId =
        (await normalizeSessionOrganizationId({
          userId: session.user.id,
          email: session.user.email ?? null,
        })) ??
        undefined;
    }
    if (!targetOrgId) {
      return NextResponse.json(
        { error: 'Organization ID required' },
        { status: 400 }
      );
    }

    // Verify the user is an admin/owner for this organization
    const supabase = createServerClient();
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', targetOrgId)
      .eq('user_id', session.user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Admin permission required to manage budgets' },
        { status: 403 }
      );
    }

    switch (action) {
      case 'set_budget':
      case 'setBudget': {
        const { monthlyLimit, alertThreshold } = params;
        if (typeof monthlyLimit !== 'number' || monthlyLimit < 0) {
          return NextResponse.json(
            { error: 'Valid monthly limit required' },
            { status: 400 }
          );
        }
        await setBudgetLimit(targetOrgId, monthlyLimit, alertThreshold ?? 0.8);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    logServerError('Cost action error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform action' },
      { status: 500 }
    );
  }
}
