/**
 * Auto-Eval Trigger API
 *
 * POST /api/eval/trigger - Manually trigger an evaluation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { emitEvalTrigger, getTriggerById } from '@/lib/eval/events';
import { autoEvalService } from '@/lib/eval/auto-eval-service';
import type { TriggerEvalRequest, TriggerEvalResponse } from '@/lib/eval/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as TriggerEvalRequest;

    // Validate request
    if (!body.type || !body.source) {
      return NextResponse.json(
        { error: 'Missing required fields: type, source' },
        { status: 400 }
      );
    }

    // Get organization from metadata or user
    const organizationId = body.metadata?.organizationId as string | undefined;

    // Verify user has access to the organization
    if (organizationId) {
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

      // Only admins/owners can trigger evaluations
      if (!['owner', 'admin'].includes(membership.role)) {
        return NextResponse.json(
          { error: 'Only admins can trigger evaluations' },
          { status: 403 }
        );
      }
    }

    // Emit the trigger event
    const triggerId = await emitEvalTrigger({
      type: body.type,
      source: body.source,
      organizationId,
      userId: user.id,
      metadata: body.metadata,
    });

    // If async mode, return immediately
    if (body.async !== false) {
      const response: TriggerEvalResponse = {
        triggerId,
        status: 'queued',
        message: 'Evaluation queued for processing',
      };

      return NextResponse.json(response, { status: 202 });
    }

    // Sync mode: run evaluation immediately
    const trigger = await getTriggerById(triggerId);
    if (!trigger) {
      return NextResponse.json(
        { error: 'Failed to retrieve trigger' },
        { status: 500 }
      );
    }

    const run = await autoEvalService.runEvaluation(trigger);

    const response: TriggerEvalResponse = {
      triggerId,
      runId: run.id,
      status: 'completed',
      message: `Evaluation completed: ${run.summary?.passed ?? 0}/${run.summary?.totalTests ?? 0} tests passed`,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[API] Eval trigger error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
