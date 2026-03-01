import { describe, expect, it } from 'vitest';
import { toCachedMemories, toCachedMemory, type SearchResultRow } from '@/lib/memory/search-types';

describe('search-types', () => {
  it('maps a single row to cached memory with defaults', () => {
    const row: SearchResultRow = {
      id: 'm1',
      content: 'hello',
      memory_type: 'fact',
    };

    expect(toCachedMemory(row)).toEqual({
      id: 'm1',
      content: 'hello',
      memory_type: 'fact',
      importance: 5,
      similarity: undefined,
      rrf_score: undefined,
    });
  });

  it('keeps numeric ranking fields when provided', () => {
    const rows: SearchResultRow[] = [
      {
        id: 'm2',
        content: 'ranked',
        memory_type: 'preference',
        importance: 8,
        similarity: 0.93,
        rrf_score: 0.71,
      },
    ];

    expect(toCachedMemories(rows)).toEqual([
      {
        id: 'm2',
        content: 'ranked',
        memory_type: 'preference',
        importance: 8,
        similarity: 0.93,
        rrf_score: 0.71,
      },
    ]);
  });
});
