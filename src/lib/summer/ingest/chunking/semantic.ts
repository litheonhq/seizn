import { estimateTokens } from '@/lib/summer/utils/tokens';
import type { SemanticChunk } from '../types';

export interface SemanticChunkingOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Semantic-ish chunking (MVP):
 * - Split by paragraphs
 * - Pack paragraphs into chunks by approximate token count
 * - Keep small overlap via last paragraph(s)
 *
 * Upgrade path:
 * - Preserve PDF layout (page, section, table blocks)
 * - Table/formula extraction
 * - Citation/reference structure extraction
 */
export function semanticChunk(text: string, options?: SemanticChunkingOptions): SemanticChunk[] {
  const maxTokens = options?.maxTokens ?? 450;
  const overlapTokens = options?.overlapTokens ?? 60;

  const normalized = normalize(text);
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

  const chunks: SemanticChunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  let idx = 0;

  const pushChunk = () => {
    const chunkText = current.join('\n\n').trim();
    if (!chunkText) return;

    chunks.push({
      index: idx++,
      text: chunkText,
      tokenCount: estimateTokens(chunkText),
      metadata: {},
    });
  };

  for (const p of paragraphs) {
    const pTokens = estimateTokens(p);

    if (currentTokens + pTokens > maxTokens && current.length > 0) {
      pushChunk();

      // Overlap: keep last paragraphs until overlapTokens budget
      const overlap: string[] = [];
      let t = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const pt = estimateTokens(current[i]);
        if (t + pt > overlapTokens) break;
        overlap.unshift(current[i]);
        t += pt;
      }

      current = overlap;
      currentTokens = t;
    }

    current.push(p);
    currentTokens += pTokens;
  }

  if (current.length > 0) pushChunk();

  return chunks;
}
