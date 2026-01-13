/**
 * Contract Enforcer
 *
 * Enforces answer contract policies and determines verdicts.
 * Handles abstaining, warning, or passing based on policy configuration.
 */

import { createServerClient } from '../supabase';
import {
  AnswerContract,
  ContractPolicy,
  ContractVerdict,
  DEFAULT_POLICY,
  EvidenceChunk,
  VerificationResult,
  VerifyAnswerRequest,
  VerifyAnswerResponse,
} from './types';
import { verifyAnswer, VerificationOptions } from './verifier';

/**
 * Enforcer options
 */
export interface EnforcerOptions {
  /** Verification options to pass through */
  verificationOptions?: VerificationOptions;
  /** Whether to save the contract to database */
  saveToDb?: boolean;
}

/**
 * Enforce answer contract and return result
 */
export async function enforceContract(
  request: VerifyAnswerRequest,
  userId: string,
  options: EnforcerOptions = {}
): Promise<VerifyAnswerResponse> {
  const { verificationOptions = {}, saveToDb = true } = options;

  // Get applicable policy
  const policy = await getApplicablePolicy(userId, request.policyId, request.collectionId);

  // Verify the answer
  const verificationResult = await verifyAnswer(
    request.answer,
    request.evidenceChunks,
    request.query,
    {
      ...verificationOptions,
      minClaimConfidence: policy.claimConfidenceThreshold,
      minEvidenceRelevance: policy.evidenceRelevanceThreshold,
    }
  );

  // Evaluate verdict based on policy
  const verdict = evaluateVerdict(verificationResult, policy);

  // Determine adjusted answer based on verdict
  const adjustedAnswer = getAdjustedAnswer(
    request.answer,
    verdict,
    policy,
    verificationResult
  );

  // Save contract to database if requested
  let contractId = '';
  if (saveToDb) {
    contractId = await saveContract(
      userId,
      request,
      verificationResult,
      verdict,
      policy.id,
      adjustedAnswer
    );
  } else {
    contractId = `tmp_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
  }

  return {
    result: verificationResult,
    verdict,
    adjustedAnswer: verdict !== 'pass' ? adjustedAnswer : undefined,
    contractId,
    policyApplied: {
      id: policy.id,
      name: policy.name,
    },
  };
}

/**
 * Get the applicable policy for user/collection
 */
async function getApplicablePolicy(
  userId: string,
  policyId?: string,
  collectionId?: string
): Promise<ContractPolicy> {
  const supabase = createServerClient();

  // If specific policy requested, fetch it
  if (policyId) {
    const { data: policy, error } = await supabase
      .from('contract_policies')
      .select('*')
      .eq('id', policyId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (!error && policy) {
      return transformDbPolicy(policy);
    }
  }

  // Try collection-specific policy
  if (collectionId) {
    const { data: policy } = await supabase
      .from('contract_policies')
      .select('*')
      .eq('user_id', userId)
      .eq('collection_id', collectionId)
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .limit(1)
      .single();

    if (policy) {
      return transformDbPolicy(policy);
    }
  }

  // Try default policy
  const { data: defaultPolicy } = await supabase
    .from('contract_policies')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('is_default', true)
    .limit(1)
    .single();

  if (defaultPolicy) {
    return transformDbPolicy(defaultPolicy);
  }

  // Try any active policy
  const { data: anyPolicy } = await supabase
    .from('contract_policies')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(1)
    .single();

  if (anyPolicy) {
    return transformDbPolicy(anyPolicy);
  }

  // Return synthetic default policy
  return {
    id: 'default',
    userId,
    ...DEFAULT_POLICY,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Transform database policy to ContractPolicy type
 */
function transformDbPolicy(dbPolicy: Record<string, unknown>): ContractPolicy {
  return {
    id: dbPolicy.id as string,
    userId: dbPolicy.user_id as string,
    collectionId: dbPolicy.collection_id as string | undefined,
    name: dbPolicy.name as string,
    description: dbPolicy.description as string | undefined,
    minGroundingScore: (dbPolicy.min_grounding_score as number) || DEFAULT_POLICY.minGroundingScore,
    minFaithfulnessScore: (dbPolicy.min_faithfulness_score as number) || DEFAULT_POLICY.minFaithfulnessScore,
    minCoverageScore: (dbPolicy.min_coverage_score as number) || DEFAULT_POLICY.minCoverageScore,
    minEvidenceChunks: (dbPolicy.min_evidence_chunks as number) || DEFAULT_POLICY.minEvidenceChunks,
    maxUnsupportedClaims: (dbPolicy.max_unsupported_claims as number) || DEFAULT_POLICY.maxUnsupportedClaims,
    onFailAction: (dbPolicy.on_fail_action as 'abstain' | 'warn' | 'pass') || DEFAULT_POLICY.onFailAction,
    abstainMessage: (dbPolicy.abstain_message as string) || DEFAULT_POLICY.abstainMessage,
    warnPrefix: (dbPolicy.warn_prefix as string) || DEFAULT_POLICY.warnPrefix,
    claimConfidenceThreshold: (dbPolicy.claim_confidence_threshold as number) || DEFAULT_POLICY.claimConfidenceThreshold,
    evidenceRelevanceThreshold: (dbPolicy.evidence_relevance_threshold as number) || DEFAULT_POLICY.evidenceRelevanceThreshold,
    isActive: dbPolicy.is_active as boolean,
    isDefault: dbPolicy.is_default as boolean,
    priority: (dbPolicy.priority as number) || 0,
    createdAt: new Date(dbPolicy.created_at as string),
    updatedAt: new Date(dbPolicy.updated_at as string),
  };
}

/**
 * Evaluate verdict based on verification result and policy
 */
export function evaluateVerdict(
  result: VerificationResult,
  policy: ContractPolicy
): ContractVerdict {
  const {
    groundingScore,
    faithfulnessScore,
    coverageScore,
    unsupportedClaims,
    contradictions,
    metadata,
  } = result;

  // Check for insufficient evidence
  if (metadata.evidenceChunksUsed < policy.minEvidenceChunks) {
    return 'abstain';
  }

  // Check for contradictions (always fail if present)
  if (contradictions.length > 0) {
    return 'fail';
  }

  // Check unsupported claims limit
  if (unsupportedClaims.length > policy.maxUnsupportedClaims) {
    return 'fail';
  }

  // Check all score thresholds
  if (
    groundingScore >= policy.minGroundingScore &&
    faithfulnessScore >= policy.minFaithfulnessScore &&
    coverageScore >= policy.minCoverageScore
  ) {
    return 'pass';
  }

  // Check for partial pass (70% of thresholds)
  if (
    groundingScore >= policy.minGroundingScore * 0.7 ||
    faithfulnessScore >= policy.minFaithfulnessScore * 0.7
  ) {
    return 'partial';
  }

  return 'fail';
}

/**
 * Get adjusted answer based on verdict and policy
 */
function getAdjustedAnswer(
  originalAnswer: string,
  verdict: ContractVerdict,
  policy: ContractPolicy,
  result: VerificationResult
): string {
  switch (verdict) {
    case 'pass':
      return originalAnswer;

    case 'partial':
      if (policy.onFailAction === 'warn') {
        return `${policy.warnPrefix}${originalAnswer}`;
      } else if (policy.onFailAction === 'abstain') {
        return buildPartialAbstainMessage(policy, result);
      }
      return originalAnswer;

    case 'fail':
      if (policy.onFailAction === 'abstain') {
        return policy.abstainMessage;
      } else if (policy.onFailAction === 'warn') {
        return `${policy.warnPrefix}${originalAnswer}\n\n[Note: This answer may contain unsupported claims.]`;
      }
      return originalAnswer;

    case 'abstain':
      return buildAbstainMessage(policy, result);

    default:
      return originalAnswer;
  }
}

/**
 * Build abstain message with context
 */
function buildAbstainMessage(
  policy: ContractPolicy,
  result: VerificationResult
): string {
  const reasons: string[] = [];

  if (result.metadata.evidenceChunksUsed < policy.minEvidenceChunks) {
    reasons.push('insufficient evidence');
  }
  if (result.groundingScore < policy.minGroundingScore) {
    reasons.push('low grounding confidence');
  }
  if (result.contradictions.length > 0) {
    reasons.push('contradictory evidence found');
  }

  if (reasons.length > 0) {
    return `${policy.abstainMessage}\n\nReason: ${reasons.join(', ')}.`;
  }

  return policy.abstainMessage;
}

/**
 * Build partial abstain message
 */
function buildPartialAbstainMessage(
  policy: ContractPolicy,
  result: VerificationResult
): string {
  const supportedCount = result.claims.filter((c) => c.supported).length;
  const totalCount = result.claims.length;

  return (
    `I can partially answer based on the available information.\n\n` +
    `Note: ${supportedCount} of ${totalCount} claims are supported by evidence. ` +
    `The following aspects may not be fully verified: ` +
    result.unsupportedClaims
      .slice(0, 3)
      .map((c) => `"${c.text.substring(0, 40)}..."`)
      .join(', ')
  );
}

/**
 * Save contract to database
 */
async function saveContract(
  userId: string,
  request: VerifyAnswerRequest,
  result: VerificationResult,
  verdict: ContractVerdict,
  policyId: string,
  adjustedAnswer?: string
): Promise<string> {
  const supabase = createServerClient();

  const contract: Partial<AnswerContract> = {
    userId,
    traceId: request.traceId,
    queryText: request.query,
    answerText: request.answer,
    evidenceChunks: request.evidenceChunks,
    isGrounded: result.isGrounded,
    groundingScore: result.groundingScore,
    faithfulnessScore: result.faithfulnessScore,
    coverageScore: result.coverageScore,
    claims: result.claims,
    unsupportedClaims: result.unsupportedClaims,
    contradictions: result.contradictions,
    verdict,
    abstainReason: verdict === 'abstain' ? adjustedAnswer : undefined,
    policyId: policyId !== 'default' ? policyId : undefined,
    processingTimeMs: result.metadata.processingTimeMs,
    modelUsed: result.metadata.modelUsed,
  };

  const { data, error } = await supabase
    .from('answer_contracts')
    .insert({
      user_id: contract.userId,
      trace_id: contract.traceId,
      query_text: contract.queryText,
      answer_text: contract.answerText,
      evidence_chunks: contract.evidenceChunks,
      is_grounded: contract.isGrounded,
      grounding_score: contract.groundingScore,
      faithfulness_score: contract.faithfulnessScore,
      coverage_score: contract.coverageScore,
      claims: contract.claims,
      unsupported_claims: contract.unsupportedClaims,
      contradictions: contract.contradictions,
      verdict: contract.verdict,
      abstain_reason: contract.abstainReason,
      policy_id: contract.policyId,
      processing_time_ms: contract.processingTimeMs,
      model_used: contract.modelUsed,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to save contract:', error);
    return `err_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
  }

  return data.id;
}

/**
 * Create or update a policy
 */
export async function upsertPolicy(
  userId: string,
  policyData: Partial<ContractPolicy>,
  policyId?: string
): Promise<ContractPolicy> {
  const supabase = createServerClient();

  const dbData = {
    user_id: userId,
    collection_id: policyData.collectionId,
    name: policyData.name || 'Unnamed Policy',
    description: policyData.description,
    min_grounding_score: policyData.minGroundingScore ?? DEFAULT_POLICY.minGroundingScore,
    min_faithfulness_score: policyData.minFaithfulnessScore ?? DEFAULT_POLICY.minFaithfulnessScore,
    min_coverage_score: policyData.minCoverageScore ?? DEFAULT_POLICY.minCoverageScore,
    min_evidence_chunks: policyData.minEvidenceChunks ?? DEFAULT_POLICY.minEvidenceChunks,
    max_unsupported_claims: policyData.maxUnsupportedClaims ?? DEFAULT_POLICY.maxUnsupportedClaims,
    on_fail_action: policyData.onFailAction ?? DEFAULT_POLICY.onFailAction,
    abstain_message: policyData.abstainMessage ?? DEFAULT_POLICY.abstainMessage,
    warn_prefix: policyData.warnPrefix ?? DEFAULT_POLICY.warnPrefix,
    claim_confidence_threshold: policyData.claimConfidenceThreshold ?? DEFAULT_POLICY.claimConfidenceThreshold,
    evidence_relevance_threshold: policyData.evidenceRelevanceThreshold ?? DEFAULT_POLICY.evidenceRelevanceThreshold,
    is_active: policyData.isActive ?? true,
    is_default: policyData.isDefault ?? false,
    priority: policyData.priority ?? 0,
  };

  let result;

  if (policyId) {
    // Update existing
    const { data, error } = await supabase
      .from('contract_policies')
      .update(dbData)
      .eq('id', policyId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update policy: ${error.message}`);
    result = data;
  } else {
    // Create new
    const { data, error } = await supabase
      .from('contract_policies')
      .insert(dbData)
      .select()
      .single();

    if (error) throw new Error(`Failed to create policy: ${error.message}`);
    result = data;
  }

  return transformDbPolicy(result);
}

/**
 * Get user's policies
 */
export async function getUserPolicies(userId: string): Promise<ContractPolicy[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('contract_policies')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch policies: ${error.message}`);
  }

  return (data || []).map(transformDbPolicy);
}

/**
 * Delete a policy
 */
export async function deletePolicy(userId: string, policyId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('contract_policies')
    .delete()
    .eq('id', policyId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete policy: ${error.message}`);
  }
}

/**
 * Get contract history for user
 */
export async function getContractHistory(
  userId: string,
  options: {
    verdict?: ContractVerdict;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    perPage?: number;
  } = {}
): Promise<{ contracts: AnswerContract[]; total: number }> {
  const supabase = createServerClient();
  const { verdict, startDate, endDate, page = 1, perPage = 20 } = options;

  let query = supabase
    .from('answer_contracts')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (verdict) {
    query = query.eq('verdict', verdict);
  }
  if (startDate) {
    query = query.gte('created_at', startDate.toISOString());
  }
  if (endDate) {
    query = query.lte('created_at', endDate.toISOString());
  }

  // Pagination
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch contract history: ${error.message}`);
  }

  const contracts: AnswerContract[] = (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    traceId: row.trace_id,
    queryText: row.query_text,
    answerText: row.answer_text,
    evidenceChunks: row.evidence_chunks || [],
    isGrounded: row.is_grounded,
    groundingScore: row.grounding_score,
    faithfulnessScore: row.faithfulness_score,
    coverageScore: row.coverage_score,
    claims: row.claims || [],
    unsupportedClaims: row.unsupported_claims || [],
    contradictions: row.contradictions || [],
    verdict: row.verdict,
    abstainReason: row.abstain_reason,
    policyId: row.policy_id,
    processingTimeMs: row.processing_time_ms,
    modelUsed: row.model_used,
    createdAt: new Date(row.created_at),
  }));

  return { contracts, total: count || 0 };
}

/**
 * Get contract statistics for user
 */
export async function getContractStats(
  userId: string,
  days = 30
): Promise<{
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
}> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('get_contract_stats', {
    p_user_id: userId,
    p_days: days,
  });

  if (error) {
    throw new Error(`Failed to fetch contract stats: ${error.message}`);
  }

  return {
    totalEvaluations: data?.total_evaluations || 0,
    passCount: data?.pass_count || 0,
    partialCount: data?.partial_count || 0,
    failCount: data?.fail_count || 0,
    abstainCount: data?.abstain_count || 0,
    avgGroundingScore: data?.avg_grounding_score || 0,
    avgFaithfulnessScore: data?.avg_faithfulness_score || 0,
    avgCoverageScore: data?.avg_coverage_score || 0,
    passRate: data?.pass_rate || 0,
    avgProcessingTimeMs: data?.avg_processing_time_ms || 0,
  };
}
