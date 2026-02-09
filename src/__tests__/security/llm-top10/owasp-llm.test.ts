/**
 * OWASP LLM Top 10 Security Tests
 *
 * Wraps the runner.ts test suites so vitest discovers them.
 * Run: npx vitest run src/__tests__/security/llm-top10/owasp-llm.test.ts
 */

// Re-export all describe/it blocks from runner
import './runner';
