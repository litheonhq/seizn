/**
 * Seizn Autopilot PR Bot - Trace Analyzer
 *
 * Analyzes traces to detect failures and generate fix suggestions.
 */

import { randomUUID } from 'crypto';
import type { StoredTrace, Span, RetrievalEvent } from '@/lib/fall/flight-recorder';
import type {
  TraceAnalysis,
  DetectedFailure,
  FailurePattern,
  FailureType,
  FailureCondition,
  FailureEvidence,
  FixSuggestion,
  FixStrategy,
  RootCauseAnalysis,
  CodeChange,
  ConfigChange,
} from './types';

// ============================================
// Built-in Failure Patterns
// ============================================

const BUILT_IN_PATTERNS: FailurePattern[] = [
  {
    id: 'error-runtime',
    type: 'error',
    name: 'Runtime Error',
    description: 'A runtime error occurred during trace execution',
    conditions: [
      { field: 'error', operator: 'ne', value: null },
    ],
    fixStrategy: 'code_patch',
    priority: 10,
  },
  {
    id: 'timeout-latency',
    type: 'timeout',
    name: 'Latency Budget Exceeded',
    description: 'Request exceeded the latency budget',
    conditions: [
      { field: 'timingsMs.total', operator: 'gt', value: 5000 },
    ],
    fixStrategy: 'cache_optimization',
    priority: 8,
  },
  {
    id: 'low-quality-no-results',
    type: 'low_quality',
    name: 'No Results Returned',
    description: 'Search returned zero results',
    conditions: [
      { field: 'resultsCount', operator: 'eq', value: 0 },
    ],
    fixStrategy: 'config_update',
    priority: 7,
  },
  {
    id: 'low-quality-poor-scores',
    type: 'low_quality',
    name: 'Poor Result Quality',
    description: 'Search results have very low scores',
    conditions: [
      { field: 'trace.resultStats.scores.max', operator: 'lt', value: 0.5 },
    ],
    fixStrategy: 'config_update',
    priority: 6,
  },
  {
    id: 'contract-violation',
    type: 'contract_violation',
    name: 'Answer Contract Failed',
    description: 'Answer contract validation failed',
    conditions: [
      { field: 'trace.answerContract.passed', operator: 'eq', value: false },
    ],
    fixStrategy: 'code_patch',
    priority: 9,
  },
  {
    id: 'embedding-failure',
    type: 'embedding_failure',
    name: 'Embedding Generation Failed',
    description: 'Failed to generate embeddings for query',
    errorPattern: /embedding|embed|vector/i,
    conditions: [
      { field: 'error', operator: 'contains', value: 'embedding' },
    ],
    fixStrategy: 'retry_logic',
    priority: 8,
  },
  {
    id: 'rerank-failure',
    type: 'rerank_failure',
    name: 'Reranking Failed',
    description: 'Reranking step failed',
    errorPattern: /rerank|cohere/i,
    conditions: [
      { field: 'error', operator: 'contains', value: 'rerank' },
    ],
    fixStrategy: 'fallback',
    priority: 7,
  },
  {
    id: 'llm-failure',
    type: 'llm_failure',
    name: 'LLM Generation Failed',
    description: 'LLM call failed',
    errorPattern: /llm|openai|anthropic|model/i,
    conditions: [
      { field: 'error', operator: 'contains', value: 'llm' },
    ],
    fixStrategy: 'model_switch',
    priority: 8,
  },
  {
    id: 'rate-limit',
    type: 'rate_limit',
    name: 'Rate Limit Hit',
    description: 'External API rate limit was hit',
    errorPattern: /rate.?limit|429|too.?many/i,
    conditions: [
      { field: 'error', operator: 'matches', value: 'rate.?limit|429' },
    ],
    fixStrategy: 'rate_limit_backoff',
    priority: 6,
  },
];

// ============================================
// Analyzer Class
// ============================================

export class TraceAnalyzer {
  private patterns: FailurePattern[];
  private customPatterns: FailurePattern[];

  constructor(customPatterns: FailurePattern[] = []) {
    this.patterns = [...BUILT_IN_PATTERNS];
    this.customPatterns = customPatterns;
  }

  /**
   * Analyze a trace for failures
   */
  async analyze(trace: StoredTrace): Promise<TraceAnalysis> {
    const allPatterns = [...this.patterns, ...this.customPatterns];
    const detectedFailures: DetectedFailure[] = [];
    const suggestions: FixSuggestion[] = [];

    // Check each pattern against the trace
    for (const pattern of allPatterns) {
      const evidence = this.checkPattern(trace, pattern);
      if (evidence.length > 0) {
        const failure = this.createFailure(trace, pattern, evidence);
        detectedFailures.push(failure);

        // Generate fix suggestion for this failure
        const suggestion = this.generateSuggestion(trace, failure, pattern);
        if (suggestion) {
          suggestions.push(suggestion);
        }
      }
    }

    // Sort failures by severity
    detectedFailures.sort((a, b) => b.severity - a.severity);

    // Calculate overall severity
    const severity = detectedFailures.length > 0
      ? Math.max(...detectedFailures.map((f) => f.severity))
      : 0;

    // Calculate confidence based on evidence quality
    const confidence = this.calculateConfidence(detectedFailures);

    // Perform root cause analysis if failures found
    const rootCause = detectedFailures.length > 0
      ? this.analyzeRootCause(trace, detectedFailures)
      : undefined;

    return {
      traceId: trace.id,
      userId: trace.userId,
      analyzedAt: new Date().toISOString(),
      failures: detectedFailures,
      suggestions,
      severity,
      confidence,
      rootCause,
    };
  }

  /**
   * Check if a pattern matches the trace
   */
  private checkPattern(trace: StoredTrace, pattern: FailurePattern): FailureEvidence[] {
    const evidence: FailureEvidence[] = [];

    // Check error pattern regex
    if (pattern.errorPattern && trace.error) {
      const regex = typeof pattern.errorPattern === 'string'
        ? new RegExp(pattern.errorPattern, 'i')
        : pattern.errorPattern;

      if (regex.test(trace.error)) {
        evidence.push({
          type: 'log',
          path: 'error',
          value: trace.error,
          description: `Error matches pattern: ${pattern.errorPattern}`,
        });
      }
    }

    // Check conditions
    for (const condition of pattern.conditions) {
      const value = this.getFieldValue(trace, condition.field);
      const matches = this.evaluateCondition(value, condition);

      if (matches) {
        evidence.push({
          type: this.inferEvidenceType(condition.field),
          path: condition.field,
          value,
          expected: condition.value,
          description: `${condition.field} ${condition.operator} ${condition.value}`,
        });
      }
    }

    return evidence;
  }

  /**
   * Get nested field value from trace
   */
  private getFieldValue(trace: StoredTrace, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = trace;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(value: unknown, condition: FailureCondition): boolean {
    const { operator, value: expected } = condition;

    switch (operator) {
      case 'eq':
        return value === expected;
      case 'ne':
        return value !== expected;
      case 'gt':
        return typeof value === 'number' && value > (expected as number);
      case 'lt':
        return typeof value === 'number' && value < (expected as number);
      case 'gte':
        return typeof value === 'number' && value >= (expected as number);
      case 'lte':
        return typeof value === 'number' && value <= (expected as number);
      case 'contains':
        return typeof value === 'string' && value.toLowerCase().includes((expected as string).toLowerCase());
      case 'matches':
        return typeof value === 'string' && new RegExp(expected as string, 'i').test(value);
      default:
        return false;
    }
  }

  /**
   * Infer evidence type from field path
   */
  private inferEvidenceType(path: string): FailureEvidence['type'] {
    if (path.startsWith('trace.spans') || path.includes('Span')) return 'span';
    if (path.startsWith('trace.events')) return 'event';
    if (path.startsWith('effectiveConfig') || path.startsWith('trace.config')) return 'config';
    if (path.includes('timings') || path.includes('cost') || path.includes('Count')) return 'metric';
    return 'log';
  }

  /**
   * Create a detected failure from pattern match
   */
  private createFailure(
    trace: StoredTrace,
    pattern: FailurePattern,
    evidence: FailureEvidence[]
  ): DetectedFailure {
    // Extract affected spans
    const affectedSpans = trace.trace.spans
      .filter((span) => span.status === 'error')
      .map((span) => span.name);

    return {
      id: `failure-${randomUUID().slice(0, 8)}`,
      patternId: pattern.id,
      type: pattern.type,
      message: this.generateFailureMessage(pattern, evidence, trace),
      severity: pattern.priority,
      evidence,
      occurredAt: trace.createdAt,
      affectedSpans: affectedSpans.length > 0 ? affectedSpans : undefined,
    };
  }

  /**
   * Generate human-readable failure message
   */
  private generateFailureMessage(
    pattern: FailurePattern,
    evidence: FailureEvidence[],
    trace: StoredTrace
  ): string {
    const baseMessage = pattern.description;

    // Add context from evidence
    const details = evidence.map((e) => e.description).join('; ');

    // Add error message if present
    const errorContext = trace.error ? ` Error: ${trace.error.slice(0, 100)}` : '';

    return `${baseMessage}. ${details}${errorContext}`;
  }

  /**
   * Generate fix suggestion for a failure
   */
  private generateSuggestion(
    trace: StoredTrace,
    failure: DetectedFailure,
    pattern: FailurePattern
  ): FixSuggestion | null {
    const suggestionGenerators: Record<FixStrategy, () => FixSuggestion | null> = {
      config_update: () => this.suggestConfigUpdate(trace, failure),
      code_patch: () => this.suggestCodePatch(trace, failure),
      retry_logic: () => this.suggestRetryLogic(trace, failure),
      fallback: () => this.suggestFallback(trace, failure),
      rate_limit_backoff: () => this.suggestRateLimitBackoff(trace, failure),
      cache_optimization: () => this.suggestCacheOptimization(trace, failure),
      model_switch: () => this.suggestModelSwitch(trace, failure),
      manual_review: () => this.suggestManualReview(trace, failure),
    };

    const generator = suggestionGenerators[pattern.fixStrategy];
    return generator ? generator() : null;
  }

  /**
   * Suggest configuration update
   */
  private suggestConfigUpdate(trace: StoredTrace, failure: DetectedFailure): FixSuggestion {
    const configChanges: ConfigChange[] = [];

    // Analyze failure type and suggest config changes
    if (failure.type === 'low_quality') {
      if (trace.resultsCount === 0) {
        configChanges.push({
          key: 'topK',
          currentValue: trace.effectiveConfig.topK || 10,
          newValue: Math.min((trace.effectiveConfig.topK || 10) * 2, 50),
          scope: 'collection',
          description: 'Increase topK to retrieve more candidates',
        });
        configChanges.push({
          key: 'searchType',
          currentValue: trace.effectiveConfig.searchType || 'semantic',
          newValue: 'hybrid',
          scope: 'collection',
          description: 'Switch to hybrid search for better recall',
        });
      }
    }

    return {
      id: `suggestion-${randomUUID().slice(0, 8)}`,
      failureId: failure.id,
      type: 'config',
      strategy: 'config_update',
      title: 'Update search configuration',
      description: 'Adjust search parameters to improve results quality',
      confidence: 0.7,
      impact: {
        areas: ['search', 'retrieval'],
        risk: 'low',
        improvement: 'Better search recall and result quality',
        sideEffects: ['Slightly increased latency due to more candidates'],
      },
      configChanges,
      effort: 'trivial',
      requiresReview: false,
    };
  }

  /**
   * Suggest code patch
   */
  private suggestCodePatch(trace: StoredTrace, failure: DetectedFailure): FixSuggestion {
    const codeChanges: CodeChange[] = [];

    // Generate code patch based on failure type
    if (failure.type === 'error') {
      codeChanges.push({
        filePath: 'src/lib/summer/search/index.ts',
        changeType: 'modify',
        newContent: `// Add error handling for ${failure.message.slice(0, 50)}
try {
  // existing code
} catch (error) {
  console.error('Search error:', error);
  // Return fallback or rethrow with context
  throw new Error(\`Search failed: \${error.message}\`);
}`,
        description: 'Add error handling wrapper',
      });
    }

    if (failure.type === 'contract_violation') {
      codeChanges.push({
        filePath: 'src/lib/summer/answer-contract/verify.ts',
        changeType: 'modify',
        newContent: `// Add validation for contract check
if (!result.passed) {
  // Log failure for debugging
  console.warn('Contract violation:', result.checks.filter(c => !c.passed));

  // Attempt auto-correction
  const corrected = await attemptAutoCorrection(result);
  if (corrected.passed) {
    return corrected;
  }
}`,
        description: 'Add auto-correction for contract violations',
      });
    }

    return {
      id: `suggestion-${randomUUID().slice(0, 8)}`,
      failureId: failure.id,
      type: 'code',
      strategy: 'code_patch',
      title: 'Apply code fix',
      description: `Fix ${failure.type} by patching source code`,
      confidence: 0.6,
      impact: {
        areas: ['error handling', 'reliability'],
        risk: 'medium',
        improvement: 'Prevent similar failures in the future',
        sideEffects: ['Requires testing before deployment'],
      },
      codeChanges,
      effort: 'small',
      requiresReview: true,
    };
  }

  /**
   * Suggest retry logic
   */
  private suggestRetryLogic(trace: StoredTrace, failure: DetectedFailure): FixSuggestion {
    return {
      id: `suggestion-${randomUUID().slice(0, 8)}`,
      failureId: failure.id,
      type: 'code',
      strategy: 'retry_logic',
      title: 'Add retry logic',
      description: 'Implement exponential backoff retry for transient failures',
      confidence: 0.8,
      impact: {
        areas: ['reliability', 'resilience'],
        risk: 'low',
        improvement: 'Automatic recovery from transient failures',
        sideEffects: ['Slightly increased latency on retries'],
      },
      codeChanges: [{
        filePath: 'src/lib/utils/retry.ts',
        changeType: 'create',
        newContent: `/**
 * Retry utility with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 10000 } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}`,
        description: 'Create retry utility with exponential backoff',
      }],
      effort: 'small',
      requiresReview: false,
    };
  }

  /**
   * Suggest fallback mechanism
   */
  private suggestFallback(trace: StoredTrace, failure: DetectedFailure): FixSuggestion {
    return {
      id: `suggestion-${randomUUID().slice(0, 8)}`,
      failureId: failure.id,
      type: 'code',
      strategy: 'fallback',
      title: 'Add fallback mechanism',
      description: 'Implement fallback when primary service fails',
      confidence: 0.75,
      impact: {
        areas: ['availability', 'reliability'],
        risk: 'low',
        improvement: 'Graceful degradation on failures',
        sideEffects: ['Fallback results may have lower quality'],
      },
      codeChanges: [{
        filePath: 'src/lib/summer/rerank/index.ts',
        changeType: 'modify',
        newContent: `// Add fallback to BM25 when Cohere reranker fails
async function rerankWithFallback(query: string, docs: Doc[]): Promise<Doc[]> {
  try {
    return await cohereRerank(query, docs);
  } catch (error) {
    console.warn('Cohere rerank failed, falling back to BM25:', error);
    return bm25Rerank(query, docs);
  }
}`,
        description: 'Add fallback to local BM25 reranker',
      }],
      effort: 'small',
      requiresReview: true,
    };
  }

  /**
   * Suggest rate limit backoff
   */
  private suggestRateLimitBackoff(trace: StoredTrace, failure: DetectedFailure): FixSuggestion {
    return {
      id: `suggestion-${randomUUID().slice(0, 8)}`,
      failureId: failure.id,
      type: 'code',
      strategy: 'rate_limit_backoff',
      title: 'Implement rate limit handling',
      description: 'Add rate limit detection and backoff strategy',
      confidence: 0.85,
      impact: {
        areas: ['reliability', 'api integration'],
        risk: 'low',
        improvement: 'Proper handling of rate limits',
        sideEffects: ['Requests may be delayed during backoff'],
      },
      codeChanges: [{
        filePath: 'src/lib/utils/rate-limiter.ts',
        changeType: 'create',
        newContent: `/**
 * Rate limit handler with backoff
 */
export class RateLimitHandler {
  private retryAfter = 0;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Wait if we're in backoff period
    if (this.retryAfter > Date.now()) {
      await new Promise(r => setTimeout(r, this.retryAfter - Date.now()));
    }

    try {
      return await fn();
    } catch (error: any) {
      if (error.status === 429) {
        const retryAfter = parseInt(error.headers?.['retry-after'] || '60');
        this.retryAfter = Date.now() + (retryAfter * 1000);
        throw new Error(\`Rate limited. Retry after \${retryAfter}s\`);
      }
      throw error;
    }
  }
}`,
        description: 'Create rate limit handler with backoff',
      }],
      effort: 'small',
      requiresReview: false,
    };
  }

  /**
   * Suggest cache optimization
   */
  private suggestCacheOptimization(trace: StoredTrace, failure: DetectedFailure): FixSuggestion {
    return {
      id: `suggestion-${randomUUID().slice(0, 8)}`,
      failureId: failure.id,
      type: 'config',
      strategy: 'cache_optimization',
      title: 'Optimize caching',
      description: 'Enable or tune caching to reduce latency',
      confidence: 0.7,
      impact: {
        areas: ['performance', 'latency'],
        risk: 'low',
        improvement: 'Reduced latency for repeated queries',
        sideEffects: ['Increased memory usage', 'Potential stale data'],
      },
      configChanges: [{
        key: 'cache.enabled',
        currentValue: false,
        newValue: true,
        scope: 'project',
        description: 'Enable semantic cache',
      }, {
        key: 'cache.ttlSeconds',
        currentValue: 0,
        newValue: 3600,
        scope: 'project',
        description: 'Set cache TTL to 1 hour',
      }, {
        key: 'cache.similarityThreshold',
        currentValue: 0.95,
        newValue: 0.9,
        scope: 'project',
        description: 'Lower similarity threshold for more cache hits',
      }],
      effort: 'trivial',
      requiresReview: false,
    };
  }

  /**
   * Suggest model switch
   */
  private suggestModelSwitch(trace: StoredTrace, failure: DetectedFailure): FixSuggestion {
    return {
      id: `suggestion-${randomUUID().slice(0, 8)}`,
      failureId: failure.id,
      type: 'config',
      strategy: 'model_switch',
      title: 'Switch to backup model',
      description: 'Configure fallback to a different model provider',
      confidence: 0.65,
      impact: {
        areas: ['reliability', 'llm integration'],
        risk: 'medium',
        improvement: 'Continued service when primary model fails',
        sideEffects: ['Different model quality', 'Potential cost changes'],
      },
      configChanges: [{
        key: 'llm.fallbackModel',
        currentValue: null,
        newValue: 'anthropic/claude-3-haiku',
        scope: 'project',
        description: 'Set fallback model to Claude Haiku',
      }, {
        key: 'llm.fallbackEnabled',
        currentValue: false,
        newValue: true,
        scope: 'project',
        description: 'Enable automatic model fallback',
      }],
      effort: 'small',
      requiresReview: true,
    };
  }

  /**
   * Suggest manual review
   */
  private suggestManualReview(trace: StoredTrace, failure: DetectedFailure): FixSuggestion {
    return {
      id: `suggestion-${randomUUID().slice(0, 8)}`,
      failureId: failure.id,
      type: 'process',
      strategy: 'manual_review',
      title: 'Manual review required',
      description: 'This issue requires human investigation',
      confidence: 0.5,
      impact: {
        areas: ['unknown'],
        risk: 'high',
        improvement: 'Root cause investigation needed',
        sideEffects: [],
      },
      effort: 'large',
      requiresReview: true,
      docsUrl: 'https://seizn.com/docs/troubleshooting',
    };
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(failures: DetectedFailure[]): number {
    if (failures.length === 0) return 1.0;

    // Weight by severity and evidence count
    let totalWeight = 0;
    let weightedConfidence = 0;

    for (const failure of failures) {
      const evidenceScore = Math.min(failure.evidence.length * 0.2, 0.8);
      const severityWeight = failure.severity / 10;

      totalWeight += severityWeight;
      weightedConfidence += evidenceScore * severityWeight;
    }

    return totalWeight > 0 ? weightedConfidence / totalWeight : 0.5;
  }

  /**
   * Analyze root cause of failures
   */
  private analyzeRootCause(
    trace: StoredTrace,
    failures: DetectedFailure[]
  ): RootCauseAnalysis {
    // Find the most severe failure
    const primaryFailure = failures[0];

    // Analyze contributing factors
    const factors: string[] = [];

    // Check for configuration issues
    if (trace.effectiveConfig.searchType === 'semantic' && trace.resultsCount === 0) {
      factors.push('Semantic search may not match query intent');
    }

    // Check for performance issues
    if (trace.timingsMs.total > 5000) {
      const slowestSpan = trace.trace.spans.reduce((max, span) =>
        (span.durationMs || 0) > (max.durationMs || 0) ? span : max
      );
      factors.push(`${slowestSpan.name} step taking too long (${slowestSpan.durationMs}ms)`);
    }

    // Check for external service issues
    const errorSpans = trace.trace.spans.filter((s) => s.status === 'error');
    if (errorSpans.length > 0) {
      factors.push(`External service failures in: ${errorSpans.map((s) => s.name).join(', ')}`);
    }

    return {
      primary: primaryFailure.message,
      factors,
      confidence: this.calculateConfidence(failures),
      investigationSteps: [
        'Review trace timeline for bottlenecks',
        'Check external service status',
        'Verify configuration matches use case',
        'Review recent changes that may have caused regression',
      ],
    };
  }

  /**
   * Add custom failure pattern
   */
  addPattern(pattern: FailurePattern): void {
    this.customPatterns.push(pattern);
  }

  /**
   * Remove custom failure pattern
   */
  removePattern(patternId: string): void {
    this.customPatterns = this.customPatterns.filter((p) => p.id !== patternId);
  }
}

// ============================================
// Singleton Instance
// ============================================

let analyzerInstance: TraceAnalyzer | null = null;

export function getTraceAnalyzer(): TraceAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new TraceAnalyzer();
  }
  return analyzerInstance;
}

export function createTraceAnalyzer(customPatterns?: FailurePattern[]): TraceAnalyzer {
  return new TraceAnalyzer(customPatterns);
}
