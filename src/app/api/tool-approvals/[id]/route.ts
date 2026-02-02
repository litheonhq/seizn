/**
 * Tool Approval API
 *
 * Get and decide on a specific approval request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createToolGatingService } from '@/lib/tool-gating';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    console.error('Get approval error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    console.error('Decide approval error:', error);

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
