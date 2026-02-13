/**
 * Context Packer Service
 *
 * Optimally packs memory notes into a token budget for LLM context.
 *
 * Supports multiple packing strategies:
 * - greedy: Simple selection by score until budget exhausted
 * - knapsack: Optimal selection using dynamic programming
 * - diverse: Ensures variety across note types and topics
 *
 * Also handles:
 * - Deduplication of similar content
 * - Contradiction summarization
 * - Token estimation
 */

import type {
  MemoryNote,
  NoteType,
} from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Available packing strategies
 */
export type PackingStrategy = 'greedy' | 'knapsack' | 'diverse';

/**
 * Result of context packing
 */
export interface PackedContext {
  /** Selected memory notes */
  notes: MemoryNote[];
  /** Formatted context string ready for LLM */
  formattedContext: string;
  /** Total tokens used (estimated) */
  tokensUsed: number;
  /** Token budget provided */
  tokenBudget: number;
  /** Strategy that was used */
  strategy: PackingStrategy;
  /** Notes that were excluded with reasons */
  excluded: Array<{
    noteId: string;
    reason: 'budget' | 'duplicate' | 'contradiction' | 'low_score';
  }>;
  /** Deduplication info */
  deduplication: {
    originalCount: number;
    afterDeduplication: number;
    duplicatesRemoved: number;
  };
  /** Contradiction handling info */
  contradictions: {
    detected: number;
    summarized: number;
    summaries: string[];
  };
  /** Packing statistics */
  stats: {
    processingTimeMs: number;
    budgetUtilization: number; // percentage of budget used
    averageNoteScore: number;
    typeDistribution: Record<NoteType, number>;
  };
}

/**
 * Options for context packing
 */
export interface PackingOptions {
  /** Minimum score threshold for inclusion */
  minScore?: number;
  /** Maximum notes to include regardless of budget */
  maxNotes?: number;
  /** Note types to prioritize */
  prioritizeTypes?: NoteType[];
  /** Whether to include note metadata in output */
  includeMetadata?: boolean;
  /** Format for the output context */
  outputFormat?: 'markdown' | 'xml' | 'json' | 'plain';
  /** Similarity threshold for deduplication (0-1) */
  deduplicationThreshold?: number;
  /** Whether to summarize contradictions */
  summarizeContradictions?: boolean;
  /** Custom token estimator function */
  tokenEstimator?: (text: string) => number;
}

/**
 * Configuration for the ContextPackerService
 */
export interface ContextPackerConfig {
  /** Default packing strategy */
  defaultStrategy?: PackingStrategy;
  /** Characters per token ratio for estimation */
  charsPerToken?: number;
  /** Default deduplication threshold */
  defaultDeduplicationThreshold?: number;
  /** Function to generate embedding for deduplication */
  generateEmbedding?: (text: string) => Promise<number[]>;
  /** Anthropic API key for contradiction summarization */
  anthropicApiKey?: string;
  /** Model to use for summarization */
  model?: 'haiku' | 'sonnet';
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG = {
  defaultStrategy: 'greedy' as PackingStrategy,
  charsPerToken: 4, // Approximate for English text
  defaultDeduplicationThreshold: 0.85,
  model: 'haiku' as const,
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// =============================================================================
// ContextPackerService Class
// =============================================================================

/**
 * Service for packing memories into optimal context for LLM calls
 */
export class ContextPackerService {
  private config: Required<
    Omit<ContextPackerConfig, 'generateEmbedding' | 'anthropicApiKey'>
  > & { anthropicApiKey: string };
  private generateEmbedding?: ContextPackerConfig['generateEmbedding'];

  constructor(config: ContextPackerConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      defaultStrategy: config.defaultStrategy ?? DEFAULT_CONFIG.defaultStrategy,
      charsPerToken: config.charsPerToken ?? DEFAULT_CONFIG.charsPerToken,
      defaultDeduplicationThreshold:
        config.defaultDeduplicationThreshold ??
        DEFAULT_CONFIG.defaultDeduplicationThreshold,
      anthropicApiKey:
        config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
      model: config.model ?? DEFAULT_CONFIG.model,
    };
    this.generateEmbedding = config.generateEmbedding;
  }

  // ===========================================================================
  // Core Methods
  // ===========================================================================

  /**
   * Pack memories into optimal context for a given token budget
   */
  async packContext(
    memories: MemoryNote[],
    tokenBudget: number,
    strategy: PackingStrategy = this.config.defaultStrategy,
    options: PackingOptions = {}
  ): Promise<PackedContext> {
    const startTime = Date.now();

    // Step 1: Filter by minimum score
    const minScore = options.minScore ?? 0;
    const filtered = memories.filter((note) => {
      const score = this.getNoteScore(note);
      return score >= minScore;
    });

    const excluded: PackedContext['excluded'] = [];

    // Track notes excluded due to low score
    for (const note of memories) {
      if (!filtered.includes(note)) {
        excluded.push({ noteId: note.id, reason: 'low_score' });
      }
    }

    // Step 2: Deduplicate
    const deduplicationThreshold =
      options.deduplicationThreshold ??
      this.config.defaultDeduplicationThreshold;

    const { deduplicated, duplicates } = await this.deduplicateNotes(
      filtered,
      deduplicationThreshold
    );

    for (const noteId of duplicates) {
      excluded.push({ noteId, reason: 'duplicate' });
    }

    // Step 3: Handle contradictions
    const contradictionResult = options.summarizeContradictions
      ? await this.handleContradictions(deduplicated)
      : { notes: deduplicated, summaries: [], contradictionCount: 0 };

    // Step 4: Apply packing strategy
    const tokenEstimator =
      options.tokenEstimator ?? ((text: string) => this.estimateTokens(text));

    let selected: MemoryNote[];

    switch (strategy) {
      case 'knapsack':
        selected = this.packKnapsack(
          contradictionResult.notes,
          tokenBudget,
          tokenEstimator,
          options
        );
        break;

      case 'diverse':
        selected = this.packDiverse(
          contradictionResult.notes,
          tokenBudget,
          tokenEstimator,
          options
        );
        break;

      case 'greedy':
      default:
        selected = this.packGreedy(
          contradictionResult.notes,
          tokenBudget,
          tokenEstimator,
          options
        );
        break;
    }

    // Apply max notes limit
    if (options.maxNotes && selected.length > options.maxNotes) {
      selected = selected.slice(0, options.maxNotes);
    }

    // Track notes excluded due to budget
    for (const note of contradictionResult.notes) {
      if (!selected.includes(note)) {
        excluded.push({ noteId: note.id, reason: 'budget' });
      }
    }

    // Step 5: Format the context
    const formattedContext = this.formatContext(
      selected,
      contradictionResult.summaries,
      options
    );

    const tokensUsed = tokenEstimator(formattedContext);

    // Calculate statistics
    const processingTimeMs = Date.now() - startTime;
    const averageNoteScore =
      selected.length > 0
        ? selected.reduce((sum, note) => sum + this.getNoteScore(note), 0) /
          selected.length
        : 0;

    const typeDistribution: Record<NoteType, number> = {
      fact: 0,
      preference: 0,
      instruction: 0,
      episode: 0,
      procedure: 0,
      relationship: 0,
    };

    for (const note of selected) {
      typeDistribution[note.type]++;
    }

    return {
      notes: selected,
      formattedContext,
      tokensUsed,
      tokenBudget,
      strategy,
      excluded,
      deduplication: {
        originalCount: filtered.length,
        afterDeduplication: deduplicated.length,
        duplicatesRemoved: duplicates.length,
      },
      contradictions: {
        detected: contradictionResult.contradictionCount,
        summarized: contradictionResult.summaries.length,
        summaries: contradictionResult.summaries,
      },
      stats: {
        processingTimeMs,
        budgetUtilization: (tokensUsed / tokenBudget) * 100,
        averageNoteScore,
        typeDistribution,
      },
    };
  }

  // ===========================================================================
  // Packing Strategies
  // ===========================================================================

  /**
   * Greedy packing: Select notes by score until budget exhausted
   */
  private packGreedy(
    notes: MemoryNote[],
    tokenBudget: number,
    tokenEstimator: (text: string) => number,
    options: PackingOptions
  ): MemoryNote[] {
    // Sort by score (combining utility and salience)
    const sortedNotes = [...notes].sort((a, b) => {
      let scoreA = this.getNoteScore(a);
      let scoreB = this.getNoteScore(b);

      // Apply type prioritization
      if (options.prioritizeTypes) {
        if (options.prioritizeTypes.includes(a.type)) scoreA += 0.5;
        if (options.prioritizeTypes.includes(b.type)) scoreB += 0.5;
      }

      return scoreB - scoreA;
    });

    const selected: MemoryNote[] = [];
    let usedTokens = 0;

    for (const note of sortedNotes) {
      const noteTokens = tokenEstimator(this.getNoteText(note, options));

      if (usedTokens + noteTokens <= tokenBudget) {
        selected.push(note);
        usedTokens += noteTokens;
      }
    }

    return selected;
  }

  /**
   * Knapsack packing: Optimal selection using dynamic programming
   * Maximizes total value (score) within token budget constraint
   */
  private packKnapsack(
    notes: MemoryNote[],
    tokenBudget: number,
    tokenEstimator: (text: string) => number,
    options: PackingOptions
  ): MemoryNote[] {
    const n = notes.length;

    if (n === 0) return [];

    // Calculate weights (tokens) and values (scores) for each note
    const items = notes.map((note) => ({
      note,
      weight: Math.ceil(tokenEstimator(this.getNoteText(note, options))),
      value: this.getNoteScore(note) * 1000, // Scale for integer math
    }));

    // Apply type prioritization bonus
    if (options.prioritizeTypes) {
      for (const item of items) {
        if (options.prioritizeTypes.includes(item.note.type)) {
          item.value *= 1.5;
        }
      }
    }

    // Use integer budget for DP
    const W = Math.floor(tokenBudget);

    // For large budgets or many items, use greedy approximation
    if (W > 10000 || n > 100) {
      console.warn(
        '[ContextPacker] Large input, falling back to greedy approximation'
      );
      return this.packGreedy(notes, tokenBudget, tokenEstimator, options);
    }

    // Standard 0/1 knapsack DP
    const dp: number[][] = Array(n + 1)
      .fill(null)
      .map(() => Array(W + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      const { weight, value } = items[i - 1];
      for (let w = 0; w <= W; w++) {
        if (weight <= w) {
          dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - weight] + value);
        } else {
          dp[i][w] = dp[i - 1][w];
        }
      }
    }

    // Backtrack to find selected items
    const selected: MemoryNote[] = [];
    let w = W;

    for (let i = n; i > 0 && w > 0; i--) {
      if (dp[i][w] !== dp[i - 1][w]) {
        selected.push(items[i - 1].note);
        w -= items[i - 1].weight;
      }
    }

    return selected;
  }

  /**
   * Diverse packing: Ensures variety across note types and topics
   */
  private packDiverse(
    notes: MemoryNote[],
    tokenBudget: number,
    tokenEstimator: (text: string) => number,
    options: PackingOptions
  ): MemoryNote[] {
    // Group notes by type
    const byType: Map<NoteType, MemoryNote[]> = new Map();

    for (const note of notes) {
      if (!byType.has(note.type)) {
        byType.set(note.type, []);
      }
      byType.get(note.type)!.push(note);
    }

    // Sort each group by score
    for (const [, typeNotes] of byType) {
      typeNotes.sort((a, b) => this.getNoteScore(b) - this.getNoteScore(a));
    }

    // Round-robin selection from each type
    const selected: MemoryNote[] = [];
    let usedTokens = 0;
    let added = true;

    // Prioritize certain types first if specified
    const typeOrder: NoteType[] = options.prioritizeTypes
      ? [...options.prioritizeTypes, ...Array.from(byType.keys()).filter(
          (t) => !options.prioritizeTypes!.includes(t)
        )]
      : Array.from(byType.keys());

    while (added && usedTokens < tokenBudget) {
      added = false;

      for (const type of typeOrder) {
        const typeNotes = byType.get(type);
        if (!typeNotes || typeNotes.length === 0) continue;

        const note = typeNotes.shift()!;
        const noteTokens = tokenEstimator(this.getNoteText(note, options));

        if (usedTokens + noteTokens <= tokenBudget) {
          selected.push(note);
          usedTokens += noteTokens;
          added = true;
        }
      }
    }

    return selected;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Get combined score for a note (utility + salience)
   */
  private getNoteScore(note: MemoryNote): number {
    const utility = note.utility?.score ?? 0.5;
    const salience = note.salience?.score ?? 0.5;

    // Weighted combination
    return utility * 0.6 + salience * 0.4;
  }

  /**
   * Get text representation of a note for token estimation
   */
  private getNoteText(note: MemoryNote, options: PackingOptions): string {
    if (options.includeMetadata) {
      return `[${note.type}] ${note.content} (tags: ${note.tags?.join(', ') || 'none'})`;
    }
    return note.content;
  }

  /**
   * Estimate tokens for a text string
   */
  private estimateTokens(text: string): number {
    // Simple character-based estimation
    return Math.ceil(text.length / this.config.charsPerToken);
  }

  /**
   * Deduplicate notes based on similarity
   */
  private async deduplicateNotes(
    notes: MemoryNote[],
    threshold: number
  ): Promise<{ deduplicated: MemoryNote[]; duplicates: string[] }> {
    const deduplicated: MemoryNote[] = [];
    const duplicates: string[] = [];

    for (const note of notes) {
      let isDuplicate = false;

      for (const selected of deduplicated) {
        const similarity = await this.calculateSimilarity(note, selected);

        if (similarity >= threshold) {
          isDuplicate = true;
          duplicates.push(note.id);

          // Keep the note with higher score
          const noteScore = this.getNoteScore(note);
          const selectedScore = this.getNoteScore(selected);

          if (noteScore > selectedScore) {
            // Replace with higher-scoring note
            const index = deduplicated.indexOf(selected);
            deduplicated[index] = note;
            duplicates.push(selected.id);
            duplicates.pop(); // Remove the note we just added as duplicate
          }

          break;
        }
      }

      if (!isDuplicate) {
        deduplicated.push(note);
      }
    }

    return { deduplicated, duplicates };
  }

  /**
   * Calculate similarity between two notes
   */
  private async calculateSimilarity(
    note1: MemoryNote,
    note2: MemoryNote
  ): Promise<number> {
    // If embeddings are available, use cosine similarity
    if (note1.embedding && note2.embedding) {
      return this.cosineSimilarity(note1.embedding, note2.embedding);
    }

    // Fall back to text-based similarity (Jaccard)
    return this.textSimilarity(note1.content, note2.content);
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Calculate text similarity using Jaccard index
   */
  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Handle contradictions in notes
   */
  private async handleContradictions(notes: MemoryNote[]): Promise<{
    notes: MemoryNote[];
    summaries: string[];
    contradictionCount: number;
  }> {
    // Find notes marked as contradicted or with contradiction edges
    const contradictedIds = new Set<string>();
    const contradictionPairs: Array<[MemoryNote, MemoryNote]> = [];

    for (const note of notes) {
      if (note.status === 'contradicted' || note.contradictedById) {
        contradictedIds.add(note.id);

        // Find the contradicting note
        if (note.contradictedById) {
          const contradicting = notes.find(
            (n) => n.id === note.contradictedById
          );
          if (contradicting) {
            contradictionPairs.push([note, contradicting]);
          }
        }
      }
    }

    // If no contradictions, return as-is
    if (contradictionPairs.length === 0) {
      return { notes, summaries: [], contradictionCount: 0 };
    }

    // Summarize each contradiction pair
    const summaries: string[] = [];

    for (const [note1, note2] of contradictionPairs) {
      try {
        const summary = await this.summarizeContradiction(note1, note2);
        summaries.push(summary);
      } catch (error) {
        console.error(
          '[ContextPacker] Failed to summarize contradiction:',
          error
        );
        // Fall back to including both notes with a warning
        summaries.push(
          `Note: Potential conflict between "${note1.content.slice(0, 50)}..." and "${note2.content.slice(0, 50)}..."`
        );
      }
    }

    // Filter out the original contradicted notes
    const filteredNotes = notes.filter((n) => !contradictedIds.has(n.id));

    return {
      notes: filteredNotes,
      summaries,
      contradictionCount: contradictionPairs.length,
    };
  }

  /**
   * Summarize a contradiction between two notes
   */
  private async summarizeContradiction(
    note1: MemoryNote,
    note2: MemoryNote
  ): Promise<string> {
    if (!this.config.anthropicApiKey) {
      // Simple fallback without LLM
      return `Conflicting information: "${note1.content}" vs "${note2.content}" - using more recent information.`;
    }

    const prompt = `These two pieces of information appear to contradict each other:

1. "${note1.content}" (created: ${note1.createdAt})
2. "${note2.content}" (created: ${note2.createdAt})

Provide a brief (1-2 sentence) summary that acknowledges the conflict and, if possible, indicates which is likely more current or accurate. Do not use any special formatting, just plain text.`;

    const modelId =
      this.config.model === 'haiku'
        ? 'claude-3-5-haiku-20241022'
        : 'claude-3-5-sonnet-20241022';

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${await response.text()}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Format selected notes into context string
   */
  private formatContext(
    notes: MemoryNote[],
    contradictionSummaries: string[],
    options: PackingOptions
  ): string {
    const format = options.outputFormat ?? 'markdown';

    switch (format) {
      case 'xml':
        return this.formatAsXml(notes, contradictionSummaries, options);
      case 'json':
        return this.formatAsJson(notes, contradictionSummaries, options);
      case 'plain':
        return this.formatAsPlain(notes, contradictionSummaries, options);
      case 'markdown':
      default:
        return this.formatAsMarkdown(notes, contradictionSummaries, options);
    }
  }

  private formatAsMarkdown(
    notes: MemoryNote[],
    contradictionSummaries: string[],
    options: PackingOptions
  ): string {
    const lines: string[] = ['## Relevant Memories\n'];

    // Add contradiction summaries first
    if (contradictionSummaries.length > 0) {
      lines.push('### Notes on Conflicting Information\n');
      for (const summary of contradictionSummaries) {
        lines.push(`- ${summary}`);
      }
      lines.push('');
    }

    // Group by type for better organization
    const byType: Map<NoteType, MemoryNote[]> = new Map();
    for (const note of notes) {
      if (!byType.has(note.type)) {
        byType.set(note.type, []);
      }
      byType.get(note.type)!.push(note);
    }

    for (const [type, typeNotes] of byType) {
      lines.push(`### ${this.formatTypeName(type)}\n`);
      for (const note of typeNotes) {
        lines.push(`- ${note.content}`);
        if (options.includeMetadata && note.tags?.length) {
          lines.push(`  *Tags: ${note.tags.join(', ')}*`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private formatAsXml(
    notes: MemoryNote[],
    contradictionSummaries: string[],
    options: PackingOptions
  ): string {
    const lines: string[] = ['<memories>'];

    if (contradictionSummaries.length > 0) {
      lines.push('  <conflicts>');
      for (const summary of contradictionSummaries) {
        lines.push(`    <conflict>${this.escapeXml(summary)}</conflict>`);
      }
      lines.push('  </conflicts>');
    }

    for (const note of notes) {
      lines.push(`  <memory type="${note.type}">`);
      lines.push(`    <content>${this.escapeXml(note.content)}</content>`);
      if (options.includeMetadata && note.tags?.length) {
        lines.push(`    <tags>${note.tags.join(', ')}</tags>`);
      }
      lines.push('  </memory>');
    }

    lines.push('</memories>');
    return lines.join('\n');
  }

  private formatAsJson(
    notes: MemoryNote[],
    contradictionSummaries: string[],
    options: PackingOptions
  ): string {
    const output: {
      conflicts?: string[];
      memories: Array<{
        type: string;
        content: string;
        tags?: string[];
      }>;
    } = {
      memories: notes.map((note) => ({
        type: note.type,
        content: note.content,
        ...(options.includeMetadata && note.tags?.length
          ? { tags: note.tags }
          : {}),
      })),
    };

    if (contradictionSummaries.length > 0) {
      output.conflicts = contradictionSummaries;
    }

    return JSON.stringify(output, null, 2);
  }

  private formatAsPlain(
    notes: MemoryNote[],
    contradictionSummaries: string[],
    options: PackingOptions
  ): string {
    const lines: string[] = [];

    if (contradictionSummaries.length > 0) {
      lines.push('CONFLICTS:');
      for (const summary of contradictionSummaries) {
        lines.push(`- ${summary}`);
      }
      lines.push('');
    }

    lines.push('MEMORIES:');
    for (const note of notes) {
      lines.push(`[${note.type.toUpperCase()}] ${note.content}`);
      if (options.includeMetadata && note.tags?.length) {
        lines.push(`  Tags: ${note.tags.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  private formatTypeName(type: NoteType): string {
    const names: Record<NoteType, string> = {
      fact: 'Facts',
      preference: 'Preferences',
      instruction: 'Instructions',
      episode: 'Episodes',
      procedure: 'Procedures',
      relationship: 'Relationships',
    };
    return names[type] || type;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ===========================================================================
  // Tier-Aware Packing (MemGPT-style)
  // ===========================================================================

  /**
   * Pack memories with tier-based budget allocation (MemGPT-style)
   *
   * Allocates different portions of the token budget to each tier:
   * - hot: Always loaded, highest priority
   * - warm: Frequently used, loaded by relevance
   * - cold: Archived, loaded on demand
   * - frozen: Rarely accessed (typically 0 budget)
   */
  async packContextWithTiers(
    memories: MemoryNote[],
    totalBudget: number,
    tierBudgets: { hot: number; warm: number; cold: number; frozen?: number },
    options: PackingOptions = {}
  ): Promise<PackedContext & { tierStats: Record<string, { count: number; tokens: number }> }> {
    const startTime = Date.now();

    // Normalize budgets to fit total
    const totalConfigured = tierBudgets.hot + tierBudgets.warm + tierBudgets.cold + (tierBudgets.frozen ?? 0);
    const scaleFactor = totalBudget / (totalConfigured || 1);

    const budgets = {
      hot: Math.round(tierBudgets.hot * scaleFactor),
      warm: Math.round(tierBudgets.warm * scaleFactor),
      cold: Math.round(tierBudgets.cold * scaleFactor),
      frozen: Math.round((tierBudgets.frozen ?? 0) * scaleFactor),
    };

    // Partition memories by tier
    const byTier: Record<string, MemoryNote[]> = {
      hot: [],
      warm: [],
      cold: [],
      frozen: [],
    };

    for (const memory of memories) {
      const tier = (memory as MemoryNote & { tier?: string }).tier || 'warm';
      if (byTier[tier]) {
        byTier[tier].push(memory);
      } else {
        byTier.warm.push(memory); // Default to warm
      }
    }

    // Sort each tier by score
    for (const tier of Object.keys(byTier)) {
      byTier[tier].sort((a, b) => this.getNoteScore(b) - this.getNoteScore(a));
    }

    // Pack each tier
    const selectedNotes: MemoryNote[] = [];
    const excluded: PackedContext['excluded'] = [];
    const tierStats: Record<string, { count: number; tokens: number }> = {};

    const tierOrder = ['hot', 'warm', 'cold', 'frozen'];

    for (const tier of tierOrder) {
      const tierMemories = byTier[tier];
      const tierBudget = budgets[tier as keyof typeof budgets];

      if (tierBudget <= 0 || tierMemories.length === 0) {
        tierStats[tier] = { count: 0, tokens: 0 };
        continue;
      }

      // Select notes within tier budget
      let usedTokens = 0;
      let selectedCount = 0;

      for (const note of tierMemories) {
        const noteTokens = this.estimateTokens(note.content);

        if (usedTokens + noteTokens <= tierBudget) {
          selectedNotes.push(note);
          usedTokens += noteTokens;
          selectedCount++;
        } else {
          excluded.push({ noteId: note.id, reason: 'budget' });
        }
      }

      tierStats[tier] = { count: selectedCount, tokens: usedTokens };
    }

    // Apply deduplication if needed
    const deduplicationThreshold = options.deduplicationThreshold ?? this.config.defaultDeduplicationThreshold;
    const { deduplicated, duplicates } = await this.deduplicateNotes(
      selectedNotes,
      deduplicationThreshold
    );

    for (const dupId of duplicates) {
      excluded.push({ noteId: dupId, reason: 'duplicate' });
    }

    // Handle contradictions if enabled
    let contradictionSummaries: string[] = [];
    if (options.summarizeContradictions !== false) {
      const { notes: nonContradicting, summaries } = await this.handleContradictions(
        deduplicated
      );
      contradictionSummaries = summaries;

      // Find notes that were summarized
      const summarizedIds = new Set(
        deduplicated
          .filter((n) => !nonContradicting.includes(n))
          .map((n) => n.id)
      );

      for (const id of summarizedIds) {
        excluded.push({ noteId: id, reason: 'contradiction' });
      }
    }

    const finalNotes = options.summarizeContradictions !== false
      ? deduplicated.filter((n) => !contradictionSummaries.length || !excluded.find((e) => e.noteId === n.id && e.reason === 'contradiction'))
      : deduplicated;

    // Format context
    const formattedContext = this.formatContext(
      finalNotes,
      contradictionSummaries,
      options
    );

    // Calculate final stats
    const tokensUsed = this.estimateTokens(formattedContext);
    const typeDistribution: Record<NoteType, number> = {
      fact: 0,
      preference: 0,
      instruction: 0,
      episode: 0,
      procedure: 0,
      relationship: 0,
    };

    for (const note of finalNotes) {
      typeDistribution[note.type] = (typeDistribution[note.type] || 0) + 1;
    }

    return {
      notes: finalNotes,
      formattedContext,
      tokensUsed,
      tokenBudget: totalBudget,
      strategy: 'greedy', // Tier packing uses greedy within each tier
      excluded,
      deduplication: {
        originalCount: memories.length,
        afterDeduplication: deduplicated.length,
        duplicatesRemoved: duplicates.length,
      },
      contradictions: {
        detected: 0,
        summarized: contradictionSummaries.length,
        summaries: contradictionSummaries,
      },
      stats: {
        processingTimeMs: Date.now() - startTime,
        budgetUtilization: (tokensUsed / totalBudget) * 100,
        averageNoteScore:
          finalNotes.length > 0
            ? finalNotes.reduce((sum, n) => sum + this.getNoteScore(n), 0) / finalNotes.length
            : 0,
        typeDistribution,
      },
      tierStats,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new ContextPackerService instance
 */
export function createContextPackerService(
  config?: ContextPackerConfig
): ContextPackerService {
  return new ContextPackerService(config);
}

// =============================================================================
// Exports
// =============================================================================

export default ContextPackerService;
