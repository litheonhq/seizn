/**
 * Answer Verifier
 *
 * Verifies that an answer is grounded in evidence.
 * Calculates grounding, faithfulness, and coverage scores.
 */

import {
  Claim,
  ClaimVerification,
  Contradiction,
  EvidenceChunk,
  EvidenceMapping,
  VerificationResult,
} from './types';
import { extractClaims, getClaimStats } from './claim-extractor';
import { mapClaimsToEvidence, aggregateEvidenceMappings } from './evidence-mapper';

/**
 * Options for answer verification
 */
export interface VerificationOptions {
  /** Model to use for extraction/mapping */
  model?: 'haiku' | 'sonnet';
  /** Minimum claim confidence threshold */
  minClaimConfidence?: number;
  /** Minimum evidence relevance threshold */
  minEvidenceRelevance?: number;
  /** Maximum claims to extract */
  maxClaims?: number;
}

/**
 * Verify an answer against evidence chunks
 */
export async function verifyAnswer(
  answer: string,
  evidenceChunks: EvidenceChunk[],
  query: string,
  options: VerificationOptions = {}
): Promise<VerificationResult> {
  const startTime = Date.now();

  const {
    model = 'haiku',
    minClaimConfidence = 0.6,
    minEvidenceRelevance = 0.3,
    maxClaims = 30,
  } = options;

  // Step 1: Extract claims from the answer
  const claims = await extractClaims(answer, {
    model,
    minConfidence: minClaimConfidence,
    maxClaims,
  });

  // Handle edge case: no claims extracted
  if (claims.length === 0) {
    return {
      isGrounded: false,
      groundingScore: 0,
      faithfulnessScore: 0,
      coverageScore: 0,
      claims: [],
      unsupportedClaims: [],
      contradictions: [],
      metadata: {
        totalClaims: 0,
        supportedClaims: 0,
        evidenceChunksUsed: evidenceChunks.length,
        processingTimeMs: Date.now() - startTime,
        modelUsed: model,
      },
    };
  }

  // Step 2: Map claims to evidence
  const evidenceMappings = await mapClaimsToEvidence(claims, evidenceChunks, {
    model,
    minRelevance: minEvidenceRelevance,
  });

  // Step 3: Build claim verifications
  const claimVerifications: ClaimVerification[] = [];
  const unsupportedClaims: Claim[] = [];
  const contradictions: Contradiction[] = [];

  for (const claim of claims) {
    const mapping = evidenceMappings.find((m) => m.claimId === claim.id);

    if (!mapping) {
      // No mapping found - unsupported
      unsupportedClaims.push(claim);
      claimVerifications.push({
        claimId: claim.id,
        claim: claim.text,
        supported: false,
        evidenceRefs: [],
        confidence: 0,
        supportStrength: 'none',
        notes: 'No evidence mapping found',
      });
      continue;
    }

    const verification: ClaimVerification = {
      claimId: claim.id,
      claim: claim.text,
      supported: mapping.supported,
      evidenceRefs: mapping.evidenceRefs,
      confidence: calculateVerificationConfidence(claim, mapping),
      supportStrength: mapping.supportStrength,
      notes: mapping.explanation,
    };

    claimVerifications.push(verification);

    // Track unsupported claims
    if (!mapping.supported && mapping.supportStrength !== 'contradicted') {
      unsupportedClaims.push(claim);
    }

    // Identify contradictions
    if (mapping.supportStrength === 'contradicted') {
      const contradictingRefs = mapping.evidenceRefs.filter(
        (r) => r.supportType === 'contradicts'
      );
      for (const ref of contradictingRefs) {
        contradictions.push({
          claim,
          evidence: ref,
          explanation: `Evidence contradicts claim: "${claim.text}"`,
          severity: ref.relevance,
        });
      }
    }
  }

  // Step 4: Calculate scores
  const scores = calculateScores(claims, claimVerifications, evidenceMappings, answer);

  // Step 5: Determine if grounded
  const isGrounded =
    scores.groundingScore >= 0.7 &&
    scores.faithfulnessScore >= 0.7 &&
    contradictions.length === 0;

  const processingTimeMs = Date.now() - startTime;

  return {
    isGrounded,
    groundingScore: scores.groundingScore,
    faithfulnessScore: scores.faithfulnessScore,
    coverageScore: scores.coverageScore,
    claims: claimVerifications,
    unsupportedClaims,
    contradictions,
    metadata: {
      totalClaims: claims.length,
      supportedClaims: claimVerifications.filter((c) => c.supported).length,
      evidenceChunksUsed: evidenceChunks.length,
      processingTimeMs,
      modelUsed: model,
    },
  };
}

/**
 * Calculate verification confidence for a claim
 */
function calculateVerificationConfidence(
  claim: Claim,
  mapping: EvidenceMapping
): number {
  if (!mapping.supported) {
    return 0;
  }

  // Base confidence from claim extraction
  let confidence = claim.confidence * 0.3;

  // Add confidence from evidence support
  if (mapping.supportStrength === 'strong') {
    confidence += 0.7;
  } else if (mapping.supportStrength === 'weak') {
    confidence += 0.4;
  }

  // Boost from multiple evidence sources
  const supportingRefs = mapping.evidenceRefs.filter(
    (r) => r.supportType === 'supports'
  );
  if (supportingRefs.length > 1) {
    confidence = Math.min(1, confidence + 0.1 * (supportingRefs.length - 1));
  }

  return Math.min(1, Math.max(0, confidence));
}

/**
 * Calculate grounding, faithfulness, and coverage scores
 */
function calculateScores(
  claims: Claim[],
  verifications: ClaimVerification[],
  mappings: EvidenceMapping[],
  answer: string
): {
  groundingScore: number;
  faithfulnessScore: number;
  coverageScore: number;
} {
  if (claims.length === 0) {
    return {
      groundingScore: 0,
      faithfulnessScore: 0,
      coverageScore: 0,
    };
  }

  // Grounding Score: What proportion of claims are supported by evidence?
  const supportedCount = verifications.filter((v) => v.supported).length;
  const groundingScore = supportedCount / claims.length;

  // Faithfulness Score: How faithful is the answer to the evidence?
  // Penalize contradictions and unsupported claims
  const contradictionPenalty = mappings.filter(
    (m) => m.supportStrength === 'contradicted'
  ).length;
  const faithfulnessBase = supportedCount / claims.length;
  const faithfulnessScore = Math.max(
    0,
    faithfulnessBase - contradictionPenalty * 0.2
  );

  // Coverage Score: How much of the answer text is covered by verified claims?
  const totalAnswerLength = answer.length;
  let coveredLength = 0;

  for (const claim of claims) {
    const verification = verifications.find((v) => v.claimId === claim.id);
    if (verification?.supported) {
      // Add the claim's position length to covered
      const claimLength = claim.position.end - claim.position.start;
      coveredLength += claimLength;
    }
  }

  // Normalize coverage (claims might overlap, so cap at 1)
  const coverageScore = Math.min(1, coveredLength / Math.max(1, totalAnswerLength));

  return {
    groundingScore: Math.round(groundingScore * 1000) / 1000,
    faithfulnessScore: Math.round(faithfulnessScore * 1000) / 1000,
    coverageScore: Math.round(coverageScore * 1000) / 1000,
  };
}

/**
 * Quick verification using simpler heuristics (for estimation)
 */
export function quickVerify(
  answer: string,
  evidenceChunks: EvidenceChunk[]
): {
  estimatedGrounding: number;
  hasEvidence: boolean;
  evidenceCount: number;
} {
  if (evidenceChunks.length === 0) {
    return {
      estimatedGrounding: 0,
      hasEvidence: false,
      evidenceCount: 0,
    };
  }

  // Calculate average relevance of evidence
  const avgScore =
    evidenceChunks.reduce((sum, chunk) => sum + chunk.score, 0) /
    evidenceChunks.length;

  // Check for keyword overlap between answer and evidence
  const answerWords = new Set(
    answer.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );
  const evidenceWords = new Set(
    evidenceChunks
      .map((c) => c.text.toLowerCase().split(/\s+/).filter((w) => w.length > 3))
      .flat()
  );

  const overlap = [...answerWords].filter((w) => evidenceWords.has(w)).length;
  const overlapRatio = overlap / Math.max(1, answerWords.size);

  // Estimate grounding based on evidence quality and overlap
  const estimatedGrounding = (avgScore * 0.6 + overlapRatio * 0.4);

  return {
    estimatedGrounding: Math.round(estimatedGrounding * 100) / 100,
    hasEvidence: evidenceChunks.length > 0 && avgScore > 0.3,
    evidenceCount: evidenceChunks.length,
  };
}

/**
 * Generate a summary of verification results
 */
export function summarizeVerification(result: VerificationResult): string {
  const {
    isGrounded,
    groundingScore,
    faithfulnessScore,
    coverageScore,
    unsupportedClaims,
    contradictions,
    metadata,
  } = result;

  const lines: string[] = [];

  // Overall verdict
  if (isGrounded) {
    lines.push('The answer is well-grounded in the provided evidence.');
  } else if (groundingScore >= 0.5) {
    lines.push('The answer is partially grounded in evidence.');
  } else {
    lines.push('The answer is not sufficiently grounded in evidence.');
  }

  // Score summary
  lines.push(
    `Scores: Grounding=${(groundingScore * 100).toFixed(0)}%, ` +
      `Faithfulness=${(faithfulnessScore * 100).toFixed(0)}%, ` +
      `Coverage=${(coverageScore * 100).toFixed(0)}%`
  );

  // Claim summary
  lines.push(
    `Claims: ${metadata.supportedClaims}/${metadata.totalClaims} supported`
  );

  // Issues
  if (unsupportedClaims.length > 0) {
    lines.push(`Unsupported claims: ${unsupportedClaims.length}`);
  }
  if (contradictions.length > 0) {
    lines.push(`Contradictions detected: ${contradictions.length}`);
  }

  return lines.join('\n');
}

/**
 * Get detailed verification report
 */
export function getVerificationReport(result: VerificationResult): {
  summary: string;
  issues: string[];
  recommendations: string[];
} {
  const summary = summarizeVerification(result);
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Identify issues
  if (result.groundingScore < 0.7) {
    issues.push(
      `Low grounding score (${(result.groundingScore * 100).toFixed(0)}%)`
    );
    recommendations.push('Consider adding more relevant evidence to the knowledge base');
  }

  if (result.faithfulnessScore < 0.7) {
    issues.push(
      `Low faithfulness score (${(result.faithfulnessScore * 100).toFixed(0)}%)`
    );
    recommendations.push('Review the answer generation to stay closer to source material');
  }

  if (result.unsupportedClaims.length > 0) {
    issues.push(
      `${result.unsupportedClaims.length} unsupported claim(s) detected`
    );
    for (const claim of result.unsupportedClaims.slice(0, 3)) {
      issues.push(`  - "${claim.text.substring(0, 50)}..."`);
    }
    recommendations.push('Consider qualifying unsupported claims or removing them');
  }

  if (result.contradictions.length > 0) {
    issues.push(`${result.contradictions.length} contradiction(s) found`);
    for (const contradiction of result.contradictions) {
      issues.push(
        `  - Claim "${contradiction.claim.text.substring(0, 40)}..." contradicted`
      );
    }
    recommendations.push('Review and correct contradictory statements');
  }

  return { summary, issues, recommendations };
}
