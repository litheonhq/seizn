/**
 * FALL Run Replay API
 *
 * POST /api/fall/runs/:runId/replay - Replay from checkpoint
 *
 * Retrieves state at a specific checkpoint for replay/debugging
 */

import { NextRequest, NextResponse } from 'next/server';
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
    const { from_step, to_step, patches } = body;

    const supabase = createServerClient();

    // Verify run access
    const { data: run } = await supabase
      .from('fall_runs')
      .select('*')
      .eq('id', runId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (!run) {
      return NextResponse.json({ error: 'Not Found', message: 'Run not found' }, { status: 404 });
    }

    // Get checkpoint at from_step
    const fromStep = from_step ?? 0;
    const { data: startCheckpoint, error: checkpointError } = await supabase
      .from('fall_run_checkpoints')
      .select('*')
      .eq('run_id', runId)
      .eq('step_number', fromStep)
      .single();

    if (checkpointError || !startCheckpoint) {
      return NextResponse.json(
        { error: 'Not Found', message: `Checkpoint not found at step ${fromStep}` },
        { status: 404 }
      );
    }

    // Apply patches if provided
    let state = startCheckpoint.state_json;
    if (patches && Array.isArray(patches)) {
      for (const patch of patches) {
        state = applyPatch(state, patch);
      }
    }

    // Get checkpoints in range if to_step specified
    let checkpointRange = null;
    if (to_step !== undefined && to_step > fromStep) {
      const { data: rangeData } = await supabase
        .from('fall_run_checkpoints')
        .select('step_number, step_type, step_input, step_output, tokens_used, latency_ms, created_at')
        .eq('run_id', runId)
        .gte('step_number', fromStep)
        .lte('step_number', to_step)
        .order('step_number', { ascending: true });

      checkpointRange = rangeData;
    }

    return NextResponse.json({
      replay: {
        run_id: runId,
        from_step: fromStep,
        to_step: to_step ?? fromStep,
        initial_state: state,
        patches_applied: patches?.length ?? 0,
        checkpoint_range: checkpointRange,
        original_config: {
          agent_config: run.agent_config,
          model_id: run.model_id,
          system_prompt: run.system_prompt,
        },
      },
    });
  } catch (error) {
    console.error('[FallReplay] POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function applyPatch(state: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(state));

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'messages' && Array.isArray(value)) {
      result.messages = value;
    } else if (key === 'context' && typeof value === 'object' && value !== null) {
      result.context = { ...result.context, ...value };
    } else if (key === 'memory' && typeof value === 'object' && value !== null) {
      result.memory = { ...result.memory, ...value };
    } else if (key === 'toolCalls' && Array.isArray(value)) {
      result.toolCalls = value;
    } else {
      result[key] = value;
    }
  }

  return result;
}
