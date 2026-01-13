/**
 * Seizn Policy Simulator - Simulation Runner
 *
 * Runs simulations comparing policy behavior against historical or test queries.
 * Supports both database-stored policies and inline policy definitions.
 */

import { createServerClient } from '@/lib/supabase';
import { parsePolicyJson, parsePolicy } from './parser';
import { evaluatePolicyBatch, type EvaluationContext } from './evaluator';
import { computeDiff, computeAggregateImpact } from './differ';
import type {
  PolicyRule,
  ChunkRef,
  EvaluatedChunk,
  SimulationConfig,
  SimulationSummary,
  SimulationResult,
  PolicySimulation,
  SimulationResultsSummary,
  SimulationStatus,
} from './types';

// ============================================
// Main Simulation Function
// ============================================

/**
 * Run a policy simulation comparing base and test policies
 */
export async function runSimulation(
  userId: string,
  config: SimulationConfig
): Promise<SimulationSummary> {
  const startTime = Date.now();
  const supabase = createServerClient();

  // Create simulation record
  const { data: simulation, error: createError } = await supabase
    .from('policy_simulations')
    .insert({
      user_id: userId,
      base_policy_id: config.basePolicyId || null,
      test_policy_id: config.testPolicyId || null,
      test_queries: {
        queryIds: config.queryIds,
        inlineQueries: config.inlineQueries,
      },
      regression_set_id: config.regressionSetId || null,
      status: 'running' as SimulationStatus,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (createError || !simulation) {
    throw new SimulationError(`Failed to create simulation: ${createError?.message}`);
  }

  const simulationId = simulation.id;

  try {
    // Load base policy rules
    const baseRules = config.basePolicyId
      ? await loadPolicyRules(config.basePolicyId)
      : [];

    // Load or parse test policy rules
    let testRules: PolicyRule[];
    if (config.testPolicyRules) {
      testRules = config.testPolicyRules;
    } else if (config.testPolicyId) {
      testRules = await loadPolicyRules(config.testPolicyId);
    } else {
      throw new SimulationError('Either testPolicyId or testPolicyRules is required');
    }

    // Get test queries
    const queries = await getTestQueries(userId, config);

    if (queries.length === 0) {
      throw new SimulationError('No test queries found');
    }

    // Run simulation for each query
    const results: SimulationResult[] = [];
    let affectedQueries = 0;
    let totalBlockedChunks = 0;
    let totalUnblockedChunks = 0;
    let totalMaskingChanged = 0;
    const ruleActivationCounts: Record<string, number> = {};

    for (const query of queries.slice(0, config.maxQueries || 100)) {
      const result = await simulateQuery(
        simulationId,
        query,
        baseRules,
        testRules,
        config
      );

      results.push(result);

      // Track affected queries
      if (result.impactScore > 0) {
        affectedQueries++;
      }

      // Track blocked/unblocked chunks
      totalBlockedChunks += result.newlyBlocked.length;
      totalUnblockedChunks += result.newlyAllowed.length;
      totalMaskingChanged += result.maskingChanged.length;

      // Track rule activations
      for (const chunk of [...result.testChunks, ...result.testBlocked]) {
        for (const rule of chunk.matchedRules) {
          ruleActivationCounts[rule] = (ruleActivationCounts[rule] || 0) + 1;
        }
      }

      // Store detailed result
      await storeSimulationResult(result);
    }

    // Calculate aggregate impact
    const overallImpact = computeAggregateImpact(results.map((r) => r.impactScore));

    // Build results summary
    const resultsSummary: SimulationResultsSummary = {
      impactByType: calculateImpactByType(results),
      topAffectedQueries: results
        .filter((r) => r.impactScore > 0)
        .sort((a, b) => b.impactScore - a.impactScore)
        .slice(0, 10)
        .map((r) => ({
          queryId: r.queryId || '',
          queryText: r.queryText.slice(0, 100),
          impactScore: r.impactScore,
        })),
      ruleActivationCounts,
    };

    // Update simulation record with results
    await supabase
      .from('policy_simulations')
      .update({
        status: 'completed' as SimulationStatus,
        total_queries: queries.length,
        affected_queries: affectedQueries,
        blocked_chunks_count: totalBlockedChunks,
        unblocked_chunks_count: totalUnblockedChunks,
        results: resultsSummary,
        completed_at: new Date().toISOString(),
      })
      .eq('id', simulationId);

    return {
      simulationId,
      status: 'completed',
      totalQueries: queries.length,
      affectedQueries,
      blockedChunksCount: totalBlockedChunks,
      unblockedChunksCount: totalUnblockedChunks,
      maskingChangedCount: totalMaskingChanged,
      overallImpactScore: overallImpact,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    // Update simulation with error
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    await supabase
      .from('policy_simulations')
      .update({
        status: 'failed' as SimulationStatus,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', simulationId);

    throw err;
  }
}

// ============================================
// Query Simulation
// ============================================

interface TestQuery {
  id?: string;
  text: string;
  chunks: ChunkRef[];
  context?: EvaluationContext;
}

/**
 * Simulate a single query against both policies
 */
async function simulateQuery(
  simulationId: string,
  query: TestQuery,
  baseRules: PolicyRule[],
  testRules: PolicyRule[],
  config: SimulationConfig
): Promise<SimulationResult> {
  // Evaluate with base policy
  const baseResults = evaluatePolicyBatch(query.chunks, baseRules, query.context);
  const baseChunks = toEvaluatedChunks(query.chunks, baseResults.results, 'allow');
  const baseBlocked = toEvaluatedChunks(query.chunks, baseResults.results, 'block');

  // Evaluate with test policy
  const testResults = evaluatePolicyBatch(query.chunks, testRules, query.context);
  const testChunks = toEvaluatedChunks(query.chunks, testResults.results, 'allow');
  const testBlocked = toEvaluatedChunks(query.chunks, testResults.results, 'block');

  // Compute diff
  const diff = computeDiff(baseResults.results, testResults.results, query.chunks);

  // Create evaluated chunks for diff results
  const newlyBlocked = diff.newlyBlocked.map((chunk) => ({
    ...chunk,
    matchedRules: testResults.results.find((r) => r.chunkId === chunk.id)?.matchedRules || [],
    reason: 'Newly blocked by test policy',
  }));

  const newlyAllowed = diff.newlyAllowed.map((chunk) => ({
    ...chunk,
    matchedRules: [],
    reason: 'Newly allowed by test policy',
  }));

  const maskingChanged = diff.maskingChanged.map(({ chunk, baseMasked, testMasked }) => ({
    ...chunk,
    matchedRules: testResults.results.find((r) => r.chunkId === chunk.id)?.matchedRules || [],
    reason: `Masking changed: "${baseMasked.slice(0, 50)}..." -> "${testMasked.slice(0, 50)}..."`,
  }));

  return {
    id: crypto.randomUUID(),
    simulationId,
    queryId: query.id,
    queryText: query.text,
    baseChunks,
    baseBlocked,
    testChunks,
    testBlocked,
    newlyBlocked,
    newlyAllowed,
    maskingChanged,
    impactScore: diff.impactScore,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Convert chunks and evaluation results to evaluated chunks
 */
function toEvaluatedChunks(
  chunks: ChunkRef[],
  results: { chunkId: string; action: string; matchedRules: string[]; maskedContent?: string }[],
  filterAction: 'allow' | 'block' | 'masked'
): EvaluatedChunk[] {
  const evaluated: EvaluatedChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const result = results[i];

    const isMatch =
      (filterAction === 'allow' && (result.action === 'allow' || result.action === 'mask' || result.action === 'redact')) ||
      (filterAction === 'block' && result.action === 'block') ||
      (filterAction === 'masked' && (result.action === 'mask' || result.action === 'redact'));

    if (isMatch) {
      evaluated.push({
        ...chunk,
        matchedRules: result.matchedRules,
        originalContent: result.maskedContent ? chunk.content : undefined,
        content: result.maskedContent || chunk.content,
      });
    }
  }

  return evaluated;
}

// ============================================
// Data Loading Functions
// ============================================

/**
 * Load policy rules from database
 */
async function loadPolicyRules(policyId: string): Promise<PolicyRule[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('policy_definitions')
    .select('policy_json, policy_yaml')
    .eq('id', policyId)
    .single();

  if (error || !data) {
    throw new SimulationError(`Failed to load policy ${policyId}: ${error?.message}`);
  }

  // Try JSON first, fall back to YAML
  if (data.policy_json) {
    return parsePolicyJson(data.policy_json).map((rule, index) => ({
      ...rule,
      id: rule.id || `rule_${index}`,
    }));
  }

  if (data.policy_yaml) {
    return parsePolicy(data.policy_yaml).map((rule, index) => ({
      ...rule,
      id: rule.id || `rule_${index}`,
    }));
  }

  return [];
}

/**
 * Get test queries based on configuration
 */
async function getTestQueries(
  userId: string,
  config: SimulationConfig
): Promise<TestQuery[]> {
  const queries: TestQuery[] = [];

  // Get queries from regression set
  if (config.regressionSetId) {
    const regressionQueries = await loadRegressionQueries(config.regressionSetId);
    queries.push(...regressionQueries);
  }

  // Get queries by ID from traces
  if (config.queryIds && config.queryIds.length > 0) {
    const traceQueries = await loadQueriesFromTraces(userId, config.queryIds);
    queries.push(...traceQueries);
  }

  // Add inline queries
  if (config.inlineQueries && config.inlineQueries.length > 0) {
    for (const queryText of config.inlineQueries) {
      // For inline queries, we need to retrieve chunks
      const chunks = await retrieveChunksForQuery(userId, queryText);
      queries.push({
        text: queryText,
        chunks,
      });
    }
  }

  // If no queries specified, get recent traces
  if (queries.length === 0) {
    const recentQueries = await loadRecentTraceQueries(userId, config.maxQueries || 50);
    queries.push(...recentQueries);
  }

  return queries;
}

/**
 * Load queries from regression test set
 */
async function loadRegressionQueries(regressionSetId: string): Promise<TestQuery[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('fall_eval_datasets')
    .select('cases')
    .eq('id', regressionSetId)
    .single();

  if (error || !data) {
    console.warn(`Failed to load regression set: ${error?.message}`);
    return [];
  }

  const cases = data.cases as Array<{
    query: string;
    expected_chunks?: ChunkRef[];
  }>;

  return cases.map((c, index) => ({
    id: `regression_${index}`,
    text: c.query,
    chunks: c.expected_chunks || [],
  }));
}

/**
 * Load queries from retrieval traces
 */
async function loadQueriesFromTraces(
  userId: string,
  queryIds: string[]
): Promise<TestQuery[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('fall_retrieval_traces')
    .select('id, query, retrieved_chunks')
    .eq('user_id', userId)
    .in('id', queryIds);

  if (error || !data) {
    console.warn(`Failed to load trace queries: ${error?.message}`);
    return [];
  }

  return data.map((trace) => ({
    id: trace.id,
    text: trace.query,
    chunks: (trace.retrieved_chunks as ChunkRef[]) || [],
  }));
}

/**
 * Load recent trace queries
 */
async function loadRecentTraceQueries(
  userId: string,
  limit: number
): Promise<TestQuery[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('fall_retrieval_traces')
    .select('id, query, retrieved_chunks')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.warn(`Failed to load recent traces: ${error?.message}`);
    return [];
  }

  return data.map((trace) => ({
    id: trace.id,
    text: trace.query,
    chunks: (trace.retrieved_chunks as ChunkRef[]) || [],
  }));
}

/**
 * Retrieve chunks for a query (for inline query testing)
 */
async function retrieveChunksForQuery(
  userId: string,
  queryText: string
): Promise<ChunkRef[]> {
  const supabase = createServerClient();

  // Simple text search on chunks
  const { data, error } = await supabase
    .from('summer_chunks')
    .select('id, document_id, content, metadata')
    .eq('user_id', userId)
    .textSearch('content', queryText.split(' ').slice(0, 5).join(' | '))
    .limit(20);

  if (error || !data) {
    return [];
  }

  return data.map((chunk) => ({
    id: chunk.id,
    documentId: chunk.document_id,
    content: chunk.content,
    metadata: chunk.metadata as Record<string, unknown>,
  }));
}

// ============================================
// Result Storage
// ============================================

/**
 * Store detailed simulation result
 */
async function storeSimulationResult(result: SimulationResult): Promise<void> {
  const supabase = createServerClient();

  await supabase.from('simulation_results').insert({
    id: result.id,
    simulation_id: result.simulationId,
    query_id: result.queryId,
    query_text: result.queryText,
    base_chunks: result.baseChunks,
    base_blocked: result.baseBlocked,
    test_chunks: result.testChunks,
    test_blocked: result.testBlocked,
    newly_blocked: result.newlyBlocked,
    newly_allowed: result.newlyAllowed,
    masking_changed: result.maskingChanged,
    impact_score: result.impactScore,
  });
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate impact breakdown by policy type
 */
function calculateImpactByType(
  results: SimulationResult[]
): Record<string, number> {
  // This is a simplified implementation
  // In production, you'd track which rules caused each impact
  const totalImpact = results.reduce((sum, r) => sum + r.impactScore, 0);
  const avgImpact = results.length > 0 ? totalImpact / results.length : 0;

  return {
    overall: avgImpact,
  };
}

// ============================================
// Simulation Retrieval
// ============================================

/**
 * Get simulation by ID
 */
export async function getSimulation(
  simulationId: string,
  userId: string
): Promise<PolicySimulation | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('policy_simulations')
    .select('*')
    .eq('id', simulationId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    basePolicyId: data.base_policy_id,
    testPolicyId: data.test_policy_id,
    testQueries: data.test_queries,
    regressionSetId: data.regression_set_id,
    status: data.status,
    totalQueries: data.total_queries,
    affectedQueries: data.affected_queries,
    blockedChunksCount: data.blocked_chunks_count,
    unblockedChunksCount: data.unblocked_chunks_count,
    results: data.results,
    errorMessage: data.error_message,
    startedAt: data.started_at,
    completedAt: data.completed_at,
    createdAt: data.created_at,
  };
}

/**
 * Get simulation results (paginated)
 */
export async function getSimulationResults(
  simulationId: string,
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ results: SimulationResult[]; total: number }> {
  const supabase = createServerClient();

  // Verify user owns the simulation
  const { data: simulation } = await supabase
    .from('policy_simulations')
    .select('id')
    .eq('id', simulationId)
    .eq('user_id', userId)
    .single();

  if (!simulation) {
    return { results: [], total: 0 };
  }

  // Get results with count
  const { data, error, count } = await supabase
    .from('simulation_results')
    .select('*', { count: 'exact' })
    .eq('simulation_id', simulationId)
    .order('impact_score', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !data) {
    return { results: [], total: 0 };
  }

  const results: SimulationResult[] = data.map((row) => ({
    id: row.id,
    simulationId: row.simulation_id,
    queryId: row.query_id,
    queryText: row.query_text,
    baseChunks: row.base_chunks || [],
    baseBlocked: row.base_blocked || [],
    testChunks: row.test_chunks || [],
    testBlocked: row.test_blocked || [],
    newlyBlocked: row.newly_blocked || [],
    newlyAllowed: row.newly_allowed || [],
    maskingChanged: row.masking_changed || [],
    impactScore: row.impact_score,
    createdAt: row.created_at,
  }));

  return { results, total: count || 0 };
}

/**
 * List simulations for a user
 */
export async function listSimulations(
  userId: string,
  limit: number = 20
): Promise<PolicySimulation[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('policy_simulations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    basePolicyId: row.base_policy_id,
    testPolicyId: row.test_policy_id,
    testQueries: row.test_queries,
    regressionSetId: row.regression_set_id,
    status: row.status,
    totalQueries: row.total_queries,
    affectedQueries: row.affected_queries,
    blockedChunksCount: row.blocked_chunks_count,
    unblockedChunksCount: row.unblocked_chunks_count,
    results: row.results,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  }));
}

// ============================================
// Error Classes
// ============================================

export class SimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimulationError';
  }
}
