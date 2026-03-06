/**
 * Auto-Eval Runs API
 *
 * GET /api/eval/runs - List evaluation runs for an organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { autoEvalService } from '@/lib/eval/auto-eval-service';
import type { EvalHistoryResponse } from '@/lib/eval/types';
import { logServerError } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const organizationId = searchParams.get('organizationId');
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);
    const triggerType = searchParams.get('triggerType') ?? undefined;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Missing required parameter: organizationId' },
        { status: 400 }
      );
    }

    // Verify user has access to the organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied to organization' },
        { status: 403 }
      );
    }

    // Get runs
    const { runs, total } = await autoEvalService.getRunHistory(organizationId, {
      page,
      pageSize,
      triggerType,
    });

    const response: EvalHistoryResponse = {
      runs,
      total,
      page,
      pageSize,
    };

    return NextResponse.json(response);
  } catch (error) {
    logServerError('[API] Eval runs error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
