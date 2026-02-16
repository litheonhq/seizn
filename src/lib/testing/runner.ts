import { buildAnthropicHeaders } from '@/lib/anthropic/prompt-caching';
/**
 * Test Runner
 *
 * Executes retrieval test suites and records results
 */

import { createServerClient } from '../supabase';
import { createQueryEmbedding } from '../ai';
import { evaluateTestCase, evaluateFaithfulness } from './evaluator';
import type {
  TestSuite,
  TestCase,
  TestRun,
  TestRunResult,
  TestResult,
  TestCaseRun,
  RunStatus,
  TriggerType,
  RetrievalResult,
} from './types';

// ============================================
// Constants
// ============================================

const DEFAULT_TOP_K = 10;
const DEFAULT_THRESHOLD = 0.7;

// ============================================
// Main Runner Functions
// ============================================

/**
 * Run all tests in a suite
 */
export async function runTestSuite(
  suiteId: string,
  userId: string,
  options: {
    caseIds?: string[];
    triggeredBy?: TriggerType;
    triggerContext?: Record<string, unknown>;
    checkFaithfulness?: boolean;
  } = {}
): Promise<TestRun> {
  const supabase = createServerClient();

  // Fetch suite and cases
  const { data: suite, error: suiteError } = await supabase
    .from('retrieval_test_suites')
    .select('*')
    .eq('id', suiteId)
    .eq('user_id', userId)
    .single();

  if (suiteError || !suite) {
    throw new Error('Test suite not found');
  }

  // Fetch test cases
  let casesQuery = supabase
    .from('retrieval_test_cases')
    .select('*')
    .eq('suite_id', suiteId)
    .eq('is_active', true);

  if (options.caseIds && options.caseIds.length > 0) {
    casesQuery = casesQuery.in('id', options.caseIds);
  }

  const { data: cases, error: casesError } = await casesQuery;

  if (casesError || !cases || cases.length === 0) {
    throw new Error('No test cases found');
  }

  // Create test run record
  const { data: run, error: runError } = await supabase
    .from('retrieval_test_runs')
    .insert({
      suite_id: suiteId,
      user_id: userId,
      status: 'running' as RunStatus,
      total_cases: cases.length,
      config_snapshot: suite.config,
      triggered_by: options.triggeredBy || 'manual',
      trigger_context: options.triggerContext,
    })
    .select()
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create test run: ${runError?.message}`);
  }

  // Execute tests
  const results: TestRunResult[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const testCase of cases as TestCase[]) {
    try {
      const result = await runSingleTest(
        testCase,
        suite as TestSuite,
        userId,
        run.id,
        options.checkFaithfulness
      );

      results.push(result);

      switch (result.result) {
        case 'pass':
          passed++;
          break;
        case 'fail':
          failed++;
          break;
        case 'skip':
          skipped++;
          break;
        default:
          failed++;
      }
    } catch (error) {
      console.error(`Error running test case ${testCase.id}:`, error);
      results.push({
        case_id: testCase.id,
        result: 'error',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      failed++;
    }
  }

  // Update run with results
  const { data: updatedRun, error: updateError } = await supabase
    .from('retrieval_test_runs')
    .update({
      status: 'completed' as RunStatus,
      passed,
      failed,
      skipped,
      results,
    })
    .eq('id', run.id)
    .select()
    .single();

  if (updateError) {
    console.error('Failed to update test run:', updateError);
  }

  return (updatedRun || run) as TestRun;
}

/**
 * Run a single test case
 */
export async function runSingleTest(
  testCase: TestCase,
  suite: TestSuite,
  userId: string,
  runId?: string,
  checkFaithfulness = false
): Promise<TestRunResult> {
  const supabase = createServerClient();
  const startTime = Date.now();

  try {
    // Get suite config
    const config = suite.config || {};
    const topK = config.topK || DEFAULT_TOP_K;
    const threshold = config.threshold || DEFAULT_THRESHOLD;
    const searchType = config.search_type || 'vector';
    const namespace = config.namespace || null;

    // Perform retrieval
    const retrievalResults = await performRetrieval(
      testCase.query,
      userId,
      {
        topK,
        threshold,
        searchType,
        namespace,
        collectionId: suite.collection_id,
      }
    );

    const latencyMs = Date.now() - startTime;

    // Evaluate results
    const evaluation = evaluateTestCase(testCase, retrievalResults);

    // Optional faithfulness check for positive tests with answers
    let faithfulnessScore = evaluation.faithfulness_score;
    if (checkFaithfulness && testCase.test_type === 'positive' && retrievalResults.length > 0) {
      try {
        const answer = await generateAnswer(testCase.query, retrievalResults);
        const faithfulnessResult = await evaluateFaithfulness(
          testCase.query,
          retrievalResults,
          answer
        );
        faithfulnessScore = faithfulnessResult.faithfulness_score;
      } catch {
        console.error('Faithfulness check failed, using default');
      }
    }

    // Determine final result
    const result: TestResult = evaluation.passed ? 'pass' : 'fail';

    // Check latency constraint
    const latencyFailed = testCase.max_latency_ms && latencyMs > testCase.max_latency_ms;
    const finalResult: TestResult = latencyFailed ? 'fail' : result;

    const runResult: TestRunResult = {
      case_id: testCase.id,
      result: finalResult,
      relevance_score: evaluation.relevance_score,
      keyword_match_score: evaluation.keyword_match_score,
      faithfulness_score: faithfulnessScore,
      latency_ms: latencyMs,
      retrieved_doc_ids: retrievalResults.map((r) => r.doc_id),
      matched_keywords: evaluation.details.matched_keywords,
      missing_keywords: evaluation.details.missing_keywords,
      error_message: latencyFailed
        ? `Latency ${latencyMs}ms exceeded max ${testCase.max_latency_ms}ms`
        : (finalResult === 'fail' ? evaluation.reason : undefined),
    };

    // Save individual case run if runId provided
    if (runId) {
      await saveCaseRun(runId, testCase.id, runResult, retrievalResults);
    }

    return runResult;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    const runResult: TestRunResult = {
      case_id: testCase.id,
      result: 'error',
      latency_ms: latencyMs,
      error_message: errorMessage,
    };

    if (runId) {
      await saveCaseRun(runId, testCase.id, runResult);
    }

    return runResult;
  }
}

// ============================================
// Retrieval Functions
// ============================================

interface RetrievalOptions {
  topK: number;
  threshold: number;
  searchType: 'vector' | 'hybrid' | 'keyword';
  namespace?: string | null;
  collectionId?: string;
}

/**
 * Perform retrieval for a query
 */
async function performRetrieval(
  query: string,
  userId: string,
  options: RetrievalOptions
): Promise<RetrievalResult[]> {
  const supabase = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let results: any[] | null = null;

  if (options.searchType === 'keyword') {
    // Keyword-only search
    const { data, error } = await supabase.rpc('keyword_search_memories', {
      query_text: query,
      match_user_id: userId,
      match_count: options.topK,
      match_namespace: options.namespace,
    });

    if (error) throw new Error(`Search error: ${error.message}`);
    results = data;
  } else if (options.searchType === 'hybrid') {
    // Hybrid search
    const queryEmbedding = await createQueryEmbedding(query);
    const { data, error } = await supabase.rpc('hybrid_search_memories', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_user_id: userId,
      match_count: options.topK,
      match_threshold: options.threshold,
      match_namespace: options.namespace,
      keyword_weight: 0.3,
      vector_weight: 0.7,
    });

    if (error) throw new Error(`Search error: ${error.message}`);
    results = data;
  } else {
    // Vector search (default)
    const queryEmbedding = await createQueryEmbedding(query);
    const { data, error } = await supabase.rpc('search_memories', {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      match_count: options.topK,
      match_threshold: options.threshold,
      match_namespace: options.namespace,
    });

    if (error) throw new Error(`Search error: ${error.message}`);
    results = data;
  }

  if (!results) return [];

  // Transform to RetrievalResult format
  return results.map((r) => ({
    doc_id: r.id,
    content: r.content,
    score: r.similarity || r.score || 0,
    metadata: r.metadata || {},
  }));
}

/**
 * Generate an answer for faithfulness checking
 */
async function generateAnswer(
  query: string,
  results: RetrievalResult[]
): Promise<string> {
  const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const context = results
    .map((r, i) => `[${i + 1}] ${r.content.slice(0, 500)}`)
    .join('\n\n');

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: buildAnthropicHeaders(apiKey),
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      system: 'Answer the question based ONLY on the provided context. Be concise.',
      messages: [
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${query}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate answer');
  }

  const data = await response.json();
  return data.content[0].text;
}

// ============================================
// Database Operations
// ============================================

/**
 * Save individual test case run details
 */
async function saveCaseRun(
  runId: string,
  caseId: string,
  result: TestRunResult,
  retrievalResults?: RetrievalResult[]
): Promise<void> {
  const supabase = createServerClient();

  const caseRun: Partial<TestCaseRun> = {
    run_id: runId,
    case_id: caseId,
    result: result.result,
    error_message: result.error_message,
    relevance_score: result.relevance_score,
    keyword_match_score: result.keyword_match_score,
    faithfulness_score: result.faithfulness_score,
    latency_ms: result.latency_ms,
    retrieved_doc_ids: result.retrieved_doc_ids,
    matched_keywords: result.matched_keywords,
    missing_keywords: result.missing_keywords,
    retrieved_content_preview: retrievalResults
      ? retrievalResults
          .slice(0, 3)
          .map((r) => r.content.slice(0, 200))
          .join('\n---\n')
      : undefined,
  };

  await supabase.from('retrieval_test_case_runs').insert(caseRun);
}

/**
 * Cancel a running test
 */
export async function cancelTestRun(runId: string, userId: string): Promise<void> {
  const supabase = createServerClient();

  await supabase
    .from('retrieval_test_runs')
    .update({
      status: 'cancelled' as RunStatus,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .eq('user_id', userId)
    .eq('status', 'running');
}

/**
 * Get test run results
 */
export async function getTestRunResults(
  runId: string,
  userId: string
): Promise<{
  run: TestRun;
  caseRuns: TestCaseRun[];
}> {
  const supabase = createServerClient();

  const { data: run, error: runError } = await supabase
    .from('retrieval_test_runs')
    .select('*')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();

  if (runError || !run) {
    throw new Error('Test run not found');
  }

  const { data: caseRuns, error: caseError } = await supabase
    .from('retrieval_test_case_runs')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true });

  if (caseError) {
    throw new Error(`Failed to fetch case runs: ${caseError.message}`);
  }

  return {
    run: run as TestRun,
    caseRuns: (caseRuns || []) as TestCaseRun[],
  };
}

// ============================================
// Retry and Batch Operations
// ============================================

/**
 * Retry failed tests from a previous run
 */
export async function retryFailedTests(
  runId: string,
  userId: string
): Promise<TestRun> {
  const supabase = createServerClient();

  // Get failed case IDs from the previous run
  const { data: prevRun } = await supabase
    .from('retrieval_test_runs')
    .select('suite_id, results')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();

  if (!prevRun) {
    throw new Error('Previous run not found');
  }

  const failedCaseIds = (prevRun.results as TestRunResult[])
    .filter((r) => r.result === 'fail' || r.result === 'error')
    .map((r) => r.case_id);

  if (failedCaseIds.length === 0) {
    throw new Error('No failed tests to retry');
  }

  return runTestSuite(prevRun.suite_id, userId, {
    caseIds: failedCaseIds,
    triggeredBy: 'manual',
    triggerContext: { retry_of: runId },
  });
}

/**
 * Run tests for multiple suites
 */
export async function runMultipleSuites(
  suiteIds: string[],
  userId: string,
  triggeredBy: TriggerType = 'manual'
): Promise<TestRun[]> {
  const runs: TestRun[] = [];

  for (const suiteId of suiteIds) {
    try {
      const run = await runTestSuite(suiteId, userId, { triggeredBy });
      runs.push(run);
    } catch (error) {
      console.error(`Failed to run suite ${suiteId}:`, error);
    }
  }

  return runs;
}
