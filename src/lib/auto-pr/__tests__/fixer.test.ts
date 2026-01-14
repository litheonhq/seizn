/**
 * FixGenerator Tests
 *
 * Tests for the fix suggestion generation functionality including:
 * - Fix suggestion generation for various issue types
 * - Confidence calculation
 * - Suggestion validation
 * - Suggestion prioritization
 * - Time estimation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FixGenerator, createFixGenerator, getFixGenerator } from '../fixer';
import type { IssueDetection, FixSuggestion, IssueType } from '../types';
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
      searchType: 'semantic',
      hybridAlpha: 0.5,
      llmMaxTokens: 1024,
    },
    trace: {
      spans: [],
      events: [],
      resultStats: {
        scores: { max: 0.85, min: 0.4, avg: 0.65 },
      },
    },
    ...overrides,
  } as StoredTrace;
}

// Helper to create a mock issue
function createMockIssue(overrides?: Partial<IssueDetection>): IssueDetection {
  return {
    id: 'issue-123',
    type: 'low_relevance',
    severity: 'medium',
    title: 'Low relevance scores',
    description: 'Retrieved documents have low relevance scores',
    evidence: [
      {
        type: 'score',
        description: 'Max score below threshold',
        value: 0.4,
        expected: 0.6,
        confidence: 0.85,
        source: 'trace.resultStats',
      },
    ],
    confidence: 0.85,
    affectedComponents: ['retrieval'],
    traceId: 'trace-123',
    detectedAt: new Date().toISOString(),
    query: 'What is machine learning?',
    collectionId: 'collection-123',
    ...overrides,
  };
}

describe('FixGenerator', () => {
  let generator: FixGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new FixGenerator();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const g = new FixGenerator();
      expect(g).toBeDefined();
    });

    it('should accept custom maxSuggestionsPerIssue', () => {
      const g = new FixGenerator({ maxSuggestionsPerIssue: 5 });
      expect(g).toBeDefined();
    });
  });

  describe('generateSuggestions', () => {
    it('should generate suggestions for hallucination issues', async () => {
      const issue = createMockIssue({ type: 'hallucination' });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].issueId).toBe('issue-123');
    });

    it('should generate suggestions for low_relevance issues', async () => {
      const issue = createMockIssue({ type: 'low_relevance' });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.type === 'retrieval_config')).toBe(true);
    });

    it('should generate suggestions for missing_context issues', async () => {
      const issue = createMockIssue({ type: 'missing_context' });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should generate suggestions for chunk_boundary issues', async () => {
      const issue = createMockIssue({ type: 'chunk_boundary' });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.type === 'chunking_strategy')).toBe(true);
    });

    it('should generate suggestions for stale_content issues', async () => {
      const issue = createMockIssue({ type: 'stale_content' });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.type === 'reindex' || s.type === 'metadata_enrichment')).toBe(true);
    });

    it('should generate suggestions for incomplete_answer issues', async () => {
      const issue = createMockIssue({ type: 'incomplete_answer' });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should limit suggestions per issue', async () => {
      const g = new FixGenerator({ maxSuggestionsPerIssue: 1 });
      const issue = createMockIssue({ type: 'low_relevance' });
      const trace = createMockTrace();

      const suggestions = await g.generateSuggestions([issue], trace);

      expect(suggestions.length).toBeLessThanOrEqual(1);
    });

    it('should handle multiple issues', async () => {
      const issues = [
        createMockIssue({ id: 'issue-1', type: 'low_relevance' }),
        createMockIssue({ id: 'issue-2', type: 'hallucination' }),
      ];
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions(issues, trace);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(new Set(suggestions.map(s => s.issueId)).size).toBeGreaterThan(1);
    });

    it('should filter by autoMergeableOnly', async () => {
      const issue = createMockIssue({ type: 'hallucination' });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace, {
        autoMergeableOnly: true,
      });

      for (const suggestion of suggestions) {
        expect(suggestion.autoMergeable).toBe(true);
      }
    });

    it('should assign sequential order', async () => {
      const issue = createMockIssue({ type: 'low_relevance' });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      for (let i = 0; i < suggestions.length; i++) {
        expect(suggestions[i].order).toBe(i);
      }
    });

    it('should sort by order and confidence', async () => {
      const issues = [
        createMockIssue({ id: 'issue-1', type: 'low_relevance', confidence: 0.9 }),
        createMockIssue({ id: 'issue-2', type: 'hallucination', confidence: 0.7 }),
      ];
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions(issues, trace);

      // Verify suggestions are sorted by order first
      for (let i = 1; i < suggestions.length; i++) {
        if (suggestions[i].order === suggestions[i - 1].order) {
          expect(suggestions[i].confidence).toBeLessThanOrEqual(suggestions[i - 1].confidence);
        }
      }
    });

    it('should include code patches when applicable', async () => {
      const issue = createMockIssue({ type: 'hallucination' });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      const withCodePatches = suggestions.filter(
        s => s.codePatches && s.codePatches.length > 0
      );
      expect(withCodePatches.length).toBeGreaterThan(0);
    });

    it('should include config patches when applicable', async () => {
      const issue = createMockIssue({ type: 'low_relevance' });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      const withConfigPatches = suggestions.filter(
        s => s.configPatches && s.configPatches.length > 0
      );
      expect(withConfigPatches.length).toBeGreaterThan(0);
    });

    it('should include impact information', async () => {
      const issue = createMockIssue({ type: 'low_relevance' });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      for (const suggestion of suggestions) {
        expect(suggestion.impact).toBeDefined();
        expect(suggestion.impact.affectedAreas).toBeDefined();
        expect(suggestion.impact.risk).toBeDefined();
      }
    });

    it('should return empty array for unknown issue type', async () => {
      const issue = createMockIssue({ type: 'unknown_type' as IssueType });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      expect(suggestions).toEqual([]);
    });
  });

  describe('getSuggestionsForType', () => {
    it('should return strategies for hallucination', () => {
      const strategies = generator.getSuggestionsForType('hallucination');
      expect(strategies.length).toBeGreaterThan(0);
    });

    it('should return strategies for low_relevance', () => {
      const strategies = generator.getSuggestionsForType('low_relevance');
      expect(strategies.length).toBeGreaterThan(0);
    });

    it('should return empty array for unknown type', () => {
      const strategies = generator.getSuggestionsForType('unknown_type' as IssueType);
      expect(strategies).toEqual([]);
    });
  });

  describe('validateSuggestions', () => {
    it('should validate non-conflicting suggestions', () => {
      const suggestions: FixSuggestion[] = [
        {
          id: 'fix-1',
          issueId: 'issue-1',
          type: 'retrieval_config',
          title: 'Increase topK',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'trivial',
          impact: { affectedAreas: ['retrieval'], risk: 'low', expectedImprovement: 'Test' },
          configPatches: [{ key: 'retrieval.topK', currentValue: 10, newValue: 20, scope: 'collection', description: 'Test' }],
          requiresReview: false,
          autoMergeable: true,
          order: 0,
        },
        {
          id: 'fix-2',
          issueId: 'issue-2',
          type: 'retrieval_config',
          title: 'Enable hybrid',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'trivial',
          impact: { affectedAreas: ['search'], risk: 'low', expectedImprovement: 'Test' },
          configPatches: [{ key: 'search.type', currentValue: 'semantic', newValue: 'hybrid', scope: 'collection', description: 'Test' }],
          requiresReview: false,
          autoMergeable: true,
          order: 1,
        },
      ];

      const result = generator.validateSuggestions(suggestions);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect conflicting config changes', () => {
      const suggestions: FixSuggestion[] = [
        {
          id: 'fix-1',
          issueId: 'issue-1',
          type: 'retrieval_config',
          title: 'Change topK to 20',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'trivial',
          impact: { affectedAreas: ['retrieval'], risk: 'low', expectedImprovement: 'Test' },
          configPatches: [{ key: 'retrieval.topK', currentValue: 10, newValue: 20, scope: 'collection', description: 'Test' }],
          requiresReview: false,
          autoMergeable: true,
          order: 0,
        },
        {
          id: 'fix-2',
          issueId: 'issue-2',
          type: 'retrieval_config',
          title: 'Change topK to 30',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'trivial',
          impact: { affectedAreas: ['retrieval'], risk: 'low', expectedImprovement: 'Test' },
          configPatches: [{ key: 'retrieval.topK', currentValue: 10, newValue: 30, scope: 'collection', description: 'Test' }],
          requiresReview: false,
          autoMergeable: true,
          order: 1,
        },
      ];

      const result = generator.validateSuggestions(suggestions);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('retrieval.topK');
    });

    it('should detect conflicting file changes', () => {
      const suggestions: FixSuggestion[] = [
        {
          id: 'fix-1',
          issueId: 'issue-1',
          type: 'prompt_tuning',
          title: 'Create file',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'small',
          impact: { affectedAreas: ['prompt'], risk: 'low', expectedImprovement: 'Test' },
          codePatches: [{ filePath: 'src/lib/test.ts', action: 'create', newContent: 'content', description: 'Test' }],
          requiresReview: true,
          autoMergeable: false,
          order: 0,
        },
        {
          id: 'fix-2',
          issueId: 'issue-2',
          type: 'prompt_tuning',
          title: 'Modify same file',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'small',
          impact: { affectedAreas: ['prompt'], risk: 'low', expectedImprovement: 'Test' },
          codePatches: [{ filePath: 'src/lib/test.ts', action: 'modify', newContent: 'other', description: 'Test' }],
          requiresReview: true,
          autoMergeable: false,
          order: 1,
        },
      ];

      const result = generator.validateSuggestions(suggestions);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('src/lib/test.ts');
    });

    it('should return valid for empty suggestions', () => {
      const result = generator.validateSuggestions([]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('calculateTotalTime', () => {
    it('should sum estimated time for all suggestions', () => {
      const suggestions: FixSuggestion[] = [
        {
          id: 'fix-1',
          issueId: 'issue-1',
          type: 'retrieval_config',
          title: 'Test',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'trivial',
          impact: { affectedAreas: [], risk: 'low', expectedImprovement: 'Test' },
          requiresReview: false,
          autoMergeable: true,
          order: 0,
          estimatedTimeMinutes: 10,
        },
        {
          id: 'fix-2',
          issueId: 'issue-2',
          type: 'prompt_tuning',
          title: 'Test',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'small',
          impact: { affectedAreas: [], risk: 'low', expectedImprovement: 'Test' },
          requiresReview: true,
          autoMergeable: false,
          order: 1,
          estimatedTimeMinutes: 20,
        },
      ];

      const total = generator.calculateTotalTime(suggestions);

      expect(total).toBe(30);
    });

    it('should return 0 for empty suggestions', () => {
      const total = generator.calculateTotalTime([]);
      expect(total).toBe(0);
    });

    it('should handle missing estimatedTimeMinutes', () => {
      const suggestions: FixSuggestion[] = [
        {
          id: 'fix-1',
          issueId: 'issue-1',
          type: 'retrieval_config',
          title: 'Test',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'trivial',
          impact: { affectedAreas: [], risk: 'low', expectedImprovement: 'Test' },
          requiresReview: false,
          autoMergeable: true,
          order: 0,
          // No estimatedTimeMinutes
        },
      ];

      const total = generator.calculateTotalTime(suggestions);
      expect(total).toBe(0);
    });
  });

  describe('prioritizeSuggestions', () => {
    it('should categorize suggestions correctly', () => {
      const suggestions: FixSuggestion[] = [
        // Immediate: auto-mergeable + low risk
        {
          id: 'fix-1',
          issueId: 'issue-1',
          type: 'retrieval_config',
          title: 'Increase topK',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'trivial',
          impact: { affectedAreas: ['retrieval'], risk: 'low', expectedImprovement: 'Test' },
          requiresReview: false,
          autoMergeable: true,
          order: 0,
        },
        // Review: requires review + not high risk
        {
          id: 'fix-2',
          issueId: 'issue-2',
          type: 'answer_contract',
          title: 'Add contract',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'medium',
          impact: { affectedAreas: ['answer'], risk: 'medium', expectedImprovement: 'Test' },
          requiresReview: true,
          autoMergeable: false,
          order: 1,
        },
        // Backlog: high risk
        {
          id: 'fix-3',
          issueId: 'issue-3',
          type: 'reindex',
          title: 'Full reindex',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'large',
          impact: { affectedAreas: ['indexing'], risk: 'high', expectedImprovement: 'Test' },
          requiresReview: true,
          autoMergeable: false,
          order: 2,
        },
      ];

      const prioritized = generator.prioritizeSuggestions(suggestions);

      expect(prioritized.immediate).toHaveLength(1);
      expect(prioritized.immediate[0].id).toBe('fix-1');

      expect(prioritized.review).toHaveLength(1);
      expect(prioritized.review[0].id).toBe('fix-2');

      expect(prioritized.backlog).toHaveLength(1);
      expect(prioritized.backlog[0].id).toBe('fix-3');
    });

    it('should handle empty suggestions', () => {
      const prioritized = generator.prioritizeSuggestions([]);

      expect(prioritized.immediate).toHaveLength(0);
      expect(prioritized.review).toHaveLength(0);
      expect(prioritized.backlog).toHaveLength(0);
    });

    it('should put large effort in backlog', () => {
      const suggestions: FixSuggestion[] = [
        {
          id: 'fix-1',
          issueId: 'issue-1',
          type: 'reindex',
          title: 'Major change',
          description: 'Test',
          rationale: 'Test',
          confidence: 0.8,
          effort: 'large',
          impact: { affectedAreas: ['indexing'], risk: 'low', expectedImprovement: 'Test' },
          requiresReview: false,
          autoMergeable: true,
          order: 0,
        },
      ];

      const prioritized = generator.prioritizeSuggestions(suggestions);

      expect(prioritized.backlog).toHaveLength(1);
    });
  });

  describe('confidence calculation', () => {
    it('should reduce confidence for higher effort', async () => {
      const issue = createMockIssue({ type: 'hallucination', confidence: 0.9 });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      // All suggestions should have confidence <= issue confidence
      for (const suggestion of suggestions) {
        expect(suggestion.confidence).toBeLessThanOrEqual(0.9);
      }
    });

    it('should reduce confidence for higher risk', async () => {
      const issue = createMockIssue({ type: 'chunk_boundary', confidence: 0.9 });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      // Suggestions with medium risk should have lower confidence
      const mediumRiskSuggestions = suggestions.filter(s => s.impact.risk === 'medium');
      const lowRiskSuggestions = suggestions.filter(s => s.impact.risk === 'low');

      if (mediumRiskSuggestions.length > 0 && lowRiskSuggestions.length > 0) {
        const avgMedium = mediumRiskSuggestions.reduce((s, x) => s + x.confidence, 0) / mediumRiskSuggestions.length;
        const avgLow = lowRiskSuggestions.reduce((s, x) => s + x.confidence, 0) / lowRiskSuggestions.length;
        expect(avgMedium).toBeLessThanOrEqual(avgLow);
      }
    });

    it('should cap confidence at 0.95', async () => {
      const issue = createMockIssue({ type: 'low_relevance', confidence: 1.0 });
      const trace = createMockTrace();

      const suggestions = await generator.generateSuggestions([issue], trace);

      for (const suggestion of suggestions) {
        expect(suggestion.confidence).toBeLessThanOrEqual(0.95);
      }
    });
  });
});

describe('Factory Functions', () => {
  describe('getFixGenerator', () => {
    it('should return singleton instance', () => {
      const g1 = getFixGenerator();
      const g2 = getFixGenerator();
      expect(g1).toBe(g2);
    });
  });

  describe('createFixGenerator', () => {
    it('should create new instance each time', () => {
      const g1 = createFixGenerator();
      const g2 = createFixGenerator();
      expect(g1).not.toBe(g2);
    });

    it('should accept custom options', () => {
      const g = createFixGenerator({ maxSuggestionsPerIssue: 5 });
      expect(g).toBeDefined();
    });
  });
});

describe('Fix Types Coverage', () => {
  let generator: FixGenerator;

  beforeEach(() => {
    generator = new FixGenerator();
  });

  const issueTypes: IssueType[] = [
    'hallucination',
    'low_relevance',
    'missing_context',
    'chunk_boundary',
    'stale_content',
    'conflicting_sources',
    'incomplete_answer',
    'citation_mismatch',
    'embedding_drift',
    'index_degradation',
  ];

  for (const issueType of issueTypes) {
    it(`should have strategies for ${issueType}`, async () => {
      const strategies = generator.getSuggestionsForType(issueType);
      expect(strategies.length).toBeGreaterThan(0);
    });
  }
});
