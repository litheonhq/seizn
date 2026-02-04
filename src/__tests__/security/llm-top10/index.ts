/**
 * OWASP LLM Top 10 Security Test Suite
 *
 * Comprehensive security testing for AI/LLM applications based on
 * OWASP Top 10 for Large Language Model Applications (2025)
 *
 * Categories Covered:
 * - LLM01: Prompt Injection
 * - LLM02: Insecure Output Handling
 * - LLM03: Training Data Poisoning (limited testability)
 * - LLM04: Model Denial of Service
 * - LLM05: Supply Chain Vulnerabilities (CI-focused)
 * - LLM06: Sensitive Information Disclosure
 * - LLM07: Insecure Plugin Design (via tool tests)
 * - LLM08: Excessive Agency
 * - LLM09: Overreliance (limited testability)
 * - LLM10: Unbounded Consumption
 *
 * @see https://owasp.org/www-project-top-10-for-large-language-model-applications/
 */

export * from './types';
export * from './payloads';
export {
  runSingleTest,
  generateReport,
  ALL_SECURITY_TESTS,
} from './runner';

// Re-export payload collections for targeted testing
export {
  LLM01_PROMPT_INJECTION,
  LLM02_INSECURE_OUTPUT,
  LLM04_MODEL_DOS,
  LLM06_SENSITIVE_DISCLOSURE,
  LLM08_EXCESSIVE_AGENCY,
  LLM10_UNBOUNDED_CONSUMPTION,
  getTestsByCategory,
  getTestsBySeverity,
  getTestsByTag,
} from './payloads';
