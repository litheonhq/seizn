/**
 * Control Tower - Cost Attribution API
 *
 * GET /api/control-tower/costs - Get cost breakdown
 * GET /api/control-tower/costs?budget=true - Get budget status
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getCostBreakdown,
  getBudgetStatus,
  setBudgetLimit,
  checkCostAlerts,
  exportCostBreakdownToCSV,
  type CostQueryParams,
} from '@/lib/control-tower/cost-attribution';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('orgId') || session.user.organizationId;

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
    console.error('Cost attribution error:', error);
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

    const targetOrgId = orgId || session.user.organizationId;
    if (!targetOrgId) {
      return NextResponse.json(
        { error: 'Organization ID required' },
        { status: 400 }
      );
    }

    // TODO: Check if user has admin permission for this org

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
    console.error('Cost action error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform action' },
      { status: 500 }
    );
  }
}
