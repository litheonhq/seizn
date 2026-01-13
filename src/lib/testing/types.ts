/**
 * Types for Retrieval Test System
 */

// ============================================
// Test Suite Types
// ============================================

export interface TestSuite {
  id: string;
  user_id: string;
  collection_id?: string;
  name: string;
  description?: string;
  generated_by: 'auto' | 'manual';
  source_doc_ids: string[];
  config: TestSuiteConfig;
  tags: string[];
  is_active: boolean;
  last_run_at?: string;
  last_run_result?: 'passed' | 'failed' | 'partial';
  created_at: string;
  updated_at: string;
}

export interface TestSuiteConfig {
  topK?: number;
  threshold?: number;
  search_type?: 'vector' | 'hybrid' | 'keyword';
  rerank_enabled?: boolean;
  namespace?: string;
}

// ============================================
// Test Case Types
// ============================================

export type TestType = 'positive' | 'negative' | 'edge_case';

export interface TestCase {
  id: string;
  suite_id: string;
  name?: string;
  query: string;
  test_type: TestType;
  expected_doc_ids: string[];
  expected_keywords: string[];
  expected_not_keywords: string[];
  min_score: number;
  max_latency_ms: number;
  generated_from_doc_id?: string;
  generation_context?: string;
  last_run_at?: string;
  last_result?: TestResult;
  last_score?: number;
  last_latency_ms?: number;
  last_retrieved_doc_ids?: string[];
  last_error?: string;
  run_count: number;
  pass_count: number;
  fail_count: number;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type TestResult = 'pass' | 'fail' | 'skip' | 'error';

// ============================================
// Test Run Types
// ============================================

export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type TriggerType = 'manual' | 'ci' | 'schedule' | 'webhook';

export interface TestRun {
  id: string;
  suite_id: string;
  user_id: string;
  status: RunStatus;
  total_cases: number;
  passed: number;
  failed: number;
  skipped: number;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  results: TestRunResult[];
  config_snapshot?: TestSuiteConfig;
  triggered_by: TriggerType;
  trigger_context?: Record<string, unknown>;
  avg_score?: number;
  avg_latency_ms?: number;
  p50_latency_ms?: number;
  p95_latency_ms?: number;
  p99_latency_ms?: number;
  created_at: string;
}

export interface TestRunResult {
  case_id: string;
  result: TestResult;
  relevance_score?: number;
  keyword_match_score?: number;
  faithfulness_score?: number;
  latency_ms?: number;
  retrieved_doc_ids?: string[];
  matched_keywords?: string[];
  missing_keywords?: string[];
  error_message?: string;
  trace_id?: string;
}

// ============================================
// Test Case Run Details
// ============================================

export interface TestCaseRun {
  id: string;
  run_id: string;
  case_id: string;
  result: TestResult;
  error_message?: string;
  relevance_score?: number;
  keyword_match_score?: number;
  faithfulness_score?: number;
  latency_ms?: number;
  retrieved_doc_ids?: string[];
  retrieved_content_preview?: string;
  matched_keywords?: string[];
  missing_keywords?: string[];
  trace_id?: string;
  created_at: string;
}

// ============================================
// Test Generation Types
// ============================================

export interface GeneratedTest {
  query: string;
  test_type: TestType;
  expected_keywords: string[];
  expected_not_keywords?: string[];
  expected_doc_ids?: string[];
  min_score?: number;
  notes?: string;
}

export interface GenerationOptions {
  count?: number;
  types?: TestType[];
  model?: 'haiku' | 'sonnet';
  templateId?: string;
}

// ============================================
// Evaluation Types
// ============================================

export interface EvaluationResult {
  passed: boolean;
  relevance_score: number;
  keyword_match_score: number;
  faithfulness_score: number;
  details: {
    matched_doc_ids: string[];
    missing_doc_ids: string[];
    matched_keywords: string[];
    missing_keywords: string[];
    forbidden_keywords_found: string[];
  };
  reason?: string;
}

export interface RetrievalResult {
  doc_id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

// ============================================
// Template Types
// ============================================

export interface TestTemplate {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  template_type: TestType | 'custom';
  prompt_template: string;
  default_config: Record<string, unknown>;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// Statistics Types
// ============================================

export interface TestSuiteStats {
  total_cases: number;
  active_cases: number;
  last_run_passed: number;
  last_run_failed: number;
  pass_rate?: number;
  avg_score?: number;
}

export interface RunStatistics {
  avg_score?: number;
  avg_latency_ms?: number;
  p50_latency_ms?: number;
  p95_latency_ms?: number;
  p99_latency_ms?: number;
}

// ============================================
// API Request/Response Types
// ============================================

export interface CreateSuiteRequest {
  name: string;
  description?: string;
  collection_id?: string;
  config?: TestSuiteConfig;
  tags?: string[];
}

export interface CreateTestCaseRequest {
  name?: string;
  query: string;
  test_type?: TestType;
  expected_doc_ids?: string[];
  expected_keywords?: string[];
  expected_not_keywords?: string[];
  min_score?: number;
  max_latency_ms?: number;
  metadata?: Record<string, unknown>;
}

export interface GenerateTestsRequest {
  doc_ids?: string[];
  count?: number;
  types?: TestType[];
  model?: 'haiku' | 'sonnet';
  template_id?: string;
}

export interface RunTestsRequest {
  case_ids?: string[];
  triggered_by?: TriggerType;
  trigger_context?: Record<string, unknown>;
}
