/**
 * Seizn Auto-PR Fixer - Public API
 *
 * B1: Auto-PR Fixer - Detects RAG quality issues and creates auto-fix PRs
 *
 * This module provides:
 * - Issue detection (hallucination, low-relevance, missing-context, etc.)
 * - Fix suggestion generation
 * - GitHub PR creation and management
 * - Complete auto-fix workflow orchestration
 */

import { randomUUID } from 'crypto';
import type { StoredTrace } from '@/lib/fall/flight-recorder';
import { IssueDetector, createIssueDetector, getIssueDetector } from './detector';
import { FixGenerator, createFixGenerator, getFixGenerator } from './fixer';
import {
  GitHubPRClient,
  createGitHubClient,
  createGitHubClientFromEnv,
  getGitHubClient,
} from './github-client';
import {
  PRTemplates,
  generatePRTitle,
  generateBranchName,
  generateCommitMessage,
  generatePRBody,
} from './templates';
import type {
  IssueDetection,
  FixSuggestion,
  AnalysisResult,
  AnalysisSummary,
  DetectionConfig,
  PRConfig,
  PRFile,
  CreatePRRequest,
  PRRecord,
  PRMetadata,
  AutoPRServiceConfig,
  GitHubRepo,
  DEFAULT_DETECTION_CONFIG,
  DEFAULT_SERVICE_CONFIG,
} from './types';

// ============================================
// Re-export Types
// ============================================

export type {
  // Issue Detection Types
  IssueDetection,
  IssueType,
  IssueSeverity,
  IssueEvidence,
  DetectionConfig,
  DetectionRule,

  // Fix Suggestion Types
  FixSuggestion,
  FixType,
  EffortLevel,
  RiskLevel,
  CodePatch,
  ConfigPatch,
  FixImpact,

  // GitHub Types
  GitHubRepo,
  PRConfig,
  PRFile,
  CreatePRRequest,
  PRRecord,
  PRStatus,
  PRStatusEvent,
  PRMetadata,

  // Analysis Types
  AnalysisResult,
  AnalysisSummary,

  // API Types
  AnalyzeRequest,
  AnalyzeResponse,
  SuggestRequest,
  SuggestResponse,
  CreatePRApiRequest,
  CreatePRResponse,

  // Service Config
  AutoPRServiceConfig,
} from './types';

export { DEFAULT_DETECTION_CONFIG, DEFAULT_SERVICE_CONFIG } from './types';

// ============================================
// Re-export Classes and Functions
// ============================================

export {
  // Detector
  IssueDetector,
  createIssueDetector,
  getIssueDetector,

  // Fix Generator
  FixGenerator,
  createFixGenerator,
  getFixGenerator,

  // GitHub Client
  GitHubPRClient,
  createGitHubClient,
  createGitHubClientFromEnv,
  getGitHubClient,

  // Templates
  PRTemplates,
  generatePRTitle,
  generateBranchName,
  generateCommitMessage,
  generatePRBody,
};

// ============================================
// Auto-PR Service Class
// ============================================

/**
 * Main service class that orchestrates the Auto-PR workflow
 */
export class AutoPRService {
  private detector: IssueDetector;
  private fixer: FixGenerator;
  private githubClient: GitHubPRClient | null = null;
  private config: AutoPRServiceConfig;

  constructor(config: Partial<AutoPRServiceConfig> = {}) {
    this.config = {
      enabled: false,
      github: {
        appId: process.env.GITHUB_APP_ID || '',
        installationId: process.env.GITHUB_APP_INSTALLATION_ID || '',
        privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
      },
      prDefaults: {},
      detection: {},
      minAutoCreateConfidence: 0.8,
      maxPrsPerDay: 5,
      rateLimitDelayMs: 1000,
      ...config,
    };

    this.detector = createIssueDetector(this.config.detection);
    this.fixer = createFixGenerator();

    // Initialize GitHub client if credentials are available
    if (
      this.config.github.appId &&
      this.config.github.privateKey &&
      this.config.github.installationId
    ) {
      this.githubClient = createGitHubClient({
        appId: this.config.github.appId,
        privateKey: this.config.github.privateKey,
        installationId: parseInt(this.config.github.installationId, 10),
      });
    }
  }

  /**
   * Analyze a trace for quality issues
   */
  async analyze(trace: StoredTrace): Promise<AnalysisResult> {
    const startTime = Date.now();

    // Detect issues
    const issues = await this.detector.detect(trace);

    // Generate suggestions
    const suggestions = await this.fixer.generateSuggestions(issues, trace);

    // Calculate quality score
    const qualityScore = this.detector.calculateQualityScore(trace, issues);

    // Calculate overall confidence
    const confidence = issues.length > 0
      ? issues.reduce((sum, i) => sum + i.confidence, 0) / issues.length
      : 1.0;

    // Build summary
    const summary = this.buildSummary(issues, suggestions);

    return {
      id: `analysis-${randomUUID().slice(0, 8)}`,
      traceId: trace.id,
      userId: trace.userId,
      collectionId: trace.collectionId,
      issues,
      suggestions,
      qualityScore,
      confidence,
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      summary,
    };
  }

  /**
   * Generate fix suggestions for specific issues
   */
  async suggestFixes(
    issues: IssueDetection[],
    trace: StoredTrace,
    options?: {
      maxSuggestionsPerIssue?: number;
      autoMergeableOnly?: boolean;
    }
  ): Promise<FixSuggestion[]> {
    return this.fixer.generateSuggestions(issues, trace, options);
  }

  /**
   * Create a PR with the suggested fixes
   */
  async createPR(
    analysis: AnalysisResult,
    suggestions: FixSuggestion[],
    repoConfig: PRConfig
  ): Promise<PRRecord> {
    if (!this.githubClient) {
      throw new Error('GitHub client not configured');
    }

    // Validate suggestions
    const validation = this.fixer.validateSuggestions(suggestions);
    if (!validation.valid) {
      throw new Error(`Invalid suggestions: ${validation.errors.join(', ')}`);
    }

    // Build PR files from suggestions
    const files: PRFile[] = [];
    for (const suggestion of suggestions) {
      for (const patch of suggestion.codePatches || []) {
        files.push({
          path: patch.filePath,
          content: patch.newContent,
          mode: '100644',
          action: patch.action,
        });
      }
    }

    // Generate PR metadata
    const metadata: PRMetadata = {
      version: '1.0.0',
      issueIds: analysis.issues.map(i => i.id),
      suggestionIds: suggestions.map(s => s.id),
      traceId: analysis.traceId,
      userId: analysis.userId,
      createdAt: new Date().toISOString(),
      confidence: analysis.confidence,
      summary: {
        totalIssues: analysis.issues.length,
        totalFixes: suggestions.length,
        codeChanges: suggestions.reduce((sum, s) => sum + (s.codePatches?.length || 0), 0),
        configChanges: suggestions.reduce((sum, s) => sum + (s.configPatches?.length || 0), 0),
      },
    };

    // Generate PR content
    const title = generatePRTitle(suggestions);
    const body = generatePRBody(analysis.issues, suggestions, metadata);
    const branchName = generateBranchName(
      repoConfig.branchPrefix,
      suggestions
    );
    const commitMessage = generateCommitMessage(suggestions);

    // Create PR request
    const request: CreatePRRequest = {
      title,
      body,
      headBranch: branchName,
      baseBranch: repoConfig.baseBranch,
      files,
      reviewers: repoConfig.reviewers,
      labels: repoConfig.labels,
      draft: repoConfig.draft,
      commitMessage,
      metadata,
    };

    // Initialize client and create PR
    await this.githubClient.initialize();
    return this.githubClient.createPullRequest(repoConfig.repo, request);
  }

  /**
   * Full workflow: analyze -> suggest -> create PR
   */
  async autoFix(
    trace: StoredTrace,
    repoConfig: PRConfig,
    options?: {
      autoMergeableOnly?: boolean;
      minConfidence?: number;
      preview?: boolean;
    }
  ): Promise<{
    analysis: AnalysisResult;
    suggestions: FixSuggestion[];
    prRecord?: PRRecord;
    preview?: {
      title: string;
      body: string;
      files: PRFile[];
    };
  }> {
    // Step 1: Analyze
    const analysis = await this.analyze(trace);

    // Step 2: Filter and generate suggestions
    const minConfidence = options?.minConfidence || this.config.minAutoCreateConfidence;
    const filteredIssues = analysis.issues.filter(i => i.confidence >= minConfidence);

    const suggestions = await this.suggestFixes(filteredIssues, trace, {
      autoMergeableOnly: options?.autoMergeableOnly,
    });

    // If no suggestions, return early
    if (suggestions.length === 0) {
      return { analysis, suggestions };
    }

    // Step 3: Create PR (or preview)
    if (options?.preview) {
      const metadata: PRMetadata = {
        version: '1.0.0',
        issueIds: filteredIssues.map(i => i.id),
        suggestionIds: suggestions.map(s => s.id),
        traceId: trace.id,
        userId: trace.userId,
        createdAt: new Date().toISOString(),
        confidence: analysis.confidence,
        summary: {
          totalIssues: analysis.summary.totalIssues,
          totalFixes: analysis.summary.totalSuggestions,
          codeChanges: suggestions.filter(s => (s.codePatches?.length ?? 0) > 0).length,
          configChanges: suggestions.filter(s => (s.configPatches?.length ?? 0) > 0).length,
        },
      };

      const files: PRFile[] = suggestions.flatMap(s =>
        (s.codePatches || []).map(p => ({
          path: p.filePath,
          content: p.newContent,
          mode: '100644',
          action: p.action,
        }))
      );

      return {
        analysis,
        suggestions,
        preview: {
          title: generatePRTitle(suggestions),
          body: generatePRBody(filteredIssues, suggestions, metadata),
          files,
        },
      };
    }

    // Create actual PR
    const prRecord = await this.createPR(analysis, suggestions, repoConfig);

    return {
      analysis,
      suggestions,
      prRecord,
    };
  }

  /**
   * Build analysis summary
   */
  private buildSummary(
    issues: IssueDetection[],
    suggestions: FixSuggestion[]
  ): AnalysisSummary {
    const issuesBySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    const issuesByType: Record<string, number> = {};

    for (const issue of issues) {
      issuesBySeverity[issue.severity]++;
      issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
    }

    const autoMergeableSuggestions = suggestions.filter(s => s.autoMergeable).length;
    const estimatedFixTime = this.fixer.calculateTotalTime(suggestions);

    // Find primary concern (most severe or most frequent issue type)
    let primaryConcern: string | undefined;
    if (issuesBySeverity.critical > 0) {
      const criticalIssue = issues.find(i => i.severity === 'critical');
      primaryConcern = criticalIssue?.title;
    } else {
      const mostFrequent = Object.entries(issuesByType)
        .sort((a, b) => b[1] - a[1])[0];
      if (mostFrequent) {
        primaryConcern = `${mostFrequent[0]} issues (${mostFrequent[1]} found)`;
      }
    }

    // Priority fixes (auto-mergeable, low risk, high confidence)
    const priorityFixIds = suggestions
      .filter(s => s.autoMergeable && s.impact.risk === 'low' && s.confidence > 0.8)
      .map(s => s.id);

    return {
      totalIssues: issues.length,
      issuesBySeverity: issuesBySeverity as Record<AnalysisSummary['issuesBySeverity'] extends Record<infer K, number> ? K : never, number>,
      issuesByType,
      totalSuggestions: suggestions.length,
      autoMergeableSuggestions,
      estimatedFixTime,
      primaryConcern,
      priorityFixIds,
    };
  }

  /**
   * Update service configuration
   */
  updateConfig(config: Partial<AutoPRServiceConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.detection) {
      this.detector = createIssueDetector(config.detection);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AutoPRServiceConfig {
    return { ...this.config };
  }
}

// ============================================
// Factory Functions
// ============================================

let serviceInstance: AutoPRService | null = null;

/**
 * Get singleton service instance
 */
export function getAutoPRService(config?: Partial<AutoPRServiceConfig>): AutoPRService {
  if (!serviceInstance) {
    serviceInstance = new AutoPRService(config);
  }
  return serviceInstance;
}

/**
 * Create new service instance
 */
export function createAutoPRService(config?: Partial<AutoPRServiceConfig>): AutoPRService {
  return new AutoPRService(config);
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Quick analysis of a trace
 */
export async function analyzeTrace(
  trace: StoredTrace,
  config?: Partial<DetectionConfig>
): Promise<AnalysisResult> {
  const service = new AutoPRService({ detection: config });
  return service.analyze(trace);
}

/**
 * Quick fix generation for issues
 */
export async function generateFixes(
  issues: IssueDetection[],
  trace: StoredTrace
): Promise<FixSuggestion[]> {
  const fixer = createFixGenerator();
  return fixer.generateSuggestions(issues, trace);
}
