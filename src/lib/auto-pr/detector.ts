/**
 * Seizn Auto-PR Fixer - Issue Detector
 *
 * Analyzes traces to detect RAG quality issues including:
 * - Hallucination detection
 * - Low relevance scores
 * - Missing context
 * - Chunk boundary issues
 * - Stale content
 */

import { randomUUID } from 'crypto';
import type { StoredTrace, Span, RetrievalEvent } from '@/lib/fall/flight-recorder';
import type {
  IssueDetection,
  IssueType,
  IssueSeverity,
  IssueEvidence,
  DetectionConfig,
  DetectionRule,
  DEFAULT_DETECTION_CONFIG,
} from './types';

// ============================================
// Built-in Detection Patterns
// ============================================

interface DetectionPattern {
  id: string;
  type: IssueType;
  name: string;
  description: string;
  detect: (trace: StoredTrace, config: DetectionConfig) => IssueEvidence[];
  severityFn: (evidence: IssueEvidence[]) => IssueSeverity;
  priority: number;
}

const BUILT_IN_PATTERNS: DetectionPattern[] = [
  // Hallucination Detection
  {
    id: 'hallucination-no-sources',
    type: 'hallucination',
    name: 'Answer without source grounding',
    description: 'Generated answer does not appear grounded in retrieved sources',
    detect: (trace, config) => {
      const evidence: IssueEvidence[] = [];

      // Check if answer was generated but no/few sources were used
      const answerEvent = trace.trace.events.find(e => e.type === 'llm');
      const contextEvent = trace.trace.events.find(e => e.type === 'context');

      if (answerEvent && (!contextEvent || trace.resultsCount === 0)) {
        evidence.push({
          type: 'pattern',
          description: 'Answer generated without source context',
          value: { hasAnswer: true, sourceCount: trace.resultsCount },
          expected: { minSources: 1 },
          confidence: 0.9,
          source: 'trace.events',
        });
      }

      // Check answer contract for hallucination indicators
      const answerContract = trace.trace.events.find(e => e.type === 'answer_contract');
      if (answerContract?.payload) {
        const payload = answerContract.payload as Record<string, unknown>;
        if (payload.passed === false) {
          const checks = payload.checks as Array<{ name: string; passed: boolean }> | undefined;
          const hallucinationCheck = checks?.find(c =>
            c.name.toLowerCase().includes('hallucination') ||
            c.name.toLowerCase().includes('grounded')
          );
          if (hallucinationCheck && !hallucinationCheck.passed) {
            evidence.push({
              type: 'text_analysis',
              description: 'Answer contract detected potential hallucination',
              value: hallucinationCheck,
              confidence: 0.85,
              source: 'answer_contract',
            });
          }
        }
      }

      return evidence;
    },
    severityFn: (evidence) => {
      if (evidence.length > 1) return 'critical';
      if (evidence.some(e => e.confidence > 0.85)) return 'high';
      return 'medium';
    },
    priority: 10,
  },

  // Low Relevance Detection
  {
    id: 'low-relevance-scores',
    type: 'low_relevance',
    name: 'Low relevance scores in results',
    description: 'Retrieved documents have low relevance scores',
    detect: (trace, config) => {
      const evidence: IssueEvidence[] = [];
      const resultStats = trace.trace.resultStats;

      if (resultStats?.scores) {
        // Check max score
        if (resultStats.scores.max < config.minRelevanceScore) {
          evidence.push({
            type: 'score',
            description: `Best result score (${resultStats.scores.max.toFixed(3)}) below threshold`,
            value: resultStats.scores.max,
            expected: config.minRelevanceScore,
            confidence: 0.9,
            source: 'trace.resultStats.scores.max',
          });
        }

        // Check average score
        if (resultStats.scores.avg < config.minRelevanceScore * 0.7) {
          evidence.push({
            type: 'score',
            description: `Average score (${resultStats.scores.avg.toFixed(3)}) is very low`,
            value: resultStats.scores.avg,
            expected: config.minRelevanceScore * 0.7,
            confidence: 0.8,
            source: 'trace.resultStats.scores.avg',
          });
        }

        // Check score distribution - large gap between best and rest
        if (resultStats.scores.max > 0.7 && resultStats.scores.avg < 0.4) {
          evidence.push({
            type: 'score',
            description: 'Large gap between best score and average - potential noise in results',
            value: { max: resultStats.scores.max, avg: resultStats.scores.avg },
            confidence: 0.7,
            source: 'trace.resultStats.scores',
          });
        }
      }

      return evidence;
    },
    severityFn: (evidence) => {
      if (evidence.length >= 2) return 'high';
      if (evidence.some(e => e.confidence > 0.85)) return 'medium';
      return 'low';
    },
    priority: 8,
  },

  // Missing Context Detection
  {
    id: 'missing-context-no-results',
    type: 'missing_context',
    name: 'No relevant context found',
    description: 'Search returned no results for the query',
    detect: (trace, config) => {
      const evidence: IssueEvidence[] = [];

      if (trace.resultsCount === 0) {
        evidence.push({
          type: 'pattern',
          description: 'Search returned zero results',
          value: { resultsCount: 0 },
          expected: { minResults: 1 },
          confidence: 0.95,
          source: 'trace.resultsCount',
        });

        // Check if query was complex
        if (trace.queryText && trace.queryText.length > 100) {
          evidence.push({
            type: 'text_analysis',
            description: 'Complex query may need reformulation',
            value: { queryLength: trace.queryText.length },
            confidence: 0.6,
            source: 'trace.queryText',
          });
        }
      }

      // Check for truncated context
      const contextEvent = trace.trace.events.find(e => e.type === 'context');
      if (contextEvent?.payload) {
        const payload = contextEvent.payload as Record<string, unknown>;
        if (payload.truncated === true) {
          evidence.push({
            type: 'pattern',
            description: 'Context was truncated due to token limits',
            value: payload,
            confidence: 0.75,
            source: 'trace.events.context',
          });
        }
      }

      return evidence;
    },
    severityFn: (evidence) => {
      if (evidence.some(e => e.description.includes('zero results'))) return 'high';
      return 'medium';
    },
    priority: 7,
  },

  // Chunk Boundary Detection
  {
    id: 'chunk-boundary-issues',
    type: 'chunk_boundary',
    name: 'Chunk boundary problems',
    description: 'Retrieved chunks may have poor boundary splits',
    detect: (trace, config) => {
      const evidence: IssueEvidence[] = [];

      // Check rerank deltas - large changes may indicate boundary issues
      const resultStats = trace.trace.resultStats;
      if (resultStats?.rerankDeltas) {
        const largeDeltas = resultStats.rerankDeltas.filter(d => Math.abs(d.delta) > 0.3);

        if (largeDeltas.length > resultStats.rerankDeltas.length * 0.5) {
          evidence.push({
            type: 'comparison',
            description: 'Significant rerank score changes suggest chunking issues',
            value: {
              totalChunks: resultStats.rerankDeltas.length,
              largeChanges: largeDeltas.length,
            },
            confidence: 0.7,
            source: 'trace.resultStats.rerankDeltas',
          });
        }
      }

      // Check for answer contract boundary warnings
      const answerContract = trace.trace.events.find(e => e.type === 'answer_contract');
      if (answerContract?.payload) {
        const payload = answerContract.payload as Record<string, unknown>;
        const checks = payload.checks as Array<{ name: string; passed: boolean; message?: string }> | undefined;
        const boundaryCheck = checks?.find(c =>
          c.name.toLowerCase().includes('boundary') ||
          c.name.toLowerCase().includes('continuity')
        );
        if (boundaryCheck && !boundaryCheck.passed) {
          evidence.push({
            type: 'text_analysis',
            description: boundaryCheck.message || 'Chunk boundary issue detected',
            value: boundaryCheck,
            confidence: 0.8,
            source: 'answer_contract',
          });
        }
      }

      return evidence;
    },
    severityFn: (evidence) => {
      if (evidence.length >= 2) return 'medium';
      return 'low';
    },
    priority: 5,
  },

  // Stale Content Detection
  {
    id: 'stale-content',
    type: 'stale_content',
    name: 'Stale content in results',
    description: 'Retrieved content may be outdated',
    detect: (trace, config) => {
      const evidence: IssueEvidence[] = [];
      const staleThreshold = Date.now() - config.staleContentDays * 24 * 60 * 60 * 1000;

      // Check candidate events for document dates
      const candidatesEvent = trace.trace.events.find(e => e.type === 'candidates');
      if (candidatesEvent?.payload) {
        const payload = candidatesEvent.payload as Record<string, unknown>;
        const docs = payload.documents as Array<{ metadata?: { updated_at?: string } }> | undefined;

        if (docs) {
          const staleDocs = docs.filter(d => {
            const updatedAt = d.metadata?.updated_at;
            if (updatedAt) {
              return new Date(updatedAt).getTime() < staleThreshold;
            }
            return false;
          });

          if (staleDocs.length > docs.length * 0.5) {
            evidence.push({
              type: 'timing',
              description: `${staleDocs.length} of ${docs.length} documents are older than ${config.staleContentDays} days`,
              value: {
                totalDocs: docs.length,
                staleDocs: staleDocs.length,
                thresholdDays: config.staleContentDays,
              },
              confidence: 0.75,
              source: 'trace.events.candidates',
            });
          }
        }
      }

      return evidence;
    },
    severityFn: (evidence) => {
      if (evidence.some(e => {
        const val = e.value as Record<string, number>;
        return val.staleDocs > val.totalDocs * 0.7;
      })) return 'high';
      return 'medium';
    },
    priority: 4,
  },

  // Conflicting Sources Detection
  {
    id: 'conflicting-sources',
    type: 'conflicting_sources',
    name: 'Conflicting information in sources',
    description: 'Retrieved sources contain contradictory information',
    detect: (trace, config) => {
      const evidence: IssueEvidence[] = [];

      // Check answer contract for conflict warnings
      const answerContract = trace.trace.events.find(e => e.type === 'answer_contract');
      if (answerContract?.payload) {
        const payload = answerContract.payload as Record<string, unknown>;
        const checks = payload.checks as Array<{ name: string; passed: boolean; message?: string }> | undefined;
        const conflictCheck = checks?.find(c =>
          c.name.toLowerCase().includes('conflict') ||
          c.name.toLowerCase().includes('contradiction')
        );
        if (conflictCheck && !conflictCheck.passed) {
          evidence.push({
            type: 'text_analysis',
            description: conflictCheck.message || 'Conflicting sources detected',
            value: conflictCheck,
            confidence: 0.85,
            source: 'answer_contract',
          });
        }
      }

      return evidence;
    },
    severityFn: (evidence) => {
      if (evidence.length > 0) return 'high';
      return 'medium';
    },
    priority: 6,
  },

  // Incomplete Answer Detection
  {
    id: 'incomplete-answer',
    type: 'incomplete_answer',
    name: 'Incomplete answer generated',
    description: 'Answer may not fully address the query',
    detect: (trace, config) => {
      const evidence: IssueEvidence[] = [];

      // Check answer contract
      const answerContract = trace.trace.events.find(e => e.type === 'answer_contract');
      if (answerContract?.payload) {
        const payload = answerContract.payload as Record<string, unknown>;
        const checks = payload.checks as Array<{ name: string; passed: boolean; message?: string }> | undefined;
        const completenessCheck = checks?.find(c =>
          c.name.toLowerCase().includes('complete') ||
          c.name.toLowerCase().includes('comprehensive')
        );
        if (completenessCheck && !completenessCheck.passed) {
          evidence.push({
            type: 'text_analysis',
            description: completenessCheck.message || 'Answer completeness check failed',
            value: completenessCheck,
            confidence: 0.8,
            source: 'answer_contract',
          });
        }
      }

      // Check if LLM was interrupted
      const llmEvent = trace.trace.events.find(e => e.type === 'llm');
      if (llmEvent?.payload) {
        const payload = llmEvent.payload as Record<string, unknown>;
        if (payload.finishReason === 'length') {
          evidence.push({
            type: 'pattern',
            description: 'LLM output was truncated due to max tokens',
            value: payload,
            confidence: 0.9,
            source: 'trace.events.llm',
          });
        }
      }

      return evidence;
    },
    severityFn: (evidence) => {
      if (evidence.some(e => e.description.includes('truncated'))) return 'high';
      return 'medium';
    },
    priority: 5,
  },

  // Citation Mismatch Detection
  {
    id: 'citation-mismatch',
    type: 'citation_mismatch',
    name: 'Citation does not match source',
    description: 'Citations in the answer do not accurately reference sources',
    detect: (trace, config) => {
      const evidence: IssueEvidence[] = [];

      // Check answer contract for citation issues
      const answerContract = trace.trace.events.find(e => e.type === 'answer_contract');
      if (answerContract?.payload) {
        const payload = answerContract.payload as Record<string, unknown>;
        const checks = payload.checks as Array<{ name: string; passed: boolean; message?: string }> | undefined;
        const citationCheck = checks?.find(c =>
          c.name.toLowerCase().includes('citation') ||
          c.name.toLowerCase().includes('reference')
        );
        if (citationCheck && !citationCheck.passed) {
          evidence.push({
            type: 'text_analysis',
            description: citationCheck.message || 'Citation verification failed',
            value: citationCheck,
            confidence: 0.85,
            source: 'answer_contract',
          });
        }
      }

      return evidence;
    },
    severityFn: (evidence) => {
      if (evidence.length > 0) return 'medium';
      return 'low';
    },
    priority: 5,
  },

  // Embedding Drift Detection
  {
    id: 'embedding-drift',
    type: 'embedding_drift',
    name: 'Embedding quality degradation',
    description: 'Embedding model output may have drifted from expected behavior',
    detect: (trace, config) => {
      const evidence: IssueEvidence[] = [];

      // Check for unusually high embedding latency
      const embedSpan = trace.trace.spans.find(s => s.name === 'embedding');
      if (embedSpan?.durationMs && embedSpan.durationMs > 2000) {
        evidence.push({
          type: 'timing',
          description: `Embedding took ${embedSpan.durationMs}ms - unusually slow`,
          value: embedSpan.durationMs,
          expected: 500,
          confidence: 0.6,
          source: 'trace.spans.embedding',
        });
      }

      // Check for embedding errors
      const embedEvent = trace.trace.events.find(e => e.type === 'embed');
      if (embedEvent?.payload) {
        const payload = embedEvent.payload as Record<string, unknown>;
        if (payload.error || payload.fallback) {
          evidence.push({
            type: 'pattern',
            description: 'Embedding step encountered issues',
            value: payload,
            confidence: 0.8,
            source: 'trace.events.embed',
          });
        }
      }

      return evidence;
    },
    severityFn: (evidence) => {
      if (evidence.some(e => e.type === 'pattern')) return 'high';
      return 'low';
    },
    priority: 3,
  },

  // Index Degradation Detection
  {
    id: 'index-degradation',
    type: 'index_degradation',
    name: 'Index quality degradation',
    description: 'Vector index may have degraded quality',
    detect: (trace, config) => {
      const evidence: IssueEvidence[] = [];

      // Check search latency vs results quality
      const searchSpan = trace.trace.spans.find(s =>
        s.name === 'vector_search' || s.name === 'keyword_search'
      );
      const resultStats = trace.trace.resultStats;

      if (searchSpan?.durationMs && resultStats?.scores) {
        // High latency with poor results suggests index issues
        if (searchSpan.durationMs > 1000 && resultStats.scores.max < 0.5) {
          evidence.push({
            type: 'comparison',
            description: `High search latency (${searchSpan.durationMs}ms) with low max score (${resultStats.scores.max.toFixed(3)})`,
            value: {
              latency: searchSpan.durationMs,
              maxScore: resultStats.scores.max,
            },
            confidence: 0.65,
            source: 'trace.spans + trace.resultStats',
          });
        }
      }

      return evidence;
    },
    severityFn: (evidence) => {
      if (evidence.length > 0) return 'medium';
      return 'low';
    },
    priority: 2,
  },
];

// ============================================
// Issue Detector Class
// ============================================

export class IssueDetector {
  private patterns: DetectionPattern[];
  private config: DetectionConfig;

  constructor(config?: Partial<DetectionConfig>) {
    this.config = {
      detectHallucination: true,
      minRelevanceScore: 0.6,
      detectMissingContext: true,
      detectChunkBoundary: true,
      staleContentDays: 90,
      minConfidenceThreshold: 0.7,
      ...config,
    };
    this.patterns = [...BUILT_IN_PATTERNS];
  }

  /**
   * Detect issues in a trace
   */
  async detect(trace: StoredTrace): Promise<IssueDetection[]> {
    const issues: IssueDetection[] = [];

    // Sort patterns by priority
    const sortedPatterns = [...this.patterns].sort((a, b) => b.priority - a.priority);

    for (const pattern of sortedPatterns) {
      // Skip disabled patterns based on config
      if (pattern.type === 'hallucination' && !this.config.detectHallucination) continue;
      if (pattern.type === 'missing_context' && !this.config.detectMissingContext) continue;
      if (pattern.type === 'chunk_boundary' && !this.config.detectChunkBoundary) continue;

      try {
        const evidence = pattern.detect(trace, this.config);

        if (evidence.length > 0) {
          // Calculate overall confidence
          const avgConfidence = evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length;

          // Skip if below threshold
          if (avgConfidence < this.config.minConfidenceThreshold) continue;

          const severity = pattern.severityFn(evidence);

          const issue: IssueDetection = {
            id: `issue-${randomUUID().slice(0, 8)}`,
            type: pattern.type,
            severity,
            title: pattern.name,
            description: this.generateDescription(pattern, evidence, trace),
            evidence,
            confidence: avgConfidence,
            affectedComponents: this.getAffectedComponents(evidence),
            traceId: trace.id,
            detectedAt: new Date().toISOString(),
            query: trace.queryText,
            collectionId: trace.collectionId,
            metadata: {
              patternId: pattern.id,
              patternPriority: pattern.priority,
            },
          };

          issues.push(issue);
        }
      } catch (error) {
        console.error(`Error running detection pattern ${pattern.id}:`, error);
      }
    }

    // Check custom rules
    if (this.config.customRules) {
      for (const rule of this.config.customRules) {
        const ruleIssue = this.evaluateCustomRule(trace, rule);
        if (ruleIssue) {
          issues.push(ruleIssue);
        }
      }
    }

    // Sort by severity and confidence
    return issues.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    });
  }

  /**
   * Generate human-readable description
   */
  private generateDescription(
    pattern: DetectionPattern,
    evidence: IssueEvidence[],
    trace: StoredTrace
  ): string {
    const parts = [pattern.description];

    // Add specific details from evidence
    for (const e of evidence.slice(0, 3)) {
      parts.push(e.description);
    }

    // Add query context if relevant
    if (trace.queryText && trace.queryText.length > 0) {
      parts.push(`Query: "${trace.queryText.slice(0, 100)}${trace.queryText.length > 100 ? '...' : ''}"`);
    }

    return parts.join('. ');
  }

  /**
   * Get affected components from evidence
   */
  private getAffectedComponents(evidence: IssueEvidence[]): string[] {
    const components = new Set<string>();

    for (const e of evidence) {
      if (e.source) {
        // Extract component from source path
        const parts = e.source.split('.');
        if (parts.length > 1) {
          components.add(parts[1]); // e.g., 'spans', 'events', 'resultStats'
        }
      }
    }

    return Array.from(components);
  }

  /**
   * Evaluate a custom detection rule
   */
  private evaluateCustomRule(trace: StoredTrace, rule: DetectionRule): IssueDetection | null {
    try {
      const value = this.getNestedValue(trace, rule.field);
      const matches = this.evaluateCondition(value, rule.operator, rule.value);

      if (!matches) return null;

      return {
        id: `issue-${randomUUID().slice(0, 8)}`,
        type: rule.issueType,
        severity: rule.severity,
        title: rule.name,
        description: rule.descriptionTemplate
          .replace('{value}', String(value))
          .replace('{expected}', String(rule.value)),
        evidence: [{
          type: 'pattern',
          description: `Custom rule: ${rule.name}`,
          value,
          expected: rule.value,
          confidence: 0.8,
          source: rule.field,
        }],
        confidence: 0.8,
        affectedComponents: [rule.field.split('.')[0]],
        traceId: trace.id,
        detectedAt: new Date().toISOString(),
        query: trace.queryText,
        collectionId: trace.collectionId,
        metadata: {
          customRuleId: rule.id,
          rulePriority: rule.priority,
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(
    value: unknown,
    operator: DetectionRule['operator'],
    expected: unknown
  ): boolean {
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
        return typeof value === 'string' &&
          value.toLowerCase().includes((expected as string).toLowerCase());
      case 'matches':
        return typeof value === 'string' &&
          new RegExp(expected as string, 'i').test(value);
      default:
        return false;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Add custom detection pattern
   */
  addPattern(pattern: DetectionPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Remove custom detection pattern
   */
  removePattern(patternId: string): void {
    this.patterns = this.patterns.filter(p => p.id !== patternId);
  }

  /**
   * Calculate quality score for a trace
   */
  calculateQualityScore(trace: StoredTrace, issues: IssueDetection[]): number {
    // Start with base score of 100
    let score = 100;

    // Deduct points based on issues
    for (const issue of issues) {
      const severityDeduction = {
        critical: 30,
        high: 20,
        medium: 10,
        low: 5,
      };

      score -= severityDeduction[issue.severity] * issue.confidence;
    }

    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, score));
  }
}

// ============================================
// Factory Functions
// ============================================

let detectorInstance: IssueDetector | null = null;

export function getIssueDetector(config?: Partial<DetectionConfig>): IssueDetector {
  if (!detectorInstance) {
    detectorInstance = new IssueDetector(config);
  }
  return detectorInstance;
}

export function createIssueDetector(config?: Partial<DetectionConfig>): IssueDetector {
  return new IssueDetector(config);
}
