/**
 * Red Team Run Detail API
 *
 * GET /api/v1/security/red-team/:runId - Get run details
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
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

    const { runId } = await params;
    const supabase = createServerClient();

    // Get run
    const { data: run, error: runError } = await supabase
      .from('red_team_runs')
      .select('*')
      .eq('id', runId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: 'Not Found', message: 'Run not found' }, { status: 404 });
    }

    // Get findings
    const { data: findings } = await supabase
      .from('red_team_findings')
      .select('*')
      .eq('run_id', runId)
      .order('severity', { ascending: true })
      .order('timestamp', { ascending: false });

    // Calculate pass rate
    const passRate = run.total_tests > 0
      ? ((run.passed_tests / run.total_tests) * 100).toFixed(1)
      : 'N/A';

    return NextResponse.json({
      run: {
        id: run.id,
        status: run.status,
        target_endpoint: run.target_endpoint,
        target_model: run.target_model,
        config: run.config,
        total_tests: run.total_tests,
        passed_tests: run.passed_tests,
        failed_tests: run.failed_tests,
        pass_rate: passRate + '%',
        critical_findings: run.critical_findings,
        high_findings: run.high_findings,
        medium_findings: run.medium_findings,
        low_findings: run.low_findings,
        started_at: run.started_at,
        completed_at: run.completed_at,
      },
      findings: (findings || []).map((f) => ({
        id: f.id,
        attack_category: f.attack_category,
        attack_name: f.attack_name,
        severity: f.severity,
        prompt: f.prompt,
        response: f.response,
        indicators: f.indicators,
        latency_ms: f.latency_ms,
        timestamp: f.timestamp,
      })),
    });
  } catch (error) {
    console.error('[RedTeamRun] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
