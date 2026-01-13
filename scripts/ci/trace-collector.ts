#!/usr/bin/env npx ts-node
/**
 * Seizn CI - Trace Collector
 *
 * Collects Flight Recorder traces during test execution.
 * Usage: npx ts-node scripts/ci/trace-collector.ts --output=.seizn-traces --format=json
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  CITrace,
  CITraceMetadata,
  CITraceCollection,
  CITraceSummary,
  CITraceLog,
  TraceCollectorOptions,
} from './types';

// ============================================
// CLI Argument Parser
// ============================================

function parseArgs(): TraceCollectorOptions {
  const args = process.argv.slice(2);
  const options: TraceCollectorOptions = {
    output: '.seizn-traces',
    format: 'json',
  };

  for (const arg of args) {
    const [key, value] = arg.replace(/^--/, '').split('=');

    switch (key) {
      case 'output':
        options.output = value;
        break;
      case 'format':
        options.format = value as 'json' | 'jsonl';
        break;
      case 'max-traces':
        options.maxTraces = parseInt(value, 10);
        break;
      case 'timeout':
        options.timeout = parseInt(value, 10);
        break;
      case 'services':
        options.filter = { ...options.filter, services: value.split(',') };
        break;
      case 'operations':
        options.filter = { ...options.filter, operations: value.split(',') };
        break;
      case 'min-duration':
        options.filter = { ...options.filter, minDurationMs: parseInt(value, 10) };
        break;
    }
  }

  return options;
}

// ============================================
// CI Environment Detection
// ============================================

interface CIEnvironment {
  provider: CITraceMetadata['provider'];
  runId: string;
  commitSha: string;
  branch: string;
  prNumber?: number;
  repository: CITraceMetadata['repository'];
}

function detectCIEnvironment(): CIEnvironment {
  const env = process.env;

  // GitHub Actions
  if (env.GITHUB_ACTIONS === 'true') {
    const [owner, name] = (env.GITHUB_REPOSITORY ?? '/').split('/');
    return {
      provider: 'github',
      runId: env.GITHUB_RUN_ID ?? randomUUID(),
      commitSha: env.GITHUB_SHA ?? 'unknown',
      branch: env.GITHUB_HEAD_REF ?? env.GITHUB_REF_NAME ?? 'unknown',
      prNumber: env.GITHUB_EVENT_NAME === 'pull_request'
        ? parseInt(env.GITHUB_REF?.match(/refs\/pull\/(\d+)/)?.[1] ?? '0', 10) || undefined
        : undefined,
      repository: {
        owner,
        name,
        url: `https://github.com/${env.GITHUB_REPOSITORY}`,
      },
    };
  }

  // GitLab CI
  if (env.GITLAB_CI === 'true') {
    return {
      provider: 'gitlab',
      runId: env.CI_PIPELINE_ID ?? randomUUID(),
      commitSha: env.CI_COMMIT_SHA ?? 'unknown',
      branch: env.CI_COMMIT_REF_NAME ?? 'unknown',
      prNumber: env.CI_MERGE_REQUEST_IID
        ? parseInt(env.CI_MERGE_REQUEST_IID, 10)
        : undefined,
      repository: {
        owner: env.CI_PROJECT_NAMESPACE ?? 'unknown',
        name: env.CI_PROJECT_NAME ?? 'unknown',
        url: env.CI_PROJECT_URL ?? '',
      },
    };
  }

  // CircleCI
  if (env.CIRCLECI === 'true') {
    return {
      provider: 'circleci',
      runId: env.CIRCLE_BUILD_NUM ?? randomUUID(),
      commitSha: env.CIRCLE_SHA1 ?? 'unknown',
      branch: env.CIRCLE_BRANCH ?? 'unknown',
      prNumber: env.CIRCLE_PULL_REQUEST
        ? parseInt(env.CIRCLE_PULL_REQUEST.split('/').pop() ?? '0', 10) || undefined
        : undefined,
      repository: {
        owner: env.CIRCLE_PROJECT_USERNAME ?? 'unknown',
        name: env.CIRCLE_PROJECT_REPONAME ?? 'unknown',
        url: `https://github.com/${env.CIRCLE_PROJECT_USERNAME}/${env.CIRCLE_PROJECT_REPONAME}`,
      },
    };
  }

  // Local development
  return {
    provider: 'local',
    runId: randomUUID(),
    commitSha: 'local',
    branch: 'local',
    repository: {
      owner: 'local',
      name: 'seizn',
      url: '',
    },
  };
}

// ============================================
// Trace Collection
// ============================================

class TraceCollector {
  private traces: CITrace[] = [];
  private options: TraceCollectorOptions;
  private ciEnv: CIEnvironment;
  private startTime: number;

  constructor(options: TraceCollectorOptions) {
    this.options = options;
    this.ciEnv = detectCIEnvironment();
    this.startTime = Date.now();
  }

  /**
   * Start trace collection during test execution
   */
  async collect(): Promise<CITraceCollection> {
    console.log('[Seizn CI] Starting trace collection...');
    console.log(`[Seizn CI] Provider: ${this.ciEnv.provider}`);
    console.log(`[Seizn CI] Run ID: ${this.ciEnv.runId}`);
    console.log(`[Seizn CI] Commit: ${this.ciEnv.commitSha}`);

    // Run tests and capture traces
    await this.runTestsWithTracing();

    // Build collection
    const collection = this.buildCollection();

    // Save to output
    await this.saveCollection(collection);

    // Set GitHub Actions outputs
    this.setOutputs(collection);

    return collection;
  }

  /**
   * Run tests with trace instrumentation
   */
  private async runTestsWithTracing(): Promise<void> {
    const testCommand = process.env.SEIZN_TEST_COMMAND ?? 'npm test';
    const [cmd, ...args] = testCommand.split(' ');

    return new Promise((resolve, reject) => {
      console.log(`[Seizn CI] Running: ${testCommand}`);

      const child: ChildProcess = spawn(cmd, args, {
        env: {
          ...process.env,
          SEIZN_TRACE_ENABLED: 'true',
          SEIZN_TRACE_SAMPLING_RATE: '1.0', // Sample all in CI
          SEIZN_CI_TRACE_COLLECTOR: 'true',
        },
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        const line = data.toString();
        stdout += line;
        process.stdout.write(line);
        this.parseTraceLine(line);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const line = data.toString();
        stderr += line;
        process.stderr.write(line);
        this.parseTraceLine(line);
      });

      const timeout = this.options.timeout ?? 600000; // 10 min default
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Test timeout after ${timeout}ms`));
      }, timeout);

      child.on('close', (code: number | null) => {
        clearTimeout(timer);

        // Add final trace for test run
        this.addTrace({
          id: randomUUID(),
          spanId: randomUUID().replace(/-/g, '').slice(0, 16),
          operationName: 'test_run',
          service: 'ci',
          startTime: new Date(this.startTime).toISOString(),
          endTime: new Date().toISOString(),
          durationMs: Date.now() - this.startTime,
          status: code === 0 ? 'ok' : 'error',
          error: code !== 0 ? `Test exited with code ${code}` : undefined,
          tags: {
            'test.exit_code': code ?? -1,
            'test.command': testCommand,
          },
          logs: [],
        });

        resolve();
      });

      child.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Parse trace data from log lines
   */
  private parseTraceLine(line: string): void {
    // Look for Seizn trace format: [SEIZN_TRACE] {...}
    const traceMatch = line.match(/\[SEIZN_TRACE\]\s*({.+})/);
    if (traceMatch) {
      try {
        const traceData = JSON.parse(traceMatch[1]);
        this.addTrace(this.normalizeTrace(traceData));
      } catch {
        // Ignore parse errors
      }
    }

    // Look for test results
    const testMatch = line.match(/^\s*(PASS|FAIL|SKIP)\s+(.+)$/);
    if (testMatch) {
      const [, status, testName] = testMatch;
      this.addTrace({
        id: randomUUID(),
        spanId: randomUUID().replace(/-/g, '').slice(0, 16),
        operationName: 'test_case',
        service: 'test',
        startTime: new Date().toISOString(),
        status: status === 'PASS' ? 'ok' : status === 'FAIL' ? 'error' : 'ok',
        tags: {
          'test.name': testName.trim(),
          'test.status': status,
        },
        logs: [],
      });
    }
  }

  /**
   * Normalize trace data to standard format
   */
  private normalizeTrace(data: Partial<CITrace>): CITrace {
    return {
      id: data.id ?? randomUUID(),
      parentTraceId: data.parentTraceId,
      spanId: data.spanId ?? randomUUID().replace(/-/g, '').slice(0, 16),
      operationName: data.operationName ?? 'unknown',
      service: data.service ?? 'unknown',
      startTime: data.startTime ?? new Date().toISOString(),
      endTime: data.endTime,
      durationMs: data.durationMs,
      status: data.status ?? 'ok',
      error: data.error,
      tags: data.tags ?? {},
      logs: data.logs ?? [],
      io: data.io,
    };
  }

  /**
   * Add a trace with filtering
   */
  private addTrace(trace: CITrace): void {
    const filter = this.options.filter;

    // Apply filters
    if (filter?.services && !filter.services.includes(trace.service)) {
      return;
    }
    if (filter?.operations && !filter.operations.includes(trace.operationName)) {
      return;
    }
    if (filter?.minDurationMs && (trace.durationMs ?? 0) < filter.minDurationMs) {
      return;
    }

    // Apply max traces limit
    if (this.options.maxTraces && this.traces.length >= this.options.maxTraces) {
      return;
    }

    this.traces.push(trace);
  }

  /**
   * Build the final trace collection
   */
  private buildCollection(): CITraceCollection {
    const metadata: CITraceMetadata = {
      traceId: randomUUID(),
      runId: this.ciEnv.runId,
      commitSha: this.ciEnv.commitSha,
      branch: this.ciEnv.branch,
      prNumber: this.ciEnv.prNumber,
      timestamp: new Date().toISOString(),
      provider: this.ciEnv.provider,
      repository: this.ciEnv.repository,
    };

    const summary = this.calculateSummary();

    return {
      metadata,
      traces: this.traces,
      summary,
    };
  }

  /**
   * Calculate trace summary statistics
   */
  private calculateSummary(): CITraceSummary {
    const durations = this.traces
      .filter((t) => t.durationMs !== undefined)
      .map((t) => t.durationMs!);

    const sortedDurations = [...durations].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedDurations.length * 0.95);

    const byService: Record<string, { count: number; avgMs: number }> = {};
    const byOperation: Record<string, { count: number; avgMs: number }> = {};

    for (const trace of this.traces) {
      // By service
      if (!byService[trace.service]) {
        byService[trace.service] = { count: 0, avgMs: 0 };
      }
      byService[trace.service].count++;
      if (trace.durationMs) {
        byService[trace.service].avgMs =
          (byService[trace.service].avgMs * (byService[trace.service].count - 1) +
            trace.durationMs) /
          byService[trace.service].count;
      }

      // By operation
      if (!byOperation[trace.operationName]) {
        byOperation[trace.operationName] = { count: 0, avgMs: 0 };
      }
      byOperation[trace.operationName].count++;
      if (trace.durationMs) {
        byOperation[trace.operationName].avgMs =
          (byOperation[trace.operationName].avgMs *
            (byOperation[trace.operationName].count - 1) +
            trace.durationMs) /
          byOperation[trace.operationName].count;
      }
    }

    return {
      totalTraces: this.traces.length,
      successCount: this.traces.filter((t) => t.status === 'ok').length,
      errorCount: this.traces.filter((t) => t.status === 'error').length,
      timeoutCount: this.traces.filter((t) => t.status === 'timeout').length,
      avgDurationMs:
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0,
      p95DurationMs: sortedDurations[p95Index] ?? 0,
      maxDurationMs: Math.max(...durations, 0),
      byService,
      byOperation,
    };
  }

  /**
   * Save collection to output directory
   */
  private async saveCollection(collection: CITraceCollection): Promise<void> {
    const outputDir = this.options.output;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename =
      this.options.format === 'json'
        ? 'traces.json'
        : 'traces.jsonl';

    const outputPath = path.join(outputDir, filename);

    if (this.options.format === 'json') {
      fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
    } else {
      // JSONL format - one trace per line
      const lines = [
        JSON.stringify({ type: 'metadata', data: collection.metadata }),
        JSON.stringify({ type: 'summary', data: collection.summary }),
        ...collection.traces.map((t) => JSON.stringify({ type: 'trace', data: t })),
      ];
      fs.writeFileSync(outputPath, lines.join('\n'));
    }

    console.log(`[Seizn CI] Saved ${collection.traces.length} traces to ${outputPath}`);
  }

  /**
   * Set GitHub Actions outputs
   */
  private setOutputs(collection: CITraceCollection): void {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
      const outputs = [
        `trace-id=${collection.metadata.traceId}`,
        `has-traces=${collection.traces.length > 0}`,
        `trace-count=${collection.traces.length}`,
        `error-count=${collection.summary.errorCount}`,
      ];
      fs.appendFileSync(outputFile, outputs.join('\n') + '\n');
    }
  }
}

// ============================================
// Main Entry Point
// ============================================

async function main(): Promise<void> {
  try {
    const options = parseArgs();
    const collector = new TraceCollector(options);
    const collection = await collector.collect();

    console.log('\n[Seizn CI] Trace collection complete');
    console.log(`[Seizn CI] Total traces: ${collection.summary.totalTraces}`);
    console.log(`[Seizn CI] Success: ${collection.summary.successCount}`);
    console.log(`[Seizn CI] Errors: ${collection.summary.errorCount}`);

    process.exit(collection.summary.errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('[Seizn CI] Trace collection failed:', error);
    process.exit(1);
  }
}

main();
