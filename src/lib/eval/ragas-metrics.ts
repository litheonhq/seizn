import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
/**
 * Seizn - Ragas-Compatible Evaluation Metrics
 *
 * Implements Ragas-style metrics for RAG evaluation:
 * - Answer Relevancy: How relevant is the answer to the question
 * - Answer Correctness: How correct is the answer compared to ground truth
 * - Answer Similarity: Semantic similarity between answer and ground truth
 * - Faithfulness: Is the answer faithful to the context (LLM-judge)
 * - Context Precision: Precision of retrieved context
 * - Context Recall: Recall of retrieved context
 * - Context Relevancy: How relevant is the context to the question
 *
 * @see https://docs.ragas.io/en/latest/concepts/metrics/
 */

import { computeEmbedding, cosineSimilarity } from '@/lib/embeddings';

// ============================================
// Types
// ============================================

export interface RagasEvalInput {
  question: string;
  answer: string;
  contexts: string[];
  groundTruth?: string;
}

export interface RagasMetrics {
  answer_relevancy?: number;
  answer_correctness?: number;
  answer_similarity?: number;
  faithfulness?: number;
  context_precision?: number;
  context_recall?: number;
  context_relevancy?: number;
  context_entity_recall?: number;
}

export interface RagasEvalResult {
  metrics: RagasMetrics;
  details: {
    answer_relevancy?: AnswerRelevancyDetails;
    answer_correctness?: AnswerCorrectnessDetails;
    faithfulness?: FaithfulnessDetails;
    context_precision?: ContextPrecisionDetails;
    context_recall?: ContextRecallDetails;
    context_relevancy?: ContextRelevancyDetails;
  };
  tokens_used: number;
  model_calls: number;
}

interface AnswerRelevancyDetails {
  generated_questions: string[];
  similarity_scores: number[];
}

interface AnswerCorrectnessDetails {
  factual_correctness: number;
  semantic_similarity: number;
  explanation?: string;
}

interface FaithfulnessDetails {
  claims: string[];
  supported_claims: string[];
  score: number;
  explanation?: string;
}

interface ContextPrecisionDetails {
  relevant_sentences: number;
  total_sentences: number;
}

interface ContextRecallDetails {
  covered_statements: number;
  total_statements: number;
}

interface ContextRelevancyDetails {
  relevant_chunks: number;
  total_chunks: number;
}

// ============================================
// LLM Helper
// ============================================

async function callLLM(prompt: string, systemPrompt?: string): Promise<{ text: string; tokens: number } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: buildAnthropicHeaders(apiKey),
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      system: systemPrompt || 'You are a strict evaluator. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) return null;

  const json = await res.json();
  const text = json?.content?.[0]?.text ?? '';
  const tokens = (json?.usage?.input_tokens || 0) + (json?.usage?.output_tokens || 0);

  return { text, tokens };
}

// ============================================
// Answer Relevancy
// ============================================

/**
 * Answer Relevancy measures how relevant the answer is to the question.
 * It generates questions from the answer and compares them to the original.
 */
export async function computeAnswerRelevancy(
  question: string,
  answer: string
): Promise<{ score: number; details: AnswerRelevancyDetails; tokens: number }> {
  const prompt = `Given this answer, generate 3 questions that this answer could be responding to.

ANSWER: ${answer.slice(0, 2000)}

Return JSON:
{
  "questions": ["question1", "question2", "question3"]
}`;

  const result = await callLLM(prompt);
  if (!result) {
    return { score: 0, details: { generated_questions: [], similarity_scores: [] }, tokens: 0 };
  }

  try {
    const parsed = JSON.parse(result.text);
    const generatedQuestions = parsed.questions || [];

    // Compute embedding similarities
    const questionEmbedding = await computeEmbedding(question);
    const similarities: number[] = [];

    for (const genQ of generatedQuestions) {
      const genEmbedding = await computeEmbedding(genQ);
      const sim = cosineSimilarity(questionEmbedding, genEmbedding);
      similarities.push(sim);
    }

    const avgSimilarity = similarities.length > 0
      ? similarities.reduce((a, b) => a + b, 0) / similarities.length
      : 0;

    return {
      score: avgSimilarity,
      details: { generated_questions: generatedQuestions, similarity_scores: similarities },
      tokens: result.tokens,
    };
  } catch {
    return { score: 0, details: { generated_questions: [], similarity_scores: [] }, tokens: result.tokens };
  }
}

// ============================================
// Answer Correctness
// ============================================

/**
 * Answer Correctness compares the answer to the ground truth.
 * Combines factual correctness (LLM-judge) with semantic similarity.
 */
export async function computeAnswerCorrectness(
  question: string,
  answer: string,
  groundTruth: string
): Promise<{ score: number; details: AnswerCorrectnessDetails; tokens: number }> {
  // Compute semantic similarity
  const answerEmbedding = await computeEmbedding(answer);
  const truthEmbedding = await computeEmbedding(groundTruth);
  const semanticSimilarity = cosineSimilarity(answerEmbedding, truthEmbedding);

  // LLM-judge for factual correctness
  const prompt = `Compare the ANSWER to the GROUND_TRUTH for the given QUESTION.

QUESTION: ${question.slice(0, 500)}

ANSWER: ${answer.slice(0, 1500)}

GROUND_TRUTH: ${groundTruth.slice(0, 1500)}

Evaluate factual correctness (0-1):
- 1.0 = All facts in answer match ground truth
- 0.5 = Some facts correct, some incorrect or missing
- 0.0 = Answer is factually wrong

Return JSON:
{
  "factual_correctness": 0.0-1.0,
  "explanation": "Brief explanation"
}`;

  const result = await callLLM(prompt);
  let factualCorrectness = 0;
  let explanation: string | undefined;

  if (result) {
    try {
      const parsed = JSON.parse(result.text);
      factualCorrectness = Math.max(0, Math.min(1, Number(parsed.factual_correctness) || 0));
      explanation = parsed.explanation;
    } catch {
      // Use semantic similarity as fallback
      factualCorrectness = semanticSimilarity;
    }
  }

  // Combined score: 70% factual, 30% semantic
  const score = factualCorrectness * 0.7 + semanticSimilarity * 0.3;

  return {
    score,
    details: {
      factual_correctness: factualCorrectness,
      semantic_similarity: semanticSimilarity,
      explanation,
    },
    tokens: result?.tokens || 0,
  };
}

// ============================================
// Answer Similarity
// ============================================

/**
 * Answer Similarity computes semantic similarity between answer and ground truth.
 * Uses embedding-based cosine similarity.
 */
export async function computeAnswerSimilarity(
  answer: string,
  groundTruth: string
): Promise<{ score: number }> {
  const answerEmbedding = await computeEmbedding(answer);
  const truthEmbedding = await computeEmbedding(groundTruth);
  const score = cosineSimilarity(answerEmbedding, truthEmbedding);

  return { score };
}

// ============================================
// Faithfulness
// ============================================

/**
 * Faithfulness measures if the answer is grounded in the context.
 * Extracts claims from answer and checks if context supports them.
 */
export async function computeFaithfulness(
  answer: string,
  contexts: string[]
): Promise<{ score: number; details: FaithfulnessDetails; tokens: number }> {
  const contextText = contexts.slice(0, 10).join('\n---\n').slice(0, 8000);

  const prompt = `Analyze if the ANSWER is faithful to (supported by) the CONTEXT.

CONTEXT:
${contextText}

ANSWER:
${answer.slice(0, 2000)}

1. Extract key claims/statements from the ANSWER
2. Check if each claim is supported by the CONTEXT

Return JSON:
{
  "claims": ["claim1", "claim2", ...],
  "supported": ["claim1", "claim3", ...],
  "explanation": "Brief explanation"
}`;

  const result = await callLLM(prompt);
  if (!result) {
    return {
      score: 0,
      details: { claims: [], supported_claims: [], score: 0 },
      tokens: 0,
    };
  }

  try {
    const parsed = JSON.parse(result.text);
    const claims = parsed.claims || [];
    const supported = parsed.supported || [];
    const score = claims.length > 0 ? supported.length / claims.length : 0;

    return {
      score,
      details: {
        claims,
        supported_claims: supported,
        score,
        explanation: parsed.explanation,
      },
      tokens: result.tokens,
    };
  } catch {
    return {
      score: 0,
      details: { claims: [], supported_claims: [], score: 0 },
      tokens: result.tokens,
    };
  }
}

// ============================================
// Context Precision
// ============================================

/**
 * Context Precision measures how much of the retrieved context is relevant.
 */
export async function computeContextPrecision(
  question: string,
  contexts: string[]
): Promise<{ score: number; details: ContextPrecisionDetails; tokens: number }> {
  if (contexts.length === 0) {
    return { score: 0, details: { relevant_sentences: 0, total_sentences: 0 }, tokens: 0 };
  }

  const contextText = contexts.slice(0, 10).join('\n---\n').slice(0, 6000);

  const prompt = `Evaluate how much of the CONTEXT is relevant to answering the QUESTION.

QUESTION: ${question.slice(0, 500)}

CONTEXT:
${contextText}

Count:
1. Total distinct pieces of information in context
2. Pieces that are relevant to the question

Return JSON:
{
  "total_pieces": number,
  "relevant_pieces": number
}`;

  const result = await callLLM(prompt);
  if (!result) {
    return { score: 0, details: { relevant_sentences: 0, total_sentences: contexts.length }, tokens: 0 };
  }

  try {
    const parsed = JSON.parse(result.text);
    const total = Math.max(1, Number(parsed.total_pieces) || 1);
    const relevant = Math.max(0, Number(parsed.relevant_pieces) || 0);
    const score = relevant / total;

    return {
      score,
      details: { relevant_sentences: relevant, total_sentences: total },
      tokens: result.tokens,
    };
  } catch {
    return { score: 0, details: { relevant_sentences: 0, total_sentences: contexts.length }, tokens: result.tokens };
  }
}

// ============================================
// Context Recall
// ============================================

/**
 * Context Recall measures how much of the ground truth is covered by context.
 */
export async function computeContextRecall(
  groundTruth: string,
  contexts: string[]
): Promise<{ score: number; details: ContextRecallDetails; tokens: number }> {
  if (!groundTruth || contexts.length === 0) {
    return { score: 0, details: { covered_statements: 0, total_statements: 0 }, tokens: 0 };
  }

  const contextText = contexts.slice(0, 10).join('\n---\n').slice(0, 6000);

  const prompt = `Evaluate how much of the GROUND_TRUTH is covered by the CONTEXT.

GROUND_TRUTH:
${groundTruth.slice(0, 2000)}

CONTEXT:
${contextText}

Count:
1. Total distinct statements in ground truth
2. Statements covered/supported by context

Return JSON:
{
  "total_statements": number,
  "covered_statements": number
}`;

  const result = await callLLM(prompt);
  if (!result) {
    return { score: 0, details: { covered_statements: 0, total_statements: 1 }, tokens: 0 };
  }

  try {
    const parsed = JSON.parse(result.text);
    const total = Math.max(1, Number(parsed.total_statements) || 1);
    const covered = Math.max(0, Number(parsed.covered_statements) || 0);
    const score = covered / total;

    return {
      score,
      details: { covered_statements: covered, total_statements: total },
      tokens: result.tokens,
    };
  } catch {
    return { score: 0, details: { covered_statements: 0, total_statements: 1 }, tokens: result.tokens };
  }
}

// ============================================
// Context Relevancy
// ============================================

/**
 * Context Relevancy measures how relevant each context chunk is.
 * Uses embedding similarity between question and contexts.
 */
export async function computeContextRelevancy(
  question: string,
  contexts: string[]
): Promise<{ score: number; details: ContextRelevancyDetails }> {
  if (contexts.length === 0) {
    return { score: 0, details: { relevant_chunks: 0, total_chunks: 0 } };
  }

  const questionEmbedding = await computeEmbedding(question);
  const threshold = 0.3; // Minimum similarity to be considered relevant
  let relevantCount = 0;

  for (const ctx of contexts.slice(0, 20)) {
    const ctxEmbedding = await computeEmbedding(ctx);
    const similarity = cosineSimilarity(questionEmbedding, ctxEmbedding);
    if (similarity >= threshold) {
      relevantCount++;
    }
  }

  const score = relevantCount / contexts.length;

  return {
    score,
    details: { relevant_chunks: relevantCount, total_chunks: contexts.length },
  };
}

// ============================================
// Full Ragas Evaluation
// ============================================

export interface RagasEvalOptions {
  /** Compute answer relevancy (requires LLM + embeddings) */
  answerRelevancy?: boolean;
  /** Compute answer correctness (requires ground truth + LLM + embeddings) */
  answerCorrectness?: boolean;
  /** Compute answer similarity (requires ground truth + embeddings) */
  answerSimilarity?: boolean;
  /** Compute faithfulness (requires LLM) */
  faithfulness?: boolean;
  /** Compute context precision (requires LLM) */
  contextPrecision?: boolean;
  /** Compute context recall (requires ground truth + LLM) */
  contextRecall?: boolean;
  /** Compute context relevancy (requires embeddings only) */
  contextRelevancy?: boolean;
}

const DEFAULT_OPTIONS: RagasEvalOptions = {
  answerRelevancy: false, // Expensive: LLM + embeddings
  answerCorrectness: true,
  answerSimilarity: true,
  faithfulness: true,
  contextPrecision: false,
  contextRecall: true,
  contextRelevancy: true,
};

/**
 * Run full Ragas-style evaluation
 */
export async function evaluateRagas(
  input: RagasEvalInput,
  options: RagasEvalOptions = DEFAULT_OPTIONS
): Promise<RagasEvalResult> {
  const metrics: RagasMetrics = {};
  const details: RagasEvalResult['details'] = {};
  let totalTokens = 0;
  let modelCalls = 0;

  // Answer Relevancy
  if (options.answerRelevancy) {
    const result = await computeAnswerRelevancy(input.question, input.answer);
    metrics.answer_relevancy = result.score;
    details.answer_relevancy = result.details;
    totalTokens += result.tokens;
    modelCalls++;
  }

  // Answer Correctness (requires ground truth)
  if (options.answerCorrectness && input.groundTruth) {
    const result = await computeAnswerCorrectness(input.question, input.answer, input.groundTruth);
    metrics.answer_correctness = result.score;
    details.answer_correctness = result.details;
    totalTokens += result.tokens;
    modelCalls++;
  }

  // Answer Similarity (requires ground truth)
  if (options.answerSimilarity && input.groundTruth) {
    const result = await computeAnswerSimilarity(input.answer, input.groundTruth);
    metrics.answer_similarity = result.score;
  }

  // Faithfulness
  if (options.faithfulness && input.contexts.length > 0) {
    const result = await computeFaithfulness(input.answer, input.contexts);
    metrics.faithfulness = result.score;
    details.faithfulness = result.details;
    totalTokens += result.tokens;
    modelCalls++;
  }

  // Context Precision
  if (options.contextPrecision && input.contexts.length > 0) {
    const result = await computeContextPrecision(input.question, input.contexts);
    metrics.context_precision = result.score;
    details.context_precision = result.details;
    totalTokens += result.tokens;
    modelCalls++;
  }

  // Context Recall (requires ground truth)
  if (options.contextRecall && input.groundTruth && input.contexts.length > 0) {
    const result = await computeContextRecall(input.groundTruth, input.contexts);
    metrics.context_recall = result.score;
    details.context_recall = result.details;
    totalTokens += result.tokens;
    modelCalls++;
  }

  // Context Relevancy
  if (options.contextRelevancy && input.contexts.length > 0) {
    const result = await computeContextRelevancy(input.question, input.contexts);
    metrics.context_relevancy = result.score;
    details.context_relevancy = result.details;
  }

  return {
    metrics,
    details,
    tokens_used: totalTokens,
    model_calls: modelCalls,
  };
}

// ============================================
// Batch Evaluation
// ============================================

export interface RagasBatchResult {
  results: RagasEvalResult[];
  aggregated: RagasMetrics;
  total_tokens: number;
  total_model_calls: number;
}

/**
 * Evaluate multiple samples and aggregate results
 */
export async function evaluateRagasBatch(
  inputs: RagasEvalInput[],
  options: RagasEvalOptions = DEFAULT_OPTIONS
): Promise<RagasBatchResult> {
  const results: RagasEvalResult[] = [];
  let totalTokens = 0;
  let totalModelCalls = 0;

  for (const input of inputs) {
    const result = await evaluateRagas(input, options);
    results.push(result);
    totalTokens += result.tokens_used;
    totalModelCalls += result.model_calls;
  }

  // Aggregate metrics
  const aggregated: RagasMetrics = {};
  const metricKeys: (keyof RagasMetrics)[] = [
    'answer_relevancy',
    'answer_correctness',
    'answer_similarity',
    'faithfulness',
    'context_precision',
    'context_recall',
    'context_relevancy',
    'context_entity_recall',
  ];

  for (const key of metricKeys) {
    const values = results
      .map((r) => r.metrics[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    if (values.length > 0) {
      aggregated[key] = values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  return {
    results,
    aggregated,
    total_tokens: totalTokens,
    total_model_calls: totalModelCalls,
  };
}

// ============================================
// Exports
// ============================================

export const RagasMetricsEvaluator = {
  answerRelevancy: computeAnswerRelevancy,
  answerCorrectness: computeAnswerCorrectness,
  answerSimilarity: computeAnswerSimilarity,
  faithfulness: computeFaithfulness,
  contextPrecision: computeContextPrecision,
  contextRecall: computeContextRecall,
  contextRelevancy: computeContextRelevancy,
  evaluate: evaluateRagas,
  evaluateBatch: evaluateRagasBatch,
};
