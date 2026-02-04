/**
 * FALL Run Checkpoints API
 *
 * POST /api/fall/runs/:runId/checkpoints - Create checkpoint
 * GET /api/fall/runs/:runId/checkpoints - List checkpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { validateApiKey } from '@/lib/auth/api-key';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ runId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const { runId } = await params;
    const body = await request.json();
    const {
      step_number,
      state,
      step_type,
      step_input,
      step_output,
      tokens_used,
      latency_ms,
      checkpoint_type,
      span_id,
    } = body;

    if (step_number === undefined || !state) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'step_number and state are required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Verify run exists and belongs to org
    const { data: run } = await supabase
      .from('fall_runs')
      .select('id')
      .eq('id', runId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (!run) {
      return NextResponse.json({ error: 'Not Found', message: 'Run not found' }, { status: 404 });
    }

    // Get previous checkpoint hash
    const { data: prevCheckpoint } = await supabase
      .from('fall_run_checkpoints')
      .select('state_hash')
      .eq('run_id', runId)
      .eq('step_number', step_number - 1)
      .single();

    const prevHash = prevCheckpoint?.state_hash || null;

    // Compute state hash
    const hashInput = `${runId}|${step_number}|${JSON.stringify(state)}|${prevHash || 'genesis'}`;
    const stateHash = createHash('sha256').update(hashInput).digest('hex');

    const { data: checkpoint, error } = await supabase
      .from('fall_run_checkpoints')
      .insert({
        run_id: runId,
        step_number,
        span_id,
        checkpoint_type: checkpoint_type || 'auto',
        state_json: state,
        messages_snapshot: state.messages || [],
        context_snapshot: state.context || {},
        memory_snapshot: state.memory || {},
        tool_calls_snapshot: state.toolCalls || [],
        step_type,
        step_input,
        step_output,
        tokens_used: tokens_used || 0,
        latency_ms: latency_ms || 0,
        state_hash: stateHash,
        prev_checkpoint_hash: prevHash,
      })
      .select()
      .single();

    if (error) {
      // Handle duplicate step
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Conflict', message: 'Checkpoint already exists for this step' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Database Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ checkpoint }, { status: 201 });
  } catch (error) {
    console.error('[FallCheckpoints] POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const { runId } = await params;
    const { searchParams } = new URL(request.url);
    const step = searchParams.get('step');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const includeState = searchParams.get('include_state') !== 'false';

    const supabase = createServerClient();

    // Verify run access
    const { data: run } = await supabase
      .from('fall_runs')
      .select('id')
      .eq('id', runId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (!run) {
      return NextResponse.json({ error: 'Not Found', message: 'Run not found' }, { status: 404 });
    }

    // Build query
    const selectFields = includeState
      ? '*'
      : 'id, run_id, step_number, span_id, checkpoint_type, step_type, tokens_used, latency_ms, state_hash, created_at';

    let query = supabase
      .from('fall_run_checkpoints')
      .select(selectFields, { count: 'exact' })
      .eq('run_id', runId)
      .order('step_number', { ascending: true });

    if (step) {
      query = query.eq('step_number', parseInt(step));
    } else {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Database Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      checkpoints: data,
      pagination: {
        total: count,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('[FallCheckpoints] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
