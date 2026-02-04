/**
 * OWASP LLM Top 10 Security Test Suite - Types
 *
 * Type definitions for comprehensive security testing against
 * OWASP Top 10 for LLM Applications (2025 edition)
 */

// ============================================
// Test Case Types
// ============================================

export type OWASPCategory =
  | 'LLM01_PromptInjection'
  | 'LLM02_InsecureOutput'
  | 'LLM03_TrainingDataPoisoning'
  | 'LLM04_ModelDoS'
  | 'LLM05_SupplyChain'
  | 'LLM06_SensitiveInfoDisclosure'
  | 'LLM07_InsecurePlugin'
  | 'LLM08_ExcessiveAgency'
  | 'LLM09_Overreliance'
  | 'LLM10_UnboundedConsumption';

export type TestSeverity = 'critical' | 'high' | 'medium' | 'low';

export type TestResult = 'pass' | 'fail' | 'skip' | 'error';

export interface SecurityTestCase {
  id: string;
  name: string;
  category: OWASPCategory;
  severity: TestSeverity;
  description: string;
  payload: string | (() => string);
  expectedBehavior: 'blocked' | 'sanitized' | 'flagged' | 'allowed';
  tags: string[];
  references?: string[];
}

export interface SecurityTestResult {
  testCase: SecurityTestCase;
  result: TestResult;
  actualBehavior: string;
  detectedThreats: string[];
  executionTimeMs: number;
  details?: string;
}

export interface TestSuiteReport {
  suiteId: string;
  category: OWASPCategory;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  coveragePercent: number;
  executionTimeMs: number;
  results: SecurityTestResult[];
  generatedAt: string;
}

// ============================================
// Guard Integration Types
// ============================================

export interface GuardTestConfig {
  enableAllPatterns: boolean;
  strictMode: boolean;
  logResults: boolean;
  throwOnCritical: boolean;
}

export interface GuardTestContext {
  userId?: string;
  orgId?: string;
  sessionId?: string;
  memory?: Record<string, unknown>;
  tools?: string[];
}
