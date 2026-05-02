/**
 * FALL Run Detail API
 *
 * GET /api/fall/runs/:runId - Get run details
 * PATCH /api/fall/runs/:runId - Update run status
 * DELETE /api/fall/runs/:runId - Delete run
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiScope } from '@/lib/auth/api-scope';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ runId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiScope(request, 'fall:read');
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { runId } = await params;
    const supabase = createServerClient();

    // Get run with checkpoint count
    const { data: run, error: runError } = await supabase
      .from('fall_runs')
      .select('*')
      .eq('id', runId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: 'Not Found', message: 'Run not found' }, { status: 404 });
    }

    // Get checkpoint count
    const { count: checkpointCount } = await supabase
      .from('fall_run_checkpoints')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', runId);

    // Get fork info
    const { data: forks } = await supabase
      .from('fall_run_forks')
      .select('fork_run_id, fork_step_number, reason, created_at')
      .eq('parent_run_id', runId);

    const { data: forkedFrom } = await supabase
      .from('fall_run_forks')
      .select('parent_run_id, fork_step_number, reason, created_at')
      .eq('fork_run_id', runId)
      .single();

    return NextResponse.json({
      run: {
        ...run,
        checkpoint_count: checkpointCount || 0,
        forks: forks || [],
        forked_from: forkedFrom || null,
      },
    });
  } catch (error) {
    console.error('[FallRun] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiScope(request, 'fall:write');
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { runId } = await params;
    const body = await request.json();
    const { status, final_output, error_message, name, description } = body;

    const supabase = createServerClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('fall_runs')
      .select('id')
      .eq('id', runId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Not Found', message: 'Run not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (final_output !== undefined) updates.final_output = final_output;
    if (error_message !== undefined) updates.error_message = error_message;
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    if (status === 'completed' || status === 'failed') {
      updates.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('fall_runs')
      .update(updates)
      .eq('id', runId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Database Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ run: data });
  } catch (error) {
    console.error('[FallRun] PATCH error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiScope(request, 'fall:delete');
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { runId } = await params;
    const supabase = createServerClient();

    const { error } = await supabase
      .from('fall_runs')
      .delete()
      .eq('id', runId)
      .eq('organization_id', auth.organizationId);

    if (error) {
      return NextResponse.json(
        { error: 'Database Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[FallRun] DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
