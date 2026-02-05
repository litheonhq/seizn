/**
 * Candidate Service
 *
 * Manages the memory candidate queue for review-before-save workflow.
 * Candidates are memories pending user approval before being committed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from '@/lib/embeddings';
import { getLanguageProcessor } from './language-processor';
import { detectPII } from '@/lib/security/pii-detector';
import { detectMultilingualPII } from '@/lib/langpack/pii';

// =============================================================================
// Types
// =============================================================================

export interface MemoryCandidate {
  id: string;
  userId: string;
  workspaceId?: string;
  namespace: string;
  scope: string;
  sessionId?: string;
  agentId?: string;

  content: string;
  noteType: string;
  tags: string[];
  categories: string[];
  confidence: number;
  metadata: Record<string, unknown>;
  provenance: Record<string, unknown>;

  action: 'pending' | 'accepted' | 'rejected' | 'redacted' | 'merged';
  reviewerUserId?: string;
  reviewedAt?: Date;
  decisionReason?: string;
  acceptedNoteId?: string;

  sourceType: string;
  sourceId?: string;

  /** Detected language (BCP-47) */
  language?: string;
  /** Detected script type */
  scriptType?: string;
  /** Language detection confidence (0-1) */
  languageConfidence?: number;

  createdAt: Date;
  expiresAt?: Date;
}

export interface CreateCandidateInput {
  content: string;
  noteType?: string;
  tags?: string[];
  categories?: string[];
  confidence?: number;
  metadata?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  workspaceId?: string;
  namespace?: string;
  scope?: string;
  sessionId?: string;
  agentId?: string;
  sourceType?: string;
  sourceId?: string;
  expiresAt?: Date;
  /** Language hint (BCP-47) to skip detection */
  language?: string;
}

export interface CandidateListOptions {
  action?: 'pending' | 'accepted' | 'rejected' | 'redacted' | 'merged';
  namespace?: string;
  sourceType?: string;
  limit?: number;
  offset?: number;
}

export interface ReviewResult {
  success: boolean;
  action: 'accepted' | 'rejected' | 'redacted';
  noteId?: string;
  error?: string;
}

// =============================================================================
// Candidate Service
// =============================================================================

export class CandidateService {
  constructor(private supabase: SupabaseClient) {}

  // ===========================================================================
  // Create Candidate
  // ===========================================================================

  /**
   * Create a new memory candidate for review
   */
  async createCandidate(userId: string, input: CreateCandidateInput): Promise<MemoryCandidate> {
    // Generate embedding
    const embedding = await generateEmbedding(input.content);

    // Process language (detect, normalize, tokenize)
    const langProcessor = getLanguageProcessor();
    const langResult = await langProcessor.processForStorage(
      input.content,
      input.language
    );

    // Scan for PII (base patterns + language-specific patterns)
    const basePiiResult = detectPII(input.content, { minConfidence: 0.7 });
    const langPiiResult = detectMultilingualPII(
      input.content,
      langResult.language,
      0.7
    );

    const piiDetected = basePiiResult.found || langPiiResult.found;
    const piiTypes = Array.from(new Set([
      ...basePiiResult.types,
      ...langPiiResult.types,
    ]));

    const { data, error } = await this.supabase
      .from('spring_memory_candidates')
      .insert({
        user_id: userId,
        workspace_id: input.workspaceId,
        namespace: input.namespace || 'default',
        scope: input.scope || 'user',
        session_id: input.sessionId,
        agent_id: input.agentId,
        content: input.content,
        embedding,
        note_type: input.noteType || 'fact',
        tags: input.tags || [],
        categories: input.categories || [],
        confidence: input.confidence || 0.8,
        metadata: {
          ...(input.metadata || {}),
          language: langResult.language,
          script_type: langResult.scriptType,
          language_confidence: langResult.languageConfidence,
          lex_tokens: langResult.lexTokens,
          phonetic_tokens: langResult.phoneticTokens,
          pii_detected: piiDetected,
          pii_types: piiTypes,
          pii_count: basePiiResult.count + langPiiResult.count,
          pii_max_confidence: Math.max(basePiiResult.maxConfidence, langPiiResult.maxConfidence),
        },
        provenance: input.provenance || {},
        source_type: input.sourceType || 'ingestion',
        source_id: input.sourceId,
        expires_at: input.expiresAt?.toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create candidate: ${error.message}`);
    }

    return this.mapCandidateFromDb(data);
  }

  /**
   * Create multiple candidates in batch
   */
  async createCandidates(
    userId: string,
    inputs: CreateCandidateInput[]
  ): Promise<MemoryCandidate[]> {
    const candidates = await Promise.all(
      inputs.map(async (input) => {
        const embedding = await generateEmbedding(input.content);
        return {
          user_id: userId,
          workspace_id: input.workspaceId,
          namespace: input.namespace || 'default',
          scope: input.scope || 'user',
          session_id: input.sessionId,
          agent_id: input.agentId,
          content: input.content,
          embedding,
          note_type: input.noteType || 'fact',
          tags: input.tags || [],
          categories: input.categories || [],
          confidence: input.confidence || 0.8,
          metadata: input.metadata || {},
          provenance: input.provenance || {},
          source_type: input.sourceType || 'ingestion',
          source_id: input.sourceId,
          expires_at: input.expiresAt?.toISOString(),
        };
      })
    );

    const { data, error } = await this.supabase
      .from('spring_memory_candidates')
      .insert(candidates)
      .select();

    if (error) {
      throw new Error(`Failed to create candidates: ${error.message}`);
    }

    return (data || []).map((row) => this.mapCandidateFromDb(row));
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get a candidate by ID
   */
  async getCandidate(candidateId: string): Promise<MemoryCandidate | null> {
    const { data, error } = await this.supabase
      .from('spring_memory_candidates')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get candidate: ${error.message}`);
    }

    return this.mapCandidateFromDb(data);
  }

  /**
   * List candidates with filters
   */
  async listCandidates(
    userId: string,
    options?: CandidateListOptions
  ): Promise<MemoryCandidate[]> {
    let query = this.supabase
      .from('spring_memory_candidates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.action) {
      query = query.eq('action', options.action);
    }

    if (options?.namespace) {
      query = query.eq('namespace', options.namespace);
    }

    if (options?.sourceType) {
      query = query.eq('source_type', options.sourceType);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 50) - 1
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list candidates: ${error.message}`);
    }

    return (data || []).map((row) => this.mapCandidateFromDb(row));
  }

  /**
   * Get pending candidate count
   */
  async getPendingCount(userId: string, namespace?: string): Promise<number> {
    let query = this.supabase
      .from('spring_memory_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('action', 'pending');

    if (namespace) {
      query = query.eq('namespace', namespace);
    }

    const { count, error } = await query;

    if (error) {
      throw new Error(`Failed to count candidates: ${error.message}`);
    }

    return count || 0;
  }

  // ===========================================================================
  // Review Operations
  // ===========================================================================

  /**
   * Accept a candidate (move to main memories table)
   */
  async acceptCandidate(
    candidateId: string,
    reviewerId: string,
    reason?: string
  ): Promise<ReviewResult> {
    const { data, error } = await this.supabase.rpc('accept_memory_candidate', {
      p_candidate_id: candidateId,
      p_reviewer_id: reviewerId,
      p_reason: reason,
    });

    if (error) {
      return { success: false, action: 'accepted', error: error.message };
    }

    return { success: true, action: 'accepted', noteId: data };
  }

  /**
   * Reject a candidate
   */
  async rejectCandidate(
    candidateId: string,
    reviewerId: string,
    reason?: string
  ): Promise<ReviewResult> {
    const { error } = await this.supabase.rpc('reject_memory_candidate', {
      p_candidate_id: candidateId,
      p_reviewer_id: reviewerId,
      p_reason: reason,
    });

    if (error) {
      return { success: false, action: 'rejected', error: error.message };
    }

    return { success: true, action: 'rejected' };
  }

  /**
   * Batch accept candidates
   */
  async acceptCandidates(
    candidateIds: string[],
    reviewerId: string,
    reason?: string
  ): Promise<ReviewResult[]> {
    return Promise.all(
      candidateIds.map((id) => this.acceptCandidate(id, reviewerId, reason))
    );
  }

  /**
   * Batch reject candidates
   */
  async rejectCandidates(
    candidateIds: string[],
    reviewerId: string,
    reason?: string
  ): Promise<ReviewResult[]> {
    return Promise.all(
      candidateIds.map((id) => this.rejectCandidate(id, reviewerId, reason))
    );
  }

  /**
   * Accept candidate with modifications
   */
  async acceptWithModifications(
    candidateId: string,
    reviewerId: string,
    modifications: {
      content?: string;
      tags?: string[];
      categories?: string[];
      noteType?: string;
    },
    reason?: string
  ): Promise<ReviewResult> {
    // Get candidate
    const candidate = await this.getCandidate(candidateId);
    if (!candidate) {
      return { success: false, action: 'accepted', error: 'Candidate not found' };
    }

    if (candidate.action !== 'pending') {
      return { success: false, action: 'accepted', error: 'Candidate already processed' };
    }

    // Generate new embedding if content changed
    const finalContent = modifications.content || candidate.content;
    let embedding = undefined;
    if (modifications.content) {
      embedding = await generateEmbedding(modifications.content);
    }

    // Process language for the final content
    const langProcessor = getLanguageProcessor();
    const langResult = await langProcessor.processForStorage(finalContent);

    // Generate canonical English translation for non-English content
    const canonical = await langProcessor.generateCanonical(
      finalContent,
      langResult.language
    );

    // Generate cross-script variants (simplified/traditional Chinese, romanized, etc.)
    const contentAlt = langProcessor.generateContentAlt(finalContent, langResult.language);
    const hasContentAlt = Object.keys(contentAlt).length > 0;

    // Insert into main table (using v3 column names + multilingual columns)
    const { data: noteData, error: insertError } = await this.supabase
      .from('spring_memory_notes')
      .insert({
        user_id: candidate.userId,
        workspace_id: candidate.workspaceId,
        content: finalContent,
        note_type: modifications.noteType || candidate.noteType,
        status: 'active',
        scope: candidate.scope,
        confidence: candidate.confidence,
        payload_json: {
          ...candidate.metadata,
          modified_on_accept: true,
          reviewer_id: reviewerId,
          original_tags: candidate.tags,
          original_categories: candidate.categories,
          applied_tags: modifications.tags || candidate.tags,
          applied_categories: modifications.categories || candidate.categories,
        },
        embedding,
        // Multilingual columns
        language: langResult.language,
        script_type: langResult.scriptType,
        language_confidence: langResult.languageConfidence,
        lex_tokens: langResult.lexTokens,
        phonetic_tokens: langResult.phoneticTokens,
        content_canonical_en: canonical?.contentCanonicalEn || null,
        embedding_canonical: canonical?.embeddingCanonical || null,
        // Cross-script variants
        content_alt: hasContentAlt ? contentAlt : {},
      })
      .select('id')
      .single();

    if (insertError) {
      return { success: false, action: 'accepted', error: insertError.message };
    }

    // Update candidate status
    await this.supabase
      .from('spring_memory_candidates')
      .update({
        action: 'accepted',
        reviewer_user_id: reviewerId,
        reviewed_at: new Date().toISOString(),
        decision_reason: reason || 'Accepted with modifications',
        accepted_note_id: noteData.id,
      })
      .eq('id', candidateId);

    return { success: true, action: 'accepted', noteId: noteData.id };
  }

  // ===========================================================================
  // Maintenance
  // ===========================================================================

  /**
   * Expire old pending candidates
   */
  async expireOldCandidates(olderThanDays = 7): Promise<number> {
    const { data, error } = await this.supabase.rpc('expire_old_candidates', {
      p_older_than: `${olderThanDays} days`,
    });

    if (error) {
      throw new Error(`Failed to expire candidates: ${error.message}`);
    }

    return data || 0;
  }

  /**
   * Delete processed candidates older than specified days
   */
  async cleanupProcessedCandidates(olderThanDays = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const { error, count } = await this.supabase
      .from('spring_memory_candidates')
      .delete()
      .neq('action', 'pending')
      .lt('reviewed_at', cutoffDate.toISOString());

    if (error) {
      throw new Error(`Failed to cleanup candidates: ${error.message}`);
    }

    return count || 0;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private mapCandidateFromDb(row: Record<string, unknown>): MemoryCandidate {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      workspaceId: row.workspace_id as string | undefined,
      namespace: row.namespace as string,
      scope: row.scope as string,
      sessionId: row.session_id as string | undefined,
      agentId: row.agent_id as string | undefined,
      content: row.content as string,
      noteType: row.note_type as string,
      tags: row.tags as string[],
      categories: row.categories as string[],
      confidence: row.confidence as number,
      metadata: row.metadata as Record<string, unknown>,
      provenance: row.provenance as Record<string, unknown>,
      action: row.action as MemoryCandidate['action'],
      reviewerUserId: row.reviewer_user_id as string | undefined,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at as string) : undefined,
      decisionReason: row.decision_reason as string | undefined,
      acceptedNoteId: row.accepted_note_id as string | undefined,
      sourceType: row.source_type as string,
      sourceId: row.source_id as string | undefined,
      language: (row.metadata as Record<string, unknown>)?.language as string | undefined,
      scriptType: (row.metadata as Record<string, unknown>)?.script_type as string | undefined,
      languageConfidence: (row.metadata as Record<string, unknown>)?.language_confidence as number | undefined,
      createdAt: new Date(row.created_at as string),
      expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createCandidateService(supabase: SupabaseClient): CandidateService {
  return new CandidateService(supabase);
}
