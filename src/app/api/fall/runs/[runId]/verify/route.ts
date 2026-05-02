/**
 * FALL Run Verify API
 *
 * GET /api/fall/runs/:runId/verify - Verify checkpoint chain integrity
 *
 * Validates that the hash chain is unbroken and all state hashes
 * match their computed values
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { hasApiScope, validateApiKey } from '@/lib/auth/api-key';
import { createServerClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ runId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }
    if (!hasApiScope(auth.scopes, 'fall:read')) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires fall:read scope' },
        { status: 403 }
      );
    }

    const { runId } = await params;
    const supabase = createServerClient();

    // Verify run access
    const { data: run } = await supabase
      .from('fall_runs')
      .select('id, total_steps')
      .eq('id', runId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (!run) {
      return NextResponse.json({ error: 'Not Found', message: 'Run not found' }, { status: 404 });
    }

    // Get all checkpoints
    const { data: checkpoints, error: checkpointError } = await supabase
      .from('fall_run_checkpoints')
      .select('*')
      .eq('run_id', runId)
      .order('step_number', { ascending: true });

    if (checkpointError) {
      return NextResponse.json(
        { error: 'Database Error', message: checkpointError.message },
        { status: 500 }
      );
    }

    if (!checkpoints || checkpoints.length === 0) {
      return NextResponse.json({
        verification: {
          run_id: runId,
          status: 'empty',
          message: 'No checkpoints to verify',
          checked_count: 0,
        },
      });
    }

    // Verify hash chain
    let prevHash: string | null = null;
    const issues: Array<{ step: number; issue: string }> = [];

    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];

      // Check 1: Verify prev_checkpoint_hash links correctly
      if (cp.prev_checkpoint_hash !== prevHash) {
        issues.push({
          step: cp.step_number,
          issue: `Hash chain broken: expected prev_hash "${prevHash}", got "${cp.prev_checkpoint_hash}"`,
        });
      }

      // Check 2: Verify state_hash is correct
      const hashInput = `${runId}|${cp.step_number}|${JSON.stringify(cp.state_json)}|${
        cp.prev_checkpoint_hash || 'genesis'
      }`;
      const expectedHash = createHash('sha256').update(hashInput).digest('hex');

      if (cp.state_hash !== expectedHash) {
        issues.push({
          step: cp.step_number,
          issue: `State hash mismatch: computed "${expectedHash.slice(0, 16)}...", stored "${cp.state_hash.slice(0, 16)}..."`,
        });
      }

      // Check 3: Verify step continuity
      if (i > 0 && cp.step_number !== checkpoints[i - 1].step_number + 1) {
        issues.push({
          step: cp.step_number,
          issue: `Step discontinuity: expected step ${checkpoints[i - 1].step_number + 1}, got ${cp.step_number}`,
        });
      }

      prevHash = cp.state_hash;
    }

    const isValid = issues.length === 0;

    return NextResponse.json({
      verification: {
        run_id: runId,
        status: isValid ? 'valid' : 'invalid',
        checked_count: checkpoints.length,
        first_step: checkpoints[0].step_number,
        last_step: checkpoints[checkpoints.length - 1].step_number,
        first_checkpoint_hash: checkpoints[0].state_hash,
        last_checkpoint_hash: checkpoints[checkpoints.length - 1].state_hash,
        issues: issues.length > 0 ? issues : undefined,
        verified_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[FallVerify] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
