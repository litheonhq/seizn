/**
 * Summer Answer Module
 *
 * Answer generation with:
 * - Groundedness verification
 * - Claim extraction and mapping
 * - Citation generation
 * - Retry logic with circuit breaker
 */

// Types
export type {
  SourceReference,
  Claim,
  ClaimSource,
  GroundednessResult,
  AnswerContract,
  Citation,
  RetryConfig,
  AnswerGenerationParams,
  AnswerGenerationResult,
} from './types';

export { DEFAULT_RETRY_CONFIG, GROUNDEDNESS_THRESHOLDS } from './types';

// Groundedness
export {
  extractClaims,
  mapClaimToSources,
  verifyGroundedness,
  highlightGroundedness,
  generateGroundednessReport,
} from './groundedness';

// Retry
export {
  isRetryableError,
  calculateRetryDelay,
  withRetry,
  createRetryWrapper,
  withRetryAndTimeout,
  withRetryAndFallback,
  batchRetry,
  RetryWithCircuitBreaker,
  type RetryState,
  type RetryResult,
} from './retry';

// Claim Mapper
export {
  extractClaimsAdvanced,
  mapClaimsToSources,
  insertCitations,
  generateReferences,
  processAnswerWithCitations,
  type ClaimExtractionConfig,
  type MappingResult,
} from './claim-mapper';

// Generator
export {
  generateAnswer,
  generateAnswerStream,
  validateAnswerContract,
  formatAnswerContract,
  type LLMClient,
} from './generator';
