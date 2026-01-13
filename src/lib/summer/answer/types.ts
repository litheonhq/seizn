/**
 * Answer Contract Types
 *
 * Types for answer generation with groundedness verification,
 * claim mapping, and retry logic.
 */

export interface SourceReference {
  chunkId: string;
  documentId: string;
  documentTitle?: string;
  content: string;
  score: number;
  page?: number;
  position?: number;
}

export interface Claim {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  confidence: number;
  sources: ClaimSource[];
  isGrounded: boolean;
  groundednessScore: number;
}

export interface ClaimSource {
  chunkId: string;
  documentId: string;
  relevantText: string;
  matchScore: number;
  matchType: 'exact' | 'paraphrase' | 'inference' | 'unsupported';
}

export interface GroundednessResult {
  isGrounded: boolean;
  overallScore: number;
  claims: Claim[];
  ungroundedClaims: Claim[];
  summary: {
    totalClaims: number;
    groundedClaims: number;
    partiallyGroundedClaims: number;
    ungroundedClaims: number;
  };
  warnings: string[];
}

export interface AnswerContract {
  query: string;
  answer: string;
  sources: SourceReference[];
  groundedness: GroundednessResult;
  citations: Citation[];
  metadata: {
    generatedAt: Date;
    modelId: string;
    latencyMs: number;
    tokenCount: {
      prompt: number;
      completion: number;
      total: number;
    };
    retryCount: number;
  };
}

export interface Citation {
  id: string;
  text: string;
  sourceChunkId: string;
  documentId: string;
  documentTitle?: string;
  page?: number;
  inlineMarker: string; // e.g., "[1]", "[2]"
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
  onRetry?: (attempt: number, error: Error) => void;
}

export interface AnswerGenerationParams {
  query: string;
  context: SourceReference[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  requireGroundedness?: boolean;
  minGroundednessScore?: number;
  includeCitations?: boolean;
  retryConfig?: Partial<RetryConfig>;
}

export interface AnswerGenerationResult {
  success: boolean;
  contract?: AnswerContract;
  error?: string;
  retriesUsed: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'rate_limit',
    'timeout',
    'server_error',
    'overloaded',
    'ECONNRESET',
    'ETIMEDOUT',
  ],
};

export const GROUNDEDNESS_THRESHOLDS = {
  high: 0.85,
  medium: 0.6,
  low: 0.4,
};
