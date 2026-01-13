/**
 * Answer Contract Library
 *
 * Ensures every generated answer is grounded in retrieved evidence.
 * If evidence is insufficient, the system acknowledges uncertainty
 * rather than hallucinating.
 */

// Types
export * from './types';

// Claim Extraction
export {
  extractClaims,
  extractClaimsSimple,
  deduplicateClaims,
  groupClaimsByType,
  getClaimStats,
  type ClaimExtractionOptions,
} from './claim-extractor';

// Evidence Mapping
export {
  mapClaimsToEvidence,
  aggregateEvidenceMappings,
  findBestEvidence,
  type EvidenceMappingOptions,
} from './evidence-mapper';

// Verification
export {
  verifyAnswer,
  quickVerify,
  summarizeVerification,
  getVerificationReport,
  type VerificationOptions,
} from './verifier';

// Enforcement
export {
  enforceContract,
  evaluateVerdict,
  upsertPolicy,
  getUserPolicies,
  deletePolicy,
  getContractHistory,
  getContractStats,
  type EnforcerOptions,
} from './enforcer';
