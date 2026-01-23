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
  { pattern: /\brefund\s*(policy|period|guarantee)/gi, description: 'Refund mention' },
  { pattern: /\bdata\s*retention/gi, description: 'Data retention' },
  { pattern: /\bwithin\s*\d+\s*days/gi, description: 'Time limit' },

  // Hours patterns for response times
  { pattern: /\b(\d+)\s*hours?\s*(response|support)/gi, description: 'Response time' },
];

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
        if (line.includes("from '@/lib/policy'") ||
            line.includes('from "@/lib/policy"') ||
            line.includes('POLICY.') ||
            line.includes('DATA_RETENTION.') ||
            line.includes('REFUND_POLICY.') ||
            line.includes('COMMUNICATION.') ||
            line.includes('formatDays(') ||
            line.includes('formatHours(')) {
          continue;
        }

        // Skip comments explaining SSOT
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
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
    const issues = scanFile(file);
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
