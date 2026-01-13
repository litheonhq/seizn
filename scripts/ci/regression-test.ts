#!/usr/bin/env npx ts-node

/**
 * Retrieval Regression Test Runner for CI
 *
 * Usage:
 *   npx ts-node scripts/ci/regression-test.ts --suite-id <id> --api-key <key>
 *   npx ts-node scripts/ci/regression-test.ts --all --api-key <key>
 *
 * Environment variables:
 *   SEIZN_API_KEY - API key for authentication
 *   SEIZN_API_URL - API base URL (default: https://seizn.com)
 *
 * Exit codes:
 *   0 - All tests passed
 *   1 - Some tests failed
 *   2 - Error running tests
 */

import https from 'https';
import http from 'http';

// ============================================
// Configuration
// ============================================

interface Config {
  apiKey: string;
  apiUrl: string;
  suiteId?: string;
  runAll: boolean;
  verbose: boolean;
  failFast: boolean;
  threshold: number; // Minimum pass rate to succeed
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    apiKey: process.env.SEIZN_API_KEY || '',
    apiUrl: process.env.SEIZN_API_URL || 'https://seizn.com',
    runAll: false,
    verbose: false,
    failFast: false,
    threshold: 100, // 100% pass rate required by default
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--suite-id':
      case '-s':
        config.suiteId = args[++i];
        break;
      case '--api-key':
      case '-k':
        config.apiKey = args[++i];
        break;
      case '--api-url':
      case '-u':
        config.apiUrl = args[++i];
        break;
      case '--all':
      case '-a':
        config.runAll = true;
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--fail-fast':
        config.failFast = true;
        break;
      case '--threshold':
      case '-t':
        config.threshold = parseFloat(args[++i]);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
Seizn Retrieval Regression Test Runner

Usage:
  npx ts-node regression-test.ts [options]

Options:
  -s, --suite-id <id>    Run specific test suite
  -a, --all              Run all active test suites
  -k, --api-key <key>    API key (or use SEIZN_API_KEY env var)
  -u, --api-url <url>    API base URL (default: https://seizn.com)
  -v, --verbose          Show detailed output
  -t, --threshold <n>    Minimum pass rate % to succeed (default: 100)
  --fail-fast            Stop on first failure
  -h, --help             Show this help

Examples:
  # Run specific suite
  npx ts-node regression-test.ts -s abc123 -k szn_xxx

  # Run all suites with 90% pass threshold
  npx ts-node regression-test.ts --all -t 90

  # Verbose output
  npx ts-node regression-test.ts -s abc123 -v
`);
}

// ============================================
// API Client
// ============================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    error_code: string;
    message: string;
  };
}

async function apiRequest<T>(
  config: Config,
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, config.apiUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      },
    };

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// ============================================
// Test Runner
// ============================================

interface TestSuite {
  id: string;
  name: string;
  is_active: boolean;
}

interface TestRun {
  id: string;
  status: string;
  total_cases: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms?: number;
  results?: Array<{
    case_id: string;
    result: string;
    relevance_score?: number;
    latency_ms?: number;
    error_message?: string;
  }>;
}

async function listSuites(config: Config): Promise<TestSuite[]> {
  const response = await apiRequest<{ data: TestSuite[] }>(
    config,
    'GET',
    '/api/testing/suites?active=true'
  );

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || 'Failed to list test suites');
  }

  // Handle both response formats
  const suites = Array.isArray(response.data) ? response.data : (response.data as { data: TestSuite[] }).data;
  return suites || [];
}

async function runSuite(
  config: Config,
  suiteId: string
): Promise<TestRun> {
  const response = await apiRequest<{ data: TestRun }>(
    config,
    'POST',
    `/api/testing/suites/${suiteId}/run`,
    {
      triggered_by: 'ci',
      trigger_context: {
        ci_run_id: process.env.GITHUB_RUN_ID || process.env.CI_JOB_ID || 'local',
        commit_sha: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA,
        branch: process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_BRANCH,
      },
    }
  );

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || 'Failed to run test suite');
  }

  // Handle nested data structure
  return (response.data as { data?: TestRun }).data || response.data as unknown as TestRun;
}

async function getRunResults(
  config: Config,
  suiteId: string,
  runId: string
): Promise<{ run: TestRun }> {
  const response = await apiRequest<{ data: { run: TestRun } }>(
    config,
    'GET',
    `/api/testing/suites/${suiteId}/results?run_id=${runId}&details=true`
  );

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || 'Failed to get results');
  }

  return (response.data as { data?: { run: TestRun } }).data || response.data as unknown as { run: TestRun };
}

// ============================================
// Output Formatting
// ============================================

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

function log(message: string): void {
  console.log(message);
}

function logSuccess(message: string): void {
  console.log(`${COLORS.green}✓${COLORS.reset} ${message}`);
}

function logError(message: string): void {
  console.log(`${COLORS.red}✗${COLORS.reset} ${message}`);
}

function logWarning(message: string): void {
  console.log(`${COLORS.yellow}⚠${COLORS.reset} ${message}`);
}

function logInfo(message: string): void {
  console.log(`${COLORS.blue}ℹ${COLORS.reset} ${message}`);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function printSummary(results: Array<{ suite: TestSuite; run?: TestRun; error?: string }>): void {
  log('\n' + '═'.repeat(60));
  log(`${COLORS.bold}TEST SUMMARY${COLORS.reset}`);
  log('═'.repeat(60) + '\n');

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const result of results) {
    const { suite, run, error } = result;

    if (error) {
      logError(`${suite.name}: ${error}`);
      continue;
    }

    if (!run) continue;

    const passRate = run.total_cases > 0
      ? ((run.passed / run.total_cases) * 100).toFixed(1)
      : '0';

    const status = run.failed === 0 ? COLORS.green + 'PASSED' : COLORS.red + 'FAILED';

    log(`${COLORS.bold}${suite.name}${COLORS.reset}`);
    log(`  Status: ${status}${COLORS.reset}`);
    log(`  Pass Rate: ${passRate}% (${run.passed}/${run.total_cases})`);
    if (run.duration_ms) {
      log(`  Duration: ${formatDuration(run.duration_ms)}`);
    }
    log('');

    totalPassed += run.passed;
    totalFailed += run.failed;
    totalSkipped += run.skipped;
  }

  const total = totalPassed + totalFailed + totalSkipped;
  const overallPassRate = total > 0 ? ((totalPassed / total) * 100).toFixed(1) : '0';

  log('─'.repeat(60));
  log(`${COLORS.bold}TOTAL${COLORS.reset}`);
  log(`  Passed: ${COLORS.green}${totalPassed}${COLORS.reset}`);
  log(`  Failed: ${COLORS.red}${totalFailed}${COLORS.reset}`);
  log(`  Skipped: ${COLORS.gray}${totalSkipped}${COLORS.reset}`);
  log(`  Pass Rate: ${overallPassRate}%`);
  log('═'.repeat(60) + '\n');
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  const config = parseArgs();

  // Validate config
  if (!config.apiKey) {
    logError('API key required. Use --api-key or set SEIZN_API_KEY');
    process.exit(2);
  }

  if (!config.suiteId && !config.runAll) {
    logError('Must specify --suite-id or --all');
    printHelp();
    process.exit(2);
  }

  log('\n' + '═'.repeat(60));
  log(`${COLORS.bold}SEIZN RETRIEVAL REGRESSION TESTS${COLORS.reset}`);
  log('═'.repeat(60) + '\n');

  const startTime = Date.now();
  const results: Array<{ suite: TestSuite; run?: TestRun; error?: string }> = [];

  try {
    // Get suites to run
    let suites: TestSuite[] = [];

    if (config.suiteId) {
      suites = [{ id: config.suiteId, name: 'Suite', is_active: true }];
    } else if (config.runAll) {
      logInfo('Fetching active test suites...');
      suites = await listSuites(config);
      logInfo(`Found ${suites.length} active suite(s)`);
    }

    if (suites.length === 0) {
      logWarning('No test suites found');
      process.exit(0);
    }

    // Run each suite
    for (const suite of suites) {
      log(`\n${COLORS.bold}Running: ${suite.name}${COLORS.reset}`);
      log('─'.repeat(40));

      try {
        const run = await runSuite(config, suite.id);
        results.push({ suite, run });

        // Print results
        const passRate = run.total_cases > 0
          ? ((run.passed / run.total_cases) * 100).toFixed(1)
          : '0';

        if (run.failed === 0) {
          logSuccess(`All ${run.passed} tests passed`);
        } else {
          logError(`${run.failed} of ${run.total_cases} tests failed`);
        }

        log(`  Pass Rate: ${passRate}%`);

        // Verbose output
        if (config.verbose && run.results) {
          log('\n  Details:');
          for (const r of run.results) {
            const icon = r.result === 'pass' ? '✓' : '✗';
            const color = r.result === 'pass' ? COLORS.green : COLORS.red;
            const score = r.relevance_score
              ? ` (score: ${r.relevance_score.toFixed(2)})`
              : '';
            log(`    ${color}${icon}${COLORS.reset} ${r.case_id}${score}`);
            if (r.error_message && config.verbose) {
              log(`      ${COLORS.gray}${r.error_message}${COLORS.reset}`);
            }
          }
        }

        // Fail fast
        if (config.failFast && run.failed > 0) {
          logError('Stopping due to --fail-fast');
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({ suite, error: message });
        logError(`Failed: ${message}`);

        if (config.failFast) {
          break;
        }
      }
    }

    // Print summary
    const totalDuration = Date.now() - startTime;
    printSummary(results);
    log(`Total Duration: ${formatDuration(totalDuration)}\n`);

    // Calculate overall pass rate
    const totalPassed = results.reduce((sum, r) => sum + (r.run?.passed || 0), 0);
    const totalTests = results.reduce((sum, r) => sum + (r.run?.total_cases || 0), 0);
    const overallPassRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

    // Exit based on threshold
    if (overallPassRate >= config.threshold) {
      logSuccess(`Pass rate ${overallPassRate.toFixed(1)}% meets threshold ${config.threshold}%`);
      process.exit(0);
    } else {
      logError(`Pass rate ${overallPassRate.toFixed(1)}% below threshold ${config.threshold}%`);
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logError(`Fatal error: ${message}`);
    process.exit(2);
  }
}

// Run
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(2);
});
