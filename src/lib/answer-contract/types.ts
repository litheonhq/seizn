/**
 * Answer Contract Types
 *
 * Type definitions for the Answer Contract feature - ensuring every generated
 * answer is grounded in retrieved evidence.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Types of claims that can be extracted from an answer
 */
export type ClaimType =
  | 'factual'       // Objective facts
  | 'opinion'       // Subjective opinions
  | 'comparison'    // Comparing two or more things
  | 'temporal'      // Time-related claims
  | 'quantitative'; // Number/measurement claims

/**
 * How strongly a claim is supported by evidence
 */
export type SupportStrength =
  | 'strong'        // Multiple pieces of direct evidence
  | 'weak'          // Indirect or partial evidence
  | 'none'          // No supporting evidence found
  | 'contradicted'; // Evidence contradicts the claim

/**
 * Final verdict for the answer contract evaluation
 */
export type ContractVerdict =
  | 'pass'          // Fully grounded in evidence
  | 'partial'       // Some grounding, some unsupported
  | 'fail'          // Not sufficiently grounded
  | 'abstain';      // Insufficient evidence to answer

/**
 * Action to take when verification fails
 */
export type FailAction =
  | 'abstain'       // Return uncertainty message
  | 'warn'          // Prefix answer with warning
  | 'pass';         // Allow through regardless

// ============================================================================
// Claim Types
// ============================================================================

/**
 * A single atomic claim extracted from an answer
 */
export interface Claim {
  /** Unique identifier for the claim */
  id: string;
  /** The claim text itself */
  text: string;
  /** Type of claim */
  type: ClaimType;
  /** Confidence in the extraction (0-1) */
  confidence: number;
  /** Position in the original answer text */
  position: {
    start: number;
    end: number;
  };
  /** Optional: normalized form of the claim for matching */
  normalized?: string;
}

/**
 * Result of verifying a single claim
 */
export interface ClaimVerification {
  /** Reference to the claim */
  claimId: string;
  /** The claim text */
  claim: string;
  /** Whether the claim is supported */
  supported: boolean;
  /** References to supporting evidence */
  evidenceRefs: EvidenceRef[];
  /** Overall confidence in this verification */
  confidence: number;
  /** Strength of support */
  supportStrength: SupportStrength;
  /** Notes about the verification */
  notes?: string;
}

// ============================================================================
// Evidence Types
// ============================================================================

/**
 * A chunk of evidence retrieved from the knowledge base
 */
export interface EvidenceChunk {
  /** Unique identifier for the chunk */
  chunkId: string;
  /** The text content of the chunk */
  text: string;
  /** Similarity/relevance score (0-1) */
  score: number;
  /** Source document information */
  source?: {
    documentId?: string;
    documentTitle?: string;
    pageNumber?: number;
    section?: string;
  };
  /** Original metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Reference to evidence supporting/contradicting a claim
 */
export interface EvidenceRef {
  /** Reference to the chunk */
  chunkId: string;
  /** Relevant excerpt from the chunk */
  excerpt: string;
  /** Relevance score for this specific claim (0-1) */
  relevance: number;
  /** Type of support */
  supportType: 'supports' | 'contradicts' | 'neutral';
  /** Highlighted portions that match */
  highlights?: string[];
}

/**
 * Mapping of a claim to its supporting evidence
 */
export interface EvidenceMapping {
  /** Reference to the claim */
  claimId: string;
  /** All evidence references */
  evidenceRefs: EvidenceRef[];
  /** Is the claim supported? */
  supported: boolean;
  /** Strength of support */
  supportStrength: SupportStrength;
  /** Explanation of the mapping */
  explanation?: string;
}

// ============================================================================
// Verification Types
// ============================================================================

/**
 * A detected contradiction between claim and evidence
 */
export interface Contradiction {
  /** The claim that contradicts evidence */
  claim: Claim;
  /** The contradicting evidence */
  evidence: EvidenceRef;
  /** Explanation of the contradiction */
  explanation: string;
  /** Severity of the contradiction (0-1) */
  severity: number;
}

/**
 * Complete verification result for an answer
 */
export interface VerificationResult {
  /** Is the answer grounded in evidence? */
  isGrounded: boolean;
  /** Overall grounding score (0-1) */
  groundingScore: number;
  /** Faithfulness to evidence score (0-1) */
  faithfulnessScore: number;
  /** Coverage of answer by evidence (0-1) */
  coverageScore: number;
  /** All claims with their verification */
  claims: ClaimVerification[];
  /** Claims without supporting evidence */
  unsupportedClaims: Claim[];
  /** Detected contradictions */
  contradictions: Contradiction[];
  /** Processing metadata */
  metadata: {
    totalClaims: number;
    supportedClaims: number;
    evidenceChunksUsed: number;
    processingTimeMs: number;
    modelUsed?: string;
  };
}

// ============================================================================
// Policy Types
// ============================================================================

/**
 * Configuration for answer contract policy
 */
export interface ContractPolicy {
  /** Unique identifier */
  id: string;
  /** User who owns this policy */
  userId: string;
  /** Optional: specific collection this applies to */
  collectionId?: string;
  /** Policy name */
  name: string;
  /** Policy description */
  description?: string;

  // Thresholds
  /** Minimum grounding score to pass (0-1) */
  minGroundingScore: number;
  /** Minimum faithfulness score to pass (0-1) */
  minFaithfulnessScore: number;
  /** Minimum coverage score to pass (0-1) */
  minCoverageScore: number;
  /** Minimum number of evidence chunks required */
  minEvidenceChunks: number;
  /** Maximum allowed unsupported claims */
  maxUnsupportedClaims: number;

  // Behavior
  /** Action to take on failure */
  onFailAction: FailAction;
  /** Message to return when abstaining */
  abstainMessage: string;
  /** Prefix for warnings */
  warnPrefix: string;

  // Advanced settings
  /** Minimum confidence for claim extraction */
  claimConfidenceThreshold: number;
  /** Minimum relevance for evidence mapping */
  evidenceRelevanceThreshold: number;

  /** Is this policy active? */
  isActive: boolean;
  /** Is this the default policy for the user? */
  isDefault: boolean;
  /** Priority (higher = more important) */
  priority: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Default policy values
 */
export const DEFAULT_POLICY: Omit<ContractPolicy, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
  name: 'Default Policy',
  description: 'Standard answer verification policy',
  minGroundingScore: 0.7,
  minFaithfulnessScore: 0.8,
  minCoverageScore: 0.5,
  minEvidenceChunks: 1,
  maxUnsupportedClaims: 0,
  onFailAction: 'abstain',
  abstainMessage: 'I cannot answer this question with confidence based on the available information.',
  warnPrefix: '[Low Confidence] ',
  claimConfidenceThreshold: 0.6,
  evidenceRelevanceThreshold: 0.5,
  isActive: true,
  isDefault: true,
  priority: 0,
};

// ============================================================================
// Contract Types
// ============================================================================

/**
 * Complete answer contract record
 */
export interface AnswerContract {
  /** Unique identifier */
  id: string;
  /** User who owns this contract */
  userId: string;
  /** Optional trace ID for linking */
  traceId?: string;

  // Input
  /** The original query */
  queryText: string;
  /** The generated answer */
  answerText: string;
  /** Evidence chunks used */
  evidenceChunks: EvidenceChunk[];

  // Verification results
  /** Is the answer grounded? */
  isGrounded: boolean;
  /** Grounding score (0-1) */
  groundingScore: number;
  /** Faithfulness score (0-1) */
  faithfulnessScore: number;
  /** Coverage score (0-1) */
  coverageScore: number;

  // Claims analysis
  /** All claim verifications */
  claims: ClaimVerification[];
  /** Unsupported claims */
  unsupportedClaims: Claim[];
  /** Detected contradictions */
  contradictions: Contradiction[];

  // Verdict
  /** Final verdict */
  verdict: ContractVerdict;
  /** Reason for abstaining (if applicable) */
  abstainReason?: string;

  // Metadata
  /** Policy used for evaluation */
  policyId?: string;
  /** Processing time in milliseconds */
  processingTimeMs?: number;
  /** Model used for analysis */
  modelUsed?: string;

  createdAt: Date;
}

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Request to verify an answer
 */
export interface VerifyAnswerRequest {
  /** The original query */
  query: string;
  /** The generated answer to verify */
  answer: string;
  /** Evidence chunks from retrieval */
  evidenceChunks: EvidenceChunk[];
  /** Optional: specific policy to use */
  policyId?: string;
  /** Optional: trace ID for linking */
  traceId?: string;
  /** Optional: collection context */
  collectionId?: string;
}

/**
 * Response from answer verification
 */
export interface VerifyAnswerResponse {
  /** Verification result */
  result: VerificationResult;
  /** Final verdict */
  verdict: ContractVerdict;
  /** Adjusted answer (if needed) */
  adjustedAnswer?: string;
  /** Contract record ID */
  contractId: string;
  /** Policy that was applied */
  policyApplied: {
    id: string;
    name: string;
  };
}

/**
 * Request to create/update a policy
 */
export interface PolicyRequest {
  name: string;
  description?: string;
  collectionId?: string;
  minGroundingScore?: number;
  minFaithfulnessScore?: number;
  minCoverageScore?: number;
  minEvidenceChunks?: number;
  maxUnsupportedClaims?: number;
  onFailAction?: FailAction;
  abstainMessage?: string;
  warnPrefix?: string;
  claimConfidenceThreshold?: number;
  evidenceRelevanceThreshold?: number;
  isActive?: boolean;
  isDefault?: boolean;
  priority?: number;
}

/**
 * Contract history query parameters
 */
export interface ContractHistoryQuery {
  /** Filter by verdict */
  verdict?: ContractVerdict;
  /** Filter by date range start */
  startDate?: Date;
  /** Filter by date range end */
  endDate?: Date;
  /** Minimum grounding score filter */
  minGroundingScore?: number;
  /** Maximum grounding score filter */
  maxGroundingScore?: number;
  /** Page number */
  page?: number;
  /** Items per page */
  perPage?: number;
  /** Sort field */
  sortBy?: 'createdAt' | 'groundingScore' | 'faithfulnessScore';
  /** Sort direction */
  sortDir?: 'asc' | 'desc';
}

/**
 * Contract statistics
 */
export interface ContractStats {
  totalEvaluations: number;
  passCount: number;
  partialCount: number;
  failCount: number;
  abstainCount: number;
  avgGroundingScore: number;
  avgFaithfulnessScore: number;
  avgCoverageScore: number;
  passRate: number;
  avgProcessingTimeMs: number;
}
