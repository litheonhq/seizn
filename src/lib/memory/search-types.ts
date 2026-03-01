import type { CachedMemory } from '@/lib/memory/query-cache';

export type SearchResultRow = {
  id: string;
  content: string;
  memory_type: string;
  importance?: number;
  similarity?: number;
  rrf_score?: number;
  created_at?: string;
  tags?: string[];
  companion_meta?: Record<string, unknown>;
  agent_id?: string;
  scope?: string;
};

export function toCachedMemory(row: SearchResultRow): CachedMemory {
  return {
    id: row.id,
    content: row.content,
    memory_type: row.memory_type,
    importance: typeof row.importance === 'number' ? row.importance : 5,
    similarity: typeof row.similarity === 'number' ? row.similarity : undefined,
    rrf_score: typeof row.rrf_score === 'number' ? row.rrf_score : undefined,
  };
}

export function toCachedMemories(rows: SearchResultRow[]): CachedMemory[] {
  return rows.map((row) => toCachedMemory(row));
}
