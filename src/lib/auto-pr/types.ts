/**
 * Seizn Auto-PR Fixer - Type Definitions
 *
 * B1: Auto-PR Fixer - Detects RAG quality issues and creates auto-fix PRs
 *
 * This module provides types for:
 * - Issue detection (hallucination, low-relevance, missing-context, etc.)
 * - Fix suggestion generation
 * - GitHub PR creation and management
 */

import type { StoredTrace, TraceConfig } from '@/lib/fall/flight-recorder';

// ============================================
// Issue Detection Types
// ============================================

/**
 * Types of RAG quality issues that can be detected
 */
export type IssueType =
  | 'hallucination'      // AI generated content not grounded in sources
  | 'low_relevance'      // Retrieved chunks have low relevance scores
  | 'missing_context'    // Important context missing from retrieval
  | 'chunk_boundary'     // Answer crosses chunk boundaries poorly
  | 'stale_content'      // Retrieved content is outdated
  | 'conflicting_sources' // Multiple sources contradict each other
  | 'incomplete_answer'  // Answer doesn't fully address the query
  | 'citation_mismatch'  // Citations don't match source content
  | 'embedding_drift'    // Embedding model output has drifted
  | 'index_degradation'; // Index quality has degraded over time

/**
 * Severity level of detected issues
 */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Evidence supporting a detected issue
 */
export interface IssueEvidence {
  /** Type of evidence */
  type: 'score' | 'text_analysis' | 'timing' | 'comparison' | 'pattern';
  /** Description of the evidence */
  description: string;
  /** Actual observed value */
  value: unknown;
  /** Expected or threshold value */
  expected?: unknown;
  /** Confidence in this piece of evidence (0-1) */
  confidence: number;
  /** Path or location of the evidence */
  source?: string;
}

/**
 * A detected RAG quality issue
 */
export interface IssueDetection {
  /** Unique issue ID */
  id: string;
  /** Type of issue detected */
  type: IssueType;
  /** Severity level */
  severity: IssueSeverity;
  /** Human-readable title */
  title: string;
  /** Detailed description of the issue */
  description: string;
  /** Evidence supporting the detection */
  evidence: IssueEvidence[];
  /** Confidence score (0-1) */
  confidence: number;
  /** Affected components */
  affectedComponents: string[];
  /** Trace ID where issue was detected */
  traceId: string;
  /** When the issue was detected */
  detectedAt: string;
  /** Query that triggered the issue */
  query?: string;
  /** Collection ID affected */
  collectionId?: string;
  /** Related issues */
  relatedIssueIds?: string[];
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for issue detection
 */
export interface DetectionConfig {
  /** Enable hallucination detection */
  detectHallucination: boolean;
  /** Minimum relevance score threshold */
  minRelevanceScore: number;
  /** Enable missing context detection */
  detectMissingContext: boolean;
  /** Enable chunk boundary issue detection */
  detectChunkBoundary: boolean;
  /** Stale content threshold (days) */
  staleContentDays: number;
  /** Minimum confidence to report issue */
  minConfidenceThreshold: number;
  /** Custom detection rules */
  customRules?: DetectionRule[];
}

/**
 * Custom detection rule
 */
export interface DetectionRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Issue type to create */
  issueType: IssueType;
  /** Severity if matched */
  severity: IssueSeverity;
  /** Field to check (dot notation) */
  field: string;
  /** Comparison operator */
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'matches';
  /** Value to compare */
  value: unknown;
  /** Description template */
  descriptionTemplate: string;
  /** Priority (higher = checked first) */
  priority: number;
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  detectHallucination: true,
  minRelevanceScore: 0.6,
  detectMissingContext: true,
  detectChunkBoundary: true,
  staleContentDays: 90,
  minConfidenceThreshold: 0.7,
};

// ============================================
// Fix Suggestion Types
// ============================================

/**
 * Types of fixes that can be suggested
 */
export type FixType =
  | 'chunking_strategy'     // Change chunking parameters
  | 'metadata_enrichment'   // Add metadata fields
  | 'prompt_tuning'         // Modify prompt templates
  | 'reindex'               // Trigger reindexing
  | 'embedding_update'      // Update embedding model/config
  | 'retrieval_config'      // Adjust retrieval parameters
  | 'answer_contract'       // Update answer contracts
  | 'cache_invalidation'    // Invalidate problematic cache entries
  | 'source_update'         // Update source documents
  | 'model_switch';         // Switch to different model

/**
 * Implementation effort estimate
 */
export type EffortLevel = 'trivial' | 'small' | 'medium' | 'large';

/**
 * Risk level of applying a fix
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * A specific code change for a fix
 */
export interface CodePatch {
  /** File path relative to repository root */
  filePath: string;
  /** Type of change */
  action: 'create' | 'modify' | 'delete';
  /** Original content (for modify) */
  originalContent?: string;
  /** New content */
  newContent: string;
  /** Unified diff patch */
  patch?: string;
  /** Line range affected */
  lineRange?: { start: number; end: number };
  /** Description of the change */
  description: string;
}

/**
 * A configuration change for a fix
 */
export interface ConfigPatch {
  /** Configuration key (dot notation) */
  key: string;
  /** Current value */
  currentValue: unknown;
  /** New value */
  newValue: unknown;
  /** Scope of the change */
  scope: 'global' | 'project' | 'collection' | 'user';
  /** Description of the change */
  description: string;
  /** Whether this requires restart */
  requiresRestart?: boolean;
}

/**
 * Impact assessment for a fix
 */
export interface FixImpact {
  /** Areas affected by the fix */
  affectedAreas: string[];
  /** Risk level */
  risk: RiskLevel;
  /** Expected improvement description */
  expectedImprovement: string;
  /** Potential side effects */
  sideEffects: string[];
  /** Estimated latency change (positive = slower) */
  latencyImpactMs?: number;
  /** Estimated cost change (positive = more expensive) */
  costImpactPercent?: number;
}

/**
 * A suggested fix for a detected issue
 */
export interface FixSuggestion {
  /** Unique suggestion ID */
  id: string;
  /** Related issue ID */
  issueId: string;
  /** Type of fix */
  type: FixType;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** Rationale for this fix */
  rationale: string;
  /** Confidence that this will resolve the issue (0-1) */
  confidence: number;
  /** Implementation effort */
  effort: EffortLevel;
  /** Impact assessment */
  impact: FixImpact;
  /** Code changes */
  codePatches?: CodePatch[];
  /** Configuration changes */
  configPatches?: ConfigPatch[];
  /** Whether this requires human review */
  requiresReview: boolean;
  /** Whether this can be auto-merged */
  autoMergeable: boolean;
  /** Order in which to apply (lower = first) */
  order: number;
  /** Prerequisites (other suggestion IDs) */
  prerequisites?: string[];
  /** Documentation URL */
  docsUrl?: string;
  /** Estimated time to implement */
  estimatedTimeMinutes?: number;
}

// ============================================
// GitHub PR Types
// ============================================

/**
 * GitHub repository information
 */
export interface GitHubRepo {
  /** Repository owner (user or org) */
  owner: string;
  /** Repository name */
  name: string;
  /** Full repository name (owner/name) */
  fullName: string;
  /** Default branch */
  defaultBranch: string;
}

/**
 * Configuration for PR creation
 */
export interface PRConfig {
  /** Target repository */
  repo: GitHubRepo;
  /** Base branch for PR */
  baseBranch: string;
  /** Branch prefix for auto-fix branches */
  branchPrefix: string;
  /** Default reviewers */
  reviewers: string[];
  /** Labels to add */
  labels: string[];
  /** Create as draft */
  draft: boolean;
  /** Auto-merge when checks pass */
  autoMerge: boolean;
  /** Assignees */
  assignees?: string[];
  /** Milestone ID */
  milestoneId?: number;
  /** Project ID (for GitHub Projects) */
  projectId?: string;
}

/**
 * A file to include in the PR
 */
export interface PRFile {
  /** File path in the repository */
  path: string;
  /** File content */
  content: string;
  /** File mode (e.g., '100644') */
  mode: string;
  /** Change type */
  action: 'create' | 'modify' | 'delete';
}

/**
 * PR creation request
 */
export interface CreatePRRequest {
  /** PR title */
  title: string;
  /** PR body (markdown) */
  body: string;
  /** Head branch name */
  headBranch: string;
  /** Base branch name */
  baseBranch: string;
  /** Files to include */
  files: PRFile[];
  /** Reviewers to request */
  reviewers?: string[];
  /** Labels to add */
  labels?: string[];
  /** Create as draft */
  draft?: boolean;
  /** Commit message */
  commitMessage: string;
  /** Metadata */
  metadata: PRMetadata;
}

/**
 * PR metadata for tracking
 */
export interface PRMetadata {
  /** Auto-PR version */
  version: string;
  /** Issues being fixed */
  issueIds: string[];
  /** Suggestions being applied */
  suggestionIds: string[];
  /** Trace ID that triggered this */
  traceId: string;
  /** User ID */
  userId: string;
  /** Created timestamp */
  createdAt: string;
  /** Total confidence score */
  confidence: number;
  /** Summary */
  summary: {
    totalIssues: number;
    totalFixes: number;
    codeChanges: number;
    configChanges: number;
  };
}

/**
 * PR status
 */
export type PRStatus =
  | 'pending'           // Waiting to be created
  | 'creating'          // Being created
  | 'created'           // PR created successfully
  | 'review_requested'  // Review requested
  | 'changes_requested' // Changes requested by reviewer
  | 'approved'          // Approved by reviewer
  | 'merged'            // Merged
  | 'closed'            // Closed without merging
  | 'failed';           // Failed to create

/**
 * PR status event
 */
export interface PRStatusEvent {
  /** Status */
  status: PRStatus;
  /** Timestamp */
  timestamp: string;
  /** Actor (GitHub username or 'auto-pr') */
  actor: string;
  /** Details */
  message?: string;
}

/**
 * PR record for tracking
 */
export interface PRRecord {
  /** Internal ID */
  id: string;
  /** User ID */
  userId: string;
  /** GitHub PR number */
  prNumber?: number;
  /** GitHub PR URL */
  prUrl?: string;
  /** Current status */
  status: PRStatus;
  /** PR creation request */
  request: CreatePRRequest;
  /** Status history */
  history: PRStatusEvent[];
  /** GitHub API response */
  githubResponse?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
  /** Check runs status */
  checks?: {
    status: 'pending' | 'success' | 'failure';
    runs: Array<{
      name: string;
      status: string;
      conclusion?: string;
    }>;
  };
}

// ============================================
// Analysis Results
// ============================================

/**
 * Complete analysis result
 */
export interface AnalysisResult {
  /** Analysis ID */
  id: string;
  /** Trace being analyzed */
  traceId: string;
  /** User ID */
  userId: string;
  /** Collection ID */
  collectionId?: string;
  /** Detected issues */
  issues: IssueDetection[];
  /** Suggested fixes */
  suggestions: FixSuggestion[];
  /** Overall quality score (0-100) */
  qualityScore: number;
  /** Overall confidence in analysis */
  confidence: number;
  /** When the analysis was performed */
  analyzedAt: string;
  /** Analysis duration in ms */
  durationMs: number;
  /** Summary */
  summary: AnalysisSummary;
}

/**
 * Analysis summary
 */
export interface AnalysisSummary {
  /** Total issues found */
  totalIssues: number;
  /** Issues by severity */
  issuesBySeverity: Record<IssueSeverity, number>;
  /** Issues by type */
  issuesByType: Record<string, number>;
  /** Total suggestions */
  totalSuggestions: number;
  /** Auto-mergeable suggestions */
  autoMergeableSuggestions: number;
  /** Estimated fix time (minutes) */
  estimatedFixTime: number;
  /** Primary concern */
  primaryConcern?: string;
  /** Recommended priority fixes */
  priorityFixIds: string[];
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * Analysis request
 */
export interface AnalyzeRequest {
  /** Trace ID to analyze */
  traceId: string;
  /** Include related traces in analysis */
  includeRelated?: boolean;
  /** Force re-analysis even if cached */
  force?: boolean;
  /** Custom detection config */
  config?: Partial<DetectionConfig>;
}

/**
 * Analysis response
 */
export interface AnalyzeResponse {
  success: boolean;
  analysis: AnalysisResult;
  cached?: boolean;
}

/**
 * Suggest fixes request
 */
export interface SuggestRequest {
  /** Analysis ID or trace ID */
  analysisId?: string;
  traceId?: string;
  /** Issue IDs to generate fixes for */
  issueIds?: string[];
  /** Maximum suggestions per issue */
  maxSuggestionsPerIssue?: number;
  /** Only include auto-mergeable suggestions */
  autoMergeableOnly?: boolean;
}

/**
 * Suggest fixes response
 */
export interface SuggestResponse {
  success: boolean;
  suggestions: FixSuggestion[];
  analysisId: string;
}

/**
 * Create PR request
 */
export interface CreatePRApiRequest {
  /** Analysis ID */
  analysisId?: string;
  /** Trace ID */
  traceId?: string;
  /** Specific suggestion IDs to include */
  suggestionIds?: string[];
  /** Apply all high-confidence suggestions */
  applyAll?: boolean;
  /** Preview only (don't create PR) */
  preview?: boolean;
  /** PR configuration overrides */
  config?: Partial<PRConfig>;
}

/**
 * Create PR response
 */
export interface CreatePRResponse {
  success: boolean;
  prRecord?: PRRecord;
  previewOnly: boolean;
  appliedSuggestions: string[];
  /** Preview data (if preview mode) */
  preview?: {
    title: string;
    body: string;
    files: PRFile[];
  };
}

// ============================================
// Service Configuration
// ============================================

/**
 * Auto-PR service configuration
 */
export interface AutoPRServiceConfig {
  /** Enable automatic PR creation */
  enabled: boolean;
  /** GitHub App configuration */
  github: {
    /** GitHub App ID */
    appId: string;
    /** Installation ID for the repository */
    installationId: string;
    /** Private key (PEM format) */
    privateKey: string;
  };
  /** Default PR configuration */
  prDefaults: Partial<PRConfig>;
  /** Detection configuration */
  detection: Partial<DetectionConfig>;
  /** Minimum confidence to auto-create PR */
  minAutoCreateConfidence: number;
  /** Maximum PRs per day */
  maxPrsPerDay: number;
  /** Rate limit delay (ms) */
  rateLimitDelayMs: number;
  /** Notification webhooks */
  notifications?: {
    slack?: string;
    email?: string[];
  };
}

export const DEFAULT_SERVICE_CONFIG: Partial<AutoPRServiceConfig> = {
  enabled: false,
  minAutoCreateConfidence: 0.8,
  maxPrsPerDay: 5,
  rateLimitDelayMs: 1000,
  prDefaults: {
    draft: true,
    autoMerge: false,
    branchPrefix: 'auto-pr/fix-',
    labels: ['auto-pr', 'quality-fix'],
  },
};
