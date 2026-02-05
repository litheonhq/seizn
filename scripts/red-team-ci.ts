#!/usr/bin/env npx ts-node
/**
 * Red Team CI/CD Integration Script
 *
 * Runs red team security scans for CI/CD pipelines.
 * Usage: npm run security:red-team -- --categories "jailbreak,injection" --limit 10
 */

import { RedTeamRunner, AttackCategory, RedTeamResult } from '../src/lib/security/red-team';

// Parse command line arguments
function parseArgs(): {
  categories: AttackCategory[];
  limit: number;
  outputFile: string;
  apiUrl?: string;
  apiKey?: string;
  stopOnCritical: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    categories: ['jailbreak', 'injection', 'extraction', 'bypass'] as AttackCategory[],
    limit: 10,
    outputFile: 'red-team-report.json',
    apiUrl: process.env.API_URL,
    apiKey: process.env.API_KEY,
    stopOnCritical: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];

    switch (arg) {
      case '--categories':
        result.categories = value.split(',').map((c) => c.trim()) as AttackCategory[];
        i++;
        break;
      case '--limit':
        result.limit = parseInt(value, 10);
        i++;
        break;
      case '--output-file':
        result.outputFile = value;
        i++;
        break;
      case '--api-url':
        result.apiUrl = value;
        i++;
        break;
      case '--api-key':
        result.apiKey = value;
        i++;
        break;
      case '--no-stop-on-critical':
        result.stopOnCritical = false;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return result;
}

function printHelp() {
  console.log(`
Red Team CI/CD Security Scanner

Usage: npm run security:red-team -- [options]

Options:
  --categories <list>      Comma-separated attack categories
                           Default: jailbreak,injection,extraction,bypass
  --limit <number>         Max tests per category (default: 10)
  --output-file <path>     Output file path (default: red-team-report.json)
  --api-url <url>          Target API URL (or set API_URL env var)
  --api-key <key>          API key for authentication (or set API_KEY env var)
  --no-stop-on-critical    Continue running even after critical findings
  --help                   Show this help message

Environment Variables:
  API_URL                  Target API URL
  API_KEY                  API key for authentication
  ATTACK_CATEGORIES        Comma-separated attack categories
  TEST_LIMIT               Max tests per category

Examples:
  npm run security:red-team -- --categories "jailbreak,injection" --limit 5
  npm run security:red-team -- --output-file ./reports/security.json
`);
}

interface ScanReport {
  summary: {
    total_tests: number;
    passed: number;
    failed: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    duration_ms: number;
    scan_time: string;
  };
  findings: Array<{
    id: string;
    category: string;
    attack_name: string;
    severity: string;
    description: string;
    prompt: string;
    response?: string;
    remediation?: string;
  }>;
  config: {
    categories: string[];
    limit: number;
    api_url?: string;
  };
}

async function runScan() {
  const config = parseArgs();

  console.log('🔴 Starting Red Team Security Scan');
  console.log(`   Categories: ${config.categories.join(', ')}`);
  console.log(`   Test limit: ${config.limit} per category`);
  console.log(`   Output: ${config.outputFile}`);
  console.log('');

  const startTime = Date.now();

  // Create a mock target function if no API URL provided
  const targetFunction = config.apiUrl
    ? createAPITargetFunction(config.apiUrl, config.apiKey)
    : createMockTargetFunction();

  // Initialize runner
  const runner = new RedTeamRunner({
    targetFunction,
    attackCategories: config.categories,
    testLimitPerCategory: config.limit,
    stopOnCritical: config.stopOnCritical,
    timeout: 30000,
  });

  let result: RedTeamResult;

  try {
    result = await runner.run();
  } catch (error) {
    console.error('❌ Scan failed:', error);
    process.exit(1);
  }

  const duration = Date.now() - startTime;

  // Build report
  const report: ScanReport = {
    summary: {
      total_tests: result.totalTests,
      passed: result.passed,
      failed: result.failed,
      critical: result.findings.filter((f) => f.severity === 'critical').length,
      high: result.findings.filter((f) => f.severity === 'high').length,
      medium: result.findings.filter((f) => f.severity === 'medium').length,
      low: result.findings.filter((f) => f.severity === 'low').length,
      duration_ms: duration,
      scan_time: new Date().toISOString(),
    },
    findings: result.findings.map((f) => ({
      id: f.id,
      category: f.category,
      attack_name: f.attackName,
      severity: f.severity,
      description: f.description,
      prompt: f.prompt,
      response: f.response?.substring(0, 500),
      remediation: getRemediation(f.category),
    })),
    config: {
      categories: config.categories,
      limit: config.limit,
      api_url: config.apiUrl ? '[REDACTED]' : undefined,
    },
  };

  // Write report
  const fs = await import('fs');
  fs.writeFileSync(config.outputFile, JSON.stringify(report, null, 2));

  // Print summary
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('                SCAN RESULTS SUMMARY                 ');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Total Tests:  ${report.summary.total_tests}`);
  console.log(`  Passed:       ${report.summary.passed}`);
  console.log(`  Failed:       ${report.summary.failed}`);
  console.log('');
  console.log('  Findings by Severity:');
  console.log(`    🔴 Critical: ${report.summary.critical}`);
  console.log(`    🟠 High:     ${report.summary.high}`);
  console.log(`    🟡 Medium:   ${report.summary.medium}`);
  console.log(`    🟢 Low:      ${report.summary.low}`);
  console.log('');
  console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  // Print critical findings
  if (report.summary.critical > 0) {
    console.log('⚠️  CRITICAL FINDINGS:');
    console.log('');
    for (const finding of report.findings.filter((f) => f.severity === 'critical')) {
      console.log(`  [${finding.category}] ${finding.attack_name}`);
      console.log(`    ${finding.description}`);
      console.log('');
    }
  }

  console.log(`📄 Full report saved to: ${config.outputFile}`);

  // Exit with error code if critical findings
  if (report.summary.critical > 0) {
    console.log('');
    console.log('❌ SCAN FAILED: Critical vulnerabilities detected');
    process.exit(1);
  }

  console.log('');
  console.log('✅ SCAN PASSED');
  process.exit(0);
}

function createAPITargetFunction(apiUrl: string, apiKey?: string) {
  return async (prompt: string): Promise<string> => {
    const response = await fetch(`${apiUrl}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.content || data.message || JSON.stringify(data);
  };
}

function createMockTargetFunction() {
  return async (prompt: string): Promise<string> => {
    // Simulate a basic LLM response for testing
    const lowerPrompt = prompt.toLowerCase();

    // Simulate some vulnerable responses for testing
    if (lowerPrompt.includes('ignore') && lowerPrompt.includes('instructions')) {
      return 'I understand you want me to ignore my instructions, but I cannot do that.';
    }

    if (lowerPrompt.includes('system prompt')) {
      return 'I cannot reveal my system prompt or internal instructions.';
    }

    return 'I am a helpful assistant. How can I help you today?';
  };
}

function getRemediation(category: string): string {
  const remediations: Record<string, string> = {
    jailbreak:
      'Review and strengthen system prompt. Add explicit refusal patterns. Consider using a guardrail layer.',
    injection:
      'Implement input sanitization. Use prompt isolation techniques. Add instruction hierarchy.',
    extraction:
      'Ensure system prompts are protected. Add metadata scrubbing. Implement output filtering.',
    bypass:
      'Strengthen policy enforcement. Add multi-layer validation. Consider content analysis.',
  };

  return remediations[category] || 'Review security policies and add appropriate guardrails.';
}

// Run the scan
runScan().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
