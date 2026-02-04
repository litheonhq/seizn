/**
 * Red Team Report API
 *
 * GET /api/v1/security/red-team/:runId/report - Get vulnerability report
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { createRedTeamRunner } from '@/lib/security/red-team';

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
    const runner = createRedTeamRunner();

    try {
      const report = await runner.generateReport(runId);

      return NextResponse.json({
        report: {
          run_id: report.runId,
          generated_at: report.generatedAt,
          summary: {
            total_tests: report.summary.totalTests,
            successful_attacks: report.summary.successfulAttacks,
            attack_success_rate: report.summary.attackSuccessRate.toFixed(1) + '%',
            findings_by_severity: {
              critical: report.summary.criticalCount,
              high: report.summary.highCount,
              medium: report.summary.mediumCount,
              low: report.summary.lowCount,
            },
          },
          findings: report.findings,
          recommendations: report.recommendations,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Run not found') {
        return NextResponse.json({ error: 'Not Found', message: 'Run not found' }, { status: 404 });
      }
      throw error;
    }
  } catch (error) {
    console.error('[RedTeamReport] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
