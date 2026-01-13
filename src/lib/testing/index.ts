/**
 * Retrieval Testing Library
 *
 * Export all testing utilities for retrieval regression testing
 */

// Types
export * from './types';

// Prompts
export {
  TEST_GENERATION_SYSTEM_PROMPT,
  POSITIVE_TEST_PROMPT,
  NEGATIVE_TEST_PROMPT,
  EDGE_CASE_TEST_PROMPT,
  MULTI_DOC_TEST_PROMPT,
  FAITHFULNESS_CHECK_PROMPT,
  getPromptForTestType,
  fillTemplate,
  buildDocumentContext,
} from './prompts';

// Generator
export {
  generateTestsFromDocs,
  generateMultiDocTests,
  generateTestsFromTemplate,
  saveGeneratedTests,
  fetchDocumentsForGeneration,
  validateGeneratedTests,
  deduplicateTests,
} from './generator';

// Evaluator
export {
  evaluateTestCase,
  evaluateFaithfulness,
  evaluateBatch,
  calculateStringSimilarity,
  normalizeScore,
} from './evaluator';

// Runner
export {
  runTestSuite,
  runSingleTest,
  cancelTestRun,
  getTestRunResults,
  retryFailedTests,
  runMultipleSuites,
} from './runner';
