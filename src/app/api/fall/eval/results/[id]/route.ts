import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  getEvalRun,
  getRunResults,
  generateReport,
} from '@/lib/fall/eval';
import type { ReportFormat } from '@/lib/fall/eval';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/fall/eval/results/[id]
 * Get evaluation run results
 *
 * Query params:
 * - format: 'json' | 'csv' | 'markdown' | 'html' (default: json)
 * - include_cases: boolean (default: true)
 * - include_debug: boolean (default: false)
 * - include_percentiles: boolean (default: true)
 * - baseline_run_id: string (optional, for comparison)
 * - limit: number (default: 100)
 * - offset: number (default: 0)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id: runId } = await context.params;
    const { searchParams } = new URL(request.url);

    const format = (searchParams.get('format') || 'json') as ReportFormat;
    const includeCases = searchParams.get('include_cases') !== 'false';
    const includeDebug = searchParams.get('include_debug') === 'true';
    const includePercentiles = searchParams.get('include_percentiles') !== 'false';
    const baselineRunId = searchParams.get('baseline_run_id') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Check if run exists and belongs to user
    const run = await getEvalRun({ userId, runId });
    if (!run) {
      return NextResponse.json(
        { error: 'Evaluation run not found' },
        { status: 404 }
      );
    }

    // If format is not JSON, generate a report
    if (format !== 'json') {
      const report = await generateReport({
        userId,
        runId,
        config: {
          format,
          includeCases,
          includeDebug,
          includePercentiles,
          baselineRunId,
        },
      });

      // Return appropriate content type
      const contentTypes: Record<ReportFormat, string> = {
        json: 'application/json',
        csv: 'text/csv',
        markdown: 'text/markdown',
        html: 'text/html',
      };

      const extensions: Record<ReportFormat, string> = {
        json: '.json',
        csv: '.csv',
        markdown: '.md',
        html: '.html',
      };

      return new NextResponse(
        typeof report.content === 'string'
          ? report.content
          : JSON.stringify(report.content, null, 2),
        {
          status: 200,
          headers: {
            'Content-Type': contentTypes[format],
            'Content-Disposition': `attachment; filename="eval-report-${runId.slice(0, 8)}${extensions[format]}"`,
          },
        }
      );
    }

    // JSON format - return structured response
    const response: Record<string, unknown> = {
      success: true,
      run,
    };

    if (includeCases) {
      const resultsData = await getRunResults({
        userId,
        runId,
        limit,
        offset,
      });
      response.results = resultsData.results;
      response.resultsTotal = resultsData.total;
      response.pagination = { limit, offset };
    }

    // Add comparison if baseline provided
    if (baselineRunId) {
      const report = await generateReport({
        userId,
        runId,
        config: {
          format: 'json',
          includeCases: false,
          baselineRunId,
        },
      });

      if (report.delta) {
        response.comparison = {
          baselineRunId: report.delta.baselineRunId,
          deltas: report.delta.metrics,
        };
      }
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('Fall eval results get error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
