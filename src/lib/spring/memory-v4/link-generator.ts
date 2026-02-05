/**
 * Link Generator Service (A-MEM)
 *
 * Implements A-MEM-style automatic link generation.
 * Connects new memories to relevant existing memories based on
 * semantic similarity and relationship analysis.
 *
 * @module spring/memory-v4/link-generator
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import {
  type EdgeType,
  type CreateEdgeInput,
  EdgeService,
  createEdgeService,
} from './edge-service';
import { SearchServiceV3, createSearchServiceV3 } from './search-service';

// =============================================================================
// Types
// =============================================================================

export interface LinkCandidate {
  /** Target memory ID */
  memoryId: string;
  /** Target memory content */
  content: string;
  /** Semantic similarity score (0-1) */
  similarity: number;
  /** Determined edge type */
  edgeType: EdgeType;
  /** Reason for the link */
  reason: string;
  /** Confidence in the relationship */
  confidence: number;
  /** Whether this is bidirectional */
  bidirectional: boolean;
}

export interface LinkGeneratorConfig {
  /** Minimum similarity for consideration (0-1) */
  minSimilarity: number;
  /** Maximum links to create per memory */
  maxLinks: number;
  /** Edge types to generate */
  edgeTypes: EdgeType[];
  /** Use LLM to validate/classify relationships */
  useLLMValidation: boolean;
  /** Minimum confidence for edge creation */
  minConfidence: number;
  /** Create bidirectional edges where appropriate */
  createBidirectional: boolean;
  /** LLM model for relationship analysis */
  model: 'haiku' | 'sonnet';
}

export interface LinkGenerationResult {
  /** Source memory ID */
  sourceMemoryId: string;
  /** Candidates evaluated */
  candidatesEvaluated: number;
  /** Links created */
  linksCreated: number;
  /** Created edges */
  edges: Array<{
    edgeId: string;
    targetMemoryId: string;
    edgeType: EdgeType;
    confidence: number;
  }>;
  /** Processing time in ms */
  processingMs: number;
  /** Any errors encountered */
  errors: string[];
}

export interface BatchLinkResult {
  processed: number;
  successful: number;
  failed: number;
  totalEdgesCreated: number;
  results: LinkGenerationResult[];
  errors: Array<{ memoryId: string; error: string }>;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: LinkGeneratorConfig = {
  minSimilarity: 0.7,
  maxLinks: 5,
  edgeTypes: ['relates_to', 'supports', 'contradicts', 'supersedes', 'similar_to'],
  useLLMValidation: true,
  minConfidence: 0.6,
  createBidirectional: false,
  model: 'haiku',
};

const RELATIONSHIP_ANALYSIS_PROMPT = `Analyze the relationship between a new memory and existing memories.

For each existing memory, determine:
1. The relationship type (if any)
2. Confidence level (0-1)
3. Brief reason

## Relationship Types
- relates_to: General topical relationship
- supports: New memory provides evidence/support for existing
- contradicts: New memory conflicts with existing
- supersedes: New memory is an update/replacement of existing (same topic, newer info)
- similar_to: Very similar content but not identical
- no_relationship: Not meaningfully connected

## Output Format
Return a JSON array with one object per existing memory:
[
  {
    "index": 0,
    "relationship": "relates_to|supports|contradicts|supersedes|similar_to|no_relationship",
    "confidence": 0.85,
    "reason": "Brief explanation",
    "bidirectional": true|false
  }
]

## Rules
1. Only identify genuine relationships
2. "contradicts" should be reserved for actual conflicts
3. "supersedes" requires same topic with newer/updated information
4. Set higher confidence for clear relationships
5. bidirectional=true if the relationship applies both ways
6. When uncertain, use "relates_to" with lower confidence

Return only valid JSON array.`;

// =============================================================================
// Link Generator Service
// =============================================================================

export class LinkGeneratorService {
  private anthropic: Anthropic;
  private edgeService: EdgeService;
  private searchService: SearchServiceV3;
  private config: LinkGeneratorConfig;

  constructor(
    private supabase: SupabaseClient,
    config?: Partial<LinkGeneratorConfig>
  ) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    this.edgeService = createEdgeService(supabase);
    this.searchService = createSearchServiceV3(supabase);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Find potential link candidates for a memory
   */
  async findLinkCandidates(
    memoryId: string,
    content: string,
    userId: string,
    config?: Partial<LinkGeneratorConfig>
  ): Promise<LinkCandidate[]> {
    const finalConfig = { ...this.config, ...config };

    // Search for similar memories
    const searchResults = await this.searchService.search(userId, {
      query: content,
      topK: Math.max(20, finalConfig.maxLinks * 4),
      mode: 'hybrid',
      rerank: true,
    });

    // Filter out self and low-similarity results
    const candidates = searchResults.results.filter(
      (r) => r.id !== memoryId && r.combinedScore >= finalConfig.minSimilarity
    );

    if (candidates.length === 0) {
      return [];
    }

    // Analyze relationships with LLM if enabled
    if (finalConfig.useLLMValidation) {
      const analyzed = await this.analyzeRelationships(
        content,
        candidates.map((c) => ({ id: c.id, content: c.content })),
        finalConfig
      );

      return analyzed
        .filter((a) => a.edgeType !== 'no_relationship')
        .filter((a) => a.confidence >= finalConfig.minConfidence)
        .slice(0, finalConfig.maxLinks);
    }

    // Without LLM: use similarity-based heuristics
    return candidates.slice(0, finalConfig.maxLinks).map((c) => ({
      memoryId: c.id,
      content: c.content,
      similarity: c.combinedScore,
      edgeType: this.inferEdgeType(c.combinedScore),
      reason: `Similarity: ${(c.combinedScore * 100).toFixed(1)}%`,
      confidence: c.combinedScore,
      bidirectional: c.combinedScore >= 0.85,
    }));
  }

  /**
   * Generate links for a memory (find candidates + create edges)
   */
  async generateLinks(
    memoryId: string,
    content: string,
    userId: string,
    config?: Partial<LinkGeneratorConfig>
  ): Promise<LinkGenerationResult> {
    const startTime = Date.now();
    const finalConfig = { ...this.config, ...config };
    const errors: string[] = [];
    const createdEdges: LinkGenerationResult['edges'] = [];

    // Find candidates
    const candidates = await this.findLinkCandidates(
      memoryId,
      content,
      userId,
      finalConfig
    );

    if (candidates.length === 0) {
      return {
        sourceMemoryId: memoryId,
        candidatesEvaluated: 0,
        linksCreated: 0,
        edges: [],
        processingMs: Date.now() - startTime,
        errors: [],
      };
    }

    // Create edges
    const edgesToCreate: CreateEdgeInput[] = [];

    for (const candidate of candidates) {
      // Skip if edge type not in allowed list
      if (!finalConfig.edgeTypes.includes(candidate.edgeType)) {
        continue;
      }

      // Primary edge: new -> existing
      edgesToCreate.push({
        srcMemoryId: memoryId,
        dstMemoryId: candidate.memoryId,
        edgeType: candidate.edgeType,
        weight: candidate.similarity,
        reason: candidate.reason,
        confidence: candidate.confidence,
        createdBySystem: true,
      });

      // Bidirectional edge if applicable
      if (finalConfig.createBidirectional && candidate.bidirectional) {
        const reverseType = this.getReverseEdgeType(candidate.edgeType);
        if (reverseType) {
          edgesToCreate.push({
            srcMemoryId: candidate.memoryId,
            dstMemoryId: memoryId,
            edgeType: reverseType,
            weight: candidate.similarity,
            reason: `Reverse: ${candidate.reason}`,
            confidence: candidate.confidence * 0.9, // Slightly lower confidence for reverse
            createdBySystem: true,
          });
        }
      }
    }

    // Batch create edges
    if (edgesToCreate.length > 0) {
      try {
        const created = await this.edgeService.createEdges(userId, edgesToCreate);
        for (const edge of created) {
          if (edge.srcMemoryId === memoryId) {
            createdEdges.push({
              edgeId: edge.id,
              targetMemoryId: edge.dstMemoryId,
              edgeType: edge.edgeType,
              confidence: edge.confidence,
            });
          }
        }
      } catch (error) {
        errors.push(
          `Failed to create edges: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return {
      sourceMemoryId: memoryId,
      candidatesEvaluated: candidates.length,
      linksCreated: createdEdges.length,
      edges: createdEdges,
      processingMs: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Generate links for multiple memories
   */
  async generateLinksForBatch(
    memories: Array<{ id: string; content: string }>,
    userId: string,
    config?: Partial<LinkGeneratorConfig>
  ): Promise<BatchLinkResult> {
    const results: LinkGenerationResult[] = [];
    const errors: Array<{ memoryId: string; error: string }> = [];
    let totalEdgesCreated = 0;

    for (const memory of memories) {
      try {
        const result = await this.generateLinks(
          memory.id,
          memory.content,
          userId,
          config
        );
        results.push(result);
        totalEdgesCreated += result.linksCreated;
      } catch (error) {
        errors.push({
          memoryId: memory.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      processed: memories.length,
      successful: results.length,
      failed: errors.length,
      totalEdgesCreated,
      results,
      errors,
    };
  }

  /**
   * Process new memories that need link generation
   */
  async processNewMemories(
    userId: string,
    options?: {
      since?: Date;
      limit?: number;
      config?: Partial<LinkGeneratorConfig>;
    }
  ): Promise<BatchLinkResult> {
    const limit = options?.limit ?? 100;
    const since = options?.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24 hours

    // Find memories without links
    const { data: memories, error } = await this.supabase
      .from('spring_memory_notes')
      .select('id, content')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch memories: ${error.message}`);
    }

    if (!memories || memories.length === 0) {
      return {
        processed: 0,
        successful: 0,
        failed: 0,
        totalEdgesCreated: 0,
        results: [],
        errors: [],
      };
    }

    // Filter to memories without outgoing edges
    const { data: memoryIds } = await this.supabase
      .from('spring_memory_edges')
      .select('src_memory_id')
      .in(
        'src_memory_id',
        memories.map((m) => m.id)
      )
      .eq('created_by_system', true);

    const linkedIds = new Set((memoryIds || []).map((m) => m.src_memory_id));
    const unlinkedMemories = memories.filter((m) => !linkedIds.has(m.id));

    return this.generateLinksForBatch(unlinkedMemories, userId, options?.config);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Analyze relationships using LLM
   */
  private async analyzeRelationships(
    newContent: string,
    candidates: Array<{ id: string; content: string }>,
    config: LinkGeneratorConfig
  ): Promise<LinkCandidate[]> {
    const modelId =
      config.model === 'haiku'
        ? 'claude-3-5-haiku-20241022'
        : 'claude-3-5-sonnet-20241022';

    // Truncate contents for prompt
    const maxContentLength = 500;
    const truncate = (s: string) =>
      s.length > maxContentLength ? s.slice(0, maxContentLength) + '...' : s;

    const prompt = `NEW MEMORY:
${truncate(newContent)}

EXISTING MEMORIES:
${candidates.map((c, i) => `[${i}] ${truncate(c.content)}`).join('\n\n')}

Analyze relationships between the new memory and each existing memory.`;

    try {
      const response = await this.anthropic.messages.create({
        model: modelId,
        max_tokens: 1024,
        system: RELATIONSHIP_ANALYSIS_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content[0];
      if (textContent.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const analyses: Array<{
        index: number;
        relationship: string;
        confidence: number;
        reason: string;
        bidirectional?: boolean;
      }> = JSON.parse(textContent.text);

      return analyses
        .filter((a) => a.relationship !== 'no_relationship')
        .map((a) => {
          const candidate = candidates[a.index];
          return {
            memoryId: candidate.id,
            content: candidate.content,
            similarity: 0, // Will be updated
            edgeType: this.mapRelationshipToEdgeType(a.relationship),
            reason: a.reason,
            confidence: Math.min(1, Math.max(0, a.confidence)),
            bidirectional: a.bidirectional ?? false,
          };
        });
    } catch (error) {
      console.error('Relationship analysis failed:', error);
      // Fallback to similarity-based
      return candidates.map((c) => ({
        memoryId: c.id,
        content: c.content,
        similarity: 0.7,
        edgeType: 'relates_to' as EdgeType,
        reason: 'Fallback: Analysis failed',
        confidence: 0.5,
        bidirectional: false,
      }));
    }
  }

  /**
   * Map relationship string to EdgeType
   */
  private mapRelationshipToEdgeType(relationship: string): EdgeType {
    const mapping: Record<string, EdgeType> = {
      relates_to: 'relates_to',
      supports: 'supports',
      contradicts: 'contradicts',
      supersedes: 'supersedes',
      similar_to: 'similar_to',
      part_of: 'part_of',
      causes: 'causes',
      derived_from: 'derived_from',
      mentions: 'mentions',
    };
    return mapping[relationship] || 'relates_to';
  }

  /**
   * Infer edge type from similarity score
   */
  private inferEdgeType(similarity: number): EdgeType {
    if (similarity >= 0.95) {
      return 'similar_to';
    } else if (similarity >= 0.85) {
      return 'relates_to';
    }
    return 'relates_to';
  }

  /**
   * Get reverse edge type for bidirectional edges
   */
  private getReverseEdgeType(edgeType: EdgeType): EdgeType | null {
    const reversible: Record<EdgeType, EdgeType | null> = {
      relates_to: 'relates_to',
      supports: null, // Not naturally bidirectional
      contradicts: 'contradicts',
      supersedes: null, // One-directional
      derived_from: null, // One-directional
      mentions: null, // One-directional
      part_of: null, // One-directional
      causes: null, // One-directional
      similar_to: 'similar_to',
      no_relationship: null, // No edge to create
    };
    return reversible[edgeType];
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<LinkGeneratorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createLinkGeneratorService(
  supabase: SupabaseClient,
  config?: Partial<LinkGeneratorConfig>
): LinkGeneratorService {
  return new LinkGeneratorService(supabase, config);
}
