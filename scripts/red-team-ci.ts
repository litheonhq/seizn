#!/usr/bin/env npx ts-node
/**
 * Red Team CI/CD Integration Script
 *
 * Runs red-team security scans for CI/CD pipelines.
 * Usage: npm run security:red-team -- --categories "jailbreak,prompt_injection" --limit 10
 */

import {
  RedTeamRunner,
  type AttackCategory,
  type RedTeamRun,
  type VulnerabilityReport,
} from '../src/lib/security/red-team';

type CliArgs = {
  categories: AttackCategory[];
  limit: number;
  outputFile: string;
  organizationId: string;
  apiUrl?: string;
  apiKey?: string;
  stopOnCritical: boolean;
};

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
    prompt?: string;
    response?: string;
    remediation?: string;
  }>;
  config: {
    categories: string[];
    limit: number;
    api_url?: string;
  };
}

const DEFAULT_CATEGORIES: AttackCategory[] = [
  'jailbreak',
  'prompt_injection',
  'data_extraction',
  'policy_bypass',
];

const CATEGORY_ALIASES: Record<string, AttackCategory> = {
  injection: 'prompt_injection',
  extraction: 'data_extraction',
  bypass: 'policy_bypass',
};

const VALID_CATEGORIES = new Set<AttackCategory>([
  'jailbreak',
  'prompt_injection',
  'data_extraction',
  'policy_bypass',
  'hallucination_induction',
  'context_manipulation',
  'encoding_attack',
  'roleplay_exploit',
]);

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const envCategories = process.env.ATTACK_CATEGORIES
    ? process.env.ATTACK_CATEGORIES.split(',').map((c) => c.trim())
    : [];
  const envLimit = Number.parseInt(process.env.TEST_LIMIT || '', 10);

  const result: CliArgs = {
    categories: normalizeCategories(envCategories),
    limit: Number.isFinite(envLimit) && envLimit > 0 ? envLimit : 10,
    outputFile: 'red-team-report.json',
    organizationId: process.env.ORG_ID || process.env.ORGANIZATION_ID || 'ci-security-scan',
    apiUrl: process.env.API_URL,
    apiKey: process.env.API_KEY,
    stopOnCritical: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];

    switch (arg) {
      case '--categories':
        result.categories = normalizeCategories(requireValue(arg, value));
        i++;
        break;
      case '--limit': {
        const parsed = Number.parseInt(requireValue(arg, value), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          result.limit = parsed;
        }
        i++;
        break;
      }
      case '--output-file':
        result.outputFile = requireValue(arg, value);
        i++;
        break;
      case '--organization-id':
        result.organizationId = requireValue(arg, value);
        i++;
        break;
      case '--api-url':
        result.apiUrl = requireValue(arg, value);
        i++;
        break;
      case '--api-key':
        result.apiKey = requireValue(arg, value);
        i++;
        break;
      case '--no-stop-on-critical':
        result.stopOnCritical = false;
        break;
      case '--help':
        printHelp();
        process.exit(0);
      default:
        break;
    }
  }

  return result;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function normalizeCategories(raw: string[] | string): AttackCategory[] {
  const values = Array.isArray(raw) ? raw : raw.split(',').map((c) => c.trim());

  const normalized = values
    .map((category) => CATEGORY_ALIASES[category] || category)
    .filter((category): category is AttackCategory => VALID_CATEGORIES.has(category as AttackCategory));

  return normalized.length > 0 ? normalized : DEFAULT_CATEGORIES;
}

function printHelp() {
  console.log(`
Red Team CI/CD Security Scanner

Usage: npm run security:red-team -- [options]

Options:
  --categories <list>      Comma-separated attack categories
                           Default: jailbreak,prompt_injection,data_extraction,policy_bypass
  --limit <number>         Max tests (default: 10)
  --output-file <path>     Output file path (default: red-team-report.json)
  --organization-id <id>   Organization ID for run metadata
                           Default: ORG_ID env or "ci-security-scan"
  --api-url <url>          Target API URL (or set API_URL env var)
  --api-key <key>          API key for authentication (or set API_KEY env var)
  --no-stop-on-critical    Continue running even after critical findings
  --help                   Show this help message

Environment Variables:
  ORG_ID / ORGANIZATION_ID Organization ID for run metadata
  API_URL                  Target API URL
  API_KEY                  API key for authentication
  ATTACK_CATEGORIES        Comma-separated attack categories
  TEST_LIMIT               Max tests

Examples:
  npm run security:red-team -- --categories "jailbreak,prompt_injection" --limit 5
  npm run security:red-team -- --output-file ./reports/security.json
`);
}

async function runScan() {
  const config = parseArgs();

  console.log('Starting red-team security scan');
  console.log(`  Categories: ${config.categories.join(', ')}`);
  console.log(`  Test limit: ${config.limit}`);
  console.log(`  Output: ${config.outputFile}`);
  console.log('');

  const startTime = Date.now();
  const targetFunction = config.apiUrl
    ? createAPITargetFunction(config.apiUrl, config.apiKey)
    : createMockTargetFunction();

  const runner = new RedTeamRunner();

  let run: RedTeamRun;
  let vulnerabilityReport: VulnerabilityReport | null = null;

  try {
    run = await runner.run(config.organizationId, targetFunction, {
      categories: config.categories,
      maxTests: config.limit,
      stopOnCritical: config.stopOnCritical,
      timeoutMs: 30000,
    });

    try {
      vulnerabilityReport = await runner.generateReport(run.id);
    } catch (reportError) {
      console.warn(
        'Report generation failed, continuing with in-memory run summary:',
        reportError instanceof Error ? reportError.message : String(reportError)
      );
    }
  } catch (error) {
    console.error('Scan failed:', error);
    process.exit(1);
  }

  const duration = Date.now() - startTime;

  const report: ScanReport = {
    summary: {
      total_tests: run.totalTests,
      passed: run.passedTests,
      failed: run.failedTests,
      critical: run.criticalFindings,
      high: run.highFindings,
      medium: run.mediumFindings,
      low: run.lowFindings,
      duration_ms: duration,
      scan_time: new Date().toISOString(),
    },
    findings: (vulnerabilityReport?.findings || []).map((finding, index) => ({
      id: `${run.id}-${index + 1}`,
      category: finding.category,
      attack_name: finding.category,
      severity: finding.severity,
      description: finding.description,
      response: finding.evidence?.substring(0, 500),
      remediation: finding.remediation || getRemediation(finding.category),
    })),
    config: {
      categories: config.categories,
      limit: config.limit,
      api_url: config.apiUrl ? '[REDACTED]' : undefined,
    },
  };

  const fs = await import('fs');
  fs.writeFileSync(config.outputFile, JSON.stringify(report, null, 2));

  console.log('------------------------------------------------------------');
  console.log('SCAN RESULTS SUMMARY');
  console.log('------------------------------------------------------------');
  console.log(`Total Tests: ${report.summary.total_tests}`);
  console.log(`Passed:      ${report.summary.passed}`);
  console.log(`Failed:      ${report.summary.failed}`);
  console.log('');
  console.log('Findings by Severity:');
  console.log(`  Critical: ${report.summary.critical}`);
  console.log(`  High:     ${report.summary.high}`);
  console.log(`  Medium:   ${report.summary.medium}`);
  console.log(`  Low:      ${report.summary.low}`);
  console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log('------------------------------------------------------------');
  console.log(`Full report saved to: ${config.outputFile}`);

  if (report.summary.critical > 0) {
    console.log('SCAN FAILED: Critical vulnerabilities detected');
    process.exit(1);
  }

  console.log('SCAN PASSED');
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

    const data = (await response.json()) as {
      response?: string;
      content?: string;
      message?: string;
    };

    return data.response || data.content || data.message || JSON.stringify(data);
  };
}

function createMockTargetFunction() {
  return async (prompt: string): Promise<string> => {
    const lowerPrompt = prompt.toLowerCase();

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
      'Review and strengthen system prompts. Add explicit refusal patterns and guardrails.',
    prompt_injection:
      'Implement input sanitization and instruction isolation. Add hierarchy-aware prompt boundaries.',
    data_extraction:
      'Harden prompt confidentiality rules and add output filtering for internal/system data.',
    policy_bypass:
      'Strengthen policy checks with layered validation and context-aware content analysis.',
    hallucination_induction:
      'Add fact-checking, confidence scoring, and strict response grounding.',
    context_manipulation:
      'Apply context length limits and anomaly detection for flooding/repetition patterns.',
    encoding_attack:
      'Normalize/decode inputs before processing and detect obfuscation attempts.',
    roleplay_exploit:
      'Block harmful roleplay scenarios and enforce safety constraints during persona prompts.',
  };

  return remediations[category] || 'Review security policies and add appropriate guardrails.';
}

runScan().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
