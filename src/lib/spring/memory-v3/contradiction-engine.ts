/**
 * Contradiction Engine
 *
 * Detects and manages contradictions and supersession relationships
 * between memory notes in the Memory v3 system.
 *
 * Uses LLM analysis (Claude) to determine relationships between notes
 * and manages the lifecycle of conflicting information.
 */

import type {
  MemoryNote,
  MemoryNoteInput,
  MemoryEdge,
  MemoryEdgeInput,
  NoteStatus,
  EdgeType,
} from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Types of relationships between memory notes
 */
export type RelationType =
  | 'supersedes'    // New note replaces old note (more recent/accurate)
  | 'contradicts'   // Notes contain conflicting information
  | 'duplicates'    // Notes contain essentially the same information
  | 'elaborates'    // New note expands on existing note
  | 'none';         // No meaningful relationship

/**
 * Result of analyzing the relationship between two notes
 */
export interface RelationAnalysis {
  /** The determined relationship type */
  relation: RelationType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Human-readable explanation of why this relationship was determined */
  reason: string;
  /** Specific evidence from the notes supporting this determination */
  evidence: string[];
}

/**
 * Update to apply to a note's status
 */
export interface NoteUpdate {
  /** ID of the note to update */
  noteId: string;
  /** New status to set */
  newStatus: NoteStatus;
  /** Reason for the status change */
  reason: string;
  /** Related note ID (e.g., the note that supersedes this one) */
  relatedNoteId?: string;
}

/**
 * Summary of contradictions and relationships for a user
 */
export interface ContradictionSummary {
  /** Total number of active notes */
  totalActiveNotes: number;
  /** Number of superseded notes */
  supersededCount: number;
  /** Number of notes marked as contradicted */
  contradictedCount: number;
  /** Number of unresolved contradictions requiring attention */
  unresolvedContradictions: number;
  /** Number of duplicate notes detected */
  duplicatesDetected: number;
  /** Recent relationship edges created */
  recentEdges: Array<{
    type: EdgeType;
    count: number;
  }>;
  /** Notes that may need review */
  notesNeedingReview: string[];
}

/**
 * Configuration for the ContradictionEngine
 */
export interface ContradictionEngineConfig {
  /** Anthropic API key (defaults to env var) */
  anthropicApiKey?: string;
  /** Model to use for analysis */
  model?: 'haiku' | 'sonnet';
  /** Minimum confidence threshold for automatic actions */
  autoActionThreshold?: number;
  /** Maximum notes to analyze per new note */
  maxCandidatesPerNote?: number;
  /** Similarity threshold for finding potential conflicts */
  similarityThreshold?: number;
  /** Function to search for similar notes */
  searchSimilarNotes?: (
    content: string,
    userId: string,
    limit: number
  ) => Promise<Array<{ note: MemoryNote; similarity: number }>>;
  /** Function to get note by ID */
  getNoteById?: (noteId: string) => Promise<MemoryNote | null>;
  /** Function to update note status */
  updateNoteStatus?: (noteId: string, status: NoteStatus, metadata?: Record<string, unknown>) => Promise<void>;
  /** Function to create edge */
  createEdge?: (edge: MemoryEdgeInput) => Promise<MemoryEdge>;
  /** Function to get user's notes */
  getUserNotes?: (userId: string, statuses?: NoteStatus[]) => Promise<MemoryNote[]>;
  /** Function to get edges for a note */
  getEdgesForNote?: (noteId: string, types?: EdgeType[]) => Promise<MemoryEdge[]>;
}

// =============================================================================
// Constants
// =============================================================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const DEFAULT_CONFIG: Required<Omit<ContradictionEngineConfig, 'anthropicApiKey' | 'searchSimilarNotes' | 'getNoteById' | 'updateNoteStatus' | 'createEdge' | 'getUserNotes' | 'getEdgesForNote'>> = {
  model: 'haiku',
  autoActionThreshold: 0.85,
  maxCandidatesPerNote: 10,
  similarityThreshold: 0.7,
};

// =============================================================================
// Prompts
// =============================================================================

const RELATION_ANALYSIS_SYSTEM_PROMPT = `You are an expert at analyzing relationships between pieces of information in a memory system. Your task is to determine how two memory notes relate to each other.

## Relationship Types

1. **supersedes**: The NEW note contains more recent, updated, or corrected information that should replace the EXISTING note.
   - Time-based updates (e.g., "User lives in NYC" supersedes "User lives in Boston" if the new note is more recent)
   - Corrections (e.g., "User's email is john@new.com" supersedes "User's email is john@old.com")
   - Status changes (e.g., "User is married" supersedes "User is single")

2. **contradicts**: The notes contain conflicting information that cannot both be true simultaneously, but it's unclear which is correct.
   - Mutually exclusive facts without clear temporal ordering
   - Conflicting preferences or statements
   - Incompatible instructions

3. **duplicates**: The notes contain essentially the same information, possibly worded differently.
   - Same core fact expressed differently
   - Redundant information
   - Near-identical content

4. **elaborates**: The NEW note provides additional detail or context about the EXISTING note without contradicting it.
   - Adds specifics to a general statement
   - Provides examples or context
   - Expands on existing information

5. **none**: The notes are about different topics or have no meaningful relationship.
   - Unrelated subjects
   - Compatible but distinct information
   - No logical connection

## Analysis Guidelines

1. Consider the note types (fact, preference, instruction, etc.) - same-type notes are more likely to have relationships
2. Look for overlapping entities, topics, or subjects
3. Consider temporal information if available
4. For preferences and facts, look for direct contradictions
5. For instructions, check for conflicting directives
6. Confidence should reflect how certain you are about the relationship (0.0-1.0)
7. Provide specific evidence from both notes

## Output Format
Return a JSON object:
{
  "relation": "supersedes" | "contradicts" | "duplicates" | "elaborates" | "none",
  "confidence": number (0.0-1.0),
  "reason": "Brief explanation of why this relationship was determined",
  "evidence": ["Specific quote or paraphrase from notes supporting this determination"]
}

Return ONLY valid JSON, no markdown or explanation.`;

// =============================================================================
// ContradictionEngine Class
// =============================================================================

/**
 * Engine for detecting and managing contradictions between memory notes
 */
export class ContradictionEngine {
  private config: Required<Omit<ContradictionEngineConfig, 'searchSimilarNotes' | 'getNoteById' | 'updateNoteStatus' | 'createEdge' | 'getUserNotes' | 'getEdgesForNote'>>;
  private searchSimilarNotes?: ContradictionEngineConfig['searchSimilarNotes'];
  private getNoteById?: ContradictionEngineConfig['getNoteById'];
  private updateNoteStatus?: ContradictionEngineConfig['updateNoteStatus'];
  private createEdge?: ContradictionEngineConfig['createEdge'];
  private getUserNotes?: ContradictionEngineConfig['getUserNotes'];
  private getEdgesForNote?: ContradictionEngineConfig['getEdgesForNote'];

  constructor(config: ContradictionEngineConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      anthropicApiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
      model: config.model ?? DEFAULT_CONFIG.model,
      autoActionThreshold: config.autoActionThreshold ?? DEFAULT_CONFIG.autoActionThreshold,
      maxCandidatesPerNote: config.maxCandidatesPerNote ?? DEFAULT_CONFIG.maxCandidatesPerNote,
      similarityThreshold: config.similarityThreshold ?? DEFAULT_CONFIG.similarityThreshold,
    };
    this.searchSimilarNotes = config.searchSimilarNotes;
    this.getNoteById = config.getNoteById;
    this.updateNoteStatus = config.updateNoteStatus;
    this.createEdge = config.createEdge;
    this.getUserNotes = config.getUserNotes;
    this.getEdgesForNote = config.getEdgesForNote;
  }

  // ===========================================================================
  // Core Analysis Methods
  // ===========================================================================

  /**
   * Analyze the relationship between an existing note and a new note
   */
  async analyzeRelation(
    existingNote: MemoryNote,
    newNote: MemoryNote
  ): Promise<RelationAnalysis> {
    const prompt = this.buildRelationPrompt(existingNote, newNote);

    try {
      const response = await this.callClaude(prompt);
      return this.parseRelationResponse(response);
    } catch (error) {
      console.error('[ContradictionEngine] Failed to analyze relation:', error);
      // Return a safe default
      return {
        relation: 'none',
        confidence: 0,
        reason: 'Analysis failed due to an error',
        evidence: [],
      };
    }
  }

  /**
   * Find notes that might conflict with a new note
   */
  async findPotentialConflicts(
    newNote: MemoryNoteInput,
    userId: string,
    limit?: number
  ): Promise<MemoryNote[]> {
    const effectiveLimit = limit ?? this.config.maxCandidatesPerNote;
    const candidates: MemoryNote[] = [];

    // Strategy 1: Vector similarity search
    if (this.searchSimilarNotes) {
      try {
        const similarResults = await this.searchSimilarNotes(
          newNote.content,
          userId,
          effectiveLimit
        );

        for (const result of similarResults) {
          if (result.similarity >= this.config.similarityThreshold) {
            candidates.push(result.note);
          }
        }
      } catch (error) {
        console.error('[ContradictionEngine] Vector search failed:', error);
      }
    }

    // Strategy 2: Keyword overlap detection
    const keywords = this.extractKeywords(newNote.content);
    if (keywords.length > 0 && this.getUserNotes) {
      try {
        const userNotes = await this.getUserNotes(userId, ['active']);

        for (const note of userNotes) {
          // Skip notes already found via vector search
          if (candidates.some(c => c.id === note.id)) continue;

          const noteKeywords = this.extractKeywords(note.content);
          const overlap = this.calculateKeywordOverlap(keywords, noteKeywords);

          // If significant keyword overlap, add as candidate
          if (overlap >= 0.3) {
            candidates.push(note);
          }

          // Stop if we have enough candidates
          if (candidates.length >= effectiveLimit) break;
        }
      } catch (error) {
        console.error('[ContradictionEngine] Keyword search failed:', error);
      }
    }

    // Strategy 3: Same type filter (prioritize same-type notes)
    const sameTypeNotes = candidates.filter(n => n.type === newNote.type);
    const otherNotes = candidates.filter(n => n.type !== newNote.type);

    // Return same-type notes first, then others, up to limit
    return [...sameTypeNotes, ...otherNotes].slice(0, effectiveLimit);
  }

  /**
   * Main entry point when a note is created/approved
   * Analyzes relationships and creates appropriate edges
   */
  async processNewNote(
    note: MemoryNote,
    userId: string
  ): Promise<{ edges: MemoryEdge[]; updates: NoteUpdate[] }> {
    const edges: MemoryEdge[] = [];
    const updates: NoteUpdate[] = [];

    // Find potential conflicts
    const candidates = await this.findPotentialConflicts(
      {
        content: note.content,
        type: note.type,
        scope: note.scope,
        userId: note.userId,
        provenance: note.provenance,
      },
      userId
    );

    // Analyze relationship with each candidate
    for (const existingNote of candidates) {
      // Skip self-comparison
      if (existingNote.id === note.id) continue;

      const analysis = await this.analyzeRelation(existingNote, note);

      // Skip if no relationship or low confidence
      if (analysis.relation === 'none' || analysis.confidence < 0.5) {
        continue;
      }

      // Create edge based on relationship
      const edgeInput = this.createEdgeForRelation(
        existingNote.id,
        note.id,
        analysis
      );

      if (edgeInput && this.createEdge) {
        try {
          const edge = await this.createEdge(edgeInput);
          edges.push(edge);
        } catch (error) {
          console.error('[ContradictionEngine] Failed to create edge:', error);
        }
      }

      // Determine if we should update note statuses
      if (analysis.confidence >= this.config.autoActionThreshold) {
        const statusUpdates = this.determineStatusUpdates(
          existingNote,
          note,
          analysis
        );
        updates.push(...statusUpdates);
      }
    }

    // Apply status updates
    for (const update of updates) {
      if (this.updateNoteStatus) {
        try {
          await this.updateNoteStatus(update.noteId, update.newStatus, {
            reason: update.reason,
            relatedNoteId: update.relatedNoteId,
          });
        } catch (error) {
          console.error('[ContradictionEngine] Failed to update status:', error);
        }
      }
    }

    return { edges, updates };
  }

  /**
   * Manually resolve a contradiction between two notes
   */
  async resolveContradiction(
    noteId1: string,
    noteId2: string,
    resolution: 'keep_first' | 'keep_second' | 'keep_both' | 'merge'
  ): Promise<void> {
    if (!this.getNoteById || !this.updateNoteStatus) {
      throw new Error('Required functions not configured');
    }

    const note1 = await this.getNoteById(noteId1);
    const note2 = await this.getNoteById(noteId2);

    if (!note1 || !note2) {
      throw new Error('One or both notes not found');
    }

    switch (resolution) {
      case 'keep_first':
        // Keep note1, mark note2 as superseded
        await this.updateNoteStatus(noteId2, 'superseded', {
          supersededById: noteId1,
          resolution: 'manual',
        });
        break;

      case 'keep_second':
        // Keep note2, mark note1 as superseded
        await this.updateNoteStatus(noteId1, 'superseded', {
          supersededById: noteId2,
          resolution: 'manual',
        });
        break;

      case 'keep_both':
        // Mark both as active (remove contradicted status if present)
        if (note1.status === 'contradicted') {
          await this.updateNoteStatus(noteId1, 'active', {
            resolution: 'manual_keep_both',
          });
        }
        if (note2.status === 'contradicted') {
          await this.updateNoteStatus(noteId2, 'active', {
            resolution: 'manual_keep_both',
          });
        }
        break;

      case 'merge':
        // This is a more complex operation that might need external handling
        // For now, we mark both as superseded and expect a new merged note to be created
        await this.updateNoteStatus(noteId1, 'superseded', {
          resolution: 'merged',
          mergedWith: noteId2,
        });
        await this.updateNoteStatus(noteId2, 'superseded', {
          resolution: 'merged',
          mergedWith: noteId1,
        });
        break;
    }
  }

  /**
   * Get a summary of contradictions and relationships for a user
   */
  async getContradictionSummary(userId: string): Promise<ContradictionSummary> {
    if (!this.getUserNotes || !this.getEdgesForNote) {
      // Return empty summary if functions not configured
      return {
        totalActiveNotes: 0,
        supersededCount: 0,
        contradictedCount: 0,
        unresolvedContradictions: 0,
        duplicatesDetected: 0,
        recentEdges: [],
        notesNeedingReview: [],
      };
    }

    try {
      // Get all user notes
      const activeNotes = await this.getUserNotes(userId, ['active']);
      const supersededNotes = await this.getUserNotes(userId, ['superseded']);
      const contradictedNotes = await this.getUserNotes(userId, ['contradicted']);

      // Count edge types
      const edgeCounts: Record<EdgeType, number> = {
        similar: 0,
        supersedes: 0,
        contradicts: 0,
        derived_from: 0,
        mentions_entity: 0,
        part_of_cluster: 0,
      };

      const notesNeedingReview: string[] = [];

      // Analyze edges for active notes
      for (const note of activeNotes.slice(0, 100)) { // Limit for performance
        const edges = await this.getEdgesForNote(note.id);
        for (const edge of edges) {
          edgeCounts[edge.type]++;

          // Notes with contradiction edges need review
          if (edge.type === 'contradicts') {
            if (!notesNeedingReview.includes(note.id)) {
              notesNeedingReview.push(note.id);
            }
          }
        }
      }

      const recentEdges: Array<{ type: EdgeType; count: number }> = Object.entries(edgeCounts)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => ({ type: type as EdgeType, count }));

      return {
        totalActiveNotes: activeNotes.length,
        supersededCount: supersededNotes.length,
        contradictedCount: contradictedNotes.length,
        unresolvedContradictions: notesNeedingReview.length,
        duplicatesDetected: edgeCounts.similar, // Similar edges often indicate duplicates
        recentEdges,
        notesNeedingReview: notesNeedingReview.slice(0, 20), // Limit returned IDs
      };
    } catch (error) {
      console.error('[ContradictionEngine] Failed to get summary:', error);
      return {
        totalActiveNotes: 0,
        supersededCount: 0,
        contradictedCount: 0,
        unresolvedContradictions: 0,
        duplicatesDetected: 0,
        recentEdges: [],
        notesNeedingReview: [],
      };
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Build the prompt for relation analysis
   */
  buildRelationPrompt(existing: MemoryNote, new_: MemoryNote): string {
    const existingInfo = `
## EXISTING Note
- ID: ${existing.id}
- Type: ${existing.type}
- Status: ${existing.status}
- Content: "${existing.content}"
- Created: ${existing.createdAt instanceof Date ? existing.createdAt.toISOString() : existing.createdAt}
- Tags: ${existing.tags?.join(', ') || 'none'}`;

    const newInfo = `
## NEW Note
- ID: ${new_.id}
- Type: ${new_.type}
- Status: ${new_.status}
- Content: "${new_.content}"
- Created: ${new_.createdAt instanceof Date ? new_.createdAt.toISOString() : new_.createdAt}
- Tags: ${new_.tags?.join(', ') || 'none'}`;

    return `Analyze the relationship between these two memory notes:
${existingInfo}
${newInfo}

Determine if the NEW note supersedes, contradicts, duplicates, elaborates on, or has no relationship with the EXISTING note.`;
  }

  /**
   * Parse the LLM response into a RelationAnalysis
   */
  parseRelationResponse(response: string): RelationAnalysis {
    try {
      // Try to extract JSON from the response
      let jsonStr = response.trim();

      // Handle potential markdown code blocks
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr);

      // Validate and normalize the response
      const validRelations: RelationType[] = ['supersedes', 'contradicts', 'duplicates', 'elaborates', 'none'];
      const relation = validRelations.includes(parsed.relation) ? parsed.relation : 'none';

      return {
        relation,
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
        reason: String(parsed.reason || 'No reason provided'),
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(String) : [],
      };
    } catch (error) {
      console.error('[ContradictionEngine] Failed to parse response:', error, response);
      return {
        relation: 'none',
        confidence: 0,
        reason: 'Failed to parse analysis response',
        evidence: [],
      };
    }
  }

  /**
   * Call Claude API for analysis
   */
  private async callClaude(userMessage: string): Promise<string> {
    if (!this.config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const modelId = this.config.model === 'haiku'
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
        system: RELATION_ANALYSIS_SYSTEM_PROMPT,
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

  /**
   * Extract keywords from text for overlap detection
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - lowercase, remove punctuation, filter short words
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Remove common stop words
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
      'can', 'has', 'her', 'was', 'one', 'our', 'out', 'this',
      'that', 'with', 'they', 'have', 'from', 'been', 'will',
      'their', 'would', 'there', 'about', 'which', 'when', 'what',
      'user', 'note', 'memory', 'prefers', 'likes', 'wants',
    ]);

    return [...new Set(words.filter(word => !stopWords.has(word)))];
  }

  /**
   * Calculate keyword overlap between two sets
   */
  private calculateKeywordOverlap(keywords1: string[], keywords2: string[]): number {
    if (keywords1.length === 0 || keywords2.length === 0) return 0;

    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);

    let overlap = 0;
    for (const word of set1) {
      if (set2.has(word)) overlap++;
    }

    // Jaccard similarity
    const union = new Set([...keywords1, ...keywords2]).size;
    return overlap / union;
  }

  /**
   * Create an edge input based on the relationship analysis
   */
  private createEdgeForRelation(
    existingNoteId: string,
    newNoteId: string,
    analysis: RelationAnalysis
  ): MemoryEdgeInput | null {
    switch (analysis.relation) {
      case 'supersedes':
        return {
          sourceId: newNoteId,
          targetId: existingNoteId,
          type: 'supersedes',
          weight: analysis.confidence,
          properties: {
            reason: analysis.reason,
            evidence: analysis.evidence,
          },
          isAutoGenerated: true,
        };

      case 'contradicts':
        return {
          sourceId: newNoteId,
          targetId: existingNoteId,
          type: 'contradicts',
          weight: analysis.confidence,
          properties: {
            reason: analysis.reason,
            evidence: analysis.evidence,
          },
          isAutoGenerated: true,
        };

      case 'duplicates':
        return {
          sourceId: newNoteId,
          targetId: existingNoteId,
          type: 'similar',
          weight: analysis.confidence,
          properties: {
            isDuplicate: true,
            reason: analysis.reason,
            evidence: analysis.evidence,
          },
          isAutoGenerated: true,
        };

      case 'elaborates':
        return {
          sourceId: newNoteId,
          targetId: existingNoteId,
          type: 'derived_from',
          weight: analysis.confidence,
          properties: {
            elaborates: true,
            reason: analysis.reason,
            evidence: analysis.evidence,
          },
          isAutoGenerated: true,
        };

      case 'none':
      default:
        return null;
    }
  }

  /**
   * Determine what status updates should be made based on the analysis
   */
  private determineStatusUpdates(
    existingNote: MemoryNote,
    newNote: MemoryNote,
    analysis: RelationAnalysis
  ): NoteUpdate[] {
    const updates: NoteUpdate[] = [];

    switch (analysis.relation) {
      case 'supersedes':
        // The new note supersedes the existing one
        if (existingNote.status === 'active') {
          updates.push({
            noteId: existingNote.id,
            newStatus: 'superseded',
            reason: analysis.reason,
            relatedNoteId: newNote.id,
          });
        }
        break;

      case 'contradicts':
        // Mark the older note as contradicted if confidence is high
        // Don't auto-resolve contradictions - flag for review
        if (analysis.confidence >= 0.9 && existingNote.status === 'active') {
          updates.push({
            noteId: existingNote.id,
            newStatus: 'contradicted',
            reason: analysis.reason,
            relatedNoteId: newNote.id,
          });
        }
        break;

      case 'duplicates':
        // For duplicates with high confidence, mark the new one as superseded
        // (keep the older one as canonical)
        if (analysis.confidence >= 0.9) {
          updates.push({
            noteId: newNote.id,
            newStatus: 'superseded',
            reason: `Duplicate of existing note: ${analysis.reason}`,
            relatedNoteId: existingNote.id,
          });
        }
        break;

      case 'elaborates':
      case 'none':
        // No status changes needed
        break;
    }

    return updates;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new ContradictionEngine instance
 */
export function createContradictionEngine(
  config?: ContradictionEngineConfig
): ContradictionEngine {
  return new ContradictionEngine(config);
}

// =============================================================================
// Exports
// =============================================================================

export default ContradictionEngine;
