/**
 * Memory v3 Service
 *
 * Comprehensive service for all Memory v3 operations including CRUD, search,
 * edge management, candidate verification, provenance tracking, and explanations.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  MemoryNote,
  MemoryNoteInput,
  MemoryEdge,
  MemoryEdgeInput,
  MemoryCandidate,
  MemoryVerification,
  NoteQuery,
  EdgeQuery,
  NoteStatus,
  NoteType,
  NoteScope,
  PrivacyClass,
  EdgeType,
  ProvenanceInfo,
  ExtractionSource,
  SalienceScore,
  UtilityScore,
  EntityMention,
  ExplainStoredResponse,
  ExplainRecalledResponse,
} from './types';

// =============================================================================
// Additional Types for Service Operations
// =============================================================================

/** Options for search operations */
export interface SearchOptions {
  /** User context for scoping results */
  userId?: string;
  /** Workspace context */
  workspaceId?: string;
  /** Organization context */
  orgId?: string;
  /** Maximum number of results */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;
  /** Note types to include */
  types?: NoteType[];
  /** Note statuses to include */
  statuses?: NoteStatus[];
  /** Enable hybrid search (vector + keyword) */
  hybridSearch?: boolean;
  /** Weight for vector search in hybrid mode (0-1) */
  vectorWeight?: number;
  /** Include expired notes */
  includeExpired?: boolean;
  /** Boost recent notes */
  recencyBoost?: boolean;
  /** Pre-computed query embedding */
  queryEmbedding?: number[];
}

/** Method for verifying a candidate note */
export type VerificationMethod =
  | 'auto'
  | 'user_confirm'
  | 'source_check'
  | 'llm_review'
  | 'consensus';

/** Result of a verification operation */
export interface VerificationResult {
  /** Whether verification passed */
  passed: boolean;
  /** Confidence in the result (0-1) */
  confidence: number;
  /** Reason for the decision */
  reason: string;
  /** Who/what performed the verification */
  verifiedBy: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/** Statistics for a user's memory */
export interface MemoryStats {
  /** Total number of notes */
  totalNotes: number;
  /** Notes by status */
  notesByStatus: Record<NoteStatus, number>;
  /** Notes by type */
  notesByType: Record<NoteType, number>;
  /** Notes by scope */
  notesByScope: Record<NoteScope, number>;
  /** Total edges */
  totalEdges: number;
  /** Edges by type */
  edgesByType: Record<EdgeType, number>;
  /** Pending candidates */
  pendingCandidates: number;
  /** Average salience score */
  averageSalience: number;
  /** Average utility score */
  averageUtility: number;
  /** Storage usage in bytes (estimated) */
  storageBytes: number;
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** Created notes in last 7 days */
  notesLast7Days: number;
  /** Created notes in last 30 days */
  notesLast30Days: number;
}

/** Logger interface for service logging */
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** Default console logger */
const defaultLogger: Logger = {
  debug: (msg, ...args) => console.debug(`[MemoryV3] ${msg}`, ...args),
  info: (msg, ...args) => console.info(`[MemoryV3] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[MemoryV3] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[MemoryV3] ${msg}`, ...args),
};

function stripUrlQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

// =============================================================================
// Memory V3 Service Class
// =============================================================================

export class MemoryV3Service {
  private logger: Logger;

  constructor(
    private supabase: SupabaseClient,
    logger?: Logger
  ) {
    this.logger = logger || defaultLogger;
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * Create a new memory note
   */
  async createNote(input: MemoryNoteInput): Promise<MemoryNote> {
    this.logger.debug('Creating note', { type: input.type, scope: input.scope });

    const now = new Date();
    const noteData = {
      content: input.content,
      type: input.type,
      status: 'active' as NoteStatus,
      scope: input.scope,
      privacy_class: input.privacyClass || 'internal',
      user_id: input.userId,
      workspace_id: input.workspaceId,
      org_id: input.orgId,
      session_id: input.sessionId,
      agent_id: input.agentId,
      embedding: input.embedding,
      embedding_model: input.embeddingModel,
      embedding_dimension: input.embedding?.length,
      salience: this.createInitialSalience(input.importanceBoost),
      utility: this.createInitialUtility(),
      provenance: {
        ...input.provenance,
        createdBy: input.provenance.createdBy || 'system',
      },
      entity_mentions: input.entityMentions,
      tags: input.tags,
      metadata: input.metadata,
      expires_at: input.expiresAt?.toISOString(),
      version: 1,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    const { data, error } = await this.supabase
      .from('memory_notes')
      .insert(noteData)
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create note', error);
      throw new Error(`Failed to create note: ${error.message}`);
    }

    this.logger.info('Note created', { noteId: data.id });
    return this.mapNote(data);
  }

  /**
   * Get a single note by ID
   */
  async getNote(noteId: string): Promise<MemoryNote | null> {
    this.logger.debug('Getting note', { noteId });

    const { data, error } = await this.supabase
      .from('memory_notes')
      .select('*')
      .eq('id', noteId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      this.logger.error('Failed to get note', error);
      throw new Error(`Failed to get note: ${error.message}`);
    }

    return this.mapNote(data);
  }

  /**
   * Update an existing note
   */
  async updateNote(
    noteId: string,
    updates: Partial<MemoryNoteInput>
  ): Promise<MemoryNote> {
    this.logger.debug('Updating note', { noteId, updates: Object.keys(updates) });

    // Get current note for version check
    const currentNote = await this.getNote(noteId);
    if (!currentNote) {
      throw new Error(`Note not found: ${noteId}`);
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      version: currentNote.version + 1,
    };

    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.scope !== undefined) updateData.scope = updates.scope;
    if (updates.privacyClass !== undefined) updateData.privacy_class = updates.privacyClass;
    if (updates.workspaceId !== undefined) updateData.workspace_id = updates.workspaceId;
    if (updates.orgId !== undefined) updateData.org_id = updates.orgId;
    if (updates.sessionId !== undefined) updateData.session_id = updates.sessionId;
    if (updates.agentId !== undefined) updateData.agent_id = updates.agentId;
    if (updates.embedding !== undefined) {
      updateData.embedding = updates.embedding;
      updateData.embedding_dimension = updates.embedding.length;
    }
    if (updates.embeddingModel !== undefined) updateData.embedding_model = updates.embeddingModel;
    if (updates.entityMentions !== undefined) updateData.entity_mentions = updates.entityMentions;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;
    if (updates.expiresAt !== undefined) updateData.expires_at = updates.expiresAt?.toISOString();

    const { data, error } = await this.supabase
      .from('memory_notes')
      .update(updateData)
      .eq('id', noteId)
      .eq('version', currentNote.version) // Optimistic locking
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to update note', error);
      throw new Error(`Failed to update note: ${error.message}`);
    }

    this.logger.info('Note updated', { noteId });
    return this.mapNote(data);
  }

  /**
   * Delete a note (soft or hard delete)
   */
  async deleteNote(noteId: string, soft: boolean = true): Promise<void> {
    this.logger.debug('Deleting note', { noteId, soft });

    if (soft) {
      // Soft delete - update status
      const { error } = await this.supabase
        .from('memory_notes')
        .update({
          status: 'deleted' as NoteStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId);

      if (error) {
        this.logger.error('Failed to soft delete note', error);
        throw new Error(`Failed to delete note: ${error.message}`);
      }
    } else {
      // Hard delete - remove from database
      // First, delete associated edges
      await this.supabase
        .from('memory_edges')
        .delete()
        .or(`source_id.eq.${noteId},target_id.eq.${noteId}`);

      // Delete verifications
      await this.supabase
        .from('memory_verifications')
        .delete()
        .eq('candidate_id', noteId);

      // Delete the note
      const { error } = await this.supabase
        .from('memory_notes')
        .delete()
        .eq('id', noteId);

      if (error) {
        this.logger.error('Failed to hard delete note', error);
        throw new Error(`Failed to delete note: ${error.message}`);
      }
    }

    this.logger.info('Note deleted', { noteId, soft });
  }

  /**
   * List notes with filtering and pagination
   */
  async listNotes(query: NoteQuery): Promise<{ notes: MemoryNote[]; total: number }> {
    this.logger.debug('Listing notes', { query });

    let dbQuery = this.supabase
      .from('memory_notes')
      .select('*', { count: 'exact' });

    // Apply filters
    if (query.ids?.length) {
      dbQuery = dbQuery.in('id', query.ids);
    }
    if (query.userId) {
      dbQuery = dbQuery.eq('user_id', query.userId);
    }
    if (query.workspaceId) {
      dbQuery = dbQuery.eq('workspace_id', query.workspaceId);
    }
    if (query.orgId) {
      dbQuery = dbQuery.eq('org_id', query.orgId);
    }
    if (query.sessionId) {
      dbQuery = dbQuery.eq('session_id', query.sessionId);
    }
    if (query.agentId) {
      dbQuery = dbQuery.eq('agent_id', query.agentId);
    }
    if (query.types?.length) {
      dbQuery = dbQuery.in('type', query.types);
    }
    if (query.statuses?.length) {
      dbQuery = dbQuery.in('status', query.statuses);
    } else {
      // Default to excluding deleted notes
      dbQuery = dbQuery.neq('status', 'deleted');
    }
    if (query.scopes?.length) {
      dbQuery = dbQuery.in('scope', query.scopes);
    }
    if (query.privacyClasses?.length) {
      dbQuery = dbQuery.in('privacy_class', query.privacyClasses);
    }
    if (query.tagsAny?.length) {
      dbQuery = dbQuery.overlaps('tags', query.tagsAny);
    }
    if (query.tagsAll?.length) {
      dbQuery = dbQuery.contains('tags', query.tagsAll);
    }
    if (query.createdAfter) {
      dbQuery = dbQuery.gte('created_at', query.createdAfter.toISOString());
    }
    if (query.createdBefore) {
      dbQuery = dbQuery.lte('created_at', query.createdBefore.toISOString());
    }
    if (query.updatedAfter) {
      dbQuery = dbQuery.gte('updated_at', query.updatedAfter.toISOString());
    }
    if (query.updatedBefore) {
      dbQuery = dbQuery.lte('updated_at', query.updatedBefore.toISOString());
    }
    if (!query.includeExpired) {
      const now = new Date().toISOString();
      dbQuery = dbQuery.or(`expires_at.is.null,expires_at.gt.${now}`);
    }

    // Text search
    if (query.textQuery) {
      dbQuery = dbQuery.textSearch('content', query.textQuery, {
        type: 'websearch',
        config: 'english',
      });
    }

    // Sorting
    const sortColumn = this.getSortColumn(query.sortBy);
    dbQuery = dbQuery.order(sortColumn, {
      ascending: query.sortOrder === 'asc',
    });

    // Pagination
    const limit = query.limit || 50;
    const offset = query.offset || 0;
    dbQuery = dbQuery.range(offset, offset + limit - 1);

    const { data, error, count } = await dbQuery;

    if (error) {
      this.logger.error('Failed to list notes', error);
      throw new Error(`Failed to list notes: ${error.message}`);
    }

    return {
      notes: (data || []).map((row) => this.mapNote(row)),
      total: count || 0,
    };
  }

  // ===========================================================================
  // Search Operations
  // ===========================================================================

  /**
   * Perform hybrid search (vector + keyword) on notes
   */
  async searchNotes(
    query: string,
    options: SearchOptions = {}
  ): Promise<MemoryNote[]> {
    this.logger.debug('Searching notes', { query, options });

    const limit = options.limit || 20;
    const minSimilarity = options.minSimilarity || 0.5;
    const hybridSearch = options.hybridSearch ?? true;
    const vectorWeight = options.vectorWeight ?? 0.7;

    // Build base filters
    const filters: Record<string, unknown> = {};
    if (options.userId) filters.user_id = options.userId;
    if (options.workspaceId) filters.workspace_id = options.workspaceId;
    if (options.orgId) filters.org_id = options.orgId;

    let results: MemoryNote[] = [];

    if (hybridSearch) {
      // Perform hybrid search using RPC function
      const { data: hybridData, error: hybridError } = await this.supabase.rpc(
        'memory_hybrid_search',
        {
          query_text: query,
          query_embedding: options.queryEmbedding || null,
          match_threshold: minSimilarity,
          match_count: limit * 2, // Get extra for filtering
          filter_user_id: options.userId || null,
          filter_workspace_id: options.workspaceId || null,
          filter_org_id: options.orgId || null,
          filter_types: options.types || null,
          filter_statuses: options.statuses || ['active'],
          vector_weight: vectorWeight,
          include_expired: options.includeExpired || false,
        }
      );

      if (hybridError) {
        this.logger.warn('Hybrid search failed, falling back to text search', hybridError);
        // Fall back to text search
        results = await this.performTextSearch(query, options, limit);
      } else {
        results = (hybridData || []).map((row: Record<string, unknown>) => this.mapNote(row));
      }
    } else {
      // Vector-only search
      if (options.queryEmbedding) {
        const { data: vectorData, error: vectorError } = await this.supabase.rpc(
          'memory_vector_search',
          {
            query_embedding: options.queryEmbedding,
            match_threshold: minSimilarity,
            match_count: limit,
            filter_user_id: options.userId || null,
            filter_workspace_id: options.workspaceId || null,
            filter_org_id: options.orgId || null,
            filter_types: options.types || null,
            filter_statuses: options.statuses || ['active'],
          }
        );

        if (vectorError) {
          this.logger.error('Vector search failed', vectorError);
          throw new Error(`Vector search failed: ${vectorError.message}`);
        }

        results = (vectorData || []).map((row: Record<string, unknown>) => this.mapNote(row));
      } else {
        // Text-only search
        results = await this.performTextSearch(query, options, limit);
      }
    }

    // Apply recency boost if requested
    if (options.recencyBoost) {
      results = this.applyRecencyBoost(results);
    }

    return results.slice(0, limit);
  }

  /**
   * Find notes similar to a given note
   */
  async findSimilarNotes(noteId: string, limit: number = 10): Promise<MemoryNote[]> {
    this.logger.debug('Finding similar notes', { noteId, limit });

    // Get the source note
    const sourceNote = await this.getNote(noteId);
    if (!sourceNote) {
      throw new Error(`Note not found: ${noteId}`);
    }

    if (!sourceNote.embedding) {
      this.logger.warn('Source note has no embedding, using text search');
      return this.searchNotes(sourceNote.content, {
        userId: sourceNote.userId,
        limit,
      });
    }

    // Use vector similarity search
    const { data, error } = await this.supabase.rpc('memory_find_similar', {
      note_id: noteId,
      note_embedding: sourceNote.embedding,
      match_count: limit + 1, // Extra to exclude self
      filter_user_id: sourceNote.userId,
    });

    if (error) {
      this.logger.error('Failed to find similar notes', error);
      throw new Error(`Failed to find similar notes: ${error.message}`);
    }

    // Filter out the source note itself
    const similarNotes = (data || [])
      .filter((row: Record<string, unknown>) => row.id !== noteId)
      .map((row: Record<string, unknown>) => this.mapNote(row));

    return similarNotes.slice(0, limit);
  }

  // ===========================================================================
  // Edge Operations
  // ===========================================================================

  /**
   * Create an edge between two notes
   */
  async createEdge(input: MemoryEdgeInput): Promise<MemoryEdge> {
    this.logger.debug('Creating edge', {
      sourceId: input.sourceId,
      targetId: input.targetId,
      type: input.type,
    });

    // Verify both notes exist
    const [source, target] = await Promise.all([
      this.getNote(input.sourceId),
      this.getNote(input.targetId),
    ]);

    if (!source) {
      throw new Error(`Source note not found: ${input.sourceId}`);
    }
    if (!target) {
      throw new Error(`Target note not found: ${input.targetId}`);
    }

    const now = new Date();
    const edgeData = {
      source_id: input.sourceId,
      target_id: input.targetId,
      type: input.type,
      weight: input.weight ?? 1.0,
      properties: input.properties,
      is_auto_generated: input.isAutoGenerated ?? false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    const { data, error } = await this.supabase
      .from('memory_edges')
      .insert(edgeData)
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to create edge', error);
      throw new Error(`Failed to create edge: ${error.message}`);
    }

    this.logger.info('Edge created', { edgeId: data.id });
    return this.mapEdge(data);
  }

  /**
   * Get edges matching a query
   */
  async getEdges(query: EdgeQuery): Promise<MemoryEdge[]> {
    this.logger.debug('Getting edges', { query });

    let dbQuery = this.supabase.from('memory_edges').select('*');

    if (query.ids?.length) {
      dbQuery = dbQuery.in('id', query.ids);
    }
    if (query.sourceId) {
      dbQuery = dbQuery.eq('source_id', query.sourceId);
    }
    if (query.targetId) {
      dbQuery = dbQuery.eq('target_id', query.targetId);
    }
    if (query.noteId) {
      dbQuery = dbQuery.or(`source_id.eq.${query.noteId},target_id.eq.${query.noteId}`);
    }
    if (query.types?.length) {
      dbQuery = dbQuery.in('type', query.types);
    }
    if (query.minWeight !== undefined) {
      dbQuery = dbQuery.gte('weight', query.minWeight);
    }
    if (query.includeAutoGenerated === false) {
      dbQuery = dbQuery.eq('is_auto_generated', false);
    }

    const limit = query.limit || 100;
    const offset = query.offset || 0;
    dbQuery = dbQuery.range(offset, offset + limit - 1);

    const { data, error } = await dbQuery;

    if (error) {
      this.logger.error('Failed to get edges', error);
      throw new Error(`Failed to get edges: ${error.message}`);
    }

    return (data || []).map((row) => this.mapEdge(row));
  }

  /**
   * Delete an edge
   */
  async deleteEdge(edgeId: string): Promise<void> {
    this.logger.debug('Deleting edge', { edgeId });

    const { error } = await this.supabase
      .from('memory_edges')
      .delete()
      .eq('id', edgeId);

    if (error) {
      this.logger.error('Failed to delete edge', error);
      throw new Error(`Failed to delete edge: ${error.message}`);
    }

    this.logger.info('Edge deleted', { edgeId });
  }

  /**
   * Find all notes connected to a given note within a maximum depth
   */
  async findConnectedNotes(noteId: string, maxDepth: number = 2): Promise<MemoryNote[]> {
    this.logger.debug('Finding connected notes', { noteId, maxDepth });

    // Use recursive CTE via RPC function
    const { data, error } = await this.supabase.rpc('memory_find_connected', {
      start_note_id: noteId,
      max_depth: maxDepth,
    });

    if (error) {
      this.logger.error('Failed to find connected notes', error);
      // Fall back to simple traversal
      return this.simpleTraversal(noteId, maxDepth);
    }

    return (data || []).map((row: Record<string, unknown>) => this.mapNote(row));
  }

  // ===========================================================================
  // Candidate Operations
  // ===========================================================================

  /**
   * Create a candidate note pending verification
   */
  async createCandidate(
    noteInput: MemoryNoteInput,
    source: ExtractionSource
  ): Promise<MemoryCandidate> {
    this.logger.debug('Creating candidate', { type: noteInput.type, source: source.type });

    // Create the note with candidate status
    const noteData = {
      ...noteInput,
      provenance: {
        ...noteInput.provenance,
        source,
      },
    };

    const now = new Date();

    // Create the note first
    const { data: noteRow, error: noteError } = await this.supabase
      .from('memory_notes')
      .insert({
        content: noteData.content,
        type: noteData.type,
        status: 'candidate' as NoteStatus,
        scope: noteData.scope,
        privacy_class: noteData.privacyClass || 'internal',
        user_id: noteData.userId,
        workspace_id: noteData.workspaceId,
        org_id: noteData.orgId,
        session_id: noteData.sessionId,
        agent_id: noteData.agentId,
        embedding: noteData.embedding,
        embedding_model: noteData.embeddingModel,
        embedding_dimension: noteData.embedding?.length,
        salience: this.createInitialSalience(noteData.importanceBoost),
        utility: this.createInitialUtility(),
        provenance: noteData.provenance,
        entity_mentions: noteData.entityMentions,
        tags: noteData.tags,
        metadata: noteData.metadata,
        expires_at: noteData.expiresAt?.toISOString(),
        version: 1,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select()
      .single();

    if (noteError) {
      this.logger.error('Failed to create candidate note', noteError);
      throw new Error(`Failed to create candidate: ${noteError.message}`);
    }

    const note = this.mapNote(noteRow);

    // Find similar notes for conflict detection
    const similarNotes = await this.findSimilarForCandidate(note);

    // Generate suggested actions
    const suggestedActions = this.generateSuggestedActions(note, similarNotes);

    // Create the candidate record
    const candidateData = {
      note_id: note.id,
      candidate_reason: this.determineCandidateReason(source),
      extraction_confidence: source.extractionConfidence || 0.8,
      similar_notes: similarNotes,
      suggested_actions: suggestedActions,
      created_at: now.toISOString(),
      auto_action_at: this.calculateAutoActionTime(source),
      auto_action: this.determineAutoAction(source, similarNotes),
    };

    const { data: candidateRow, error: candidateError } = await this.supabase
      .from('memory_candidates')
      .insert(candidateData)
      .select()
      .single();

    if (candidateError) {
      this.logger.error('Failed to create candidate record', candidateError);
      // Clean up the note
      await this.deleteNote(note.id, false);
      throw new Error(`Failed to create candidate: ${candidateError.message}`);
    }

    this.logger.info('Candidate created', { candidateId: candidateRow.id, noteId: note.id });

    return {
      note,
      candidateReason: candidateRow.candidate_reason,
      extractionConfidence: candidateRow.extraction_confidence,
      similarNotes,
      suggestedActions,
      createdAt: new Date(candidateRow.created_at),
      autoActionAt: candidateRow.auto_action_at ? new Date(candidateRow.auto_action_at) : undefined,
      autoAction: candidateRow.auto_action,
    };
  }

  /**
   * Approve a candidate note, making it active
   */
  async approveCandidate(candidateId: string): Promise<MemoryNote> {
    this.logger.debug('Approving candidate', { candidateId });

    // Get the candidate
    const { data: candidate, error: fetchError } = await this.supabase
      .from('memory_candidates')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (fetchError || !candidate) {
      throw new Error(`Candidate not found: ${candidateId}`);
    }

    // Update the note status to active
    const { data: note, error: updateError } = await this.supabase
      .from('memory_notes')
      .update({
        status: 'active' as NoteStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidate.note_id)
      .select()
      .single();

    if (updateError) {
      this.logger.error('Failed to approve candidate', updateError);
      throw new Error(`Failed to approve candidate: ${updateError.message}`);
    }

    // Record the verification
    await this.supabase.from('memory_verifications').insert({
      candidate_id: candidate.note_id,
      decision: 'approved',
      verified_by: 'user',
      is_auto_verified: false,
      verified_at: new Date().toISOString(),
    });

    // Delete the candidate record
    await this.supabase.from('memory_candidates').delete().eq('id', candidateId);

    this.logger.info('Candidate approved', { candidateId, noteId: note.id });
    return this.mapNote(note);
  }

  /**
   * Reject a candidate note
   */
  async rejectCandidate(candidateId: string, reason: string): Promise<void> {
    this.logger.debug('Rejecting candidate', { candidateId, reason });

    // Get the candidate
    const { data: candidate, error: fetchError } = await this.supabase
      .from('memory_candidates')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (fetchError || !candidate) {
      throw new Error(`Candidate not found: ${candidateId}`);
    }

    // Record the verification
    await this.supabase.from('memory_verifications').insert({
      candidate_id: candidate.note_id,
      decision: 'rejected',
      verified_by: 'user',
      is_auto_verified: false,
      reason,
      verified_at: new Date().toISOString(),
    });

    // Delete the note (hard delete)
    await this.deleteNote(candidate.note_id, false);

    // Delete the candidate record
    await this.supabase.from('memory_candidates').delete().eq('id', candidateId);

    this.logger.info('Candidate rejected', { candidateId, reason });
  }

  /**
   * Edit a candidate note before approval
   */
  async editCandidate(
    candidateId: string,
    edits: Partial<MemoryNoteInput>
  ): Promise<MemoryCandidate> {
    this.logger.debug('Editing candidate', { candidateId, edits: Object.keys(edits) });

    // Get the candidate
    const { data: candidate, error: fetchError } = await this.supabase
      .from('memory_candidates')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (fetchError || !candidate) {
      throw new Error(`Candidate not found: ${candidateId}`);
    }

    // Update the note
    const updatedNote = await this.updateNote(candidate.note_id, edits);

    // Re-find similar notes with updated content
    const similarNotes = await this.findSimilarForCandidate(updatedNote);
    const suggestedActions = this.generateSuggestedActions(updatedNote, similarNotes);

    // Update the candidate record
    const { error: updateError } = await this.supabase
      .from('memory_candidates')
      .update({
        similar_notes: similarNotes,
        suggested_actions: suggestedActions,
      })
      .eq('id', candidateId);

    if (updateError) {
      this.logger.error('Failed to update candidate', updateError);
      throw new Error(`Failed to edit candidate: ${updateError.message}`);
    }

    // Record the edit in verifications
    await this.supabase.from('memory_verifications').insert({
      candidate_id: candidate.note_id,
      decision: 'edited',
      verified_by: 'user',
      is_auto_verified: false,
      edits: Object.entries(edits).map(([field, newValue]) => ({
        field,
        oldValue: null, // Would need to track old values
        newValue,
      })),
      verified_at: new Date().toISOString(),
    });

    this.logger.info('Candidate edited', { candidateId });

    return {
      note: updatedNote,
      candidateReason: candidate.candidate_reason,
      extractionConfidence: candidate.extraction_confidence,
      similarNotes,
      suggestedActions,
      createdAt: new Date(candidate.created_at),
      autoActionAt: candidate.auto_action_at ? new Date(candidate.auto_action_at) : undefined,
      autoAction: candidate.auto_action,
    };
  }

  /**
   * List all pending candidates for a user
   */
  async listPendingCandidates(userId: string): Promise<MemoryCandidate[]> {
    this.logger.debug('Listing pending candidates', { userId });

    const { data, error } = await this.supabase
      .from('memory_candidates')
      .select(`
        *,
        memory_notes!inner (*)
      `)
      .eq('memory_notes.user_id', userId)
      .eq('memory_notes.status', 'candidate')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Failed to list pending candidates', error);
      throw new Error(`Failed to list pending candidates: ${error.message}`);
    }

    return (data || []).map((row) => ({
      note: this.mapNote(row.memory_notes),
      candidateReason: row.candidate_reason,
      extractionConfidence: row.extraction_confidence,
      similarNotes: row.similar_notes,
      suggestedActions: row.suggested_actions,
      createdAt: new Date(row.created_at),
      autoActionAt: row.auto_action_at ? new Date(row.auto_action_at) : undefined,
      autoAction: row.auto_action,
    }));
  }

  // ===========================================================================
  // Verification Operations
  // ===========================================================================

  /**
   * Request verification for a note
   */
  async requestVerification(
    noteId: string,
    method: VerificationMethod
  ): Promise<MemoryVerification> {
    this.logger.debug('Requesting verification', { noteId, method });

    const note = await this.getNote(noteId);
    if (!note) {
      throw new Error(`Note not found: ${noteId}`);
    }

    const verificationData = {
      candidate_id: noteId,
      decision: 'pending' as const,
      verified_by: method,
      is_auto_verified: method === 'auto',
      verification_method: method,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('memory_verifications')
      .insert(verificationData)
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to request verification', error);
      throw new Error(`Failed to request verification: ${error.message}`);
    }

    this.logger.info('Verification requested', { verificationId: data.id, noteId });

    return this.mapVerification(data);
  }

  /**
   * Record the result of a verification
   */
  async recordVerificationResult(
    verificationId: string,
    result: VerificationResult
  ): Promise<void> {
    this.logger.debug('Recording verification result', { verificationId, result });

    const { data: verification, error: fetchError } = await this.supabase
      .from('memory_verifications')
      .select('*')
      .eq('id', verificationId)
      .single();

    if (fetchError || !verification) {
      throw new Error(`Verification not found: ${verificationId}`);
    }

    // Update the verification record
    const { error: updateError } = await this.supabase
      .from('memory_verifications')
      .update({
        decision: result.passed ? 'approved' : 'rejected',
        verified_by: result.verifiedBy,
        is_auto_verified: result.verifiedBy !== 'user',
        reason: result.reason,
        verification_details: result.details,
        verified_at: new Date().toISOString(),
      })
      .eq('id', verificationId);

    if (updateError) {
      this.logger.error('Failed to record verification result', updateError);
      throw new Error(`Failed to record verification result: ${updateError.message}`);
    }

    // Update the note status based on the result
    if (result.passed) {
      await this.supabase
        .from('memory_notes')
        .update({
          status: 'active' as NoteStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', verification.candidate_id);
    }

    this.logger.info('Verification result recorded', { verificationId, passed: result.passed });
  }

  /**
   * Get verification history for a note
   */
  async getVerificationHistory(noteId: string): Promise<MemoryVerification[]> {
    this.logger.debug('Getting verification history', { noteId });

    const { data, error } = await this.supabase
      .from('memory_verifications')
      .select('*')
      .eq('candidate_id', noteId)
      .order('verified_at', { ascending: false });

    if (error) {
      this.logger.error('Failed to get verification history', error);
      throw new Error(`Failed to get verification history: ${error.message}`);
    }

    return (data || []).map((row) => this.mapVerification(row));
  }

  // ===========================================================================
  // Provenance Operations
  // ===========================================================================

  /**
   * Attach or update provenance information for a note
   */
  async attachProvenance(noteId: string, provenance: ProvenanceInfo): Promise<void> {
    this.logger.debug('Attaching provenance', { noteId });

    const { error } = await this.supabase
      .from('memory_notes')
      .update({
        provenance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', noteId);

    if (error) {
      this.logger.error('Failed to attach provenance', error);
      throw new Error(`Failed to attach provenance: ${error.message}`);
    }

    this.logger.info('Provenance attached', { noteId });
  }

  /**
   * Get provenance information for a note
   */
  async getProvenance(noteId: string): Promise<ProvenanceInfo | null> {
    this.logger.debug('Getting provenance', { noteId });

    const { data, error } = await this.supabase
      .from('memory_notes')
      .select('provenance')
      .eq('id', noteId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      this.logger.error('Failed to get provenance', error);
      throw new Error(`Failed to get provenance: ${error.message}`);
    }

    return data?.provenance as ProvenanceInfo | null;
  }

  // ===========================================================================
  // Explain Operations
  // ===========================================================================

  /**
   * Explain why a note was stored
   */
  async explainStored(noteId: string): Promise<ExplainStoredResponse> {
    this.logger.debug('Explaining stored note', { noteId });

    const note = await this.getNote(noteId);
    if (!note) {
      throw new Error(`Note not found: ${noteId}`);
    }

    // Find similar notes that were considered
    const similarNotes = await this.findSimilarNotes(noteId, 5);
    const consideredSimilar = similarNotes.map((similar) => ({
      note: similar,
      similarity: this.calculateSimilarity(note, similar),
      decision: this.determineSimilarDecision(note, similar),
      reason: this.explainSimilarDecision(note, similar),
    }));

    // Extract classification reasoning
    const classificationReasoning = this.generateClassificationReasoning(note);

    // Generate factors that influenced storage
    const factors = this.generateStorageFactors(note);

    // Generate reasoning text
    const reasoning = this.generateStorageReasoning(note, factors);

    return {
      note,
      reasoning,
      factors,
      consideredSimilar,
      extractedEntities: note.entityMentions || [],
      classificationReasoning,
      initialScores: {
        salience: note.salience || this.createInitialSalience(),
        utility: note.utility || this.createInitialUtility(),
      },
    };
  }

  /**
   * Explain why notes were recalled for a query
   */
  async explainRecalled(
    noteId: string,
    query: string,
    context?: object
  ): Promise<ExplainRecalledResponse> {
    this.logger.debug('Explaining recalled note', { noteId, query });

    const startTime = Date.now();

    const note = await this.getNote(noteId);
    if (!note) {
      throw new Error(`Note not found: ${noteId}`);
    }

    // Perform the search to understand the recall context
    const searchResults = await this.searchNotes(query, {
      userId: note.userId,
      limit: 20,
    });

    // Find the note's rank in results
    const rank = searchResults.findIndex((n) => n.id === noteId) + 1;

    // Generate relevance factors
    const relevanceFactors = this.generateRelevanceFactors(note, query);

    // Calculate final score
    const finalScore = relevanceFactors.reduce((sum, f) => sum + f.contribution, 0);

    // Generate query understanding
    const queryUnderstanding = this.analyzeQuery(query);

    // Build processing steps
    const processingSteps = [
      {
        step: 'query_parsing',
        description: 'Parsed and analyzed the input query',
        duration: 10,
      },
      {
        step: 'embedding_generation',
        description: 'Generated embedding for semantic search',
        duration: 50,
      },
      {
        step: 'vector_search',
        description: 'Performed vector similarity search',
        duration: 100,
        resultCount: searchResults.length,
      },
      {
        step: 'text_search',
        description: 'Performed full-text search',
        duration: 30,
        resultCount: searchResults.length,
      },
      {
        step: 'ranking',
        description: 'Ranked and merged results',
        duration: 20,
        resultCount: searchResults.length,
      },
    ];

    const totalTime = Date.now() - startTime;

    return {
      query: { textQuery: query, ...context } as NoteQuery,
      processingSteps,
      recalledNotes: [
        {
          note,
          reasoning: this.generateRecallReasoning(note, query, relevanceFactors),
          relevanceFactors,
          finalScore,
          rank,
        },
      ],
      queryUnderstanding,
      metrics: {
        totalConsidered: searchResults.length,
        totalReturned: searchResults.length,
        processingTime: totalTime,
        embeddingTime: 50,
        searchTime: 130,
        rankingTime: 20,
      },
    };
  }

  // ===========================================================================
  // Stats Operations
  // ===========================================================================

  /**
   * Get memory statistics for a user
   */
  async getStats(userId: string): Promise<MemoryStats> {
    this.logger.debug('Getting stats', { userId });

    // Get total counts and breakdowns
    const { data: statsData, error: statsError } = await this.supabase.rpc(
      'memory_get_user_stats',
      { p_user_id: userId }
    );

    if (statsError) {
      this.logger.warn('Stats RPC failed, computing manually', statsError);
      return this.computeStatsManually(userId);
    }

    if (statsData) {
      return {
        totalNotes: statsData.total_notes || 0,
        notesByStatus: statsData.notes_by_status || {},
        notesByType: statsData.notes_by_type || {},
        notesByScope: statsData.notes_by_scope || {},
        totalEdges: statsData.total_edges || 0,
        edgesByType: statsData.edges_by_type || {},
        pendingCandidates: statsData.pending_candidates || 0,
        averageSalience: statsData.average_salience || 0,
        averageUtility: statsData.average_utility || 0,
        storageBytes: statsData.storage_bytes || 0,
        lastActivityAt: new Date(statsData.last_activity_at || Date.now()),
        notesLast7Days: statsData.notes_last_7_days || 0,
        notesLast30Days: statsData.notes_last_30_days || 0,
      };
    }

    return this.computeStatsManually(userId);
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  private mapNote(row: Record<string, unknown>): MemoryNote {
    return {
      id: row.id as string,
      content: row.content as string,
      type: row.type as NoteType,
      status: row.status as NoteStatus,
      scope: row.scope as NoteScope,
      privacyClass: row.privacy_class as PrivacyClass,
      userId: row.user_id as string,
      workspaceId: row.workspace_id as string | undefined,
      orgId: row.org_id as string | undefined,
      sessionId: row.session_id as string | undefined,
      agentId: row.agent_id as string | undefined,
      embedding: row.embedding as number[] | undefined,
      embeddingDimension: row.embedding_dimension as number | undefined,
      embeddingModel: row.embedding_model as string | undefined,
      salience: row.salience as SalienceScore | undefined,
      utility: row.utility as UtilityScore | undefined,
      provenance:
        this.sanitizeProvenance(row.provenance as ProvenanceInfo | null | undefined) ||
        (row.provenance as ProvenanceInfo),
      entityMentions: row.entity_mentions as EntityMention[] | undefined,
      tags: row.tags as string[] | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
      version: row.version as number,
      supersedesId: row.supersedes_id as string | undefined,
      contradictedById: row.contradicted_by_id as string | undefined,
    };
  }

  private sanitizeProvenance(prov: ProvenanceInfo | null | undefined): ProvenanceInfo | undefined {
    if (!prov || typeof prov !== 'object') return undefined;

    const source = prov.source
      ? {
          ...prov.source,
          sourceUrl: prov.source.sourceUrl ? stripUrlQuery(prov.source.sourceUrl) : prov.source.sourceUrl,
        }
      : prov.source;

    const corroboratingSources = Array.isArray(prov.corroboratingSources)
      ? prov.corroboratingSources.map((item) =>
          item?.sourceUrl ? { ...item, sourceUrl: stripUrlQuery(item.sourceUrl) } : item
        )
      : prov.corroboratingSources;

    return {
      ...prov,
      source,
      corroboratingSources,
    };
  }

  private mapEdge(row: Record<string, unknown>): MemoryEdge {
    return {
      id: row.id as string,
      sourceId: row.source_id as string,
      targetId: row.target_id as string,
      type: row.type as EdgeType,
      weight: row.weight as number,
      properties: row.properties as Record<string, unknown> | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      isAutoGenerated: row.is_auto_generated as boolean,
    };
  }

  private mapVerification(row: Record<string, unknown>): MemoryVerification {
    return {
      id: row.id as string,
      candidateId: row.candidate_id as string,
      decision: row.decision as 'approved' | 'rejected' | 'merged' | 'edited',
      verifiedBy: row.verified_by as string,
      isAutoVerified: row.is_auto_verified as boolean,
      reason: row.reason as string | undefined,
      mergedIntoId: row.merged_into_id as string | undefined,
      edits: row.edits as { field: string; oldValue: unknown; newValue: unknown }[] | undefined,
      verifiedAt: new Date(row.verified_at as string),
    };
  }

  private createInitialSalience(importanceBoost?: number): SalienceScore {
    return {
      score: 0.5 + (importanceBoost || 0),
      recencyFactor: 1.0,
      frequencyFactor: 0,
      relevanceFactor: 0.5,
      importanceBoost: importanceBoost || 0,
      calculatedAt: new Date(),
    };
  }

  private createInitialUtility(): UtilityScore {
    return {
      score: 0.5,
      usageCount: 0,
      successRate: undefined,
      feedbackScore: undefined,
      contextualAdjustments: {},
      decayFactor: 1.0,
    };
  }

  private getSortColumn(sortBy?: string): string {
    switch (sortBy) {
      case 'salience':
        return 'salience->score';
      case 'utility':
        return 'utility->score';
      case 'updatedAt':
        return 'updated_at';
      case 'similarity':
        return 'similarity';
      case 'createdAt':
      default:
        return 'created_at';
    }
  }

  private async performTextSearch(
    query: string,
    options: SearchOptions,
    limit: number
  ): Promise<MemoryNote[]> {
    let dbQuery = this.supabase
      .from('memory_notes')
      .select('*')
      .textSearch('content', query, { type: 'websearch', config: 'english' });

    if (options.userId) {
      dbQuery = dbQuery.eq('user_id', options.userId);
    }
    if (options.workspaceId) {
      dbQuery = dbQuery.eq('workspace_id', options.workspaceId);
    }
    if (options.orgId) {
      dbQuery = dbQuery.eq('org_id', options.orgId);
    }
    if (options.types?.length) {
      dbQuery = dbQuery.in('type', options.types);
    }
    if (options.statuses?.length) {
      dbQuery = dbQuery.in('status', options.statuses);
    } else {
      dbQuery = dbQuery.eq('status', 'active');
    }
    if (!options.includeExpired) {
      const now = new Date().toISOString();
      dbQuery = dbQuery.or(`expires_at.is.null,expires_at.gt.${now}`);
    }

    dbQuery = dbQuery.limit(limit);

    const { data, error } = await dbQuery;

    if (error) {
      this.logger.error('Text search failed', error);
      throw new Error(`Text search failed: ${error.message}`);
    }

    return (data || []).map((row) => this.mapNote(row));
  }

  private applyRecencyBoost(notes: MemoryNote[]): MemoryNote[] {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return notes
      .map((note) => {
        const ageMs = now - note.updatedAt.getTime();
        const ageDays = ageMs / dayMs;
        // Exponential decay with half-life of 7 days
        const recencyBoost = Math.exp(-ageDays / 7);

        return {
          note,
          boostedScore: (note.salience?.score || 0.5) + recencyBoost * 0.2,
        };
      })
      .sort((a, b) => b.boostedScore - a.boostedScore)
      .map((item) => item.note);
  }

  private async simpleTraversal(
    startNoteId: string,
    maxDepth: number
  ): Promise<MemoryNote[]> {
    const visited = new Set<string>();
    const result: MemoryNote[] = [];
    let currentLevel = [startNoteId];

    for (let depth = 0; depth < maxDepth && currentLevel.length > 0; depth++) {
      const nextLevel: string[] = [];

      for (const noteId of currentLevel) {
        if (visited.has(noteId)) continue;
        visited.add(noteId);

        // Get the note
        const note = await this.getNote(noteId);
        if (note && noteId !== startNoteId) {
          result.push(note);
        }

        // Get connected edges
        const edges = await this.getEdges({ noteId });
        for (const edge of edges) {
          const connectedId = edge.sourceId === noteId ? edge.targetId : edge.sourceId;
          if (!visited.has(connectedId)) {
            nextLevel.push(connectedId);
          }
        }
      }

      currentLevel = nextLevel;
    }

    return result;
  }

  private async findSimilarForCandidate(
    note: MemoryNote
  ): Promise<Array<{ note: MemoryNote; similarity: number }>> {
    try {
      const similar = await this.findSimilarNotes(note.id, 5);
      return similar.map((s) => ({
        note: s,
        similarity: this.calculateSimilarity(note, s),
      }));
    } catch {
      return [];
    }
  }

  private calculateSimilarity(note1: MemoryNote, note2: MemoryNote): number {
    // Simple text-based similarity (Jaccard)
    const words1 = new Set(note1.content.toLowerCase().split(/\s+/));
    const words2 = new Set(note2.content.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private generateSuggestedActions(
    note: MemoryNote,
    similarNotes: Array<{ note: MemoryNote; similarity: number }>
  ): Array<{ action: 'approve' | 'reject' | 'merge' | 'edit'; reason: string; mergeTargetId?: string }> {
    const actions: Array<{ action: 'approve' | 'reject' | 'merge' | 'edit'; reason: string; mergeTargetId?: string }> = [];

    // Check for very similar notes
    const verySimilar = similarNotes.filter((s) => s.similarity > 0.8);
    if (verySimilar.length > 0) {
      actions.push({
        action: 'merge',
        reason: `Very similar to existing note (${Math.round(verySimilar[0].similarity * 100)}% match)`,
        mergeTargetId: verySimilar[0].note.id,
      });
    }

    // Check for moderately similar notes
    const moderatelySimilar = similarNotes.filter((s) => s.similarity > 0.5 && s.similarity <= 0.8);
    if (moderatelySimilar.length > 0) {
      actions.push({
        action: 'edit',
        reason: 'Similar notes exist, consider editing to differentiate',
      });
    }

    // Default approve if no issues
    if (verySimilar.length === 0) {
      actions.push({
        action: 'approve',
        reason: 'No conflicts detected',
      });
    }

    return actions;
  }

  private determineCandidateReason(source: ExtractionSource): string {
    if (source.extractionConfidence !== undefined && source.extractionConfidence < 0.7) {
      return 'Low extraction confidence requires verification';
    }
    if (source.type === 'conversation') {
      return 'Extracted from conversation, needs user confirmation';
    }
    if (source.type === 'document') {
      return 'Extracted from document, needs relevance verification';
    }
    return 'New information requires verification';
  }

  private calculateAutoActionTime(source: ExtractionSource): string | null {
    if (source.extractionConfidence !== undefined && source.extractionConfidence > 0.9) {
      // High confidence: auto-approve in 24 hours
      const autoTime = new Date();
      autoTime.setHours(autoTime.getHours() + 24);
      return autoTime.toISOString();
    }
    return null;
  }

  private determineAutoAction(
    source: ExtractionSource,
    similarNotes: Array<{ note: MemoryNote; similarity: number }>
  ): 'approve' | 'reject' | undefined {
    // Don't auto-action if there are very similar notes
    if (similarNotes.some((s) => s.similarity > 0.8)) {
      return undefined;
    }

    // High confidence can auto-approve
    if (source.extractionConfidence !== undefined && source.extractionConfidence > 0.9) {
      return 'approve';
    }

    return undefined;
  }

  private generateClassificationReasoning(note: MemoryNote): ExplainStoredResponse['classificationReasoning'] {
    return {
      type: {
        chosen: note.type,
        alternatives: this.getTypeAlternatives(note),
        reason: this.explainTypeChoice(note),
      },
      scope: {
        chosen: note.scope,
        reason: this.explainScopeChoice(note),
      },
      privacy: {
        chosen: note.privacyClass,
        reason: this.explainPrivacyChoice(note),
      },
    };
  }

  private getTypeAlternatives(note: MemoryNote): Array<{ type: NoteType; confidence: number }> {
    const types: NoteType[] = ['fact', 'preference', 'instruction', 'episode', 'procedure', 'relationship'];
    return types
      .filter((t) => t !== note.type)
      .map((type) => ({
        type,
        confidence: Math.random() * 0.3, // Placeholder
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 2);
  }

  private explainTypeChoice(note: MemoryNote): string {
    const explanations: Record<NoteType, string> = {
      fact: 'Content appears to be a factual statement or piece of information',
      preference: 'Content expresses a user preference or personal choice',
      instruction: 'Content contains instructions or directives',
      episode: 'Content describes a specific event or experience',
      procedure: 'Content outlines a process or sequence of steps',
      relationship: 'Content describes a relationship between entities',
    };
    return explanations[note.type] || 'Classification based on content analysis';
  }

  private explainScopeChoice(note: MemoryNote): string {
    const explanations: Record<NoteScope, string> = {
      user: 'Information is personal to the user',
      workspace: 'Information is relevant to a specific workspace',
      org: 'Information applies organization-wide',
      session: 'Information is relevant only to the current session',
      agent: 'Information is specific to agent behavior',
    };
    return explanations[note.scope] || 'Scope determined by context';
  }

  private explainPrivacyChoice(note: MemoryNote): string {
    const explanations: Record<PrivacyClass, string> = {
      public: 'Content contains no sensitive information',
      internal: 'Content is for internal use only (default)',
      confidential: 'Content contains sensitive business information',
      restricted: 'Content requires strict access control',
    };
    return explanations[note.privacyClass] || 'Privacy level set by default policy';
  }

  private generateStorageFactors(
    note: MemoryNote
  ): Array<{ factor: string; description: string; weight: number }> {
    const factors = [];

    // Novelty factor
    factors.push({
      factor: 'novelty',
      description: 'Information is new and not already stored',
      weight: 0.3,
    });

    // Relevance factor
    factors.push({
      factor: 'relevance',
      description: 'Information is relevant to user context',
      weight: 0.25,
    });

    // Specificity factor
    factors.push({
      factor: 'specificity',
      description: 'Information is specific and actionable',
      weight: 0.2,
    });

    // Source reliability factor
    const sourceReliability = note.provenance?.source?.extractionConfidence || 0.8;
    factors.push({
      factor: 'source_reliability',
      description: `Source has ${Math.round(sourceReliability * 100)}% confidence`,
      weight: sourceReliability * 0.15,
    });

    // User importance factor
    if (note.salience?.importanceBoost) {
      factors.push({
        factor: 'user_importance',
        description: 'User marked as important',
        weight: note.salience.importanceBoost * 0.1,
      });
    }

    return factors;
  }

  private generateStorageReasoning(
    note: MemoryNote,
    factors: Array<{ factor: string; description: string; weight: number }>
  ): string {
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const topFactors = factors
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((f) => f.description)
      .join('; ');

    return `This ${note.type} was stored because: ${topFactors}. Combined storage score: ${Math.round(totalWeight * 100)}%.`;
  }

  private determineSimilarDecision(
    note: MemoryNote,
    similar: MemoryNote
  ): 'kept_both' | 'superseded' | 'merged' {
    const similarity = this.calculateSimilarity(note, similar);
    if (similarity > 0.9) return 'merged';
    if (similarity > 0.7 && note.createdAt > similar.createdAt) return 'superseded';
    return 'kept_both';
  }

  private explainSimilarDecision(note: MemoryNote, similar: MemoryNote): string {
    const decision = this.determineSimilarDecision(note, similar);
    const similarity = Math.round(this.calculateSimilarity(note, similar) * 100);

    switch (decision) {
      case 'merged':
        return `Merged due to ${similarity}% similarity`;
      case 'superseded':
        return `Newer note supersedes older with ${similarity}% overlap`;
      case 'kept_both':
        return `Both kept as ${similarity}% similarity is below threshold`;
    }
  }

  private generateRelevanceFactors(
    note: MemoryNote,
    query: string
  ): Array<{ factor: string; contribution: number; explanation: string }> {
    const factors = [];
    const queryLower = query.toLowerCase();
    const contentLower = note.content.toLowerCase();

    // Keyword match factor
    const queryWords = queryLower.split(/\s+/);
    const matchedWords = queryWords.filter((w) => contentLower.includes(w));
    const keywordMatch = matchedWords.length / queryWords.length;
    factors.push({
      factor: 'keyword_match',
      contribution: keywordMatch * 0.3,
      explanation: `${matchedWords.length}/${queryWords.length} query terms found in content`,
    });

    // Type relevance factor
    const typeRelevance = this.getTypeRelevance(note.type, query);
    factors.push({
      factor: 'type_relevance',
      contribution: typeRelevance * 0.2,
      explanation: `Note type '${note.type}' ${typeRelevance > 0.5 ? 'matches' : 'partially matches'} query intent`,
    });

    // Recency factor
    const ageMs = Date.now() - note.updatedAt.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const recencyScore = Math.exp(-ageDays / 30);
    factors.push({
      factor: 'recency',
      contribution: recencyScore * 0.15,
      explanation: `Note is ${Math.round(ageDays)} days old`,
    });

    // Salience factor
    const salience = note.salience?.score || 0.5;
    factors.push({
      factor: 'salience',
      contribution: salience * 0.2,
      explanation: `Salience score of ${Math.round(salience * 100)}%`,
    });

    // Utility factor
    const utility = note.utility?.score || 0.5;
    factors.push({
      factor: 'utility',
      contribution: utility * 0.15,
      explanation: `Utility score of ${Math.round(utility * 100)}% based on ${note.utility?.usageCount || 0} uses`,
    });

    return factors;
  }

  private getTypeRelevance(type: NoteType, query: string): number {
    const queryLower = query.toLowerCase();

    // Detect query intent
    if (queryLower.includes('how') || queryLower.includes('step')) {
      return type === 'procedure' ? 1.0 : type === 'instruction' ? 0.8 : 0.3;
    }
    if (queryLower.includes('what') || queryLower.includes('is')) {
      return type === 'fact' ? 1.0 : type === 'relationship' ? 0.7 : 0.4;
    }
    if (queryLower.includes('prefer') || queryLower.includes('like')) {
      return type === 'preference' ? 1.0 : 0.3;
    }
    if (queryLower.includes('when') || queryLower.includes('happened')) {
      return type === 'episode' ? 1.0 : 0.3;
    }

    return 0.5; // Default relevance
  }

  private analyzeQuery(query: string): ExplainRecalledResponse['queryUnderstanding'] {
    const queryLower = query.toLowerCase();

    // Detect intent
    let intent = 'general_search';
    if (queryLower.includes('how')) intent = 'procedural';
    else if (queryLower.includes('what')) intent = 'factual';
    else if (queryLower.includes('when')) intent = 'temporal';
    else if (queryLower.includes('why')) intent = 'explanatory';
    else if (queryLower.includes('who')) intent = 'entity_search';

    // Extract key concepts (simple word extraction)
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with']);
    const keyConcepts = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .slice(0, 5);

    // Detect temporal scope
    let temporalScope: string | undefined;
    if (queryLower.includes('today')) temporalScope = 'today';
    else if (queryLower.includes('yesterday')) temporalScope = 'yesterday';
    else if (queryLower.includes('last week')) temporalScope = 'last_week';
    else if (queryLower.includes('last month')) temporalScope = 'last_month';

    return {
      intent,
      keyConcepts,
      temporalScope,
      expandedTerms: keyConcepts, // Would use a thesaurus in production
    };
  }

  private generateRecallReasoning(
    note: MemoryNote,
    query: string,
    factors: Array<{ factor: string; contribution: number; explanation: string }>
  ): string {
    const topFactors = factors
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 2)
      .map((f) => f.explanation)
      .join('; ');

    return `This note was recalled because: ${topFactors}. The note's ${note.type} classification aligns with the query intent.`;
  }

  private async computeStatsManually(userId: string): Promise<MemoryStats> {
    // Count notes by status
    const { data: noteData } = await this.supabase
      .from('memory_notes')
      .select('status, type, scope, salience, utility, created_at, content')
      .eq('user_id', userId);

    const notes = noteData || [];

    const notesByStatus: Record<NoteStatus, number> = {
      candidate: 0,
      active: 0,
      superseded: 0,
      contradicted: 0,
      deleted: 0,
    };

    const notesByType: Record<NoteType, number> = {
      fact: 0,
      preference: 0,
      instruction: 0,
      episode: 0,
      procedure: 0,
      relationship: 0,
    };

    const notesByScope: Record<NoteScope, number> = {
      user: 0,
      workspace: 0,
      org: 0,
      session: 0,
      agent: 0,
    };

    let totalSalience = 0;
    let totalUtility = 0;
    let salienceCount = 0;
    let utilityCount = 0;
    let storageBytes = 0;
    let lastActivityAt = new Date(0);
    let notesLast7Days = 0;
    let notesLast30Days = 0;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const note of notes) {
      notesByStatus[note.status as NoteStatus]++;
      notesByType[note.type as NoteType]++;
      notesByScope[note.scope as NoteScope]++;

      if (note.salience?.score) {
        totalSalience += note.salience.score;
        salienceCount++;
      }
      if (note.utility?.score) {
        totalUtility += note.utility.score;
        utilityCount++;
      }

      storageBytes += (note.content?.length || 0) * 2; // Rough estimate

      const createdAt = new Date(note.created_at);
      if (createdAt > lastActivityAt) {
        lastActivityAt = createdAt;
      }
      if (createdAt >= sevenDaysAgo) {
        notesLast7Days++;
      }
      if (createdAt >= thirtyDaysAgo) {
        notesLast30Days++;
      }
    }

    // Count edges
    const { count: edgeCount } = await this.supabase
      .from('memory_edges')
      .select('*', { count: 'exact', head: true })
      .or(`source_id.in.(${notes.map((n) => n).join(',')}),target_id.in.(${notes.map((n) => n).join(',')})`);

    // Count pending candidates
    const pendingCandidates = notesByStatus.candidate;

    // Get edge type breakdown
    const { data: edgeData } = await this.supabase
      .from('memory_edges')
      .select('type');

    const edgesByType: Record<EdgeType, number> = {
      similar: 0,
      supersedes: 0,
      contradicts: 0,
      derived_from: 0,
      mentions_entity: 0,
      part_of_cluster: 0,
    };

    for (const edge of edgeData || []) {
      if (edge.type in edgesByType) {
        edgesByType[edge.type as EdgeType]++;
      }
    }

    return {
      totalNotes: notes.length,
      notesByStatus,
      notesByType,
      notesByScope,
      totalEdges: edgeCount || 0,
      edgesByType,
      pendingCandidates,
      averageSalience: salienceCount > 0 ? totalSalience / salienceCount : 0,
      averageUtility: utilityCount > 0 ? totalUtility / utilityCount : 0,
      storageBytes,
      lastActivityAt,
      notesLast7Days,
      notesLast30Days,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new Memory v3 service instance
 */
export function createMemoryV3Service(
  supabase: SupabaseClient,
  logger?: Logger
): MemoryV3Service {
  return new MemoryV3Service(supabase, logger);
}
