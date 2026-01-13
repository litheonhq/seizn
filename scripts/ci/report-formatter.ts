#!/usr/bin/env npx ts-node
/**
 * Seizn CI - Report Formatter
 *
 * Formats CI results for PR comments and uploads to Seizn.
 * Usage: npx ts-node scripts/ci/report-formatter.ts --traces=.seizn-traces --tests=.seizn-generated-tests --output=ci-report.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  CITraceCollection,
  CITraceSummary,
  TestGenerationResult,
  TestGenerationSummary,
  CIReport,
  CIFinding,
  CIRecommendation,
  ReportFormatterOptions,
} from './types';

// ============================================
// CLI Argument Parser
// ============================================

function parseArgs(): ReportFormatterOptions {
  const args = process.argv.slice(2);
  const options: ReportFormatterOptions = {
    traces: '.seizn-traces',
    tests: '.seizn-generated-tests',
    format: 'github',
  };

  for (const arg of args) {
    const [key, value] = arg.replace(/^--/, '').split('=');

    switch (key) {
      case 'traces':
        options.traces = value;
        break;
      case 'tests':
        options.tests = value;
        break;
      case 'output':
        options.output = value;
        break;
      case 'format':
        options.format = value as ReportFormatterOptions['format'];
        break;
      case 'upload':
        options.upload = true;
        break;
      case 'pr-number':
        options.prNumber = parseInt(value, 10);
        break;
      case 'commit-sha':
        options.commitSha = value;
        break;
    }
  }

  return options;
}

// ============================================
// Report Formatter
// ============================================

class ReportFormatter {
  private options: ReportFormatterOptions;
  private traceCollection: CITraceCollection | null = null;
  private testResult: TestGenerationResult | null = null;
  private findings: CIFinding[] = [];
  private recommendations: CIRecommendation[] = [];

  constructor(options: ReportFormatterOptions) {
    this.options = options;
  }

  /**
   * Format the CI report
   */
  async format(): Promise<CIReport> {
    console.log('[Seizn CI] Formatting report...');

    // Load data
    await this.loadData();

    // Analyze and generate findings
    this.analyzeTraces();
    this.analyzeTests();

    // Generate recommendations
    this.generateRecommendations();

    // Build report
    const report = this.buildReport();

    // Format output
    const formatted = this.formatOutput(report);

    // Save or upload
    if (this.options.output) {
      fs.writeFileSync(this.options.output, formatted);
      console.log(`[Seizn CI] Report saved to ${this.options.output}`);
    }

    if (this.options.upload) {
      await this.uploadReport(report);
    }

    return report;
  }

  /**
   * Load trace and test data
   */
  private async loadData(): Promise<void> {
    // Load traces
    const tracesPath = path.join(this.options.traces, 'traces.json');
    if (fs.existsSync(tracesPath)) {
      this.traceCollection = JSON.parse(fs.readFileSync(tracesPath, 'utf-8'));
    }

    // Load tests
    const testsPath = path.join(this.options.tests, 'tests.json');
    if (fs.existsSync(testsPath)) {
      this.testResult = JSON.parse(fs.readFileSync(testsPath, 'utf-8'));
    }
  }

  /**
   * Analyze traces for findings
   */
  private analyzeTraces(): void {
    if (!this.traceCollection) return;

    const { summary, traces } = this.traceCollection;

    // Check error rate
    const errorRate = summary.errorCount / Math.max(1, summary.totalTraces);
    if (errorRate > 0.1) {
      this.findings.push({
        id: randomUUID(),
        severity: errorRate > 0.3 ? 'critical' : 'high',
        category: 'error',
        title: 'High Error Rate Detected',
        description: `${(errorRate * 100).toFixed(1)}% of traces resulted in errors (${summary.errorCount}/${summary.totalTraces})`,
        relatedTraces: traces.filter((t) => t.status === 'error').map((t) => t.id),
        suggestedFix: 'Review error traces and fix underlying issues before merging',
        docsUrl: 'https://seizn.com/docs#error-handling',
      });
    }

    // Check performance
    if (summary.p95DurationMs > 2000) {
      this.findings.push({
        id: randomUUID(),
        severity: summary.p95DurationMs > 5000 ? 'high' : 'medium',
        category: 'performance',
        title: 'Slow Performance Detected',
        description: `P95 latency is ${summary.p95DurationMs}ms (threshold: 2000ms)`,
        relatedTraces: traces
          .filter((t) => (t.durationMs ?? 0) > summary.p95DurationMs)
          .map((t) => t.id),
        suggestedFix: 'Consider optimizing slow operations or adding caching',
        docsUrl: 'https://seizn.com/docs#performance',
      });
    }

    // Check for timeouts
    if (summary.timeoutCount > 0) {
      this.findings.push({
        id: randomUUID(),
        severity: 'high',
        category: 'performance',
        title: 'Request Timeouts Detected',
        description: `${summary.timeoutCount} requests timed out during test execution`,
        relatedTraces: traces.filter((t) => t.status === 'timeout').map((t) => t.id),
        suggestedFix: 'Increase timeout limits or optimize slow operations',
        docsUrl: 'https://seizn.com/docs#timeouts',
      });
    }

    // Check service distribution
    const services = Object.keys(summary.byService);
    const untested = ['spring', 'summer', 'fall', 'winter'].filter(
      (s) => !services.includes(s)
    );
    if (untested.length > 0) {
      this.findings.push({
        id: randomUUID(),
        severity: 'info',
        category: 'coverage',
        title: 'Untested Services',
        description: `The following services have no traces: ${untested.join(', ')}`,
        relatedTraces: [],
        suggestedFix: 'Consider adding tests for these services',
      });
    }
  }

  /**
   * Analyze generated tests for findings
   */
  private analyzeTests(): void {
    if (!this.testResult) return;

    const { summary, tests } = this.testResult;

    // Check test coverage
    if (summary.coverageEstimate < 0.5) {
      this.findings.push({
        id: randomUUID(),
        severity: 'medium',
        category: 'coverage',
        title: 'Low Test Coverage Estimate',
        description: `Estimated coverage is ${(summary.coverageEstimate * 100).toFixed(1)}%`,
        relatedTraces: [],
        suggestedFix: 'Consider adding more test cases for uncovered code paths',
      });
    }

    // Check confidence levels
    if (summary.avgConfidence < 0.6) {
      this.findings.push({
        id: randomUUID(),
        severity: 'low',
        category: 'quality',
        title: 'Low Test Confidence',
        description: `Average test confidence is ${(summary.avgConfidence * 100).toFixed(1)}%`,
        relatedTraces: [],
        suggestedFix: 'Review generated tests and improve input/output data in traces',
      });
    }

    // Check for critical tests
    if (summary.byPriority.critical > 0) {
      this.findings.push({
        id: randomUUID(),
        severity: 'critical',
        category: 'quality',
        title: 'Critical Tests Generated',
        description: `${summary.byPriority.critical} critical tests were generated from error traces`,
        relatedTraces: tests.filter((t) => t.priority === 'critical').map((t) => t.sourceTraceId),
        suggestedFix: 'Address critical issues before merging',
      });
    }
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(): void {
    const traceSummary = this.traceCollection?.summary;
    const testSummary = this.testResult?.summary;

    // Performance recommendation
    if (traceSummary && traceSummary.avgDurationMs > 500) {
      this.recommendations.push({
        id: randomUUID(),
        priority: 'high',
        title: 'Optimize Request Latency',
        description: `Average request latency is ${traceSummary.avgDurationMs.toFixed(0)}ms`,
        actionItems: [
          'Profile slow endpoints using Flight Recorder',
          'Consider implementing caching for repeated queries',
          'Review database query performance',
        ],
        estimatedImpact: 'Could reduce P95 latency by 30-50%',
      });
    }

    // Test coverage recommendation
    if (testSummary && testSummary.byType.integration < testSummary.byType.unit) {
      this.recommendations.push({
        id: randomUUID(),
        priority: 'medium',
        title: 'Increase Integration Test Coverage',
        description: 'Integration tests are underrepresented in generated tests',
        actionItems: [
          'Add more API endpoint traces with full request/response data',
          'Include cross-service workflow traces',
          'Consider adding E2E test scenarios',
        ],
        estimatedImpact: 'Better detection of integration issues',
      });
    }

    // Error handling recommendation
    if (traceSummary && traceSummary.errorCount > 0) {
      this.recommendations.push({
        id: randomUUID(),
        priority: 'high',
        title: 'Improve Error Handling',
        description: `${traceSummary.errorCount} errors detected during test run`,
        actionItems: [
          'Review error traces for common patterns',
          'Add proper error boundaries and fallbacks',
          'Implement retry logic for transient failures',
        ],
        estimatedImpact: 'Reduce error rate and improve reliability',
      });
    }

    // Monitoring recommendation
    if (!this.findings.some((f) => f.category === 'performance')) {
      this.recommendations.push({
        id: randomUUID(),
        priority: 'low',
        title: 'Continue Monitoring',
        description: 'No performance issues detected in this run',
        actionItems: [
          'Keep Flight Recorder enabled in production',
          'Set up alerts for latency thresholds',
          'Review weekly performance trends',
        ],
        estimatedImpact: 'Early detection of performance regressions',
      });
    }
  }

  /**
   * Build the final report
   */
  private buildReport(): CIReport {
    const metadata = this.traceCollection?.metadata ?? {
      traceId: randomUUID(),
      runId: 'unknown',
      commitSha: this.options.commitSha ?? 'unknown',
      branch: 'unknown',
      prNumber: this.options.prNumber,
      timestamp: new Date().toISOString(),
      provider: 'local' as const,
      repository: { owner: 'unknown', name: 'unknown', url: '' },
    };

    const traceSummary = this.traceCollection?.summary ?? {
      totalTraces: 0,
      successCount: 0,
      errorCount: 0,
      timeoutCount: 0,
      avgDurationMs: 0,
      p95DurationMs: 0,
      maxDurationMs: 0,
      byService: {},
      byOperation: {},
    };

    // Determine overall status
    const criticalFindings = this.findings.filter(
      (f) => f.severity === 'critical'
    ).length;
    const highFindings = this.findings.filter((f) => f.severity === 'high').length;

    let status: CIReport['status'] = 'passed';
    if (criticalFindings > 0) status = 'failed';
    else if (highFindings > 0) status = 'warning';

    return {
      id: randomUUID(),
      version: '1.0',
      metadata,
      traceSummary,
      testSummary: this.testResult?.summary,
      findings: this.findings,
      recommendations: this.recommendations,
      status,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Format output based on format option
   */
  private formatOutput(report: CIReport): string {
    switch (this.options.format) {
      case 'github':
        return this.formatGitHub(report);
      case 'markdown':
        return this.formatMarkdown(report);
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'html':
        return this.formatHTML(report);
      default:
        return this.formatMarkdown(report);
    }
  }

  /**
   * Format for GitHub PR comments
   */
  private formatGitHub(report: CIReport): string {
    const statusEmoji =
      report.status === 'passed' ? ':white_check_mark:' :
      report.status === 'warning' ? ':warning:' : ':x:';

    const statusText =
      report.status === 'passed' ? 'Passed' :
      report.status === 'warning' ? 'Warning' : 'Failed';

    let md = `### ${statusEmoji} Seizn CI: ${statusText}\n\n`;

    // Summary table
    md += '#### Trace Summary\n\n';
    md += '| Metric | Value |\n';
    md += '|--------|-------|\n';
    md += `| Total Traces | ${report.traceSummary.totalTraces} |\n`;
    md += `| Success | ${report.traceSummary.successCount} |\n`;
    md += `| Errors | ${report.traceSummary.errorCount} |\n`;
    md += `| Avg Latency | ${report.traceSummary.avgDurationMs.toFixed(0)}ms |\n`;
    md += `| P95 Latency | ${report.traceSummary.p95DurationMs.toFixed(0)}ms |\n\n`;

    // Test summary
    if (report.testSummary) {
      md += '#### Generated Tests\n\n';
      md += '| Type | Count |\n';
      md += '|------|-------|\n';
      md += `| Unit | ${report.testSummary.byType.unit} |\n`;
      md += `| Integration | ${report.testSummary.byType.integration} |\n`;
      md += `| E2E | ${report.testSummary.byType.e2e} |\n`;
      md += `| Regression | ${report.testSummary.byType.regression} |\n`;
      md += `| **Total** | **${report.testSummary.totalTests}** |\n\n`;
    }

    // Findings
    if (report.findings.length > 0) {
      md += '#### Findings\n\n';
      for (const finding of report.findings) {
        const severityEmoji = {
          critical: ':rotating_light:',
          high: ':red_circle:',
          medium: ':orange_circle:',
          low: ':yellow_circle:',
          info: ':blue_circle:',
        }[finding.severity];

        md += `<details>\n`;
        md += `<summary>${severityEmoji} <strong>${finding.title}</strong></summary>\n\n`;
        md += `**Severity:** ${finding.severity}\n\n`;
        md += `**Description:** ${finding.description}\n\n`;
        if (finding.suggestedFix) {
          md += `**Suggested Fix:** ${finding.suggestedFix}\n\n`;
        }
        if (finding.docsUrl) {
          md += `[Documentation](${finding.docsUrl})\n\n`;
        }
        md += `</details>\n\n`;
      }
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      md += '#### Recommendations\n\n';
      for (const rec of report.recommendations) {
        const priorityEmoji = {
          high: ':star:',
          medium: ':small_blue_diamond:',
          low: ':small_orange_diamond:',
        }[rec.priority];

        md += `<details>\n`;
        md += `<summary>${priorityEmoji} <strong>${rec.title}</strong></summary>\n\n`;
        md += `${rec.description}\n\n`;
        md += `**Action Items:**\n`;
        for (const item of rec.actionItems) {
          md += `- [ ] ${item}\n`;
        }
        md += `\n**Impact:** ${rec.estimatedImpact}\n\n`;
        md += `</details>\n\n`;
      }
    }

    // Footer
    md += '---\n';
    md += `*Generated by [Seizn CI](https://seizn.com) at ${new Date(report.generatedAt).toISOString()}*\n`;

    return md;
  }

  /**
   * Format as plain Markdown
   */
  private formatMarkdown(report: CIReport): string {
    let md = `# Seizn CI Report\n\n`;
    md += `**Status:** ${report.status.toUpperCase()}\n`;
    md += `**Generated:** ${report.generatedAt}\n`;
    md += `**Commit:** ${report.metadata.commitSha}\n\n`;

    md += `## Trace Summary\n\n`;
    md += `- Total: ${report.traceSummary.totalTraces}\n`;
    md += `- Success: ${report.traceSummary.successCount}\n`;
    md += `- Errors: ${report.traceSummary.errorCount}\n`;
    md += `- Timeouts: ${report.traceSummary.timeoutCount}\n`;
    md += `- Avg Latency: ${report.traceSummary.avgDurationMs.toFixed(0)}ms\n`;
    md += `- P95 Latency: ${report.traceSummary.p95DurationMs.toFixed(0)}ms\n\n`;

    if (report.testSummary) {
      md += `## Generated Tests\n\n`;
      md += `- Total: ${report.testSummary.totalTests}\n`;
      md += `- Unit: ${report.testSummary.byType.unit}\n`;
      md += `- Integration: ${report.testSummary.byType.integration}\n`;
      md += `- Coverage: ${(report.testSummary.coverageEstimate * 100).toFixed(1)}%\n\n`;
    }

    if (report.findings.length > 0) {
      md += `## Findings\n\n`;
      for (const f of report.findings) {
        md += `### [${f.severity.toUpperCase()}] ${f.title}\n\n`;
        md += `${f.description}\n\n`;
        if (f.suggestedFix) md += `**Fix:** ${f.suggestedFix}\n\n`;
      }
    }

    if (report.recommendations.length > 0) {
      md += `## Recommendations\n\n`;
      for (const r of report.recommendations) {
        md += `### ${r.title}\n\n`;
        md += `${r.description}\n\n`;
        md += `**Actions:**\n`;
        for (const a of r.actionItems) {
          md += `- ${a}\n`;
        }
        md += `\n`;
      }
    }

    return md;
  }

  /**
   * Format as HTML
   */
  private formatHTML(report: CIReport): string {
    const statusClass =
      report.status === 'passed' ? 'success' :
      report.status === 'warning' ? 'warning' : 'error';

    return `
<!DOCTYPE html>
<html>
<head>
  <title>Seizn CI Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    .status { padding: 10px 20px; border-radius: 8px; font-weight: bold; }
    .success { background: #d4edda; color: #155724; }
    .warning { background: #fff3cd; color: #856404; }
    .error { background: #f8d7da; color: #721c24; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; }
    .finding { margin: 15px 0; padding: 15px; border-left: 4px solid; }
    .finding.critical { border-color: #dc3545; background: #fff5f5; }
    .finding.high { border-color: #fd7e14; background: #fff8f0; }
    .finding.medium { border-color: #ffc107; background: #fffdf0; }
    .finding.low { border-color: #28a745; background: #f0fff0; }
    .finding.info { border-color: #17a2b8; background: #f0f8ff; }
  </style>
</head>
<body>
  <h1>Seizn CI Report</h1>
  <p class="status ${statusClass}">Status: ${report.status.toUpperCase()}</p>
  <p>Generated: ${report.generatedAt}</p>
  <p>Commit: ${report.metadata.commitSha}</p>

  <h2>Trace Summary</h2>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Total Traces</td><td>${report.traceSummary.totalTraces}</td></tr>
    <tr><td>Success</td><td>${report.traceSummary.successCount}</td></tr>
    <tr><td>Errors</td><td>${report.traceSummary.errorCount}</td></tr>
    <tr><td>Avg Latency</td><td>${report.traceSummary.avgDurationMs.toFixed(0)}ms</td></tr>
    <tr><td>P95 Latency</td><td>${report.traceSummary.p95DurationMs.toFixed(0)}ms</td></tr>
  </table>

  ${report.testSummary ? `
  <h2>Generated Tests</h2>
  <table>
    <tr><th>Type</th><th>Count</th></tr>
    <tr><td>Unit</td><td>${report.testSummary.byType.unit}</td></tr>
    <tr><td>Integration</td><td>${report.testSummary.byType.integration}</td></tr>
    <tr><td>E2E</td><td>${report.testSummary.byType.e2e}</td></tr>
    <tr><td>Regression</td><td>${report.testSummary.byType.regression}</td></tr>
    <tr><th>Total</th><th>${report.testSummary.totalTests}</th></tr>
  </table>
  ` : ''}

  <h2>Findings</h2>
  ${report.findings.map(f => `
  <div class="finding ${f.severity}">
    <h3>${f.title}</h3>
    <p><strong>Severity:</strong> ${f.severity}</p>
    <p>${f.description}</p>
    ${f.suggestedFix ? `<p><strong>Fix:</strong> ${f.suggestedFix}</p>` : ''}
  </div>
  `).join('')}

  <h2>Recommendations</h2>
  ${report.recommendations.map(r => `
  <div class="finding info">
    <h3>${r.title}</h3>
    <p>${r.description}</p>
    <ul>
      ${r.actionItems.map(a => `<li>${a}</li>`).join('')}
    </ul>
    <p><strong>Impact:</strong> ${r.estimatedImpact}</p>
  </div>
  `).join('')}

  <hr>
  <p><em>Generated by <a href="https://seizn.com">Seizn CI</a></em></p>
</body>
</html>
    `.trim();
  }

  /**
   * Upload report to Seizn API
   */
  private async uploadReport(report: CIReport): Promise<void> {
    const apiKey = process.env.SEIZN_API_KEY;
    const ciToken = process.env.SEIZN_CI_TOKEN;

    if (!apiKey && !ciToken) {
      console.log('[Seizn CI] No API key or CI token found, skipping upload');
      return;
    }

    const baseUrl = process.env.SEIZN_API_URL ?? 'https://seizn.com';

    try {
      const response = await fetch(`${baseUrl}/api/ci/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey ?? '',
          ...(ciToken && { 'x-ci-token': ciToken }),
        },
        body: JSON.stringify({
          metadata: report.metadata,
          traceSummary: report.traceSummary,
          testSummary: report.testSummary,
          findings: report.findings,
          recommendations: report.recommendations,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[Seizn CI] Report uploaded: ${data.url ?? 'success'}`);
      } else {
        console.error('[Seizn CI] Upload failed:', await response.text());
      }
    } catch (error) {
      console.error('[Seizn CI] Upload error:', error);
    }
  }
}

// ============================================
// Main Entry Point
// ============================================

async function main(): Promise<void> {
  try {
    const options = parseArgs();
    const formatter = new ReportFormatter(options);
    const report = await formatter.format();

    console.log('\n[Seizn CI] Report formatting complete');
    console.log(`[Seizn CI] Status: ${report.status}`);
    console.log(`[Seizn CI] Findings: ${report.findings.length}`);
    console.log(`[Seizn CI] Recommendations: ${report.recommendations.length}`);

    process.exit(report.status === 'failed' ? 1 : 0);
  } catch (error) {
    console.error('[Seizn CI] Report formatting failed:', error);
    process.exit(1);
  }
}

main();
