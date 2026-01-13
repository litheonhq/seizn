/**
 * Seizn CI Integration - Type Definitions
 *
 * Shared types for CI trace collection, test generation, and reporting.
 */

// ============================================
// Trace Types
// ============================================

export interface CITraceMetadata {
  /** Unique trace ID */
  traceId: string;
  /** CI run ID (e.g., GitHub Actions run ID) */
  runId: string;
  /** Commit SHA */
  commitSha: string;
  /** Branch name */
  branch: string;
  /** PR number if applicable */
  prNumber?: number;
  /** Timestamp */
  timestamp: string;
  /** CI provider */
  provider: 'github' | 'gitlab' | 'circleci' | 'jenkins' | 'local';
  /** Repository info */
  repository: {
    owner: string;
    name: string;
    url: string;
  };
}

export interface CITrace {
  /** Unique ID */
  id: string;
  /** Parent trace ID */
  parentTraceId?: string;
  /** Span ID */
  spanId: string;
  /** Operation name */
  operationName: string;
  /** Service name */
  service: string;
  /** Start time ISO */
  startTime: string;
  /** End time ISO */
  endTime?: string;
  /** Duration in ms */
  durationMs?: number;
  /** Status */
  status: 'ok' | 'error' | 'timeout' | 'pending';
  /** Error message if failed */
  error?: string;
  /** Tags */
  tags: Record<string, string | number | boolean>;
  /** Logs */
  logs: CITraceLog[];
  /** Input/output data for test generation */
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

export interface CITraceCollection {
  metadata: CITraceMetadata;
  traces: CITrace[];
  summary: CITraceSummary;
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

// ============================================
// Test Generation Types
// ============================================

export interface GeneratedTest {
  /** Unique test ID */
  id: string;
  /** Source trace ID */
  sourceTraceId: string;
  /** Test name */
  name: string;
  /** Test description */
  description: string;
  /** Test type */
  type: 'unit' | 'integration' | 'e2e' | 'regression';
  /** Test category */
  category: 'api' | 'function' | 'component' | 'workflow';
  /** Target being tested */
  target: {
    service: string;
    operation: string;
    endpoint?: string;
  };
  /** Test case */
  testCase: {
    input: unknown;
    expectedOutput: unknown;
    assertions: TestAssertion[];
  };
  /** Generated code */
  code: string;
  /** Priority */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Confidence score (0-1) */
  confidence: number;
  /** Generation timestamp */
  generatedAt: string;
}

export interface TestAssertion {
  type: 'equals' | 'contains' | 'matches' | 'truthy' | 'falsy' | 'throws' | 'resolves';
  path?: string;
  expected?: unknown;
  message?: string;
}

export interface TestGenerationResult {
  metadata: CITraceMetadata;
  tests: GeneratedTest[];
  summary: TestGenerationSummary;
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

export interface CIReport {
  /** Report ID */
  id: string;
  /** Report version */
  version: '1.0';
  /** CI metadata */
  metadata: CITraceMetadata;
  /** Trace summary */
  traceSummary: CITraceSummary;
  /** Test generation summary */
  testSummary?: TestGenerationSummary;
  /** Findings */
  findings: CIFinding[];
  /** Recommendations */
  recommendations: CIRecommendation[];
  /** Overall status */
  status: 'passed' | 'failed' | 'warning';
  /** Report generation timestamp */
  generatedAt: string;
}

export interface CIFinding {
  /** Finding ID */
  id: string;
  /** Severity */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Category */
  category: 'performance' | 'error' | 'coverage' | 'quality' | 'security';
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Related trace IDs */
  relatedTraces: string[];
  /** Suggested fix */
  suggestedFix?: string;
  /** Documentation link */
  docsUrl?: string;
}

export interface CIRecommendation {
  /** Recommendation ID */
  id: string;
  /** Priority */
  priority: 'high' | 'medium' | 'low';
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Action items */
  actionItems: string[];
  /** Estimated impact */
  estimatedImpact: string;
}

// ============================================
// CLI Types
// ============================================

export interface TraceCollectorOptions {
  output: string;
  format: 'json' | 'jsonl';
  maxTraces?: number;
  timeout?: number;
  filter?: {
    services?: string[];
    operations?: string[];
    minDurationMs?: number;
  };
}

export interface TestGeneratorOptions {
  input: string;
  output: string;
  traceId?: string;
  types?: GeneratedTest['type'][];
  minConfidence?: number;
  maxTests?: number;
}

export interface ReportFormatterOptions {
  traces: string;
  tests: string;
  output?: string;
  format: 'github' | 'markdown' | 'json' | 'html';
  upload?: boolean;
  prNumber?: number;
  commitSha?: string;
}

// ============================================
// API Types
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

export interface GetTestsRequest {
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
