#!/usr/bin/env node
/**
 * Claims Matrix Verification Script
 *
 * Scans documentation and FAQ files for compliance/security claims
 * and verifies they match the status in claims.json
 *
 * Exit codes:
 *   0 - All claims verified or properly marked
 *   1 - Unverified claims found in documentation
 *
 * Usage:
 *   node scripts/claims-check.mjs
 *   node scripts/claims-check.mjs --fix  # Generate report only, no exit code
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Configuration
const CONFIG = {
  claimsPath: path.join(projectRoot, 'src/data/claims.json'),
  scanPaths: [
    'docs/**/*.{md,mdx}',
    'src/app/**/page.tsx',
    'src/components/**/*.tsx',
    'public/**/*.json',
  ],
  excludePaths: [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
  ],
};

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

/**
 * Load claims from claims.json
 */
function loadClaims() {
  try {
    const content = fs.readFileSync(CONFIG.claimsPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`${colors.red}Error loading claims.json:${colors.reset}`, error.message);
    process.exit(1);
  }
}

/**
 * Find all files to scan
 */
async function findFilesToScan() {
  const files = [];

  for (const pattern of CONFIG.scanPaths) {
    const matches = await glob(pattern, {
      cwd: projectRoot,
      ignore: CONFIG.excludePaths,
      absolute: true,
    });
    files.push(...matches);
  }

  return [...new Set(files)]; // Remove duplicates
}

/**
 * Scan a file for claim keywords
 */
function scanFileForClaims(filePath, claims) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const findings = [];

  for (const claim of claims) {
    for (const keyword of claim.keywords) {
      // Case-insensitive search
      const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = content.match(regex);

      if (matches) {
        // Find line numbers for context
        const lines = content.split('\n');
        const lineNumbers = [];

        lines.forEach((line, index) => {
          if (regex.test(line)) {
            lineNumbers.push(index + 1);
          }
        });

        findings.push({
          claim_id: claim.claim_id,
          claim_text: claim.claim_text,
          status: claim.status,
          keyword: keyword,
          matchCount: matches.length,
          lineNumbers: lineNumbers.slice(0, 5), // Limit to first 5 occurrences
          filePath: path.relative(projectRoot, filePath),
        });
      }
    }
  }

  return findings;
}

/**
 * Generate report
 */
function generateReport(allFindings, claims) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalClaims: claims.length,
      verifiedClaims: claims.filter(c => c.status === 'verified').length,
      partialClaims: claims.filter(c => c.status === 'partial').length,
      roadmapClaims: claims.filter(c => c.status === 'roadmap').length,
      filesScanned: 0,
      violations: [],
      warnings: [],
    },
    findings: [],
  };

  // Group findings by claim
  const findingsByClaim = {};
  for (const finding of allFindings) {
    if (!findingsByClaim[finding.claim_id]) {
      findingsByClaim[finding.claim_id] = [];
    }
    findingsByClaim[finding.claim_id].push(finding);
  }

  // Analyze findings
  for (const [claimId, findings] of Object.entries(findingsByClaim)) {
    const claim = claims.find(c => c.claim_id === claimId);
    const status = claim?.status || 'unknown';

    const entry = {
      claim_id: claimId,
      claim_text: claim?.claim_text,
      status: status,
      occurrences: findings,
    };

    report.findings.push(entry);

    // Check for violations (unverified claims mentioned in docs)
    if (status === 'roadmap') {
      report.summary.violations.push({
        claim_id: claimId,
        claim_text: claim?.claim_text,
        status: status,
        files: [...new Set(findings.map(f => f.filePath))],
        message: `Roadmap claim "${claim?.claim_text}" found in documentation without verified status`,
      });
    } else if (status === 'partial') {
      report.summary.warnings.push({
        claim_id: claimId,
        claim_text: claim?.claim_text,
        status: status,
        files: [...new Set(findings.map(f => f.filePath))],
        message: `Partial claim "${claim?.claim_text}" found - ensure documentation reflects partial status`,
      });
    }
  }

  return report;
}

/**
 * Print report to console
 */
function printReport(report) {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.cyan}CLAIMS MATRIX VERIFICATION REPORT${colors.reset}`);
  console.log('='.repeat(60));
  console.log(`${colors.dim}Generated: ${report.timestamp}${colors.reset}\n`);

  // Summary
  console.log(`${colors.blue}Summary:${colors.reset}`);
  console.log(`  Total Claims: ${report.summary.totalClaims}`);
  console.log(`  ${colors.green}Verified:${colors.reset} ${report.summary.verifiedClaims}`);
  console.log(`  ${colors.yellow}Partial:${colors.reset} ${report.summary.partialClaims}`);
  console.log(`  ${colors.red}Roadmap:${colors.reset} ${report.summary.roadmapClaims}`);
  console.log();

  // Violations
  if (report.summary.violations.length > 0) {
    console.log(`${colors.red}VIOLATIONS (${report.summary.violations.length}):${colors.reset}`);
    for (const violation of report.summary.violations) {
      console.log(`\n  ${colors.red}[VIOLATION]${colors.reset} ${violation.claim_text}`);
      console.log(`    Status: ${violation.status}`);
      console.log(`    Files:`);
      for (const file of violation.files) {
        console.log(`      - ${file}`);
      }
      console.log(`    ${colors.dim}${violation.message}${colors.reset}`);
    }
    console.log();
  }

  // Warnings
  if (report.summary.warnings.length > 0) {
    console.log(`${colors.yellow}WARNINGS (${report.summary.warnings.length}):${colors.reset}`);
    for (const warning of report.summary.warnings) {
      console.log(`\n  ${colors.yellow}[WARNING]${colors.reset} ${warning.claim_text}`);
      console.log(`    Status: ${warning.status}`);
      console.log(`    Files:`);
      for (const file of warning.files) {
        console.log(`      - ${file}`);
      }
      console.log(`    ${colors.dim}${warning.message}${colors.reset}`);
    }
    console.log();
  }

  // Verified claims found
  const verifiedFindings = report.findings.filter(f => f.status === 'verified');
  if (verifiedFindings.length > 0) {
    console.log(`${colors.green}VERIFIED CLAIMS IN DOCS (${verifiedFindings.length}):${colors.reset}`);
    for (const finding of verifiedFindings) {
      const files = [...new Set(finding.occurrences.map(o => o.filePath))];
      console.log(`  ${colors.green}[OK]${colors.reset} ${finding.claim_text}`);
      console.log(`    ${colors.dim}Found in: ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` (+${files.length - 3} more)` : ''}${colors.reset}`);
    }
    console.log();
  }

  console.log('='.repeat(60));

  if (report.summary.violations.length === 0) {
    console.log(`${colors.green}All claims verified!${colors.reset}`);
  } else {
    console.log(`${colors.red}Found ${report.summary.violations.length} violation(s) that need attention.${colors.reset}`);
    console.log(`${colors.dim}Fix: Either verify the claim with evidence or remove from documentation.${colors.reset}`);
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const fixMode = args.includes('--fix');

  console.log(`${colors.cyan}Claims Matrix Verification${colors.reset}`);
  console.log(`${colors.dim}Scanning documentation for unverified claims...${colors.reset}\n`);

  // Load claims
  const claimsData = loadClaims();
  const claims = claimsData.claims;
  console.log(`Loaded ${claims.length} claims from claims.json`);

  // Find files
  const files = await findFilesToScan();
  console.log(`Found ${files.length} files to scan\n`);

  // Scan files
  const allFindings = [];
  for (const file of files) {
    try {
      const findings = scanFileForClaims(file, claims);
      allFindings.push(...findings);
    } catch (error) {
      console.warn(`${colors.yellow}Warning: Could not scan ${path.relative(projectRoot, file)}: ${error.message}${colors.reset}`);
    }
  }

  // Generate and print report
  const report = generateReport(allFindings, claims);
  report.summary.filesScanned = files.length;
  printReport(report);

  // Save report to file
  const reportPath = path.join(projectRoot, '.claims-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`${colors.dim}Report saved to: ${reportPath}${colors.reset}\n`);

  // Exit with error if violations found (unless in fix mode)
  if (!fixMode && report.summary.violations.length > 0) {
    process.exit(1);
  }

  process.exit(0);
}

// Run
main().catch(error => {
  console.error(`${colors.red}Error:${colors.reset}`, error);
  process.exit(1);
});
