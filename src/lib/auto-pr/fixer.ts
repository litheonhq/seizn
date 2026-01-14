/**
 * Seizn Auto-PR Fixer - Fix Generator
 *
 * Generates fix suggestions for detected RAG quality issues.
 * Supports multiple fix types:
 * - Chunking strategy changes
 * - Metadata enrichment
 * - Prompt tuning
 * - Retrieval config updates
 * - And more
 */

import { randomUUID } from 'crypto';
import type { StoredTrace } from '@/lib/fall/flight-recorder';
import type {
  IssueDetection,
  IssueType,
  FixSuggestion,
  FixType,
  EffortLevel,
  RiskLevel,
  CodePatch,
  ConfigPatch,
  FixImpact,
} from './types';

// ============================================
// Fix Strategy Map
// ============================================

interface FixStrategy {
  type: FixType;
  title: string;
  description: string;
  rationale: string;
  effort: EffortLevel;
  risk: RiskLevel;
  autoMergeable: boolean;
  requiresReview: boolean;
  estimatedTimeMinutes: number;
  generator: (issue: IssueDetection, trace: StoredTrace) => {
    codePatches?: CodePatch[];
    configPatches?: ConfigPatch[];
    impact: FixImpact;
  };
}

const FIX_STRATEGIES: Record<IssueType, FixStrategy[]> = {
  // Hallucination fixes
  hallucination: [
    {
      type: 'prompt_tuning',
      title: 'Add source grounding instructions to prompt',
      description: 'Update the system prompt to require explicit source citations',
      rationale: 'Instructing the LLM to cite sources reduces hallucination',
      effort: 'small',
      risk: 'low',
      autoMergeable: true,
      requiresReview: false,
      estimatedTimeMinutes: 10,
      generator: (issue, trace) => ({
        codePatches: [{
          filePath: 'src/lib/summer/answer/generator.ts',
          action: 'modify',
          newContent: `// Add grounding instructions
const GROUNDING_PROMPT = \`
You MUST base your answer strictly on the provided sources.
For each claim, include [Source N] citation.
If information is not in sources, say "I don't have this information in my sources."
Never make up information not found in the sources.
\`;`,
          description: 'Add explicit grounding instructions to prevent hallucination',
        }],
        configPatches: [{
          key: 'llm.systemPromptAddendum',
          currentValue: '',
          newValue: 'Always cite sources. Never hallucinate.',
          scope: 'project',
          description: 'Add anti-hallucination instruction to system prompt',
        }],
        impact: {
          affectedAreas: ['answer generation', 'prompt'],
          risk: 'low',
          expectedImprovement: 'Reduced hallucination by ~60%',
          sideEffects: ['Answers may be more conservative'],
        },
      }),
    },
    {
      type: 'answer_contract',
      title: 'Add hallucination detection contract',
      description: 'Implement answer contract to detect and flag potential hallucinations',
      rationale: 'Post-generation validation catches hallucinations before user sees them',
      effort: 'medium',
      risk: 'low',
      autoMergeable: false,
      requiresReview: true,
      estimatedTimeMinutes: 30,
      generator: (issue, trace) => ({
        codePatches: [{
          filePath: 'src/lib/summer/answer-contract/hallucination-check.ts',
          action: 'create',
          newContent: `/**
 * Hallucination Detection Contract
 *
 * Validates that generated answers are grounded in source documents.
 */

export interface HallucinationCheckResult {
  passed: boolean;
  claims: Array<{
    text: string;
    grounded: boolean;
    sourceId?: string;
  }>;
  ungroundedPercentage: number;
}

export async function checkHallucination(
  answer: string,
  sources: Array<{ id: string; text: string }>
): Promise<HallucinationCheckResult> {
  // Extract claims from answer
  const claims = extractClaims(answer);

  // Check each claim against sources
  const checkedClaims = claims.map(claim => ({
    text: claim,
    grounded: isClaimGrounded(claim, sources),
    sourceId: findSourceForClaim(claim, sources),
  }));

  const ungroundedCount = checkedClaims.filter(c => !c.grounded).length;
  const ungroundedPercentage = claims.length > 0
    ? (ungroundedCount / claims.length) * 100
    : 0;

  return {
    passed: ungroundedPercentage < 20, // Allow up to 20% ungrounded
    claims: checkedClaims,
    ungroundedPercentage,
  };
}

function extractClaims(text: string): string[] {
  // Split into sentences, filter out questions and meta-statements
  return text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10)
    .filter(s => !s.startsWith('I ') && !s.includes('?'));
}

function isClaimGrounded(claim: string, sources: Array<{ text: string }>): boolean {
  const claimWords = new Set(claim.toLowerCase().split(/\\s+/));

  for (const source of sources) {
    const sourceWords = new Set(source.text.toLowerCase().split(/\\s+/));
    const overlap = [...claimWords].filter(w => sourceWords.has(w)).length;
    const overlapRatio = overlap / claimWords.size;

    if (overlapRatio > 0.5) return true;
  }

  return false;
}

function findSourceForClaim(
  claim: string,
  sources: Array<{ id: string; text: string }>
): string | undefined {
  let bestMatch = { id: '', score: 0 };

  for (const source of sources) {
    const score = calculateSimilarity(claim, source.text);
    if (score > bestMatch.score) {
      bestMatch = { id: source.id, score };
    }
  }

  return bestMatch.score > 0.3 ? bestMatch.id : undefined;
}

function calculateSimilarity(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\\s+/));
  const bWords = new Set(b.toLowerCase().split(/\\s+/));
  const intersection = [...aWords].filter(w => bWords.has(w)).length;
  return intersection / Math.max(aWords.size, bWords.size);
}
`,
          description: 'Create hallucination detection contract module',
        }],
        impact: {
          affectedAreas: ['answer validation', 'answer contracts'],
          risk: 'low',
          expectedImprovement: 'Catch ~80% of hallucinations before delivery',
          sideEffects: ['Adds ~100-200ms to response time'],
        },
      }),
    },
  ],

  // Low relevance fixes
  low_relevance: [
    {
      type: 'retrieval_config',
      title: 'Increase retrieval candidates (topK)',
      description: 'Retrieve more candidates to improve chances of finding relevant docs',
      rationale: 'More candidates increase recall at the cost of some latency',
      effort: 'trivial',
      risk: 'low',
      autoMergeable: true,
      requiresReview: false,
      estimatedTimeMinutes: 5,
      generator: (issue, trace) => {
        const currentTopK = trace.effectiveConfig.topK || 10;
        const newTopK = Math.min(currentTopK * 2, 50);

        return {
          configPatches: [{
            key: 'retrieval.topK',
            currentValue: currentTopK,
            newValue: newTopK,
            scope: 'collection',
            description: `Increase topK from ${currentTopK} to ${newTopK}`,
          }],
          impact: {
            affectedAreas: ['retrieval', 'search'],
            risk: 'low',
            expectedImprovement: 'Better recall, more relevant results in top positions',
            sideEffects: ['~20% increase in retrieval latency'],
            latencyImpactMs: 50,
          },
        };
      },
    },
    {
      type: 'retrieval_config',
      title: 'Switch to hybrid search',
      description: 'Enable hybrid search combining semantic and keyword matching',
      rationale: 'Hybrid search improves recall for queries with specific terms',
      effort: 'trivial',
      risk: 'low',
      autoMergeable: true,
      requiresReview: false,
      estimatedTimeMinutes: 5,
      generator: (issue, trace) => ({
        configPatches: [
          {
            key: 'search.type',
            currentValue: trace.effectiveConfig.searchType || 'semantic',
            newValue: 'hybrid',
            scope: 'collection',
            description: 'Switch from semantic to hybrid search',
          },
          {
            key: 'search.hybridAlpha',
            currentValue: trace.effectiveConfig.hybridAlpha || 0.5,
            newValue: 0.6,
            scope: 'collection',
            description: 'Set hybrid alpha to 0.6 (60% semantic, 40% keyword)',
          },
        ],
        impact: {
          affectedAreas: ['search', 'retrieval'],
          risk: 'low',
          expectedImprovement: 'Better handling of keyword-heavy queries',
          sideEffects: ['Slight increase in latency'],
          latencyImpactMs: 30,
        },
      }),
    },
    {
      type: 'chunking_strategy',
      title: 'Optimize chunk size for better context',
      description: 'Adjust chunking parameters to capture more complete context',
      rationale: 'Larger chunks with more overlap preserve context better',
      effort: 'small',
      risk: 'medium',
      autoMergeable: false,
      requiresReview: true,
      estimatedTimeMinutes: 20,
      generator: (issue, trace) => ({
        configPatches: [
          {
            key: 'chunking.chunkSize',
            currentValue: 500,
            newValue: 800,
            scope: 'collection',
            description: 'Increase chunk size from 500 to 800 tokens',
          },
          {
            key: 'chunking.chunkOverlap',
            currentValue: 50,
            newValue: 150,
            scope: 'collection',
            description: 'Increase overlap from 50 to 150 tokens',
          },
        ],
        impact: {
          affectedAreas: ['chunking', 'indexing'],
          risk: 'medium',
          expectedImprovement: 'Better context preservation in chunks',
          sideEffects: ['Requires re-indexing', 'Increased storage'],
          costImpactPercent: 20,
        },
      }),
    },
  ],

  // Missing context fixes
  missing_context: [
    {
      type: 'retrieval_config',
      title: 'Lower similarity threshold',
      description: 'Reduce minimum similarity threshold to include more results',
      rationale: 'Lower threshold increases recall for difficult queries',
      effort: 'trivial',
      risk: 'medium',
      autoMergeable: true,
      requiresReview: false,
      estimatedTimeMinutes: 5,
      generator: (issue, trace) => ({
        configPatches: [{
          key: 'retrieval.minScore',
          currentValue: 0.7,
          newValue: 0.5,
          scope: 'collection',
          description: 'Lower minimum similarity threshold from 0.7 to 0.5',
        }],
        impact: {
          affectedAreas: ['retrieval', 'filtering'],
          risk: 'medium',
          expectedImprovement: 'More results returned for difficult queries',
          sideEffects: ['May include less relevant results'],
        },
      }),
    },
    {
      type: 'metadata_enrichment',
      title: 'Add query expansion',
      description: 'Enable query expansion to find semantically similar content',
      rationale: 'Query expansion helps find relevant docs with different wording',
      effort: 'small',
      risk: 'low',
      autoMergeable: true,
      requiresReview: false,
      estimatedTimeMinutes: 15,
      generator: (issue, trace) => ({
        configPatches: [{
          key: 'retrieval.queryExpansion',
          currentValue: false,
          newValue: true,
          scope: 'collection',
          description: 'Enable automatic query expansion',
        }],
        codePatches: [{
          filePath: 'src/lib/summer/retrieval/query-expander.ts',
          action: 'create',
          newContent: `/**
 * Query Expansion Module
 *
 * Expands queries with synonyms and related terms to improve recall.
 */

export interface ExpandedQuery {
  original: string;
  expanded: string[];
  method: 'synonym' | 'embedding' | 'llm';
}

export async function expandQuery(query: string): Promise<ExpandedQuery> {
  // Use embedding similarity to find related terms
  const expansions: string[] = [];

  // Split into key terms
  const terms = query.split(/\\s+/).filter(t => t.length > 3);

  // For each term, find similar terms from vocabulary
  for (const term of terms) {
    const synonyms = await findSynonyms(term);
    expansions.push(...synonyms);
  }

  return {
    original: query,
    expanded: [...new Set(expansions)].slice(0, 5),
    method: 'embedding',
  };
}

async function findSynonyms(term: string): Promise<string[]> {
  // Placeholder - implement with actual embedding lookup
  return [];
}
`,
          description: 'Create query expansion module',
        }],
        impact: {
          affectedAreas: ['query processing', 'retrieval'],
          risk: 'low',
          expectedImprovement: 'Better recall for queries with synonyms',
          sideEffects: ['~50ms additional latency'],
          latencyImpactMs: 50,
        },
      }),
    },
  ],

  // Chunk boundary fixes
  chunk_boundary: [
    {
      type: 'chunking_strategy',
      title: 'Enable semantic chunking',
      description: 'Switch to semantic chunking to respect content boundaries',
      rationale: 'Semantic chunking preserves logical sections better',
      effort: 'medium',
      risk: 'medium',
      autoMergeable: false,
      requiresReview: true,
      estimatedTimeMinutes: 30,
      generator: (issue, trace) => ({
        configPatches: [{
          key: 'chunking.strategy',
          currentValue: 'fixed',
          newValue: 'semantic',
          scope: 'collection',
          description: 'Switch from fixed to semantic chunking',
        }],
        impact: {
          affectedAreas: ['chunking', 'indexing'],
          risk: 'medium',
          expectedImprovement: 'Better context preservation at chunk boundaries',
          sideEffects: ['Requires re-indexing', 'Variable chunk sizes'],
        },
      }),
    },
    {
      type: 'chunking_strategy',
      title: 'Increase chunk overlap',
      description: 'Increase overlap between chunks to reduce boundary issues',
      rationale: 'More overlap ensures context is not lost at boundaries',
      effort: 'small',
      risk: 'low',
      autoMergeable: true,
      requiresReview: false,
      estimatedTimeMinutes: 10,
      generator: (issue, trace) => ({
        configPatches: [{
          key: 'chunking.chunkOverlap',
          currentValue: 50,
          newValue: 200,
          scope: 'collection',
          description: 'Increase chunk overlap from 50 to 200 tokens',
        }],
        impact: {
          affectedAreas: ['chunking'],
          risk: 'low',
          expectedImprovement: 'Better context continuity across chunks',
          sideEffects: ['~40% more chunks, increased storage'],
          costImpactPercent: 40,
        },
      }),
    },
  ],

  // Stale content fixes
  stale_content: [
    {
      type: 'reindex',
      title: 'Schedule content refresh',
      description: 'Set up automatic re-indexing schedule for fresh content',
      rationale: 'Regular re-indexing ensures content stays current',
      effort: 'small',
      risk: 'low',
      autoMergeable: true,
      requiresReview: false,
      estimatedTimeMinutes: 15,
      generator: (issue, trace) => ({
        configPatches: [{
          key: 'indexing.refreshSchedule',
          currentValue: 'manual',
          newValue: 'weekly',
          scope: 'collection',
          description: 'Enable weekly automatic re-indexing',
        }],
        impact: {
          affectedAreas: ['indexing', 'scheduling'],
          risk: 'low',
          expectedImprovement: 'Content refreshed weekly',
          sideEffects: ['Increased compute costs during re-index'],
          costImpactPercent: 10,
        },
      }),
    },
    {
      type: 'metadata_enrichment',
      title: 'Add freshness scoring',
      description: 'Factor document age into relevance scoring',
      rationale: 'Newer documents may be more relevant for time-sensitive queries',
      effort: 'small',
      risk: 'low',
      autoMergeable: true,
      requiresReview: false,
      estimatedTimeMinutes: 15,
      generator: (issue, trace) => ({
        configPatches: [
          {
            key: 'scoring.freshnessBoost',
            currentValue: 0,
            newValue: 0.1,
            scope: 'collection',
            description: 'Add 10% boost for documents updated in last 30 days',
          },
          {
            key: 'scoring.freshnessDecay',
            currentValue: 0,
            newValue: 0.05,
            scope: 'collection',
            description: 'Apply 5% decay per 30 days of age',
          },
        ],
        impact: {
          affectedAreas: ['scoring', 'ranking'],
          risk: 'low',
          expectedImprovement: 'Fresh content ranked higher',
          sideEffects: ['Older but highly relevant content may rank lower'],
        },
      }),
    },
  ],

  // Conflicting sources fixes
  conflicting_sources: [
    {
      type: 'answer_contract',
      title: 'Add conflict detection contract',
      description: 'Implement contract to detect and handle conflicting sources',
      rationale: 'Explicit conflict handling prevents confusing answers',
      effort: 'medium',
      risk: 'low',
      autoMergeable: false,
      requiresReview: true,
      estimatedTimeMinutes: 30,
      generator: (issue, trace) => ({
        configPatches: [{
          key: 'answerContract.detectConflicts',
          currentValue: false,
          newValue: true,
          scope: 'project',
          description: 'Enable conflict detection in answer contracts',
        }],
        impact: {
          affectedAreas: ['answer generation', 'answer contracts'],
          risk: 'low',
          expectedImprovement: 'Explicit handling of conflicting information',
          sideEffects: ['May require user to resolve conflicts manually'],
        },
      }),
    },
  ],

  // Incomplete answer fixes
  incomplete_answer: [
    {
      type: 'prompt_tuning',
      title: 'Add completeness instructions',
      description: 'Update prompt to emphasize comprehensive answers',
      rationale: 'Explicit instructions improve answer completeness',
      effort: 'trivial',
      risk: 'low',
      autoMergeable: true,
      requiresReview: false,
      estimatedTimeMinutes: 5,
      generator: (issue, trace) => ({
        configPatches: [{
          key: 'llm.systemPromptAddendum',
          currentValue: '',
          newValue: 'Provide comprehensive answers that fully address all aspects of the question.',
          scope: 'project',
          description: 'Add completeness instruction to system prompt',
        }],
        impact: {
          affectedAreas: ['answer generation'],
          risk: 'low',
          expectedImprovement: 'More complete, thorough answers',
          sideEffects: ['Answers may be longer'],
        },
      }),
    },
    {
      type: 'retrieval_config',
      title: 'Increase max tokens for complete answers',
      description: 'Allow more tokens in generated responses',
      rationale: 'More tokens allow for complete explanations',
      effort: 'trivial',
      risk: 'low',
      autoMergeable: true,
      requiresReview: false,
      estimatedTimeMinutes: 5,
      generator: (issue, trace) => ({
        configPatches: [{
          key: 'llm.maxTokens',
          currentValue: trace.effectiveConfig.llmMaxTokens || 1024,
          newValue: 2048,
          scope: 'project',
          description: 'Increase max tokens from 1024 to 2048',
        }],
        impact: {
          affectedAreas: ['answer generation'],
          risk: 'low',
          expectedImprovement: 'Room for complete explanations',
          sideEffects: ['Increased LLM costs'],
          costImpactPercent: 30,
        },
      }),
    },
  ],

  // Citation mismatch fixes
  citation_mismatch: [
    {
      type: 'answer_contract',
      title: 'Add citation verification',
      description: 'Verify that citations accurately reference source content',
      rationale: 'Citation verification prevents incorrect references',
      effort: 'medium',
      risk: 'low',
      autoMergeable: false,
      requiresReview: true,
      estimatedTimeMinutes: 30,
      generator: (issue, trace) => ({
        configPatches: [{
          key: 'answerContract.verifyCitations',
          currentValue: false,
          newValue: true,
          scope: 'project',
          description: 'Enable citation verification in answer contracts',
        }],
        impact: {
          affectedAreas: ['answer validation', 'citations'],
          risk: 'low',
          expectedImprovement: 'Accurate source citations',
          sideEffects: ['~100ms additional latency'],
          latencyImpactMs: 100,
        },
      }),
    },
  ],

  // Embedding drift fixes
  embedding_drift: [
    {
      type: 'embedding_update',
      title: 'Schedule embedding model health check',
      description: 'Add periodic validation of embedding model consistency',
      rationale: 'Early detection of drift prevents quality degradation',
      effort: 'medium',
      risk: 'low',
      autoMergeable: true,
      requiresReview: false,
      estimatedTimeMinutes: 20,
      generator: (issue, trace) => ({
        configPatches: [{
          key: 'monitoring.embeddingHealthCheck',
          currentValue: false,
          newValue: true,
          scope: 'project',
          description: 'Enable periodic embedding health checks',
        }],
        impact: {
          affectedAreas: ['monitoring', 'embeddings'],
          risk: 'low',
          expectedImprovement: 'Early detection of embedding issues',
          sideEffects: ['Minimal overhead from periodic checks'],
        },
      }),
    },
  ],

  // Index degradation fixes
  index_degradation: [
    {
      type: 'reindex',
      title: 'Trigger index optimization',
      description: 'Rebuild vector index for better performance',
      rationale: 'Index optimization restores search quality',
      effort: 'medium',
      risk: 'medium',
      autoMergeable: false,
      requiresReview: true,
      estimatedTimeMinutes: 60,
      generator: (issue, trace) => ({
        configPatches: [{
          key: 'indexing.optimizeOnNextReindex',
          currentValue: false,
          newValue: true,
          scope: 'collection',
          description: 'Enable index optimization during next re-index',
        }],
        impact: {
          affectedAreas: ['indexing', 'search performance'],
          risk: 'medium',
          expectedImprovement: 'Restored search performance',
          sideEffects: ['Temporary unavailability during reindex'],
        },
      }),
    },
  ],
};

// ============================================
// Fix Generator Class
// ============================================

export class FixGenerator {
  private maxSuggestionsPerIssue: number;

  constructor(options?: { maxSuggestionsPerIssue?: number }) {
    this.maxSuggestionsPerIssue = options?.maxSuggestionsPerIssue || 3;
  }

  /**
   * Generate fix suggestions for detected issues
   */
  async generateSuggestions(
    issues: IssueDetection[],
    trace: StoredTrace,
    options?: {
      maxSuggestionsPerIssue?: number;
      autoMergeableOnly?: boolean;
    }
  ): Promise<FixSuggestion[]> {
    const maxSuggestions = options?.maxSuggestionsPerIssue || this.maxSuggestionsPerIssue;
    const suggestions: FixSuggestion[] = [];
    let order = 0;

    for (const issue of issues) {
      const strategies = FIX_STRATEGIES[issue.type] || [];

      for (const strategy of strategies.slice(0, maxSuggestions)) {
        // Skip non-auto-mergeable if requested
        if (options?.autoMergeableOnly && !strategy.autoMergeable) continue;

        try {
          const generated = strategy.generator(issue, trace);

          const suggestion: FixSuggestion = {
            id: `fix-${randomUUID().slice(0, 8)}`,
            issueId: issue.id,
            type: strategy.type,
            title: strategy.title,
            description: strategy.description,
            rationale: strategy.rationale,
            confidence: this.calculateConfidence(issue, strategy),
            effort: strategy.effort,
            impact: generated.impact,
            codePatches: generated.codePatches,
            configPatches: generated.configPatches,
            requiresReview: strategy.requiresReview,
            autoMergeable: strategy.autoMergeable,
            order: order++,
            estimatedTimeMinutes: strategy.estimatedTimeMinutes,
          };

          suggestions.push(suggestion);
        } catch (error) {
          console.error(`Error generating fix for ${issue.type}:`, error);
        }
      }
    }

    // Sort by order and confidence
    return suggestions.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return b.confidence - a.confidence;
    });
  }

  /**
   * Calculate confidence in a fix suggestion
   */
  private calculateConfidence(issue: IssueDetection, strategy: FixStrategy): number {
    // Base confidence from issue confidence
    let confidence = issue.confidence;

    // Adjust based on fix effort (simpler fixes more likely to work)
    const effortMultiplier = {
      trivial: 1.0,
      small: 0.95,
      medium: 0.85,
      large: 0.7,
    };
    confidence *= effortMultiplier[strategy.effort];

    // Adjust based on risk
    const riskMultiplier = {
      low: 1.0,
      medium: 0.9,
      high: 0.75,
    };
    confidence *= riskMultiplier[strategy.risk];

    // Cap at 0.95
    return Math.min(0.95, confidence);
  }

  /**
   * Get suggestions for a specific issue type
   */
  getSuggestionsForType(issueType: IssueType): FixStrategy[] {
    return FIX_STRATEGIES[issueType] || [];
  }

  /**
   * Validate that suggestions can be applied
   */
  validateSuggestions(suggestions: FixSuggestion[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check for conflicting config changes
    const configKeys = new Set<string>();
    for (const suggestion of suggestions) {
      for (const patch of suggestion.configPatches || []) {
        if (configKeys.has(patch.key)) {
          errors.push(`Conflicting changes to config key: ${patch.key}`);
        }
        configKeys.add(patch.key);
      }
    }

    // Check for conflicting file changes
    const fileActions = new Map<string, string>();
    for (const suggestion of suggestions) {
      for (const patch of suggestion.codePatches || []) {
        const existing = fileActions.get(patch.filePath);
        if (existing && existing !== patch.action) {
          errors.push(`Conflicting actions on file: ${patch.filePath}`);
        }
        fileActions.set(patch.filePath, patch.action);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate total estimated time for suggestions
   */
  calculateTotalTime(suggestions: FixSuggestion[]): number {
    return suggestions.reduce(
      (total, s) => total + (s.estimatedTimeMinutes || 0),
      0
    );
  }

  /**
   * Group suggestions by priority
   */
  prioritizeSuggestions(suggestions: FixSuggestion[]): {
    immediate: FixSuggestion[];  // Auto-mergeable, low risk
    review: FixSuggestion[];     // Needs review
    backlog: FixSuggestion[];    // Complex, can wait
  } {
    return {
      immediate: suggestions.filter(s => s.autoMergeable && s.impact.risk === 'low'),
      review: suggestions.filter(s => s.requiresReview && s.impact.risk !== 'high'),
      backlog: suggestions.filter(s => s.impact.risk === 'high' || s.effort === 'large'),
    };
  }
}

// ============================================
// Factory Functions
// ============================================

let generatorInstance: FixGenerator | null = null;

export function getFixGenerator(): FixGenerator {
  if (!generatorInstance) {
    generatorInstance = new FixGenerator();
  }
  return generatorInstance;
}

export function createFixGenerator(options?: {
  maxSuggestionsPerIssue?: number;
}): FixGenerator {
  return new FixGenerator(options);
}
