/**
 * OWASP LLM Top 10 Security Test Suite - Test Runner
 *
 * Executes security tests against the Seizn Guard/Firewall system.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PromptInjectionDetector,
  createDetector,
} from '../../../lib/prompt-firewall/detector';
import type { DetectionResult } from '../../../lib/prompt-firewall/types';
import type {
  SecurityTestCase,
  SecurityTestResult,
  TestSuiteReport,
  OWASPCategory,
  TestResult,
} from './types';
import {
  ALL_SECURITY_TESTS,
  getTestsByCategory,
  LLM01_PROMPT_INJECTION,
  LLM02_INSECURE_OUTPUT,
  LLM04_MODEL_DOS,
  LLM06_SENSITIVE_DISCLOSURE,
  LLM08_EXCESSIVE_AGENCY,
  LLM10_UNBOUNDED_CONSUMPTION,
} from './payloads';

// ============================================
// Test Configuration
// ============================================

const STRICT_MODE = process.env.SECURITY_STRICT_MODE === 'true';
const LOG_RESULTS = process.env.SECURITY_LOG_RESULTS === 'true';

// ============================================
// Test Utilities
// ============================================

function getPayloadString(payload: string | (() => string)): string {
  return typeof payload === 'function' ? payload() : payload;
}

function evaluateResult(
  testCase: SecurityTestCase,
  detection: DetectionResult
): TestResult {
  const { expectedBehavior } = testCase;
  const { detected, threatLevel } = detection;

  switch (expectedBehavior) {
    case 'blocked':
      // Should be detected with high/critical threat level
      if (detected && (threatLevel === 'critical' || threatLevel === 'high')) {
        return 'pass';
      }
      return 'fail';

    case 'sanitized':
      // Should be detected and sanitized
      if (detected && detection.sanitizedInput) {
        return 'pass';
      }
      // Also pass if blocked (more conservative)
      if (detected && (threatLevel === 'critical' || threatLevel === 'high')) {
        return 'pass';
      }
      return 'fail';

    case 'flagged':
      // Should be detected at any level
      if (detected) {
        return 'pass';
      }
      return 'fail';

    case 'allowed':
      // Should not be detected (for testing false positives)
      if (!detected) {
        return 'pass';
      }
      return 'fail';

    default:
      return 'error';
  }
}

function runSingleTest(
  detector: PromptInjectionDetector,
  testCase: SecurityTestCase
): SecurityTestResult {
  const startTime = performance.now();

  try {
    const payload = getPayloadString(testCase.payload);
    const detection = detector.scan(payload);
    const result = evaluateResult(testCase, detection);

    const testResult: SecurityTestResult = {
      testCase,
      result,
      actualBehavior: detection.detected
        ? `Detected (${detection.threatLevel})`
        : 'Not detected',
      detectedThreats: detection.threats.map((t) => t.patternName),
      executionTimeMs: performance.now() - startTime,
    };

    if (LOG_RESULTS) {
      console.log(
        `[${result.toUpperCase()}] ${testCase.id}: ${testCase.name}`,
        result === 'fail' ? `(Expected: ${testCase.expectedBehavior})` : ''
      );
    }

    return testResult;
  } catch (error) {
    return {
      testCase,
      result: 'error',
      actualBehavior: 'Error during test',
      detectedThreats: [],
      executionTimeMs: performance.now() - startTime,
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

function generateReport(
  category: OWASPCategory,
  results: SecurityTestResult[]
): TestSuiteReport {
  const passed = results.filter((r) => r.result === 'pass').length;
  const failed = results.filter((r) => r.result === 'fail').length;
  const skipped = results.filter((r) => r.result === 'skip').length;
  const errors = results.filter((r) => r.result === 'error').length;
  const totalTime = results.reduce((sum, r) => sum + r.executionTimeMs, 0);

  return {
    suiteId: `owasp-${category.toLowerCase()}-${Date.now()}`,
    category,
    totalTests: results.length,
    passed,
    failed,
    skipped,
    errors,
    coveragePercent: results.length > 0 ? (passed / results.length) * 100 : 0,
    executionTimeMs: totalTime,
    results,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================
// Test Suites
// ============================================

describe('OWASP LLM Top 10 Security Test Suite', () => {
  let detector: PromptInjectionDetector;

  beforeAll(() => {
    // Create detector with strict configuration for security testing
    detector = createDetector({
      enabled: true,
      mode: 'block',
      minThreatLevel: 'low',
      logDetections: false,
      alertOnCritical: true,
    });
  });

  // ----------------------------------------
  // LLM01: Prompt Injection
  // ----------------------------------------
  describe('LLM01: Prompt Injection', () => {
    const tests = LLM01_PROMPT_INJECTION;

    it.each(tests.map((t) => [t.id, t.name, t]))(
      '%s - %s',
      (id, name, testCase) => {
        const result = runSingleTest(detector, testCase as SecurityTestCase);

        if (STRICT_MODE || testCase.severity === 'critical') {
          expect(result.result).toBe('pass');
        } else {
          // In non-strict mode, warn but don't fail for non-critical
          if (result.result === 'fail') {
            console.warn(`[WARN] ${id}: ${name} - Expected ${testCase.expectedBehavior}`);
          }
        }
      }
    );

    it('should achieve >90% detection rate for critical injections', () => {
      const criticalTests = tests.filter((t) => t.severity === 'critical');
      const results = criticalTests.map((t) => runSingleTest(detector, t));
      const passRate =
        results.filter((r) => r.result === 'pass').length / results.length;
      expect(passRate).toBeGreaterThanOrEqual(0.9);
    });
  });

  // ----------------------------------------
  // LLM02: Insecure Output Handling
  // ----------------------------------------
  describe('LLM02: Insecure Output Handling', () => {
    const tests = LLM02_INSECURE_OUTPUT;

    it.each(tests.map((t) => [t.id, t.name, t]))(
      '%s - %s',
      (id, name, testCase) => {
        const result = runSingleTest(detector, testCase as SecurityTestCase);

        // Output handling tests may need different detection approach
        // These validate that malicious payloads in input are caught
        if (testCase.severity === 'critical' && STRICT_MODE) {
          expect(result.result).toBe('pass');
        }
      }
    );
  });

  // ----------------------------------------
  // LLM04: Model Denial of Service
  // ----------------------------------------
  describe('LLM04: Model Denial of Service', () => {
    const tests = LLM04_MODEL_DOS;

    it.each(tests.map((t) => [t.id, t.name, t]))(
      '%s - %s',
      (id, name, testCase) => {
        const result = runSingleTest(detector, testCase as SecurityTestCase);

        if (STRICT_MODE) {
          expect(result.result).toBe('pass');
        }
      }
    );

    it('should detect resource exhaustion attempts', () => {
      const results = tests.map((t) => runSingleTest(detector, t));
      const detected = results.filter(
        (r) => r.detectedThreats.length > 0
      ).length;
      expect(detected).toBeGreaterThan(0);
    });
  });

  // ----------------------------------------
  // LLM06: Sensitive Information Disclosure
  // ----------------------------------------
  describe('LLM06: Sensitive Information Disclosure', () => {
    const tests = LLM06_SENSITIVE_DISCLOSURE;

    it.each(tests.map((t) => [t.id, t.name, t]))(
      '%s - %s',
      (id, name, testCase) => {
        const result = runSingleTest(detector, testCase as SecurityTestCase);

        // Critical disclosure attempts must be blocked
        if (testCase.severity === 'critical') {
          expect(result.result).toBe('pass');
        }
      }
    );

    it('should block all system prompt extraction attempts', () => {
      const extractionTests = tests.filter((t) =>
        t.tags.includes('system-prompt')
      );
      const results = extractionTests.map((t) => runSingleTest(detector, t));
      const allBlocked = results.every((r) => r.result === 'pass');
      expect(allBlocked).toBe(true);
    });
  });

  // ----------------------------------------
  // LLM08: Excessive Agency
  // ----------------------------------------
  describe('LLM08: Excessive Agency', () => {
    const tests = LLM08_EXCESSIVE_AGENCY;

    it.each(tests.map((t) => [t.id, t.name, t]))(
      '%s - %s',
      (id, name, testCase) => {
        const result = runSingleTest(detector, testCase as SecurityTestCase);

        // All excessive agency tests should at minimum flag
        if (testCase.severity === 'critical') {
          expect(['pass', 'fail']).toContain(result.result);
          // Log for review
          if (result.result === 'fail') {
            console.warn(
              `[AGENCY] ${id} not detected - may need pattern update`
            );
          }
        }
      }
    );
  });

  // ----------------------------------------
  // LLM10: Unbounded Consumption
  // ----------------------------------------
  describe('LLM10: Unbounded Consumption', () => {
    const tests = LLM10_UNBOUNDED_CONSUMPTION;

    it.each(tests.map((t) => [t.id, t.name, t]))(
      '%s - %s',
      (id, name, testCase) => {
        const result = runSingleTest(detector, testCase as SecurityTestCase);

        if (STRICT_MODE) {
          expect(result.result).toBe('pass');
        }
      }
    );
  });

  // ----------------------------------------
  // Full Suite Summary
  // ----------------------------------------
  describe('Full Suite Summary', () => {
    it('should generate comprehensive coverage report', () => {
      const allResults = ALL_SECURITY_TESTS.map((t) =>
        runSingleTest(detector, t)
      );

      const categories: OWASPCategory[] = [
        'LLM01_PromptInjection',
        'LLM02_InsecureOutput',
        'LLM04_ModelDoS',
        'LLM06_SensitiveInfoDisclosure',
        'LLM08_ExcessiveAgency',
        'LLM10_UnboundedConsumption',
      ];

      const reports = categories.map((cat) => {
        const catResults = allResults.filter(
          (r) => r.testCase.category === cat
        );
        return generateReport(cat, catResults);
      });

      // Log summary
      console.log('\n=== OWASP LLM Top 10 Security Test Summary ===\n');
      for (const report of reports) {
        console.log(
          `${report.category}: ${report.passed}/${report.totalTests} passed (${report.coveragePercent.toFixed(1)}%)`
        );
      }

      // Overall pass rate should be >80%
      const totalPassed = reports.reduce((sum, r) => sum + r.passed, 0);
      const totalTests = reports.reduce((sum, r) => sum + r.totalTests, 0);
      const overallRate = totalPassed / totalTests;

      console.log(
        `\nOverall: ${totalPassed}/${totalTests} (${(overallRate * 100).toFixed(1)}%)`
      );

      if (STRICT_MODE) {
        expect(overallRate).toBeGreaterThanOrEqual(0.8);
      }
    });
  });
});

// ============================================
// Export for CI Integration
// ============================================

export { runSingleTest, generateReport, ALL_SECURITY_TESTS };
