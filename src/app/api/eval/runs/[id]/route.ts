/**
 * Auto-Eval Run Detail API
 *
 * GET /api/eval/runs/[id] - Get a specific evaluation run
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { autoEvalService } from '@/lib/eval/auto-eval-service';
import type { EvalRunResponse } from '@/lib/eval/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the run
    const run = await autoEvalService.getRunById(id);

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    // Verify user has access to the organization
    if (run.organizationId) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', run.organizationId)
        .eq('user_id', user.id)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: 'Access denied to organization' },
          { status: 403 }
        );
      }
    }

    // Check if deployment was blocked
    const blocked = (run.metadata as { blocked?: boolean })?.blocked === true;
    const blockReason = blocked
      ? run.summary?.criticalIssues
        ? `${run.summary.criticalIssues} critical issue(s) detected`
        : 'Policy evaluation failed'
      : undefined;

    const response: EvalRunResponse = {
      run,
      blocked,
      blockReason,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[API] Eval run detail error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
