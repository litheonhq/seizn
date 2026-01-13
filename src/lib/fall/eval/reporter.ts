/**
 * Seizn Eval Pipeline - Report Generation Module
 * Generates evaluation reports in various formats (JSON, CSV, Markdown, HTML)
 */

import { createServerClient } from '@/lib/supabase';
import { compareMetrics } from './metrics';
import type {
  EvalReport,
  ReportConfig,
  ReportFormat,
  EvalRun,
  EvalRunMetrics,
  EvalCaseResult,
  MetricComparison,
} from './types';

// ============================================
// Report Generation
// ============================================

/**
 * Generate an evaluation report for a run
 */
export async function generateReport(params: {
  userId: string;
  runId: string;
  config?: ReportConfig;
}): Promise<EvalReport> {
  const supabase = createServerClient();
  const config = params.config ?? { format: 'json' };

  // Fetch run data
  const { data: runData, error: runErr } = await supabase
    .from('fall_eval_runs')
    .select('*, fall_eval_datasets(name, description)')
    .eq('id', params.runId)
    .eq('user_id', params.userId)
    .single();

  if (runErr) {
    throw new Error(`Failed to fetch run: ${runErr.message}`);
  }

  // Fetch results if needed
  let results: EvalCaseResult[] = [];
  if (config.includeCases) {
    const { data: resultData } = await supabase
      .from('fall_eval_results')
      .select('*, fall_eval_cases(query_text)')
      .eq('run_id', params.runId)
      .order('created_at', { ascending: true })
      .limit(1000);

    results = (resultData ?? []).map(mapResultRowWithQuery);
  }

  // Fetch baseline if comparison requested
  let baselineMetrics: EvalRunMetrics | null = null;
  let comparison: Record<string, MetricComparison> | null = null;

  if (config.baselineRunId) {
    const { data: baselineData } = await supabase
      .from('fall_eval_runs')
      .select('summary_metrics')
      .eq('id', config.baselineRunId)
      .eq('user_id', params.userId)
      .single();

    if (baselineData?.summary_metrics) {
      baselineMetrics = baselineData.summary_metrics as EvalRunMetrics;
      if (runData.summary_metrics) {
        const comparisonResult = compareMetrics(
          baselineMetrics,
          runData.summary_metrics as EvalRunMetrics
        );
        comparison = {};
        for (const [key, value] of Object.entries(comparisonResult)) {
          comparison[key] = {
            metricKey: key,
            baselineValue: value.baseline,
            candidateValue: value.candidate,
            delta: value.delta,
            deltaPercent: value.deltaPercent,
            isImprovement: value.delta > 0,
            isRegression: value.delta < -0.02, // 2% threshold
          };
        }
      }
    }
  }

  // Generate report content based on format
  const reportId = crypto.randomUUID();
  let content: string | Record<string, unknown>;

  switch (config.format) {
    case 'csv':
      content = generateCSVReport(runData, results, config);
      break;
    case 'markdown':
      content = generateMarkdownReport(runData, results, comparison, config);
      break;
    case 'html':
      content = generateHTMLReport(runData, results, comparison, config);
      break;
    case 'json':
    default:
      content = generateJSONReport(runData, results, comparison, config);
      break;
  }

  return {
    id: reportId,
    runId: params.runId,
    format: config.format,
    content,
    generatedAt: new Date().toISOString(),
    delta: comparison ? {
      baselineRunId: config.baselineRunId!,
      metrics: Object.fromEntries(
        Object.entries(comparison).map(([k, v]) => [k, v.delta])
      ),
    } : undefined,
  };
}

// ============================================
// Format-Specific Generators
// ============================================

/* eslint-disable @typescript-eslint/no-explicit-any */

function generateJSONReport(
  runData: any,
  results: EvalCaseResult[],
  comparison: Record<string, MetricComparison> | null,
  config: ReportConfig
): Record<string, unknown> {
  const report: Record<string, unknown> = {
    title: config.title ?? `Evaluation Report - ${runData.id.slice(0, 8)}`,
    run: {
      id: runData.id,
      dataset: runData.fall_eval_datasets?.name ?? runData.dataset_id,
      datasetDescription: runData.fall_eval_datasets?.description,
      status: runData.status,
      startedAt: runData.started_at,
      finishedAt: runData.finished_at,
      durationMs: runData.duration_ms,
      config: runData.config,
    },
    metrics: runData.summary_metrics,
  };

  if (config.includePercentiles && runData.summary_metrics) {
    report.percentiles = {
      p50_mrr: runData.summary_metrics.p50_mrr,
      p90_mrr: runData.summary_metrics.p90_mrr,
      p99_mrr: runData.summary_metrics.p99_mrr,
      std_mrr: runData.summary_metrics.std_mrr,
      std_ndcg: runData.summary_metrics.std_ndcg,
    };
  }

  if (comparison) {
    report.comparison = comparison;
  }

  if (config.includeCases && results.length > 0) {
    report.cases = results.map((r) => ({
      caseId: r.caseId,
      query: (r as any).queryText,
      retrievedCount: r.retrievedIds.length,
      metrics: r.metrics,
      ...(config.includeDebug ? { debug: r.debug } : {}),
    }));
  }

  return report;
}

function generateCSVReport(
  runData: any,
  results: EvalCaseResult[],
  _config: ReportConfig
): string {
  const headers = [
    'case_id',
    'query',
    'retrieved_count',
    'mrr',
    'hit_rate',
    'ndcg',
    'recall_at_5',
    'recall_at_10',
    'recall_at_20',
    'precision_at_5',
    'precision_at_10',
    'precision_at_20',
    'context_precision',
    'context_recall',
    'faithfulness',
  ];

  const rows = results.map((r) => {
    const m = r.metrics;
    return [
      r.caseId,
      `"${((r as any).queryText ?? '').replace(/"/g, '""')}"`,
      r.retrievedIds.length,
      m.mrr?.toFixed(4) ?? '',
      m.hit_rate?.toFixed(4) ?? '',
      m.ndcg?.toFixed(4) ?? '',
      m.recall_at_5?.toFixed(4) ?? '',
      m.recall_at_10?.toFixed(4) ?? '',
      m.recall_at_20?.toFixed(4) ?? '',
      m.precision_at_5?.toFixed(4) ?? '',
      m.precision_at_10?.toFixed(4) ?? '',
      m.precision_at_20?.toFixed(4) ?? '',
      m.context_precision?.toFixed(4) ?? '',
      m.context_recall?.toFixed(4) ?? '',
      m.faithfulness?.toFixed(4) ?? '',
    ].join(',');
  });

  // Add summary row
  const summary = runData.summary_metrics;
  if (summary) {
    rows.push('');
    rows.push('# Summary Metrics');
    rows.push(`total_cases,${summary.total_cases ?? ''}`);
    rows.push(`avg_mrr,${summary.avg_mrr?.toFixed(4) ?? ''}`);
    rows.push(`avg_hit_rate,${summary.avg_hit_rate?.toFixed(4) ?? ''}`);
    rows.push(`avg_ndcg,${summary.avg_ndcg?.toFixed(4) ?? ''}`);
    rows.push(`avg_recall_at_5,${summary.avg_recall_at_5?.toFixed(4) ?? ''}`);
    rows.push(`avg_recall_at_10,${summary.avg_recall_at_10?.toFixed(4) ?? ''}`);
    rows.push(`avg_recall_at_20,${summary.avg_recall_at_20?.toFixed(4) ?? ''}`);
  }

  return [headers.join(','), ...rows].join('\n');
}

function generateMarkdownReport(
  runData: any,
  results: EvalCaseResult[],
  comparison: Record<string, MetricComparison> | null,
  config: ReportConfig
): string {
  const lines: string[] = [];
  const title = config.title ?? `Evaluation Report`;
  const datasetName = runData.fall_eval_datasets?.name ?? runData.dataset_id.slice(0, 8);

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**Dataset:** ${datasetName}`);
  lines.push(`**Run ID:** ${runData.id}`);
  lines.push(`**Status:** ${runData.status}`);
  lines.push(`**Started:** ${runData.started_at}`);
  lines.push(`**Duration:** ${runData.duration_ms ? `${runData.duration_ms}ms` : 'N/A'}`);
  lines.push('');

  // Summary metrics
  const summary = runData.summary_metrics;
  if (summary) {
    lines.push('## Summary Metrics');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Cases | ${summary.total_cases ?? 'N/A'} |`);
    lines.push(`| MRR | ${formatMetric(summary.avg_mrr)} |`);
    lines.push(`| Hit Rate | ${formatMetric(summary.avg_hit_rate)} |`);
    lines.push(`| NDCG | ${formatMetric(summary.avg_ndcg)} |`);
    lines.push(`| Recall@5 | ${formatMetric(summary.avg_recall_at_5)} |`);
    lines.push(`| Recall@10 | ${formatMetric(summary.avg_recall_at_10)} |`);
    lines.push(`| Recall@20 | ${formatMetric(summary.avg_recall_at_20)} |`);
    lines.push(`| Precision@5 | ${formatMetric(summary.avg_precision_at_5)} |`);
    lines.push(`| Precision@10 | ${formatMetric(summary.avg_precision_at_10)} |`);
    lines.push(`| Precision@20 | ${formatMetric(summary.avg_precision_at_20)} |`);
    if (summary.avg_faithfulness !== undefined) {
      lines.push(`| Faithfulness | ${formatMetric(summary.avg_faithfulness)} |`);
    }
    lines.push('');
  }

  // Percentiles
  if (config.includePercentiles && summary) {
    lines.push('## Distribution Analysis');
    lines.push('');
    lines.push('| Metric | P50 | P90 | P99 | Std Dev |');
    lines.push('|--------|-----|-----|-----|---------|');
    lines.push(`| MRR | ${formatMetric(summary.p50_mrr)} | ${formatMetric(summary.p90_mrr)} | ${formatMetric(summary.p99_mrr)} | ${formatMetric(summary.std_mrr)} |`);
    lines.push('');
  }

  // Comparison with baseline
  if (comparison) {
    lines.push('## Comparison with Baseline');
    lines.push('');
    lines.push('| Metric | Baseline | Current | Delta | Status |');
    lines.push('|--------|----------|---------|-------|--------|');
    for (const [key, comp] of Object.entries(comparison)) {
      const status = comp.isRegression ? 'Regression' : comp.isImprovement ? 'Improved' : 'Stable';
      const emoji = comp.isRegression ? '' : comp.isImprovement ? '' : '';
      lines.push(`| ${key.replace('avg_', '')} | ${formatMetric(comp.baselineValue)} | ${formatMetric(comp.candidateValue)} | ${formatDelta(comp.delta, comp.deltaPercent)} | ${status} ${emoji} |`);
    }
    lines.push('');
  }

  // Individual cases
  if (config.includeCases && results.length > 0) {
    lines.push('## Case Results');
    lines.push('');
    lines.push('| Query | MRR | NDCG | Recall@10 | Hit |');
    lines.push('|-------|-----|------|-----------|-----|');
    for (const r of results.slice(0, 50)) {
      const query = ((r as any).queryText ?? '').slice(0, 50);
      const m = r.metrics;
      lines.push(`| ${query}... | ${formatMetric(m.mrr)} | ${formatMetric(m.ndcg)} | ${formatMetric(m.recall_at_10)} | ${m.hit_rate === 1 ? 'Yes' : 'No'} |`);
    }
    if (results.length > 50) {
      lines.push(`| ... and ${results.length - 50} more cases | | | | |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateHTMLReport(
  runData: any,
  results: EvalCaseResult[],
  comparison: Record<string, MetricComparison> | null,
  config: ReportConfig
): string {
  const title = config.title ?? 'Evaluation Report';
  const datasetName = runData.fall_eval_datasets?.name ?? runData.dataset_id.slice(0, 8);
  const summary = runData.summary_metrics;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1, h2 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; }
    .metric { font-family: 'SF Mono', Monaco, monospace; }
    .good { color: #28a745; }
    .bad { color: #dc3545; }
    .neutral { color: #6c757d; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .badge.success { background: #d4edda; color: #155724; }
    .badge.failed { background: #f8d7da; color: #721c24; }
    .badge.running { background: #cce5ff; color: #004085; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${title}</h1>
      <span class="badge ${runData.status}">${runData.status}</span>
    </div>
    <p><strong>Dataset:</strong> ${datasetName}</p>
    <p><strong>Run ID:</strong> ${runData.id}</p>
    <p><strong>Duration:</strong> ${runData.duration_ms ? `${runData.duration_ms}ms` : 'N/A'}</p>
  </div>

  ${summary ? `
  <div class="card">
    <h2>Summary Metrics</h2>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Total Cases</td><td class="metric">${summary.total_cases ?? 'N/A'}</td></tr>
      <tr><td>Mean Reciprocal Rank (MRR)</td><td class="metric">${formatMetric(summary.avg_mrr)}</td></tr>
      <tr><td>Hit Rate</td><td class="metric">${formatMetric(summary.avg_hit_rate)}</td></tr>
      <tr><td>NDCG</td><td class="metric">${formatMetric(summary.avg_ndcg)}</td></tr>
      <tr><td>Recall@5</td><td class="metric">${formatMetric(summary.avg_recall_at_5)}</td></tr>
      <tr><td>Recall@10</td><td class="metric">${formatMetric(summary.avg_recall_at_10)}</td></tr>
      <tr><td>Recall@20</td><td class="metric">${formatMetric(summary.avg_recall_at_20)}</td></tr>
      <tr><td>Precision@5</td><td class="metric">${formatMetric(summary.avg_precision_at_5)}</td></tr>
      <tr><td>Precision@10</td><td class="metric">${formatMetric(summary.avg_precision_at_10)}</td></tr>
      <tr><td>Precision@20</td><td class="metric">${formatMetric(summary.avg_precision_at_20)}</td></tr>
      ${summary.avg_faithfulness !== undefined ? `<tr><td>Faithfulness</td><td class="metric">${formatMetric(summary.avg_faithfulness)}</td></tr>` : ''}
    </table>
  </div>
  ` : ''}

  ${comparison ? `
  <div class="card">
    <h2>Comparison with Baseline</h2>
    <table>
      <tr><th>Metric</th><th>Baseline</th><th>Current</th><th>Delta</th><th>Status</th></tr>
      ${Object.entries(comparison).map(([key, comp]) => {
        const statusClass = comp.isRegression ? 'bad' : comp.isImprovement ? 'good' : 'neutral';
        const status = comp.isRegression ? 'Regression' : comp.isImprovement ? 'Improved' : 'Stable';
        return `<tr>
          <td>${key.replace('avg_', '')}</td>
          <td class="metric">${formatMetric(comp.baselineValue)}</td>
          <td class="metric">${formatMetric(comp.candidateValue)}</td>
          <td class="metric ${statusClass}">${formatDelta(comp.delta, comp.deltaPercent)}</td>
          <td class="${statusClass}">${status}</td>
        </tr>`;
      }).join('')}
    </table>
  </div>
  ` : ''}

  ${config.includeCases && results.length > 0 ? `
  <div class="card">
    <h2>Case Results (${results.length} cases)</h2>
    <table>
      <tr><th>Query</th><th>MRR</th><th>NDCG</th><th>Recall@10</th><th>Hit</th></tr>
      ${results.slice(0, 100).map((r) => {
        const query = ((r as any).queryText ?? '').slice(0, 60);
        const m = r.metrics;
        return `<tr>
          <td>${query}${query.length >= 60 ? '...' : ''}</td>
          <td class="metric">${formatMetric(m.mrr)}</td>
          <td class="metric">${formatMetric(m.ndcg)}</td>
          <td class="metric">${formatMetric(m.recall_at_10)}</td>
          <td>${m.hit_rate === 1 ? 'Yes' : 'No'}</td>
        </tr>`;
      }).join('')}
    </table>
    ${results.length > 100 ? `<p><em>Showing first 100 of ${results.length} cases</em></p>` : ''}
  </div>
  ` : ''}

  <div class="card" style="text-align: center; color: #6c757d; font-size: 12px;">
    Generated by Seizn Eval Pipeline on ${new Date().toISOString()}
  </div>
</body>
</html>`;

  return html;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================
// Helper Functions
// ============================================

function formatMetric(value: number | undefined | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return 'N/A';
  }
  return value.toFixed(4);
}

function formatDelta(delta: number, deltaPercent: number): string {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(4)} (${sign}${deltaPercent.toFixed(1)}%)`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapResultRowWithQuery(row: any): EvalCaseResult & { queryText?: string } {
  return {
    id: row.id,
    runId: row.run_id,
    caseId: row.case_id,
    retrievedIds: row.retrieved_chunk_ids ?? [],
    metrics: row.metrics ?? {},
    debug: row.debug ?? undefined,
    createdAt: row.created_at,
    queryText: row.fall_eval_cases?.query_text,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================
// Export Utilities
// ============================================

/**
 * Export report to a downloadable format
 */
export function getReportMimeType(format: ReportFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'markdown':
      return 'text/markdown';
    case 'html':
      return 'text/html';
    case 'json':
    default:
      return 'application/json';
  }
}

/**
 * Get recommended file extension for a report format
 */
export function getReportExtension(format: ReportFormat): string {
  switch (format) {
    case 'csv':
      return '.csv';
    case 'markdown':
      return '.md';
    case 'html':
      return '.html';
    case 'json':
    default:
      return '.json';
  }
}
