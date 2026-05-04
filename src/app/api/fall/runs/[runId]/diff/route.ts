/**
 * FALL Run Diff API
 *
 * GET /api/fall/runs/:runId/diff - Diff between checkpoints or runs
 *
 * Query params:
 * - step1, step2: Compare two steps within same run
 * - compare_run: Compare with another run at same step
 * - step: Step number when comparing runs
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiScope } from '@/lib/auth/api-scope';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ runId: string }>;
}

interface StateDiff {
  path: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: unknown;
  newValue?: unknown;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiScope(request, 'fall:read');
    if (authResult.response) return authResult.response;
    const { auth } = authResult;

    const { runId } = await params;
    const { searchParams } = new URL(request.url);
    const step1 = searchParams.get('step1');
    const step2 = searchParams.get('step2');
    const compareRunId = searchParams.get('compare_run');
    const step = searchParams.get('step');

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

    // Mode 1: Compare two steps within same run
    if (step1 && step2) {
      const { data: checkpoint1 } = await supabase
        .from('fall_run_checkpoints')
        .select('*')
        .eq('run_id', runId)
        .eq('step_number', parseInt(step1))
        .single();

      const { data: checkpoint2 } = await supabase
        .from('fall_run_checkpoints')
        .select('*')
        .eq('run_id', runId)
        .eq('step_number', parseInt(step2))
        .single();

      if (!checkpoint1 || !checkpoint2) {
        return NextResponse.json(
          { error: 'Not Found', message: 'One or both checkpoints not found' },
          { status: 404 }
        );
      }

      const diffs = deepDiff(checkpoint1.state_json, checkpoint2.state_json);

      return NextResponse.json({
        diff: {
          type: 'within_run',
          run_id: runId,
          step1: parseInt(step1),
          step2: parseInt(step2),
          changes: diffs,
          summary: {
            added: diffs.filter((d) => d.type === 'added').length,
            removed: diffs.filter((d) => d.type === 'removed').length,
            changed: diffs.filter((d) => d.type === 'changed').length,
          },
          checkpoint1_created: checkpoint1.created_at,
          checkpoint2_created: checkpoint2.created_at,
        },
      });
    }

    // Mode 2: Compare with another run at same step
    if (compareRunId && step) {
      // Verify access to compare run
      const { data: compareRun } = await supabase
        .from('fall_runs')
        .select('id')
        .eq('id', compareRunId)
        .eq('organization_id', auth.organizationId)
        .single();

      if (!compareRun) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Compare run not found' },
          { status: 404 }
        );
      }

      const stepNum = parseInt(step);

      const { data: checkpoint1 } = await supabase
        .from('fall_run_checkpoints')
        .select('*')
        .eq('run_id', runId)
        .eq('step_number', stepNum)
        .single();

      const { data: checkpoint2 } = await supabase
        .from('fall_run_checkpoints')
        .select('*')
        .eq('run_id', compareRunId)
        .eq('step_number', stepNum)
        .single();

      if (!checkpoint1 && !checkpoint2) {
        return NextResponse.json(
          { error: 'Not Found', message: 'No checkpoints found at specified step' },
          { status: 404 }
        );
      }

      const state1 = checkpoint1?.state_json || {};
      const state2 = checkpoint2?.state_json || {};
      const diffs = deepDiff(state1, state2);

      return NextResponse.json({
        diff: {
          type: 'between_runs',
          run1_id: runId,
          run2_id: compareRunId,
          step: stepNum,
          changes: diffs,
          summary: {
            added: diffs.filter((d) => d.type === 'added').length,
            removed: diffs.filter((d) => d.type === 'removed').length,
            changed: diffs.filter((d) => d.type === 'changed').length,
          },
          run1_has_checkpoint: !!checkpoint1,
          run2_has_checkpoint: !!checkpoint2,
        },
      });
    }

    // Mode 3: Show diff between consecutive steps (default)
    const { data: checkpoints } = await supabase
      .from('fall_run_checkpoints')
      .select('step_number, state_json, created_at')
      .eq('run_id', runId)
      .order('step_number', { ascending: true })
      .limit(50);

    if (!checkpoints || checkpoints.length < 2) {
      return NextResponse.json({
        diff: {
          type: 'consecutive',
          run_id: runId,
          steps: [],
          message: 'Not enough checkpoints for diff',
        },
      });
    }

    const stepDiffs = [];
    for (let i = 1; i < checkpoints.length; i++) {
      const prev = checkpoints[i - 1];
      const curr = checkpoints[i];
      const diffs = deepDiff(prev.state_json, curr.state_json);

      stepDiffs.push({
        from_step: prev.step_number,
        to_step: curr.step_number,
        changes_count: diffs.length,
        summary: {
          added: diffs.filter((d) => d.type === 'added').length,
          removed: diffs.filter((d) => d.type === 'removed').length,
          changed: diffs.filter((d) => d.type === 'changed').length,
        },
      });
    }

    return NextResponse.json({
      diff: {
        type: 'consecutive',
        run_id: runId,
        total_steps: checkpoints.length,
        steps: stepDiffs,
      },
    });
  } catch (error) {
    console.error('[FallDiff] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function deepDiff(obj1: unknown, obj2: unknown, path: string = ''): StateDiff[] {
  const diffs: StateDiff[] = [];

  if (obj1 === obj2) return diffs;

  const type1 = typeof obj1;
  const type2 = typeof obj2;

  if (type1 !== type2) {
    diffs.push({ path: path || '.', type: 'changed', oldValue: obj1, newValue: obj2 });
    return diffs;
  }

  if (type1 !== 'object' || obj1 === null || obj2 === null) {
    if (obj1 !== obj2) {
      diffs.push({ path: path || '.', type: 'changed', oldValue: obj1, newValue: obj2 });
    }
    return diffs;
  }

  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    const maxLen = Math.max(obj1.length, obj2.length);
    for (let i = 0; i < maxLen; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;
      if (i >= obj1.length) {
        diffs.push({ path: itemPath, type: 'added', newValue: obj2[i] });
      } else if (i >= obj2.length) {
        diffs.push({ path: itemPath, type: 'removed', oldValue: obj1[i] });
      } else {
        diffs.push(...deepDiff(obj1[i], obj2[i], itemPath));
      }
    }
    return diffs;
  }

  const record1 = obj1 as Record<string, unknown>;
  const record2 = obj2 as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(record1), ...Object.keys(record2)]);

  for (const key of allKeys) {
    const keyPath = path ? `${path}.${key}` : key;
    if (!(key in record1)) {
      diffs.push({ path: keyPath, type: 'added', newValue: record2[key] });
    } else if (!(key in record2)) {
      diffs.push({ path: keyPath, type: 'removed', oldValue: record1[key] });
    } else {
      diffs.push(...deepDiff(record1[key], record2[key], keyPath));
    }
  }

  return diffs;
}
