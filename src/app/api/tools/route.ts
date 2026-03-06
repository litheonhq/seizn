/**
 * Tools API
 *
 * List and create agent tools.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getRequestUser } from '@/lib/api/request-user';
import { createToolGatingService } from '@/lib/tool-gating';
import type { ToolCategory, RiskLevel } from '@/lib/tool-gating';
import { logServerError } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') as ToolCategory | null;
    const riskLevel = searchParams.get('riskLevel') as RiskLevel | null;
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    const service = createToolGatingService(supabase);
    const tools = await service.listTools({
      category: category || undefined,
      riskLevel: riskLevel || undefined,
      activeOnly,
    });

    return NextResponse.json({ tools });
  } catch (error) {
    logServerError('List tools error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Only admins can create tools (system-level operation)
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const service = createToolGatingService(supabase);
    const tool = await service.createTool(body);

    return NextResponse.json({ tool }, { status: 201 });
  } catch (error) {
    logServerError('Create tool error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

