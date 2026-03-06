/**
 * Tool Approval API
 *
 * Get and decide on a specific approval request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getRequestUser } from '@/lib/api/request-user';
import { createToolGatingService } from '@/lib/tool-gating';
import { logServerError } from '@/lib/server/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const service = createToolGatingService(supabase);
    const approval = await service.getApproval(id);

    if (!approval) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    }

    // Enrich with tool info
    const tool = await service.getTool(approval.toolId);

    return NextResponse.json({
      approval: {
        ...approval,
        tool: tool
          ? {
              id: tool.id,
              name: tool.name,
              displayName: tool.displayName,
              riskLevel: tool.riskLevel,
              description: tool.description,
            }
          : null,
      },
    });
  } catch (error) {
    logServerError('Get approval error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const body = await request.json();
    const { decision, reason } = body;

    if (!decision || !['approved', 'denied'].includes(decision)) {
      return NextResponse.json(
        { error: 'Invalid decision. Must be "approved" or "denied"' },
        { status: 400 }
      );
    }

    const service = createToolGatingService(supabase);
    const approval = await service.decideApproval({
      approvalId: id,
      decision,
      reason,
    });

    return NextResponse.json({ approval });
  } catch (error) {
    logServerError('Decide approval error', error);

    if (error instanceof Error) {
      if (error.message === 'approval_not_found') {
        return NextResponse.json(
          { error: 'Approval not found' },
          { status: 404 }
        );
      }
      if (error.message === 'approval_expired') {
        return NextResponse.json(
          { error: 'Approval has expired' },
          { status: 410 }
        );
      }
      if (error.message.includes('already_decided')) {
        return NextResponse.json(
          { error: 'Approval has already been decided' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

