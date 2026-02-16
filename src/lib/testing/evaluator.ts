import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
/**
 * Test Evaluator
 *
 * Evaluates retrieval results against test case expectations
 */

import type {
  TestCase,
  TestResult,
  EvaluationResult,
  RetrievalResult,
} from './types';
import { FAITHFULNESS_CHECK_PROMPT, fillTemplate } from './prompts';

// ============================================
// Constants
// ============================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ============================================
// Main Evaluation Function
// ============================================

/**
 * Evaluate retrieval results against a test case
 */
export function evaluateTestCase(
  testCase: TestCase,
  results: RetrievalResult[],
  answer?: string
): EvaluationResult {
  // Document ID matching
  const docIdScore = evaluateDocumentIds(
    testCase.expected_doc_ids,
    results.map((r) => r.doc_id)
  );

  // Keyword matching
  const keywordResults = evaluateKeywords(
    testCase.expected_keywords,
    testCase.expected_not_keywords,
    results,
    answer
  );

  // Calculate overall relevance score
  const avgResultScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;

  // Combine scores
  const relevanceScore = calculateRelevanceScore(
    docIdScore.score,
    keywordResults.matchScore,
    avgResultScore
  );

  // Determine pass/fail
  const passed = determinePassFail(
    testCase,
    relevanceScore,
    keywordResults,
    docIdScore
  );

  return {
    passed,
    relevance_score: relevanceScore,
    keyword_match_score: keywordResults.matchScore,
    faithfulness_score: 1.0, // Default, can be overridden with LLM check
    details: {
      matched_doc_ids: docIdScore.matched,
      missing_doc_ids: docIdScore.missing,
      matched_keywords: keywordResults.matched,
      missing_keywords: keywordResults.missing,
      forbidden_keywords_found: keywordResults.forbiddenFound,
    },
    reason: passed
      ? 'All evaluation criteria met'
      : buildFailureReason(testCase, keywordResults, docIdScore, relevanceScore),
  };
}

// ============================================
// Document ID Evaluation
// ============================================

interface DocIdEvaluation {
  score: number;
  matched: string[];
  missing: string[];
}

/**
 * Evaluate if expected document IDs are in the results
 */
function evaluateDocumentIds(
  expectedIds: string[],
  retrievedIds: string[]
): DocIdEvaluation {
  if (expectedIds.length === 0) {
    return { score: 1.0, matched: [], missing: [] };
  }

  const matched: string[] = [];
  const missing: string[] = [];

  for (const expectedId of expectedIds) {
    if (retrievedIds.includes(expectedId)) {
      matched.push(expectedId);
    } else {
      missing.push(expectedId);
    }
  }

  const score = matched.length / expectedIds.length;

  return { score, matched, missing };
}

// ============================================
// Keyword Evaluation
// ============================================

interface KeywordEvaluation {
  matchScore: number;
  matched: string[];
  missing: string[];
  forbiddenFound: string[];
}

/**
 * Evaluate keyword presence in results and answer
 */
function evaluateKeywords(
  expectedKeywords: string[],
  forbiddenKeywords: string[],
  results: RetrievalResult[],
  answer?: string
): KeywordEvaluation {
  // Combine all text for matching
  const allText = [
    ...results.map((r) => r.content.toLowerCase()),
    (answer || '').toLowerCase(),
  ].join(' ');

  const matched: string[] = [];
  const missing: string[] = [];

  // Check expected keywords
  for (const keyword of expectedKeywords) {
    const normalizedKeyword = keyword.toLowerCase().trim();
    if (allText.includes(normalizedKeyword)) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  // Check forbidden keywords
  const forbiddenFound: string[] = [];
  for (const keyword of forbiddenKeywords) {
    const normalizedKeyword = keyword.toLowerCase().trim();
    if (allText.includes(normalizedKeyword)) {
      forbiddenFound.push(keyword);
    }
  }

  // Calculate match score
  let matchScore: number;
  if (expectedKeywords.length === 0) {
    // For negative tests, score based on absence of forbidden keywords
    matchScore = forbiddenKeywords.length > 0
      ? 1 - (forbiddenFound.length / forbiddenKeywords.length)
      : 1.0;
  } else {
    matchScore = matched.length / expectedKeywords.length;
    // Penalize for forbidden keywords found
    if (forbiddenFound.length > 0) {
      matchScore *= 0.5;
    }
  }

  return { matchScore, matched, missing, forbiddenFound };
}

// ============================================
// Score Calculation
// ============================================

/**
 * Calculate combined relevance score
 */
function calculateRelevanceScore(
  docIdScore: number,
  keywordScore: number,
  avgResultScore: number
): number {
  // Weighted average
  const weights = {
    docId: 0.3,
    keyword: 0.4,
    resultScore: 0.3,
  };

  return (
    docIdScore * weights.docId +
    keywordScore * weights.keyword +
    avgResultScore * weights.resultScore
  );
}

/**
 * Determine if the test passed
 */
function determinePassFail(
  testCase: TestCase,
  relevanceScore: number,
  keywordResults: KeywordEvaluation,
  docIdScore: DocIdEvaluation
): boolean {
  switch (testCase.test_type) {
    case 'positive':
      // Positive tests pass if relevance meets threshold and no forbidden keywords
      return (
        relevanceScore >= testCase.min_score &&
        keywordResults.forbiddenFound.length === 0
      );

    case 'negative':
      // Negative tests pass if forbidden keywords are NOT found
      // and expected keywords (if any) are also not found
      return (
        keywordResults.forbiddenFound.length === 0 &&
        (testCase.expected_keywords.length === 0 ||
          keywordResults.matched.length === 0)
      );

    case 'edge_case':
      // Edge cases pass if score meets (lower) threshold
      return relevanceScore >= Math.max(testCase.min_score - 0.1, 0.5);

    default:
      return relevanceScore >= testCase.min_score;
  }
}

/**
 * Build a human-readable failure reason
 */
function buildFailureReason(
  testCase: TestCase,
  keywordResults: KeywordEvaluation,
  docIdScore: DocIdEvaluation,
  relevanceScore: number
): string {
  const reasons: string[] = [];

  if (relevanceScore < testCase.min_score) {
    reasons.push(
      `Relevance score ${relevanceScore.toFixed(2)} below threshold ${testCase.min_score}`
    );
  }

  if (keywordResults.missing.length > 0) {
    reasons.push(
      `Missing expected keywords: ${keywordResults.missing.slice(0, 3).join(', ')}${
        keywordResults.missing.length > 3 ? '...' : ''
      }`
    );
  }

  if (keywordResults.forbiddenFound.length > 0) {
    reasons.push(
      `Found forbidden keywords: ${keywordResults.forbiddenFound.join(', ')}`
    );
  }

  if (docIdScore.missing.length > 0) {
    reasons.push(
      `Missing expected documents: ${docIdScore.missing.length} of ${
        docIdScore.missing.length + docIdScore.matched.length
      }`
    );
  }

  return reasons.length > 0 ? reasons.join('; ') : 'Unknown failure reason';
}

// ============================================
// Advanced Evaluation (LLM-based)
// ============================================

/**
 * Evaluate answer faithfulness using LLM
 */
export async function evaluateFaithfulness(
  query: string,
  documents: RetrievalResult[],
  answer: string,
  model: 'haiku' | 'sonnet' = 'haiku'
): Promise<{
  faithfulness_score: number;
  hallucinations: string[];
  unsupported_claims: string[];
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const documentsText = documents
    .map((d, i) => `[Doc ${i + 1}] ${d.content.slice(0, 1000)}`)
    .join('\n\n');

  const prompt = fillTemplate(FAITHFULNESS_CHECK_PROMPT, {
    query,
    documents: documentsText,
    answer,
  });

  const modelId =
    model === 'haiku'
      ? 'claude-3-5-haiku-20241022'
      : 'claude-3-5-sonnet-20241022';

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: buildAnthropicHeaders(apiKey),
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  try {
    const result = JSON.parse(text);
    return {
      faithfulness_score: result.faithfulness_score ?? 1.0,
      hallucinations: result.hallucinations || [],
      unsupported_claims: result.unsupported_claims || [],
    };
  } catch {
    console.error('Failed to parse faithfulness check:', text);
    return {
      faithfulness_score: 0.5,
      hallucinations: [],
      unsupported_claims: [],
    };
  }
}

// ============================================
// Batch Evaluation
// ============================================

export interface BatchEvaluationResult {
  total: number;
  passed: number;
  failed: number;
  avgRelevanceScore: number;
  avgKeywordScore: number;
  results: Array<{
    caseId: string;
    result: EvaluationResult;
  }>;
}

/**
 * Evaluate multiple test cases
 */
export function evaluateBatch(
  testCases: TestCase[],
  resultsMap: Map<string, { results: RetrievalResult[]; answer?: string }>
): BatchEvaluationResult {
  const evaluations: Array<{ caseId: string; result: EvaluationResult }> = [];

  for (const testCase of testCases) {
    const data = resultsMap.get(testCase.id);
    if (!data) {
      evaluations.push({
        caseId: testCase.id,
        result: {
          passed: false,
          relevance_score: 0,
          keyword_match_score: 0,
          faithfulness_score: 0,
          details: {
            matched_doc_ids: [],
            missing_doc_ids: testCase.expected_doc_ids,
            matched_keywords: [],
            missing_keywords: testCase.expected_keywords,
            forbidden_keywords_found: [],
          },
          reason: 'No results data available',
        },
      });
      continue;
    }

    const result = evaluateTestCase(testCase, data.results, data.answer);
    evaluations.push({ caseId: testCase.id, result });
  }

  // Calculate aggregates
  const passed = evaluations.filter((e) => e.result.passed).length;
  const avgRelevanceScore =
    evaluations.reduce((sum, e) => sum + e.result.relevance_score, 0) /
    evaluations.length;
  const avgKeywordScore =
    evaluations.reduce((sum, e) => sum + e.result.keyword_match_score, 0) /
    evaluations.length;

  return {
    total: testCases.length,
    passed,
    failed: testCases.length - passed,
    avgRelevanceScore,
    avgKeywordScore,
    results: evaluations,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate similarity between two strings (simple approach)
 */
export function calculateStringSimilarity(a: string, b: string): number {
  const aTokens = new Set(a.toLowerCase().split(/\s+/));
  const bTokens = new Set(b.toLowerCase().split(/\s+/));

  const intersection = new Set([...aTokens].filter((x) => bTokens.has(x)));
  const union = new Set([...aTokens, ...bTokens]);

  return intersection.size / union.size; // Jaccard similarity
}

/**
 * Normalize score to 0-1 range
 */
export function normalizeScore(score: number, min = 0, max = 1): number {
  return Math.max(0, Math.min(1, (score - min) / (max - min)));
}
