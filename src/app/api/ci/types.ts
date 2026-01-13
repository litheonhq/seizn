/**
 * Seizn CI API - Type Definitions
 *
 * Types for CI integration API endpoints.
 */

// ============================================
// Trace Types
// ============================================

export interface CITraceMetadata {
  traceId: string;
  runId: string;
  commitSha: string;
  branch: string;
  prNumber?: number;
  timestamp: string;
  provider: 'github' | 'gitlab' | 'circleci' | 'jenkins' | 'local';
  repository: {
    owner: string;
    name: string;
    url: string;
  };
}

export interface CITrace {
  id: string;
  parentTraceId?: string;
  spanId: string;
  operationName: string;
  service: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: 'ok' | 'error' | 'timeout' | 'pending';
  error?: string;
  tags: Record<string, string | number | boolean>;
  logs: CITraceLog[];
  io?: {
    input?: unknown;
    output?: unknown;
    expectedOutput?: unknown;
  };
}

export interface CITraceLog {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, unknown>;
}

export interface CITraceSummary {
  totalTraces: number;
  successCount: number;
  errorCount: number;
  timeoutCount: number;
  avgDurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  byService: Record<string, { count: number; avgMs: number }>;
  byOperation: Record<string, { count: number; avgMs: number }>;
}

export interface CITraceCollection {
  metadata: CITraceMetadata;
  traces: CITrace[];
  summary: CITraceSummary;
}

// ============================================
// Test Types
// ============================================

export interface GeneratedTest {
  id: string;
  sourceTraceId: string;
  name: string;
  description: string;
  type: 'unit' | 'integration' | 'e2e' | 'regression';
  category: 'api' | 'function' | 'component' | 'workflow';
  target: {
    service: string;
    operation: string;
    endpoint?: string;
  };
  testCase: {
    input: unknown;
    expectedOutput: unknown;
    assertions: TestAssertion[];
  };
  code: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  generatedAt: string;
}

export interface TestAssertion {
  type: 'equals' | 'contains' | 'matches' | 'truthy' | 'falsy' | 'throws' | 'resolves';
  path?: string;
  expected?: unknown;
  message?: string;
}

export interface TestGenerationSummary {
  totalTests: number;
  byType: Record<GeneratedTest['type'], number>;
  byCategory: Record<GeneratedTest['category'], number>;
  byPriority: Record<GeneratedTest['priority'], number>;
  avgConfidence: number;
  coverageEstimate: number;
}

// ============================================
// Report Types
// ============================================

export interface CIFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'performance' | 'error' | 'coverage' | 'quality' | 'security';
  title: string;
  description: string;
  relatedTraces: string[];
  suggestedFix?: string;
  docsUrl?: string;
}

export interface CIRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionItems: string[];
  estimatedImpact: string;
}

export interface CIReport {
  id: string;
  version: '1.0';
  metadata: CITraceMetadata;
  traceSummary: CITraceSummary;
  testSummary?: TestGenerationSummary;
  findings: CIFinding[];
  recommendations: CIRecommendation[];
  status: 'passed' | 'failed' | 'warning';
  generatedAt: string;
}

// ============================================
// API Request/Response Types
// ============================================

export interface UploadTracesRequest {
  traces: CITraceCollection;
  ciToken?: string;
}

export interface UploadTracesResponse {
  success: boolean;
  traceId: string;
  uploadedCount: number;
  url: string;
}

export interface GetTestsParams {
  traceId: string;
  types?: GeneratedTest['type'][];
  minConfidence?: number;
}

export interface GetTestsResponse {
  success: boolean;
  tests: GeneratedTest[];
  summary: TestGenerationSummary;
}

export interface CreateReportRequest {
  metadata: CITraceMetadata;
  traceSummary: CITraceSummary;
  testSummary?: TestGenerationSummary;
  findings: CIFinding[];
  recommendations: CIRecommendation[];
}

export interface CreateReportResponse {
  success: boolean;
  reportId: string;
  status: CIReport['status'];
  url: string;
}

// ============================================
// Database Types
// ============================================

export interface CITraceRecord {
  id: string;
  user_id: string;
  trace_id: string;
  run_id: string;
  commit_sha: string;
  branch: string;
  pr_number?: number;
  provider: string;
  repository_owner: string;
  repository_name: string;
  traces_data: CITrace[];
  summary: CITraceSummary;
  created_at: string;
}

export interface CIReportRecord {
  id: string;
  user_id: string;
  trace_record_id?: string;
  metadata: CITraceMetadata;
  trace_summary: CITraceSummary;
  test_summary?: TestGenerationSummary;
  findings: CIFinding[];
  recommendations: CIRecommendation[];
  status: 'passed' | 'failed' | 'warning';
  created_at: string;
}
