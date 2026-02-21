/**
 * Red Team API
 *
 * POST /api/v1/security/red-team - Start red team test
 * GET /api/v1/security/red-team - List red team runs
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { createServerClient } from '@/lib/supabase';
import { validateOutboundUrl } from '@/lib/security/outbound-url';
import {
  createRedTeamRunner,
  type RedTeamConfig,
  type AttackCategory,
} from '@/lib/security/red-team';

interface RedTeamRequest {
  target_url?: string;
  categories?: AttackCategory[];
  max_tests?: number;
  stop_on_critical?: boolean;
  mutation_depth?: number;
  timeout_ms?: number;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    // Check permission
    const hasPermission =
      auth.scopes?.includes('admin') ||
      auth.scopes?.includes('security:red-team') ||
      auth.scopes?.includes('*');

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires admin or security:red-team scope' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as RedTeamRequest;

    let validatedTargetUrl: string | null = null;
    if (body.target_url) {
      const urlValidation = await validateOutboundUrl(body.target_url, {
        allowHttp:
          process.env.NODE_ENV !== 'production' &&
          process.env.ALLOW_UNSAFE_PROVIDER_TARGETS === 'true',
        allowPrivateNetwork:
          process.env.NODE_ENV !== 'production' &&
          process.env.ALLOW_UNSAFE_PROVIDER_TARGETS === 'true',
      });
      if (!urlValidation.valid || !urlValidation.normalizedUrl) {
        return NextResponse.json(
          {
            error: 'Validation Error',
            message: `Invalid target_url: ${urlValidation.reason || 'unsafe URL'}`,
          },
          { status: 400 }
        );
      }
      validatedTargetUrl = urlValidation.normalizedUrl;
    }

    const config: RedTeamConfig = {
      categories: body.categories,
      maxTests: body.max_tests || 50,
      stopOnCritical: body.stop_on_critical ?? true,
      mutationDepth: body.mutation_depth || 1,
      timeoutMs: body.timeout_ms || 30000,
    };

    // Create mock target function (in production, would call actual endpoint)
    const targetFn = async (prompt: string): Promise<string> => {
      if (validatedTargetUrl) {
        const response = await fetch(validatedTargetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        const data = await response.json();
        return data.response || data.content || JSON.stringify(data);
      }
      // Mock response for testing
      return 'I cannot assist with that request as it violates my guidelines.';
    };

    const runner = createRedTeamRunner();
    const run = await runner.run(auth.organizationId!, targetFn, config);

    return NextResponse.json({
      run: {
        id: run.id,
        status: run.status,
        total_tests: run.totalTests,
        passed_tests: run.passedTests,
        failed_tests: run.failedTests,
        critical_findings: run.criticalFindings,
        high_findings: run.highFindings,
        medium_findings: run.mediumFindings,
        low_findings: run.lowFindings,
        started_at: run.startedAt,
        completed_at: run.completedAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[RedTeam] POST error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized', message: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status');

    const supabase = createServerClient();

    let query = supabase
      .from('red_team_runs')
      .select('*', { count: 'exact' })
      .eq('organization_id', auth.organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Database Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      runs: (data || []).map((r) => ({
        id: r.id,
        status: r.status,
        target_endpoint: r.target_endpoint,
        total_tests: r.total_tests,
        passed_tests: r.passed_tests,
        failed_tests: r.failed_tests,
        pass_rate: r.total_tests > 0 ? ((r.passed_tests / r.total_tests) * 100).toFixed(1) + '%' : 'N/A',
        critical_findings: r.critical_findings,
        high_findings: r.high_findings,
        medium_findings: r.medium_findings,
        low_findings: r.low_findings,
        started_at: r.started_at,
        completed_at: r.completed_at,
      })),
      pagination: {
        total: count,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('[RedTeam] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
