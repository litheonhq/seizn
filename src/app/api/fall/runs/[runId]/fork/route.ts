/**
 * FALL Run Fork API
 *
 * POST /api/fall/runs/:runId/fork - Fork run from checkpoint
 *
 * Creates a new run branching from a specific checkpoint,
 * with optional patches to modify the initial state
 */

import { NextRequest, NextResponse } from 'next/server';
import { hasApiScope, validateApiKey } from '@/lib/auth/api-key';
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
    if (!hasApiScope(auth.scopes, 'fall:write')) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires fall:write scope' },
        { status: 403 }
      );
    }

    const { runId } = await params;
    const body = await request.json();
    const {
      from_step,
      from_checkpoint_id,
      patches,
      reason,
      name,
      description,
    } = body;

    const supabase = createServerClient();

    // Get parent run
    const { data: parentRun, error: runError } = await supabase
      .from('fall_runs')
      .select('*')
      .eq('id', runId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (runError || !parentRun) {
      return NextResponse.json({ error: 'Not Found', message: 'Run not found' }, { status: 404 });
    }

    // Find checkpoint to fork from
    let checkpoint;
    if (from_checkpoint_id) {
      const { data } = await supabase
        .from('fall_run_checkpoints')
        .select('*')
        .eq('id', from_checkpoint_id)
        .eq('run_id', runId)
        .single();
      checkpoint = data;
    } else if (from_step !== undefined) {
      const { data } = await supabase
        .from('fall_run_checkpoints')
        .select('*')
        .eq('run_id', runId)
        .eq('step_number', from_step)
        .single();
      checkpoint = data;
    } else {
      // Use latest checkpoint
      const { data } = await supabase
        .from('fall_run_checkpoints')
        .select('*')
        .eq('run_id', runId)
        .order('step_number', { ascending: false })
        .limit(1)
        .single();
      checkpoint = data;
    }

    if (!checkpoint) {
      return NextResponse.json(
        { error: 'Not Found', message: 'No checkpoint found to fork from' },
        { status: 404 }
      );
    }

    // Apply patches to create initial state for forked run
    let forkedState = JSON.parse(JSON.stringify(checkpoint.state_json));
    const appliedPatches = patches || {};

    if (patches) {
      forkedState = applyPatch(forkedState, patches);
    }

    // Determine what was modified
    const modifiedInput = patches && 'input' in patches;
    const modifiedContext = patches && 'context' in patches;
    const modifiedSystemPrompt = patches && 'systemPrompt' in patches;
    const modifiedModel = patches && 'model' in patches;

    // Create new run
    const { data: newRun, error: newRunError } = await supabase
      .from('fall_runs')
      .insert({
        organization_id: auth.organizationId,
        trace_id: `fork-${parentRun.trace_id}-${Date.now()}`,
        root_span_id: null,
        name: name || `Fork of ${parentRun.name || runId.slice(0, 8)}`,
        description: description || reason,
        agent_config: parentRun.agent_config,
        model_id: modifiedModel ? patches.model : parentRun.model_id,
        system_prompt: modifiedSystemPrompt ? patches.systemPrompt : parentRun.system_prompt,
        initial_input: forkedState,
        status: 'running',
        created_by: auth.userId,
      })
      .select()
      .single();

    if (newRunError) {
      return NextResponse.json(
        { error: 'Database Error', message: newRunError.message },
        { status: 500 }
      );
    }

    // Record fork relationship
    const { error: forkError } = await supabase.from('fall_run_forks').insert({
      parent_run_id: runId,
      fork_run_id: newRun.id,
      fork_checkpoint_id: checkpoint.id,
      fork_step_number: checkpoint.step_number,
      reason,
      patch_json: appliedPatches,
      modified_input: modifiedInput,
      modified_context: modifiedContext,
      modified_system_prompt: modifiedSystemPrompt,
      modified_model: modifiedModel,
      created_by: auth.userId,
    });

    if (forkError) {
      console.error('Failed to record fork relationship:', forkError);
    }

    // Update parent run status if not already forked
    if (parentRun.status !== 'forked') {
      await supabase
        .from('fall_runs')
        .update({ status: 'forked' })
        .eq('id', runId);
    }

    return NextResponse.json({
      fork: {
        parent_run_id: runId,
        fork_run_id: newRun.id,
        fork_step: checkpoint.step_number,
        patches_applied: Object.keys(appliedPatches).length,
        modifications: {
          input: modifiedInput,
          context: modifiedContext,
          system_prompt: modifiedSystemPrompt,
          model: modifiedModel,
        },
      },
      new_run: newRun,
    }, { status: 201 });
  } catch (error) {
    console.error('[FallFork] POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function applyPatch(
  state: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
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
