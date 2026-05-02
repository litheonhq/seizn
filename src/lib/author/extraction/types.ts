import type { FactStatus } from '@/lib/author/extraction/status';

export type AuthorExtractionCandidateType =
  | 'character'
  | 'world_rule'
  | 'event'
  | 'relationship'
  | 'voice_sample'
  | 'fact';

export interface AuthorExtractionSource {
  document_id: string;
  file_path: string;
  span: {
    start_line: number;
    end_line: number;
    start_char: number;
    end_char: number;
  };
  excerpt: string;
}

export interface ExtractedAuthorCandidate {
  id?: string;
  content: string;
  type: AuthorExtractionCandidateType;
  status?: FactStatus;
  confidence: number;
  suggested_status: FactStatus;
  tags: string[];
  source: AuthorExtractionSource;
  related_existing: Array<{
    entity_id: string;
    entity_type?: string;
    relationship: 'duplicate' | 'similar' | 'conflicts';
  }>;
  target_entity_id?: string;
}

export interface AuthorExtractionInput {
  userId: string;
  projectId: string;
  importId: string;
  fileName: string;
  sourceRole: 'canon' | 'character' | 'scene' | 'reference' | 'visual';
  text: string;
  headings?: Array<{ text: string; line?: number; level?: number }>;
  existingCandidates?: Array<{ id: string; content: string; type?: string }>;
}

export interface AuthorExtractionRejectedCandidate {
  candidate: ExtractedAuthorCandidate;
  reasons: string[];
}

export interface AuthorExtractionResult {
  candidates: ExtractedAuthorCandidate[];
  rejected: AuthorExtractionRejectedCandidate[];
  metrics: {
    mode: 'llm' | 'heuristic';
    raw_candidate_count: number;
    accepted_count: number;
    rejected_count: number;
    prompt_count: number;
  };
}

export interface AuthorExtractionPromptTask {
  type: AuthorExtractionCandidateType;
  promptFile: string;
  schemaName: string;
}

export type AuthorBacklogCategory =
  | '좋아하는 것'
  | '싫어하는 것'
  | '작은 보상'
  | '작은 짜증';

export interface AuthorBacklogCharacterInput {
  id: string;
  name: string;
  summary?: string;
  archetype?: string;
  voice?: unknown;
  persona?: unknown;
  appearance?: unknown;
  background?: unknown;
  currentArcPhase?: string;
}

export interface AuthorBacklogInput {
  userId: string;
  projectId: string;
  character: AuthorBacklogCharacterInput;
  categories?: AuthorBacklogCategory[];
  itemsPerCategory?: number;
  existingEntries?: string[];
  existingCandidates?: Array<{ id: string; content: string; type?: string }>;
  principles?: string;
}

export interface AuthorBacklogCandidate {
  category: AuthorBacklogCategory;
  content: string;
  rationale: string;
  tier: 1 | 2;
  scope: 'short1';
}

export interface AuthorBacklogResult {
  characterId: string;
  characterName: string;
  candidates: AuthorBacklogCandidate[];
  rejected: Array<{
    candidate: AuthorBacklogCandidate;
    reasons: string[];
  }>;
  exportMarkdown: string;
  metrics: {
    mode: 'llm' | 'heuristic';
    categories: AuthorBacklogCategory[];
    requested_per_category: number;
    accepted_count: number;
    rejected_count: number;
  };
}
