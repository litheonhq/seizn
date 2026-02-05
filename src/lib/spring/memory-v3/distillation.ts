/**
 * Memory Distillation Service
 *
 * Implements MemGPT-style hierarchical memory management through:
 * - Clustering similar episode notes
 * - Creating summarized "semantic memory" from clusters
 * - Moving raw episodes to cold tier (lower importance)
 *
 * This enables efficient memory consolidation over time, similar to how
 * human memory consolidates episodic memories into semantic knowledge.
 */

import type {
  MemoryNote,
  MemoryNoteInput,
  MemoryEdge,
  MemoryEdgeInput,
  NoteType,
  NoteStatus,
  SalienceScore,
  ProvenanceInfo,
} from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * A cluster of related memory notes
 */
export interface Cluster {
  /** Unique identifier for the cluster */
  id: string;
  /** User who owns this cluster */
  userId: string;
  /** The notes in this cluster */
  notes: MemoryNote[];
  /** Centroid embedding of the cluster */
  centroid?: number[];
  /** Common themes/topics identified in the cluster */
  themes: string[];
  /** Average similarity within the cluster */
  intraClusterSimilarity: number;
  /** The dominant note type in the cluster */
  dominantType: NoteType;
  /** When the cluster was identified */
  createdAt: Date;
  /** Metadata about the clustering */
  metadata?: Record<string, unknown>;
}

/**
 * Result of the distillation process
 */
export interface DistillationResult {
  /** Clusters that were identified */
  clustersFound: number;
  /** Clusters that were distilled into semantic memories */
  clustersDistilled: number;
  /** New semantic memory notes created */
  semanticNotesCreated: MemoryNote[];
  /** Episode notes that were archived (moved to cold tier) */
  episodesArchived: number;
  /** Total processing time in milliseconds */
  processingTimeMs: number;
  /** Detailed logs of the process */
  logs: DistillationLog[];
  /** Any errors encountered */
  errors: Array<{ clusterId: string; error: string }>;
}

/**
 * Log entry for distillation process
 */
export interface DistillationLog {
  /** Timestamp of the log */
  timestamp: Date;
  /** Type of log entry */
  type: 'cluster_found' | 'summary_created' | 'episodes_archived' | 'error';
  /** Description of what happened */
  message: string;
  /** Associated cluster ID if applicable */
  clusterId?: string;
  /** Additional data */
  data?: Record<string, unknown>;
}

/**
 * Configuration for the DistillationService
 */
export interface DistillationConfig {
  /** Anthropic API key for LLM summarization */
  anthropicApiKey?: string;
  /** Model to use for summarization */
  model?: 'haiku' | 'sonnet';
  /** Minimum cluster size to consider for distillation */
  minClusterSize?: number;
  /** Maximum cluster size before forcing distillation */
  maxClusterSize?: number;
  /** Similarity threshold for clustering (0-1) */
  clusteringSimilarityThreshold?: number;
  /** Importance reduction factor for archived episodes */
  archiveImportanceReduction?: number;
  /** Function to search for similar notes */
  searchSimilarNotes?: (
    embedding: number[],
    userId: string,
    limit: number
  ) => Promise<Array<{ note: MemoryNote; similarity: number }>>;
  /** Function to get notes by query */
  getNotes?: (
    userId: string,
    options?: { types?: NoteType[]; statuses?: NoteStatus[]; limit?: number }
  ) => Promise<MemoryNote[]>;
  /** Function to create a note */
  createNote?: (input: MemoryNoteInput) => Promise<MemoryNote>;
  /** Function to update a note */
  updateNote?: (
    noteId: string,
    updates: Partial<MemoryNoteInput>
  ) => Promise<MemoryNote>;
  /** Function to create an edge */
  createEdge?: (edge: MemoryEdgeInput) => Promise<MemoryEdge>;
  /** Function to generate embedding */
  generateEmbedding?: (text: string) => Promise<number[]>;
}

// =============================================================================
// Constants
// =============================================================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const DEFAULT_CONFIG = {
  model: 'haiku' as const,
  minClusterSize: 3,
  maxClusterSize: 20,
  clusteringSimilarityThreshold: 0.75,
  archiveImportanceReduction: 0.5,
};

// =============================================================================
// Prompts
// =============================================================================

const CLUSTER_SUMMARY_SYSTEM_PROMPT = `You are an expert at synthesizing and summarizing related pieces of information into coherent, factual knowledge.

Your task is to take a cluster of related memory notes (typically episodic memories or observations) and distill them into a single, comprehensive semantic memory.

## Guidelines

1. **Identify Common Themes**: Look for recurring patterns, facts, or preferences across the notes.

2. **Synthesize, Don't List**: Create a coherent summary rather than listing individual items.

3. **Preserve Key Details**: Keep important specifics that appear consistently.

4. **Handle Conflicts**: If notes contain conflicting information, note the most recent or most frequent pattern.

5. **Be Factual**: Stick to what the notes actually say, don't infer beyond the evidence.

6. **Be Concise**: The summary should be shorter than the combined input while capturing essential knowledge.

## Output Format

Return a JSON object:
{
  "summary": "The distilled semantic memory content",
  "themes": ["theme1", "theme2"],
  "confidence": 0.0-1.0,
  "noteType": "fact" | "preference" | "procedure" | "relationship",
  "keyEntities": ["entity1", "entity2"]
}

Return ONLY valid JSON, no markdown or explanation.`;

// =============================================================================
// DistillationService Class
// =============================================================================

/**
 * Service for distilling episodic memories into semantic knowledge
 */
export class DistillationService {
  private config: Required<
    Omit<
      DistillationConfig,
      | 'anthropicApiKey'
      | 'searchSimilarNotes'
      | 'getNotes'
      | 'createNote'
      | 'updateNote'
      | 'createEdge'
      | 'generateEmbedding'
    >
  > & { anthropicApiKey: string };
  private searchSimilarNotes?: DistillationConfig['searchSimilarNotes'];
  private getNotes?: DistillationConfig['getNotes'];
  private createNote?: DistillationConfig['createNote'];
  private updateNote?: DistillationConfig['updateNote'];
  private createEdge?: DistillationConfig['createEdge'];
  private generateEmbedding?: DistillationConfig['generateEmbedding'];

  constructor(config: DistillationConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      anthropicApiKey:
        config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
      model: config.model ?? DEFAULT_CONFIG.model,
      minClusterSize: config.minClusterSize ?? DEFAULT_CONFIG.minClusterSize,
      maxClusterSize: config.maxClusterSize ?? DEFAULT_CONFIG.maxClusterSize,
      clusteringSimilarityThreshold:
        config.clusteringSimilarityThreshold ??
        DEFAULT_CONFIG.clusteringSimilarityThreshold,
      archiveImportanceReduction:
        config.archiveImportanceReduction ??
        DEFAULT_CONFIG.archiveImportanceReduction,
    };
    this.searchSimilarNotes = config.searchSimilarNotes;
    this.getNotes = config.getNotes;
    this.createNote = config.createNote;
    this.updateNote = config.updateNote;
    this.createEdge = config.createEdge;
    this.generateEmbedding = config.generateEmbedding;
  }

  // ===========================================================================
  // Core Methods
  // ===========================================================================

  /**
   * Find clusters of similar episode notes for a user
   *
   * Uses agglomerative clustering based on embedding similarity
   */
  async findClusters(userId: string, minSize?: number): Promise<Cluster[]> {
    const effectiveMinSize = minSize ?? this.config.minClusterSize;

    if (!this.getNotes) {
      throw new Error('getNotes function not configured');
    }

    // Get all episode notes for the user
    const episodes = await this.getNotes(userId, {
      types: ['episode'],
      statuses: ['active'],
      limit: 500, // Process up to 500 notes at a time
    });

    if (episodes.length < effectiveMinSize) {
      return [];
    }

    // Filter notes with embeddings
    const notesWithEmbeddings = episodes.filter(
      (note) => note.embedding && note.embedding.length > 0
    );

    if (notesWithEmbeddings.length < effectiveMinSize) {
      return [];
    }

    // Perform clustering
    const clusters = this.performClustering(
      notesWithEmbeddings,
      this.config.clusteringSimilarityThreshold,
      effectiveMinSize
    );

    // Enrich clusters with metadata
    return clusters.map((noteGroup, index) => {
      const centroid = this.computeCentroid(
        noteGroup.map((n) => n.embedding!)
      );
      const themes = this.extractThemes(noteGroup);
      const dominantType = this.getDominantType(noteGroup);
      const intraClusterSimilarity =
        this.computeIntraClusterSimilarity(noteGroup);

      return {
        id: `cluster_${userId}_${Date.now()}_${index}`,
        userId,
        notes: noteGroup,
        centroid,
        themes,
        intraClusterSimilarity,
        dominantType,
        createdAt: new Date(),
      };
    });
  }

  /**
   * Create a semantic memory note summarizing a cluster
   */
  async createClusterSummary(clusterId: string): Promise<MemoryNote> {
    // Parse cluster from stored clusters or find it
    // In a real implementation, clusters would be persisted
    throw new Error(
      'Cluster must be passed directly. Use createClusterSummaryFromCluster instead.'
    );
  }

  /**
   * Create a semantic memory note from a cluster object
   */
  async createClusterSummaryFromCluster(cluster: Cluster): Promise<MemoryNote> {
    if (!this.createNote) {
      throw new Error('createNote function not configured');
    }

    if (cluster.notes.length === 0) {
      throw new Error('Cluster has no notes to summarize');
    }

    // Generate summary using LLM
    const summaryResult = await this.generateClusterSummary(cluster);

    // Create provenance tracking what this note was derived from
    const provenance: ProvenanceInfo = {
      source: {
        type: 'distillation',
        sourceId: cluster.id,
        extractedAt: new Date(),
        extractionMethod: 'llm_summarization',
        extractionConfidence: summaryResult.confidence,
      },
      createdBy: 'distillation_service',
      modelVersion: this.config.model,
      derivationChain: cluster.notes.map((n) => n.id),
    };

    // Determine the best note type based on cluster content
    const noteType = summaryResult.noteType || cluster.dominantType;

    // Generate embedding for the summary
    let embedding: number[] | undefined;
    if (this.generateEmbedding) {
      try {
        embedding = await this.generateEmbedding(summaryResult.summary);
      } catch (error) {
        console.error(
          '[DistillationService] Failed to generate embedding:',
          error
        );
      }
    }

    // Create the semantic memory note
    const semanticNote = await this.createNote({
      content: summaryResult.summary,
      type: noteType === 'episode' ? 'fact' : noteType, // Convert episode to fact for semantic memory
      scope: 'user',
      userId: cluster.userId,
      provenance,
      embedding,
      tags: [...summaryResult.themes, 'semantic_memory', 'distilled'],
      metadata: {
        sourceClusterId: cluster.id,
        sourceNoteCount: cluster.notes.length,
        distillationTimestamp: new Date().toISOString(),
        themes: summaryResult.themes,
        keyEntities: summaryResult.keyEntities,
      },
      importanceBoost: 0.1, // Slight boost for distilled knowledge
    });

    // Create edges linking semantic note to source episodes
    if (this.createEdge) {
      for (const sourceNote of cluster.notes) {
        try {
          await this.createEdge({
            sourceId: semanticNote.id,
            targetId: sourceNote.id,
            type: 'derived_from',
            weight: 1.0,
            properties: {
              clusterId: cluster.id,
              distillationType: 'semantic_summary',
            },
            isAutoGenerated: true,
          });
        } catch (error) {
          console.error(
            '[DistillationService] Failed to create edge:',
            error
          );
        }
      }
    }

    return semanticNote;
  }

  /**
   * Archive episodes in a cluster by reducing their importance
   * This moves them to the "cold tier" in the hierarchical memory
   */
  async archiveClusterEpisodes(clusterId: string): Promise<void> {
    throw new Error(
      'Cluster must be passed directly. Use archiveClusterEpisodesFromCluster instead.'
    );
  }

  /**
   * Archive episodes from a cluster object
   */
  async archiveClusterEpisodesFromCluster(cluster: Cluster): Promise<void> {
    if (!this.updateNote) {
      throw new Error('updateNote function not configured');
    }

    for (const note of cluster.notes) {
      try {
        // Reduce the salience/importance of the episode
        const currentSalience = note.salience?.score ?? 0.5;
        const newSalience =
          currentSalience * this.config.archiveImportanceReduction;

        const updatedSalience: SalienceScore = {
          score: newSalience,
          recencyFactor: note.salience?.recencyFactor ?? 1.0,
          frequencyFactor: note.salience?.frequencyFactor ?? 0,
          relevanceFactor:
            (note.salience?.relevanceFactor ?? 0.5) *
            this.config.archiveImportanceReduction,
          importanceBoost: 0, // Remove any importance boost
          calculatedAt: new Date(),
        };

        await this.updateNote(note.id, {
          tags: [...(note.tags || []), 'archived', 'cold_tier'],
          metadata: {
            ...note.metadata,
            archivedAt: new Date().toISOString(),
            archivedReason: 'distillation',
            sourceClusterId: cluster.id,
            originalSalience: currentSalience,
          },
        });

        // Note: In a real implementation, you'd also update the salience
        // directly in the database. This requires database-level updates.
      } catch (error) {
        console.error(
          '[DistillationService] Failed to archive episode:',
          note.id,
          error
        );
      }
    }
  }

  /**
   * Run the full distillation pipeline for a user
   *
   * This:
   * 1. Finds clusters of similar episodes
   * 2. Creates semantic summaries for qualifying clusters
   * 3. Archives the source episodes (moves to cold tier)
   */
  async runDistillation(userId: string): Promise<DistillationResult> {
    const startTime = Date.now();
    const logs: DistillationLog[] = [];
    const errors: Array<{ clusterId: string; error: string }> = [];
    const semanticNotesCreated: MemoryNote[] = [];
    let episodesArchived = 0;

    // Step 1: Find clusters
    logs.push({
      timestamp: new Date(),
      type: 'cluster_found',
      message: 'Starting cluster identification',
    });

    const clusters = await this.findClusters(userId);

    logs.push({
      timestamp: new Date(),
      type: 'cluster_found',
      message: `Found ${clusters.length} clusters`,
      data: { clusterCount: clusters.length },
    });

    // Step 2: Process each cluster
    for (const cluster of clusters) {
      // Skip clusters that are too small
      if (cluster.notes.length < this.config.minClusterSize) {
        continue;
      }

      // Check if cluster should be distilled (either large enough or high similarity)
      const shouldDistill =
        cluster.notes.length >= this.config.maxClusterSize ||
        (cluster.notes.length >= this.config.minClusterSize &&
          cluster.intraClusterSimilarity >= 0.8);

      if (!shouldDistill) {
        continue;
      }

      try {
        // Create semantic summary
        logs.push({
          timestamp: new Date(),
          type: 'summary_created',
          message: `Creating summary for cluster with ${cluster.notes.length} notes`,
          clusterId: cluster.id,
        });

        const semanticNote =
          await this.createClusterSummaryFromCluster(cluster);
        semanticNotesCreated.push(semanticNote);

        logs.push({
          timestamp: new Date(),
          type: 'summary_created',
          message: `Created semantic note: ${semanticNote.id}`,
          clusterId: cluster.id,
          data: { noteId: semanticNote.id },
        });

        // Archive source episodes
        await this.archiveClusterEpisodesFromCluster(cluster);
        episodesArchived += cluster.notes.length;

        logs.push({
          timestamp: new Date(),
          type: 'episodes_archived',
          message: `Archived ${cluster.notes.length} episodes`,
          clusterId: cluster.id,
          data: { archivedCount: cluster.notes.length },
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push({ clusterId: cluster.id, error: errorMessage });

        logs.push({
          timestamp: new Date(),
          type: 'error',
          message: `Failed to process cluster: ${errorMessage}`,
          clusterId: cluster.id,
        });
      }
    }

    const processingTimeMs = Date.now() - startTime;

    return {
      clustersFound: clusters.length,
      clustersDistilled: semanticNotesCreated.length,
      semanticNotesCreated,
      episodesArchived,
      processingTimeMs,
      logs,
      errors,
    };
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Perform agglomerative clustering on notes
   */
  private performClustering(
    notes: MemoryNote[],
    similarityThreshold: number,
    minClusterSize: number
  ): MemoryNote[][] {
    // Simple single-linkage agglomerative clustering
    const clusters: Set<number>[] = notes.map((_, i) => new Set([i]));
    const processed = new Set<number>();

    // Compute similarity matrix
    const similarities: Map<string, number> = new Map();
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const sim = this.cosineSimilarity(
          notes[i].embedding!,
          notes[j].embedding!
        );
        similarities.set(`${i}-${j}`, sim);
      }
    }

    // Merge clusters iteratively
    let merged = true;
    while (merged) {
      merged = false;

      for (let i = 0; i < clusters.length; i++) {
        if (processed.has(i) || clusters[i].size === 0) continue;

        for (let j = i + 1; j < clusters.length; j++) {
          if (processed.has(j) || clusters[j].size === 0) continue;

          // Check if clusters should be merged
          const shouldMerge = this.shouldMergeClusters(
            clusters[i],
            clusters[j],
            similarities,
            similarityThreshold
          );

          if (shouldMerge) {
            // Merge j into i
            for (const idx of clusters[j]) {
              clusters[i].add(idx);
            }
            clusters[j].clear();
            processed.add(j);
            merged = true;
          }
        }
      }
    }

    // Convert to note arrays and filter by minimum size
    return clusters
      .filter((cluster) => cluster.size >= minClusterSize)
      .map((cluster) => [...cluster].map((idx) => notes[idx]));
  }

  /**
   * Check if two clusters should be merged based on average linkage
   */
  private shouldMergeClusters(
    cluster1: Set<number>,
    cluster2: Set<number>,
    similarities: Map<string, number>,
    threshold: number
  ): boolean {
    let totalSim = 0;
    let count = 0;

    for (const i of cluster1) {
      for (const j of cluster2) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        const sim = similarities.get(key) ?? 0;
        totalSim += sim;
        count++;
      }
    }

    const avgSim = count > 0 ? totalSim / count : 0;
    return avgSim >= threshold;
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
   * Compute the centroid of a set of embeddings
   */
  private computeCentroid(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];

    const dim = embeddings[0].length;
    const centroid = new Array(dim).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += embedding[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= embeddings.length;
    }

    return centroid;
  }

  /**
   * Extract common themes from cluster notes
   */
  private extractThemes(notes: MemoryNote[]): string[] {
    // Simple theme extraction based on tags and common words
    const tagCounts = new Map<string, number>();
    const wordCounts = new Map<string, number>();

    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'been',
      'be',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'as',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'between',
      'under',
      'again',
      'further',
      'then',
      'once',
      'here',
      'there',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',
      'no',
      'nor',
      'not',
      'only',
      'own',
      'same',
      'so',
      'than',
      'too',
      'very',
      'just',
      'and',
      'but',
      'if',
      'or',
      'because',
      'until',
      'while',
      'although',
      'since',
      'unless',
      'that',
      'this',
      'these',
      'those',
      'it',
      'its',
      'user',
      'note',
      'memory',
    ]);

    for (const note of notes) {
      // Count tags
      for (const tag of note.tags || []) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }

      // Count significant words
      const words = note.content
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stopWords.has(w));

      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    // Get top themes from tags and words
    const themes: string[] = [];

    // Add frequent tags
    const sortedTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [tag] of sortedTags) {
      if (!themes.includes(tag)) {
        themes.push(tag);
      }
    }

    // Add frequent words
    const sortedWords = [...wordCounts.entries()]
      .filter(([, count]) => count >= notes.length * 0.3) // Word appears in 30%+ of notes
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [word] of sortedWords) {
      if (!themes.includes(word)) {
        themes.push(word);
      }
    }

    return themes.slice(0, 5);
  }

  /**
   * Get the dominant note type in a cluster
   */
  private getDominantType(notes: MemoryNote[]): NoteType {
    const typeCounts = new Map<NoteType, number>();

    for (const note of notes) {
      typeCounts.set(note.type, (typeCounts.get(note.type) || 0) + 1);
    }

    let dominantType: NoteType = 'episode';
    let maxCount = 0;

    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }

    return dominantType;
  }

  /**
   * Compute average intra-cluster similarity
   */
  private computeIntraClusterSimilarity(notes: MemoryNote[]): number {
    if (notes.length < 2) return 1.0;

    let totalSim = 0;
    let count = 0;

    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        if (notes[i].embedding && notes[j].embedding) {
          totalSim += this.cosineSimilarity(
            notes[i].embedding!,
            notes[j].embedding!
          );
          count++;
        }
      }
    }

    return count > 0 ? totalSim / count : 0;
  }

  /**
   * Generate a summary of the cluster using LLM
   */
  private async generateClusterSummary(cluster: Cluster): Promise<{
    summary: string;
    themes: string[];
    confidence: number;
    noteType: NoteType;
    keyEntities: string[];
  }> {
    const notesContent = cluster.notes
      .map(
        (note, i) =>
          `Note ${i + 1} (${note.type}, ${note.createdAt instanceof Date ? note.createdAt.toISOString() : note.createdAt}):\n"${note.content}"`
      )
      .join('\n\n');

    const prompt = `Analyze and summarize the following cluster of ${cluster.notes.length} related memory notes:

${notesContent}

Common themes identified: ${cluster.themes.join(', ') || 'none'}

Create a single, coherent semantic memory that captures the essential knowledge from these notes.`;

    try {
      const response = await this.callClaude(prompt);
      return this.parseSummaryResponse(response);
    } catch (error) {
      console.error(
        '[DistillationService] Failed to generate summary:',
        error
      );

      // Fallback: Create a simple concatenated summary
      return {
        summary: `Combined knowledge from ${cluster.notes.length} related observations: ${cluster.themes.join(', ')}. ` +
          cluster.notes.slice(0, 3).map(n => n.content).join(' '),
        themes: cluster.themes,
        confidence: 0.5,
        noteType: cluster.dominantType,
        keyEntities: [],
      };
    }
  }

  /**
   * Parse the LLM summary response
   */
  private parseSummaryResponse(response: string): {
    summary: string;
    themes: string[];
    confidence: number;
    noteType: NoteType;
    keyEntities: string[];
  } {
    try {
      let jsonStr = response.trim();

      // Handle potential markdown code blocks
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr);

      const validTypes: NoteType[] = [
        'fact',
        'preference',
        'instruction',
        'episode',
        'procedure',
        'relationship',
      ];
      const noteType = validTypes.includes(parsed.noteType)
        ? parsed.noteType
        : 'fact';

      return {
        summary: String(parsed.summary || 'Summary unavailable'),
        themes: Array.isArray(parsed.themes)
          ? parsed.themes.map(String)
          : [],
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.7)),
        noteType,
        keyEntities: Array.isArray(parsed.keyEntities)
          ? parsed.keyEntities.map(String)
          : [],
      };
    } catch (error) {
      console.error(
        '[DistillationService] Failed to parse summary response:',
        error
      );
      return {
        summary: response.slice(0, 500), // Use raw response as fallback
        themes: [],
        confidence: 0.5,
        noteType: 'fact',
        keyEntities: [],
      };
    }
  }

  /**
   * Call Claude API for summarization
   */
  private async callClaude(userMessage: string): Promise<string> {
    if (!this.config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

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
        max_tokens: 1024,
        system: CLUSTER_SUMMARY_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new DistillationService instance
 */
export function createDistillationService(
  config?: DistillationConfig
): DistillationService {
  return new DistillationService(config);
}

// =============================================================================
// Exports
// =============================================================================

export default DistillationService;
