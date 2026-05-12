#!/usr/bin/env node

/**
 * Policy Consistency Check Script
 *
 * WP-P0-04: 정책 SSOT 자동 검사
 *
 * 목적:
 * - pages/markdown에서 하드코딩된 정책 값 검출
 * - SSOT(src/lib/policy.ts) 외부에서 정의된 값 발견 시 CI 실패
 *
 * 사용법:
 *   node scripts/policy-consistency-check.mjs
 *
 * CI 통합:
 *   npm run check:policy
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// ============================================
// Configuration
// ============================================

// Policy-related patterns to detect (regex)
const POLICY_PATTERNS = [
  // Days patterns (e.g., "14 days", "30-day", "7 day")
  { pattern: /\b(\d+)\s*[-]?days?\b/gi, description: 'Day duration' },

  // Specific policy numbers
  { pattern: /\b14\s*[-]?day\s*money\s*[-]?back/gi, description: 'Refund guarantee' },
  { pattern: /\b\d+\s*[-]?\s*day\s+refund\s*(period|guarantee)/gi, description: 'Refund mention' },
  { pattern: /\bwithin\s*\d+\s*days/gi, description: 'Time limit' },

  // Hours patterns for response times
  { pattern: /\b(\d+)\s*hours?\s*(response|support)/gi, description: 'Response time' },

  // Plan limits patterns (detect hardcoded plan values)
  { pattern: /\b(10|50|100|1000)[,\s]*000\s*(memories|API\s*calls)/gi, description: 'Plan limit' },
  { pattern: /\$\s*(9|29|99|499)\s*(\/mo|per\s*month)/gi, description: 'Plan pricing' },
  { pattern: /\b(2|3|5|10|100)\s*(API\s*keys|collections)/gi, description: 'Plan feature limit' },
];

const LEGACY_TAILWIND_CLASS_PATTERN =
  /\b(?:bg|text|border|divide)-(?:cream|ink|terracotta)(?:\/\d+)?\b/g;

// Files/directories to scan
const SCAN_PATHS = [
  'src/app',
  'src/components',
];

// Files to exclude (SSOT files, tests, etc.)
const EXCLUDE_PATTERNS = [
  'policy.ts',
  'plan-limits.ts',
  '.test.',
  '.spec.',
  '__tests__',
  'node_modules',
];

// Extensions to scan
const SCAN_EXTENSIONS = ['.tsx', '.ts', '.md', '.mdx'];

const POLICY_SOURCE_TOKENS = [
  "from '@/lib/policy'",
  'from "@/lib/policy"',
  'POLICY.',
  'DATA_RETENTION.',
  'REFUND_POLICY.',
  'COMMUNICATION.',
  'SECURITY_POLICY.',
  'TRIAL_POLICY.',
  'DESIGN_PARTNER_POLICY.',
  'TOKENS.',
  'SUPPORT.',
  'formatDays(',
  'formatHours(',
  'formatYears(',
  'formatMonthlyUsd(',
  'PLAN_LIMITS.',
  'getPlanLimits(',
  'formatLimit(',
  'SDK_INFO.',
];

const NON_POLICY_DURATION_PATH_PATTERNS = [
  /src[\\/]app[\\/]status[\\/]/,
  /src[\\/]app[\\/]engine[\\/]_components[\\/]snippet-tabs\.tsx$/,
  /src[\\/]app[\\/]api[\\/]admin[\\/]metrics[\\/]route\.ts$/,
  /src[\\/]app[\\/]api[\\/]cron[\\/]spring[\\/]beyond-mem0[\\/]route\.ts$/,
  /src[\\/]app[\\/]api[\\/]cron[\\/]winter[\\/]rtbf[\\/]process-queue[\\/]route\.ts$/,
  /src[\\/]app[\\/]api[\\/]organizations[\\/]members[\\/]route\.ts$/,
  /src[\\/]app[\\/]\(dashboard\)[\\/]dashboard[\\/]memories[\\/]mindmap[\\/]/,
  /src[\\/]app[\\/]\(dashboard\)[\\/]dashboard[\\/]overview-client\.tsx$/,
  /src[\\/]app[\\/]\(dashboard\)[\\/]dashboard[\\/]legacy[\\/]organizations[\\/]\[id\][\\/]client\.tsx$/,
  /src[\\/]app[\\/]\[locale\][\\/]admin[\\/]metrics[\\/]metrics-dashboard\.tsx$/,
  /src[\\/]components[\\/]author[\\/]graph[\\/]relationship-graph-model\.ts$/,
  /src[\\/]components[\\/]dashboard[\\/]NorthStarMetrics\.tsx$/,
  /src[\\/]components[\\/]dashboard[\\/]redesign[\\/]views[\\/]mock-data\.ts$/,
  /src[\\/]components[\\/]landing[\\/]conflict-detector\.tsx$/,
  /src[\\/]components[\\/]retops[\\/]RetOpsDashboard\.tsx$/,
];

const NON_POLICY_DURATION_LINE_PATTERN =
  /\b(last|ago|uptime|history|demo|timeline|funnel|conversion|refreshStaleSummaries|MAX_JOB_AGE_HOURS|maxAge|expiresAt|period=|label:|time:|title:)\b/i;

// ============================================
// Utilities
// ============================================

function shouldScan(filePath) {
  const ext = extname(filePath);
  if (!SCAN_EXTENSIONS.includes(ext)) return false;

  for (const pattern of EXCLUDE_PATTERNS) {
    if (filePath.includes(pattern)) return false;
  }

  return true;
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  try {
    const files = readdirSync(dirPath);

    for (const file of files) {
      const fullPath = join(dirPath, file);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          getAllFiles(fullPath, arrayOfFiles);
        } else if (shouldScan(fullPath)) {
          arrayOfFiles.push(fullPath);
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return arrayOfFiles;
}

function isPolicySourceLine(line) {
  return POLICY_SOURCE_TOKENS.some((token) => line.includes(token));
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('{/*');
}

function isNonPolicyDuration(filePath, line) {
  const normalized = filePath.replaceAll('\\', '/');
  return NON_POLICY_DURATION_PATH_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    NON_POLICY_DURATION_LINE_PATTERN.test(line);
}

function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const { pattern, description } of POLICY_PATTERNS) {
      // Reset regex state for each line
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(line)) !== null) {
        // Skip if it looks like it's importing from policy.ts
        if (isPolicySourceLine(line)) {
          continue;
        }

        // Skip comments explaining SSOT
        if (isCommentLine(line)) {
          continue;
        }

        // Skip operational UI/demo durations that are not policy commitments.
        if (description === 'Day duration' && isNonPolicyDuration(filePath, line)) {
          continue;
        }

        // Skip select/option values that are UI filters (e.g., "Last 7 days" dropdown)
        if (line.includes('<option') && (line.includes('Last') || line.includes('value='))) {
          continue;
        }

        issues.push({
          file: filePath.replace(ROOT_DIR + '/', ''),
          line: lineNum,
          match: match[0],
          description,
          context: line.trim().substring(0, 100),
        });
      }
    }
  }

  return issues;
}

function scanLegacyTailwindClasses(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    LEGACY_TAILWIND_CLASS_PATTERN.lastIndex = 0;
    let match;
    while ((match = LEGACY_TAILWIND_CLASS_PATTERN.exec(line)) !== null) {
      if (isCommentLine(line)) {
        continue;
      }

      issues.push({
        file: filePath.replace(ROOT_DIR + '/', ''),
        line: i + 1,
        match: match[0],
        description: 'Legacy Tailwind color class',
        context: line.trim().substring(0, 100),
      });
    }
  }

  return issues;
}

// ============================================
// Main
// ============================================

function main() {
  console.log('🔍 Policy Consistency Check');
  console.log('━'.repeat(60));
  console.log();

  let allFiles = [];
  for (const scanPath of SCAN_PATHS) {
    const fullPath = join(ROOT_DIR, scanPath);
    allFiles = allFiles.concat(getAllFiles(fullPath));
  }

  console.log(`📁 Scanning ${allFiles.length} files...`);
  console.log();

  let allIssues = [];
  for (const file of allFiles) {
    const issues = scanFile(file).concat(scanLegacyTailwindClasses(file));
    allIssues = allIssues.concat(issues);
  }

  if (allIssues.length === 0) {
    console.log('✅ No policy consistency issues found!');
    console.log();
    console.log('All policy values are properly sourced from SSOT (src/lib/policy.ts)');
    process.exit(0);
  }

  console.log(`⚠️  Found ${allIssues.length} potential policy consistency issues:`);
  console.log();

  // Group by file
  const byFile = {};
  for (const issue of allIssues) {
    if (!byFile[issue.file]) byFile[issue.file] = [];
    byFile[issue.file].push(issue);
  }

  for (const [file, issues] of Object.entries(byFile)) {
    console.log(`📄 ${file}`);
    for (const issue of issues) {
      console.log(`   L${issue.line}: "${issue.match}" (${issue.description})`);
      console.log(`   └─ ${issue.context}`);
    }
    console.log();
  }

  console.log('━'.repeat(60));
  console.log();
  console.log('💡 To fix these issues:');
  console.log('   1. Import values from src/lib/policy.ts');
  console.log('   2. Use formatDays(), formatHours() for display');
  console.log('   3. Never hardcode policy numbers in page components');
  console.log();
  console.log('📚 Example:');
  console.log('   import { REFUND_POLICY, formatDays } from "@/lib/policy";');
  console.log('   <p>{formatDays(REFUND_POLICY.GUARANTEE_DAYS)} money-back guarantee</p>');
  console.log();

  // Exit with error for CI
  process.exit(1);
}

main();
