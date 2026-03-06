/**
 * Tool Approvals API
 *
 * List pending approval requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getRequestUser } from '@/lib/api/request-user';
import { createToolGatingService } from '@/lib/tool-gating';
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
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    const service = createToolGatingService(supabase);
    const approvals = await service.listPendingApprovals(membership.organization_id);

    // Enrich with tool and token info
    const enrichedApprovals = await Promise.all(
      approvals.map(async (approval) => {
        const tool = await service.getTool(approval.toolId);
        const token = await service.getToken(approval.tokenId);
        return {
          ...approval,
          tool: tool
            ? {
                id: tool.id,
                name: tool.name,
                displayName: tool.displayName,
                riskLevel: tool.riskLevel,
              }
            : null,
          token: token
            ? {
                id: token.id,
                name: token.name,
              }
            : null,
        };
      })
    );

    return NextResponse.json({
      approvals: enrichedApprovals,
      total: enrichedApprovals.length,
    });
  } catch (error) {
    logServerError('List approvals error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

