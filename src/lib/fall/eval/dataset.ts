/**
 * Seizn Eval Pipeline - Dataset Management Module
 * CRUD operations for evaluation datasets and cases
 */

import { createServerClient } from '@/lib/supabase';
import type {
  EvalDataset,
  EvalCase,
  EvalCaseInput,
  CreateDatasetInput,
  PaginationOptions,
  DatasetFilterOptions,
} from './types';

// ============================================
// Dataset CRUD Operations
// ============================================

/**
 * Create a new evaluation dataset with optional cases
 */
export async function createDataset(params: {
  userId: string;
  input: CreateDatasetInput;
}): Promise<{ dataset: EvalDataset; casesCreated: number }> {
  const supabase = createServerClient();
  const { userId, input } = params;

  const datasetId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Insert dataset
  const { data: datasetRow, error: datasetErr } = await supabase
    .from('fall_eval_datasets')
    .insert({
      id: datasetId,
      user_id: userId,
      name: input.name,
      description: input.description ?? null,
      source: input.source ?? 'manual',
      metadata: input.metadata ?? {},
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (datasetErr) {
    throw new Error(`Failed to create dataset: ${datasetErr.message}`);
  }

  let casesCreated = 0;

  // Insert cases if provided
  if (input.cases && input.cases.length > 0) {
    const casesToInsert = input.cases.map((c) => ({
      id: crypto.randomUUID(),
      dataset_id: datasetId,
      user_id: userId,
      query_text: c.query,
      expected_chunk_ids: c.expected_ids ?? null,
      relevance_scores: c.relevance_scores ?? null,
      expected_answer: c.expected_answer ?? null,
      metadata: c.metadata ?? {},
      created_at: now,
    }));

    const { error: casesErr } = await supabase
      .from('fall_eval_cases')
      .insert(casesToInsert);

    if (casesErr) {
      console.warn('Failed to insert cases:', casesErr.message);
    } else {
      casesCreated = casesToInsert.length;
    }

    // Update case count
    await supabase
      .from('fall_eval_datasets')
      .update({ case_count: casesCreated, updated_at: new Date().toISOString() })
      .eq('id', datasetId);
  }

  const dataset = mapDatasetRow(datasetRow);

  return { dataset, casesCreated };
}

/**
 * Get a dataset by ID
 */
export async function getDataset(params: {
  userId: string;
  datasetId: string;
}): Promise<EvalDataset | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('fall_eval_datasets')
    .select('*')
    .eq('id', params.datasetId)
    .eq('user_id', params.userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to get dataset: ${error.message}`);
  }

  return mapDatasetRow(data);
}

/**
 * List datasets for a user
 */
export async function listDatasets(params: {
  userId: string;
  pagination?: PaginationOptions;
  filters?: DatasetFilterOptions;
}): Promise<{ datasets: EvalDataset[]; total: number }> {
  const supabase = createServerClient();
  const { userId, pagination, filters } = params;

  const limit = pagination?.limit ?? 20;
  const offset = pagination?.offset ?? 0;

  let query = supabase
    .from('fall_eval_datasets')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  // Apply filters
  if (filters?.source) {
    query = query.eq('source', filters.source);
  }
  if (filters?.search) {
    query = query.ilike('name', `%${filters.search}%`);
  }
  if (filters?.createdAfter) {
    query = query.gte('created_at', filters.createdAfter);
  }
  if (filters?.createdBefore) {
    query = query.lte('created_at', filters.createdBefore);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to list datasets: ${error.message}`);
  }

  return {
    datasets: (data ?? []).map(mapDatasetRow),
    total: count ?? 0,
  };
}

/**
 * Update a dataset
 */
export async function updateDataset(params: {
  userId: string;
  datasetId: string;
  updates: Partial<Pick<EvalDataset, 'name' | 'description' | 'metadata'>>;
}): Promise<EvalDataset> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('fall_eval_datasets')
    .update({
      ...params.updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.datasetId)
    .eq('user_id', params.userId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update dataset: ${error.message}`);
  }

  return mapDatasetRow(data);
}

/**
 * Delete a dataset and all its cases
 */
export async function deleteDataset(params: {
  userId: string;
  datasetId: string;
}): Promise<boolean> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('fall_eval_datasets')
    .delete()
    .eq('id', params.datasetId)
    .eq('user_id', params.userId);

  if (error) {
    throw new Error(`Failed to delete dataset: ${error.message}`);
  }

  return true;
}

// ============================================
// Case CRUD Operations
// ============================================

/**
 * Add cases to a dataset
 */
export async function addCases(params: {
  userId: string;
  datasetId: string;
  cases: EvalCaseInput[];
}): Promise<{ casesCreated: number }> {
  const supabase = createServerClient();
  const { userId, datasetId, cases } = params;

  if (cases.length === 0) {
    return { casesCreated: 0 };
  }

  const now = new Date().toISOString();

  const casesToInsert = cases.map((c) => ({
    id: crypto.randomUUID(),
    dataset_id: datasetId,
    user_id: userId,
    query_text: c.query,
    expected_chunk_ids: c.expected_ids ?? null,
    relevance_scores: c.relevance_scores ?? null,
    expected_answer: c.expected_answer ?? null,
    metadata: c.metadata ?? {},
    created_at: now,
  }));

  const { error } = await supabase.from('fall_eval_cases').insert(casesToInsert);

  if (error) {
    throw new Error(`Failed to add cases: ${error.message}`);
  }

  // Update dataset case count and timestamp
  const { count } = await supabase
    .from('fall_eval_cases')
    .select('*', { count: 'exact', head: true })
    .eq('dataset_id', datasetId);

  await supabase
    .from('fall_eval_datasets')
    .update({ case_count: count, updated_at: now })
    .eq('id', datasetId);

  return { casesCreated: casesToInsert.length };
}

/**
 * Get cases for a dataset
 */
export async function getCases(params: {
  userId: string;
  datasetId: string;
  pagination?: PaginationOptions;
}): Promise<{ cases: EvalCase[]; total: number }> {
  const supabase = createServerClient();
  const { userId, datasetId, pagination } = params;

  const limit = pagination?.limit ?? 50;
  const offset = pagination?.offset ?? 0;

  const { data, count, error } = await supabase
    .from('fall_eval_cases')
    .select('*', { count: 'exact' })
    .eq('dataset_id', datasetId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to get cases: ${error.message}`);
  }

  return {
    cases: (data ?? []).map(mapCaseRow),
    total: count ?? 0,
  };
}

/**
 * Get a single case by ID
 */
export async function getCase(params: {
  userId: string;
  caseId: string;
}): Promise<EvalCase | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('fall_eval_cases')
    .select('*')
    .eq('id', params.caseId)
    .eq('user_id', params.userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get case: ${error.message}`);
  }

  return mapCaseRow(data);
}

/**
 * Update a case
 */
export async function updateCase(params: {
  userId: string;
  caseId: string;
  updates: Partial<EvalCaseInput>;
}): Promise<EvalCase> {
  const supabase = createServerClient();

  const updatePayload: Record<string, unknown> = {};
  if (params.updates.query !== undefined) {
    updatePayload.query_text = params.updates.query;
  }
  if (params.updates.expected_ids !== undefined) {
    updatePayload.expected_chunk_ids = params.updates.expected_ids;
  }
  if (params.updates.relevance_scores !== undefined) {
    updatePayload.relevance_scores = params.updates.relevance_scores;
  }
  if (params.updates.expected_answer !== undefined) {
    updatePayload.expected_answer = params.updates.expected_answer;
  }
  if (params.updates.metadata !== undefined) {
    updatePayload.metadata = params.updates.metadata;
  }

  const { data, error } = await supabase
    .from('fall_eval_cases')
    .update(updatePayload)
    .eq('id', params.caseId)
    .eq('user_id', params.userId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update case: ${error.message}`);
  }

  return mapCaseRow(data);
}

/**
 * Delete a case
 */
export async function deleteCase(params: {
  userId: string;
  caseId: string;
}): Promise<boolean> {
  const supabase = createServerClient();

  // Get dataset ID first for updating count
  const { data: caseData } = await supabase
    .from('fall_eval_cases')
    .select('dataset_id')
    .eq('id', params.caseId)
    .single();

  const { error } = await supabase
    .from('fall_eval_cases')
    .delete()
    .eq('id', params.caseId)
    .eq('user_id', params.userId);

  if (error) {
    throw new Error(`Failed to delete case: ${error.message}`);
  }

  // Update dataset case count
  if (caseData?.dataset_id) {
    const { count } = await supabase
      .from('fall_eval_cases')
      .select('*', { count: 'exact', head: true })
      .eq('dataset_id', caseData.dataset_id);

    await supabase
      .from('fall_eval_datasets')
      .update({ case_count: count, updated_at: new Date().toISOString() })
      .eq('id', caseData.dataset_id);
  }

  return true;
}

/**
 * Delete multiple cases
 */
export async function deleteCases(params: {
  userId: string;
  caseIds: string[];
}): Promise<number> {
  const supabase = createServerClient();

  if (params.caseIds.length === 0) {
    return 0;
  }

  // Get dataset IDs first
  const { data: casesData } = await supabase
    .from('fall_eval_cases')
    .select('dataset_id')
    .in('id', params.caseIds);

  const { error, count } = await supabase
    .from('fall_eval_cases')
    .delete()
    .in('id', params.caseIds)
    .eq('user_id', params.userId);

  if (error) {
    throw new Error(`Failed to delete cases: ${error.message}`);
  }

  // Update dataset case counts
  const datasetIds = [...new Set((casesData ?? []).map((c) => c.dataset_id))];
  for (const datasetId of datasetIds) {
    const { count: caseCount } = await supabase
      .from('fall_eval_cases')
      .select('*', { count: 'exact', head: true })
      .eq('dataset_id', datasetId);

    await supabase
      .from('fall_eval_datasets')
      .update({ case_count: caseCount, updated_at: new Date().toISOString() })
      .eq('id', datasetId);
  }

  return count ?? 0;
}

// ============================================
// Import/Export Functions
// ============================================

/**
 * Import cases from JSON
 */
export async function importCasesFromJSON(params: {
  userId: string;
  datasetId: string;
  json: Array<{
    query: string;
    expected_ids?: string[];
    relevance_scores?: number[];
    expected_answer?: string;
    metadata?: Record<string, unknown>;
  }>;
}): Promise<{ casesCreated: number; errors: string[] }> {
  const errors: string[] = [];
  const validCases: EvalCaseInput[] = [];

  for (let i = 0; i < params.json.length; i++) {
    const item = params.json[i];
    if (!item.query || typeof item.query !== 'string') {
      errors.push(`Case ${i}: missing or invalid query`);
      continue;
    }
    validCases.push({
      query: item.query,
      expected_ids: item.expected_ids,
      relevance_scores: item.relevance_scores,
      expected_answer: item.expected_answer,
      metadata: item.metadata,
    });
  }

  if (validCases.length === 0) {
    return { casesCreated: 0, errors };
  }

  const result = await addCases({
    userId: params.userId,
    datasetId: params.datasetId,
    cases: validCases,
  });

  return { casesCreated: result.casesCreated, errors };
}

/**
 * Export cases to JSON
 */
export async function exportCasesToJSON(params: {
  userId: string;
  datasetId: string;
}): Promise<Array<{
  query: string;
  expected_ids?: string[];
  relevance_scores?: number[];
  expected_answer?: string;
  metadata?: Record<string, unknown>;
}>> {
  const { cases } = await getCases({
    userId: params.userId,
    datasetId: params.datasetId,
    pagination: { limit: 10000 },
  });

  return cases.map((c) => ({
    query: c.queryText,
    expected_ids: c.expectedIds,
    relevance_scores: c.relevanceScores,
    expected_answer: c.expectedAnswer,
    metadata: c.metadata,
  }));
}

// ============================================
// Helper Functions
// ============================================

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapDatasetRow(row: any): EvalDataset {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? undefined,
    source: row.source ?? undefined,
    caseCount: row.case_count ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCaseRow(row: any): EvalCase {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    userId: row.user_id,
    queryText: row.query_text,
    expectedIds: row.expected_chunk_ids ?? undefined,
    relevanceScores: row.relevance_scores ?? undefined,
    expectedAnswer: row.expected_answer ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
