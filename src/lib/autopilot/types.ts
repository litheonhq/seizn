/**
 * Seizn Autopilot PR Bot - Types
 *
 * Type definitions for the Autopilot system that:
 * - Detects failures in traces
 * - Generates fix suggestions
 * - Creates auto-fix PRs
 */

import type { StoredTrace, TraceConfig } from '@/lib/fall/flight-recorder';

// ============================================
// Configuration
// ============================================

export interface AutopilotConfig {
  /** Enable automatic PR creation */
  enabled: boolean;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Base branch for PRs (default: main) */
  baseBranch: string;
  /** Branch prefix for auto-fix branches */
  branchPrefix: string;
  /** Default reviewers for PRs */
  defaultReviewers: string[];
  /** Labels to add to PRs */
  labels: string[];
  /** Auto-merge when checks pass */
  autoMerge: boolean;
  /** Minimum confidence score to create PR (0-1) */
  minConfidence: number;
  /** Maximum PRs to create per day */
  maxPrsPerDay: number;
  /** Patterns to exclude from fixes */
  excludePatterns: string[];
  /** Notification settings */
  notifications: {
    slack?: {
      webhookUrl: string;
      channel: string;
    };
    email?: string[];
  };
}

export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  enabled: false,
  owner: '',
  repo: '',
  baseBranch: 'main',
  branchPrefix: 'autopilot/fix-',
  defaultReviewers: [],
  labels: ['autopilot', 'auto-fix'],
  autoMerge: false,
  minConfidence: 0.8,
  maxPrsPerDay: 5,
  excludePatterns: ['*.test.ts', '*.spec.ts', 'node_modules/**'],
  notifications: {},
};

// ============================================
// Failure Analysis
// ============================================

export type FailureType =
  | 'error' // Runtime error
  | 'timeout' // Latency budget exceeded
  | 'low_quality' // Poor search results
  | 'contract_violation' // Answer contract failed
  | 'rate_limit' // Rate limit hit
  | 'embedding_failure' // Embedding generation failed
  | 'rerank_failure' // Reranking failed
  | 'llm_failure' // LLM call failed
  | 'config_drift'; // Config diverged from expected

export interface FailurePattern {
  /** Unique pattern ID */
  id: string;
  /** Type of failure */
  type: FailureType;
  /** Pattern name */
  name: string;
  /** Description of the pattern */
  description: string;
  /** Regex or exact match for error messages */
  errorPattern?: RegExp | string;
  /** Conditions that trigger this pattern */
  conditions: FailureCondition[];
  /** Suggested fix strategy */
  fixStrategy: FixStrategy;
  /** Priority (higher = more urgent) */
  priority: number;
}

export interface FailureCondition {
  /** Field path in trace (dot notation) */
  field: string;
  /** Comparison operator */
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'matches';
  /** Value to compare against */
  value: unknown;
}

export type FixStrategy =
  | 'config_update' // Update configuration
  | 'code_patch' // Patch source code
  | 'retry_logic' // Add retry logic
  | 'fallback' // Add fallback mechanism
  | 'rate_limit_backoff' // Implement backoff
  | 'cache_optimization' // Optimize caching
  | 'model_switch' // Switch to different model
  | 'manual_review'; // Requires human review

// ============================================
// Analysis Results
// ============================================

export interface TraceAnalysis {
  /** Trace being analyzed */
  traceId: string;
  /** User who owns the trace */
  userId: string;
  /** Timestamp of analysis */
  analyzedAt: string;
  /** Detected failures */
  failures: DetectedFailure[];
  /** Suggested fixes */
  suggestions: FixSuggestion[];
  /** Overall severity (1-10) */
  severity: number;
  /** Confidence in analysis (0-1) */
  confidence: number;
  /** Related traces with similar issues */
  relatedTraces?: string[];
  /** Root cause analysis */
  rootCause?: RootCauseAnalysis;
}

export interface DetectedFailure {
  /** Unique failure ID */
  id: string;
  /** Pattern that matched */
  patternId: string;
  /** Type of failure */
  type: FailureType;
  /** Human-readable message */
  message: string;
  /** Severity (1-10) */
  severity: number;
  /** Evidence from trace */
  evidence: FailureEvidence[];
  /** When the failure occurred */
  occurredAt: string;
  /** Affected spans */
  affectedSpans?: string[];
}

export interface FailureEvidence {
  /** Type of evidence */
  type: 'log' | 'metric' | 'span' | 'event' | 'config';
  /** Path to the evidence */
  path: string;
  /** Actual value */
  value: unknown;
  /** Expected value (if applicable) */
  expected?: unknown;
  /** Description */
  description: string;
}

export interface RootCauseAnalysis {
  /** Primary root cause */
  primary: string;
  /** Contributing factors */
  factors: string[];
  /** Confidence in analysis */
  confidence: number;
  /** Recommended investigation steps */
  investigationSteps: string[];
}

// ============================================
// Fix Suggestions
// ============================================

export interface FixSuggestion {
  /** Unique suggestion ID */
  id: string;
  /** Related failure ID */
  failureId: string;
  /** Type of fix */
  type: FixType;
  /** Strategy to apply */
  strategy: FixStrategy;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** Confidence in the fix (0-1) */
  confidence: number;
  /** Impact assessment */
  impact: FixImpact;
  /** Code changes (if applicable) */
  codeChanges?: CodeChange[];
  /** Config changes (if applicable) */
  configChanges?: ConfigChange[];
  /** Estimated implementation effort */
  effort: 'trivial' | 'small' | 'medium' | 'large';
  /** Requires human review */
  requiresReview: boolean;
  /** Related documentation */
  docsUrl?: string;
}

export type FixType =
  | 'code' // Source code change
  | 'config' // Configuration change
  | 'infrastructure' // Infrastructure change
  | 'process'; // Process/workflow change

export interface FixImpact {
  /** Affected areas */
  areas: string[];
  /** Risk level */
  risk: 'low' | 'medium' | 'high';
  /** Expected improvement */
  improvement: string;
  /** Potential side effects */
  sideEffects: string[];
}

export interface CodeChange {
  /** File path */
  filePath: string;
  /** Change type */
  changeType: 'create' | 'modify' | 'delete';
  /** Original content (for modify) */
  originalContent?: string;
  /** New content */
  newContent: string;
  /** Diff patch (unified format) */
  patch?: string;
  /** Line range affected */
  lineRange?: { start: number; end: number };
  /** Description of change */
  description: string;
}

export interface ConfigChange {
  /** Config key (dot notation) */
  key: string;
  /** Current value */
  currentValue: unknown;
  /** New value */
  newValue: unknown;
  /** Scope of change */
  scope: 'global' | 'project' | 'collection' | 'request';
  /** Description */
  description: string;
}

// ============================================
// PR Context
// ============================================

export interface PRContext {
  /** PR title */
  title: string;
  /** PR body (markdown) */
  body: string;
  /** Source branch */
  headBranch: string;
  /** Target branch */
  baseBranch: string;
  /** Files to change */
  files: PRFile[];
  /** Reviewers to assign */
  reviewers: string[];
  /** Labels to add */
  labels: string[];
  /** Draft PR */
  draft: boolean;
  /** Associated analysis */
  analysis: TraceAnalysis;
  /** Associated suggestions */
  suggestions: FixSuggestion[];
  /** Metadata */
  metadata: PRMetadata;
}

export interface PRFile {
  /** File path */
  path: string;
  /** File content */
  content: string;
  /** Change type */
  changeType: 'create' | 'modify' | 'delete';
  /** Mode (e.g., '100644') */
  mode?: string;
}

export interface PRMetadata {
  /** Trace ID that triggered the PR */
  traceId: string;
  /** User ID */
  userId: string;
  /** Target repository in "owner/repo" format (used for webhook reconciliation) */
  repoFullName?: string;
  /** Autopilot version */
  autopilotVersion: string;
  /** Timestamp */
  createdAt: string;
  /** Total confidence score */
  confidence: number;
  /** Fix summary */
  fixSummary: {
    totalFixes: number;
    codeChanges: number;
    configChanges: number;
  };
}

// ============================================
// PR Status
// ============================================

export type PRStatus =
  | 'pending' // Waiting to be created
  | 'created' // PR created
  | 'review_requested' // Review requested
  | 'changes_requested' // Changes requested
  | 'approved' // Approved
  | 'merged' // Merged
  | 'closed' // Closed without merge
  | 'failed'; // Failed to create

export interface PRRecord {
  /** Internal ID */
  id: string;
  /** GitHub PR number */
  prNumber?: number;
  /** GitHub PR URL */
  prUrl?: string;
  /** Current status */
  status: PRStatus;
  /** PR context */
  context: PRContext;
  /** Status history */
  history: PRStatusEvent[];
  /** GitHub API response */
  githubResponse?: Record<string, unknown>;
  /** Error message (if failed) */
  error?: string;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
}

export interface PRStatusEvent {
  /** Status */
  status: PRStatus;
  /** Timestamp */
  timestamp: string;
  /** Actor (GitHub username or 'autopilot') */
  actor: string;
  /** Additional details */
  details?: string;
}

// ============================================
// Webhook Events
// ============================================

export type GitHubWebhookEvent =
  | 'push'
  | 'pull_request'
  | 'pull_request_review'
  | 'check_suite'
  | 'check_run'
  | 'workflow_run'
  | 'issue_comment';

export interface WebhookPayload {
  /** Event type */
  event: GitHubWebhookEvent;
  /** Delivery ID */
  deliveryId: string;
  /** Repository info */
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
  /** Raw payload */
  payload: Record<string, unknown>;
  /** Signature valid */
  signatureValid: boolean;
  /** Timestamp */
  receivedAt: string;
}

// ============================================
// API Request/Response Types
// ============================================

export interface AnalyzeRequest {
  /** Trace ID to analyze */
  traceId: string;
  /** Include related traces */
  includeRelated?: boolean;
  /** Force re-analysis */
  force?: boolean;
}

export interface AnalyzeResponse {
  success: boolean;
  analysis: TraceAnalysis;
}

export interface FixRequest {
  /** Analysis ID or trace ID */
  analysisId?: string;
  traceId?: string;
  /** Specific suggestion IDs to apply */
  suggestionIds?: string[];
  /** Apply all suggestions */
  applyAll?: boolean;
  /** Preview only (don't create PR) */
  preview?: boolean;
}

export interface FixResponse {
  success: boolean;
  prContext?: PRContext;
  previewOnly: boolean;
  appliedSuggestions: string[];
}

export interface CreatePRRequest {
  /** PR context from fix step */
  context: PRContext;
  /** Override reviewers */
  reviewers?: string[];
  /** Override labels */
  labels?: string[];
  /** Create as draft */
  draft?: boolean;
}

export interface CreatePRResponse {
  success: boolean;
  prRecord: PRRecord;
}

export interface PRStatusResponse {
  success: boolean;
  prRecord: PRRecord;
  checks?: {
    status: 'pending' | 'success' | 'failure';
    runs: Array<{
      name: string;
      status: string;
      conclusion?: string;
    }>;
  };
}
