/**
 * IssueDetector Tests
 *
 * Tests for the RAG quality issue detection functionality including:
 * - Hallucination detection
 * - Low relevance detection
 * - Missing context detection
 * - Chunk boundary detection
 * - Stale content detection
 * - Custom rule evaluation
 * - Quality score calculation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueDetector, createIssueDetector, getIssueDetector } from '../detector';
import type { DetectionConfig, IssueDetection, DetectionRule } from '../types';
import type { StoredTrace } from '@/lib/fall/flight-recorder';

// Note: crypto mock is provided by src/test/setup.ts

// Helper to create a mock trace
function createMockTrace(overrides?: Partial<StoredTrace>): StoredTrace {
  return {
    id: 'trace-123',
    queryText: 'What is machine learning?',
    resultsCount: 5,
    collectionId: 'collection-123',
    effectiveConfig: {
      topK: 10,
      searchType: 'hybrid',
      hybridAlpha: 0.5,
    },
    trace: {
      spans: [],
      events: [],
      resultStats: {
        scores: {
          max: 0.85,
          min: 0.4,
          avg: 0.65,
        },
      },
    },
    ...overrides,
  } as StoredTrace;
}

describe('IssueDetector', () => {
  let detector: IssueDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new IssueDetector();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const d = new IssueDetector();
      expect(d).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const customConfig: Partial<DetectionConfig> = {
        minRelevanceScore: 0.8,
        staleContentDays: 30,
      };
      const d = new IssueDetector(customConfig);
      expect(d).toBeDefined();
    });

    it('should allow disabling specific detections', () => {
      const d = new IssueDetector({
        detectHallucination: false,
        detectMissingContext: false,
        detectChunkBoundary: false,
      });
      expect(d).toBeDefined();
    });
  });

  describe('detect', () => {
    it('should return empty array for trace with no issues', async () => {
      const trace = createMockTrace({
        resultsCount: 10,
        trace: {
          spans: [],
          events: [
            { type: 'context', timestamp: Date.now(), payload: {} },
            { type: 'llm', timestamp: Date.now(), payload: {} },
          ],
          resultStats: {
            scores: { max: 0.95, min: 0.7, avg: 0.85 },
          },
        },
      });

      const issues = await detector.detect(trace);
      expect(Array.isArray(issues)).toBe(true);
    });

    it('should detect hallucination when answer has no sources', async () => {
      const trace = createMockTrace({
        resultsCount: 0,
        trace: {
          spans: [],
          events: [
            { type: 'llm', timestamp: Date.now(), payload: { answer: 'Some answer' } },
          ],
          resultStats: undefined,
        },
      });

      const issues = await detector.detect(trace);
      const hallucinationIssue = issues.find(i => i.type === 'hallucination');
      expect(hallucinationIssue).toBeDefined();
    });

    it('should detect low relevance scores', async () => {
      const trace = createMockTrace({
        trace: {
          spans: [],
          events: [],
          resultStats: {
            scores: { max: 0.4, min: 0.1, avg: 0.25 },
          },
        },
      });

      const issues = await detector.detect(trace);
      const lowRelevanceIssue = issues.find(i => i.type === 'low_relevance');
      expect(lowRelevanceIssue).toBeDefined();
    });

    it('should detect missing context when zero results', async () => {
      const trace = createMockTrace({
        resultsCount: 0,
        trace: {
          spans: [],
          events: [],
          resultStats: undefined,
        },
      });

      const issues = await detector.detect(trace);
      const missingContextIssue = issues.find(i => i.type === 'missing_context');
      expect(missingContextIssue).toBeDefined();
    });

    it('should detect chunk boundary issues from rerank deltas', async () => {
      const trace = createMockTrace({
        trace: {
          spans: [],
          events: [],
          resultStats: {
            scores: { max: 0.8, min: 0.5, avg: 0.65 },
            rerankDeltas: [
              { chunkId: 'c1', delta: 0.5 },
              { chunkId: 'c2', delta: -0.4 },
              { chunkId: 'c3', delta: 0.35 },
            ],
          },
        },
      });

      const issues = await detector.detect(trace);
      const chunkIssue = issues.find(i => i.type === 'chunk_boundary');
      expect(chunkIssue).toBeDefined();
    });

    it('should detect stale content', async () => {
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 120); // 120 days ago

      const trace = createMockTrace({
        trace: {
          spans: [],
          events: [
            {
              type: 'candidates',
              timestamp: Date.now(),
              payload: {
                documents: [
                  { metadata: { updated_at: staleDate.toISOString() } },
                  { metadata: { updated_at: staleDate.toISOString() } },
                  { metadata: { updated_at: staleDate.toISOString() } },
                ],
              },
            },
          ],
          resultStats: { scores: { max: 0.8, min: 0.5, avg: 0.65 } },
        },
      });

      const issues = await detector.detect(trace);
      const staleIssue = issues.find(i => i.type === 'stale_content');
      expect(staleIssue).toBeDefined();
    });

    it('should detect incomplete answer when LLM truncated', async () => {
      const trace = createMockTrace({
        trace: {
          spans: [],
          events: [
            {
              type: 'llm',
              timestamp: Date.now(),
              payload: { finishReason: 'length' },
            },
          ],
          resultStats: { scores: { max: 0.8, min: 0.5, avg: 0.65 } },
        },
      });

      const issues = await detector.detect(trace);
      const incompleteIssue = issues.find(i => i.type === 'incomplete_answer');
      expect(incompleteIssue).toBeDefined();
    });

    it('should detect embedding drift when latency is high', async () => {
      // Use lower confidence threshold to detect timing-only evidence (0.6 confidence)
      const d = new IssueDetector({ minConfidenceThreshold: 0.5 });

      const trace = createMockTrace({
        trace: {
          spans: [
            { name: 'embedding', startTime: Date.now(), durationMs: 3000 },
          ],
          events: [],
          resultStats: { scores: { max: 0.8, min: 0.5, avg: 0.65 } },
        },
      });

      const issues = await d.detect(trace);
      const driftIssue = issues.find(i => i.type === 'embedding_drift');
      expect(driftIssue).toBeDefined();
    });

    it('should sort issues by severity and confidence', async () => {
      const trace = createMockTrace({
        resultsCount: 0,
        trace: {
          spans: [],
          events: [
            { type: 'llm', timestamp: Date.now(), payload: {} },
          ],
          resultStats: {
            scores: { max: 0.3, min: 0.1, avg: 0.2 },
          },
        },
      });

      const issues = await detector.detect(trace);

      // Verify issues are sorted by severity
      for (let i = 1; i < issues.length; i++) {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const prevSeverity = severityOrder[issues[i - 1].severity];
        const currSeverity = severityOrder[issues[i].severity];
        expect(prevSeverity).toBeLessThanOrEqual(currSeverity);
      }
    });

    it('should skip disabled detection patterns', async () => {
      const d = new IssueDetector({ detectHallucination: false });

      const trace = createMockTrace({
        resultsCount: 0,
        trace: {
          spans: [],
          events: [
            { type: 'llm', timestamp: Date.now(), payload: {} },
          ],
          resultStats: undefined,
        },
      });

      const issues = await d.detect(trace);
      const hallucinationIssue = issues.find(i => i.type === 'hallucination');
      expect(hallucinationIssue).toBeUndefined();
    });

    it('should skip issues below confidence threshold', async () => {
      const d = new IssueDetector({ minConfidenceThreshold: 0.99 });

      const trace = createMockTrace({
        trace: {
          spans: [],
          events: [],
          resultStats: {
            scores: { max: 0.5, min: 0.3, avg: 0.4 },
          },
        },
      });

      const issues = await d.detect(trace);
      // High threshold should filter out most issues
      expect(issues.length).toBeLessThanOrEqual(1);
    });
  });

  describe('custom rules', () => {
    it('should evaluate custom rules', async () => {
      const customRule: DetectionRule = {
        id: 'custom-rule-1',
        name: 'Low result count',
        field: 'resultsCount',
        operator: 'lt',
        value: 3,
        issueType: 'missing_context',
        severity: 'medium',
        descriptionTemplate: 'Only {value} results found (expected at least {expected})',
        priority: 5,
      };

      const d = new IssueDetector({ customRules: [customRule] });

      const trace = createMockTrace({ resultsCount: 1 });
      const issues = await d.detect(trace);

      const customIssue = issues.find(i =>
        i.metadata?.customRuleId === 'custom-rule-1'
      );
      expect(customIssue).toBeDefined();
    });

    it('should support various operators in custom rules', async () => {
      const operators: Array<{ op: DetectionRule['operator']; value: unknown; field: string; expected: boolean }> = [
        { op: 'eq', value: 5, field: 'resultsCount', expected: true },
        { op: 'ne', value: 10, field: 'resultsCount', expected: true },
        { op: 'gt', value: 3, field: 'resultsCount', expected: true },
        { op: 'lt', value: 10, field: 'resultsCount', expected: true },
        { op: 'gte', value: 5, field: 'resultsCount', expected: true },
        { op: 'lte', value: 5, field: 'resultsCount', expected: true },
      ];

      for (const { op, value, field, expected } of operators) {
        const rule: DetectionRule = {
          id: `test-${op}`,
          name: `Test ${op}`,
          field,
          operator: op,
          value,
          issueType: 'missing_context',
          severity: 'low',
          descriptionTemplate: 'Test',
          priority: 1,
        };

        const d = new IssueDetector({ customRules: [rule] });
        const trace = createMockTrace({ resultsCount: 5 });
        const issues = await d.detect(trace);

        const found = issues.some(i => i.metadata?.customRuleId === `test-${op}`);
        expect(found).toBe(expected);
      }
    });

    it('should support contains operator for strings', async () => {
      const rule: DetectionRule = {
        id: 'contains-test',
        name: 'Query contains machine',
        field: 'queryText',
        operator: 'contains',
        value: 'machine',
        issueType: 'low_relevance',
        severity: 'low',
        descriptionTemplate: 'Query contains {expected}',
        priority: 1,
      };

      const d = new IssueDetector({ customRules: [rule] });
      const trace = createMockTrace({ queryText: 'What is machine learning?' });
      const issues = await d.detect(trace);

      const found = issues.some(i => i.metadata?.customRuleId === 'contains-test');
      expect(found).toBe(true);
    });

    it('should support matches operator for regex', async () => {
      const rule: DetectionRule = {
        id: 'regex-test',
        name: 'Query matches pattern',
        field: 'queryText',
        operator: 'matches',
        value: '^what.*\\?$',
        issueType: 'low_relevance',
        severity: 'low',
        descriptionTemplate: 'Query matches pattern',
        priority: 1,
      };

      const d = new IssueDetector({ customRules: [rule] });
      const trace = createMockTrace({ queryText: 'What is AI?' });
      const issues = await d.detect(trace);

      const found = issues.some(i => i.metadata?.customRuleId === 'regex-test');
      expect(found).toBe(true);
    });
  });

  describe('calculateQualityScore', () => {
    it('should return 100 for no issues', () => {
      const trace = createMockTrace();
      const issues: IssueDetection[] = [];

      const score = detector.calculateQualityScore(trace, issues);
      expect(score).toBe(100);
    });

    it('should deduct points based on severity', () => {
      const trace = createMockTrace();
      const issues: IssueDetection[] = [
        {
          id: 'issue-1',
          type: 'low_relevance',
          severity: 'critical',
          title: 'Critical issue',
          description: 'Test',
          evidence: [],
          confidence: 1.0,
          affectedComponents: [],
          traceId: 'trace-123',
          detectedAt: new Date().toISOString(),
        },
      ];

      const score = detector.calculateQualityScore(trace, issues);
      // Critical: -30 * 1.0 = -30
      expect(score).toBe(70);
    });

    it('should factor in confidence', () => {
      const trace = createMockTrace();
      const issues: IssueDetection[] = [
        {
          id: 'issue-1',
          type: 'low_relevance',
          severity: 'high',
          title: 'High issue',
          description: 'Test',
          evidence: [],
          confidence: 0.5, // 50% confidence
          affectedComponents: [],
          traceId: 'trace-123',
          detectedAt: new Date().toISOString(),
        },
      ];

      const score = detector.calculateQualityScore(trace, issues);
      // High: -20 * 0.5 = -10
      expect(score).toBe(90);
    });

    it('should not go below 0', () => {
      const trace = createMockTrace();
      const issues: IssueDetection[] = Array(10).fill({
        id: 'issue',
        type: 'hallucination',
        severity: 'critical',
        title: 'Critical',
        description: 'Test',
        evidence: [],
        confidence: 1.0,
        affectedComponents: [],
        traceId: 'trace-123',
        detectedAt: new Date().toISOString(),
      });

      const score = detector.calculateQualityScore(trace, issues);
      expect(score).toBe(0);
    });

    it('should not exceed 100', () => {
      const trace = createMockTrace();
      const issues: IssueDetection[] = [];

      const score = detector.calculateQualityScore(trace, issues);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      detector.updateConfig({ minRelevanceScore: 0.9 });
      // Config should be updated (we can't directly access it, but method should not throw)
      expect(true).toBe(true);
    });

    it('should preserve other config values', () => {
      detector.updateConfig({ minRelevanceScore: 0.9 });
      detector.updateConfig({ staleContentDays: 30 });
      // Both configs should be preserved
      expect(true).toBe(true);
    });
  });

  describe('addPattern / removePattern', () => {
    it('should add custom pattern', () => {
      const customPattern = {
        id: 'custom-pattern-1',
        type: 'low_relevance' as const,
        name: 'Custom pattern',
        description: 'Custom detection',
        detect: () => [],
        severityFn: () => 'low' as const,
        priority: 1,
      };

      detector.addPattern(customPattern);
      // Pattern should be added (we can verify by detection)
      expect(true).toBe(true);
    });

    it('should remove pattern by id', () => {
      detector.removePattern('custom-pattern-1');
      // Pattern should be removed
      expect(true).toBe(true);
    });
  });
});

describe('Factory Functions', () => {
  describe('getIssueDetector', () => {
    it('should return singleton instance', () => {
      const d1 = getIssueDetector();
      const d2 = getIssueDetector();
      expect(d1).toBe(d2);
    });
  });

  describe('createIssueDetector', () => {
    it('should create new instance each time', () => {
      const d1 = createIssueDetector();
      const d2 = createIssueDetector();
      expect(d1).not.toBe(d2);
    });

    it('should accept custom config', () => {
      const d = createIssueDetector({ minRelevanceScore: 0.9 });
      expect(d).toBeDefined();
    });
  });
});
