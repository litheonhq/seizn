import { estimateTokens } from './tokens';

export interface Chunk {
  index: number;
  content: string;
  tokenCount: number;
}

export interface ChunkingOptions {
  maxTokens?: number; // default 800
  overlapTokens?: number; // default 120
}

/**
 * Deterministic chunker with token-aware size.
 * - Split by blank lines -> paragraphs
 * - Pack paragraphs into chunks up to maxTokens
 * - Apply overlap by reusing tail paragraphs until overlapTokens satisfied
 */
export function chunkText(input: string, options: ChunkingOptions = {}): Chunk[] {
  const maxTokens = options.maxTokens ?? 800;
  const overlapTokens = options.overlapTokens ?? 120;

  const text = (input ?? '').trim();
  if (!text) return [];

  // Normalize newlines and split into paragraphs
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);

  // If no paragraphs found, fall back to raw text
  const units = paragraphs.length > 0 ? paragraphs : [text];
  const unitTokens = units.map((u) => estimateTokens(u));

  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  function finalizeChunk(): void {
    if (current.length === 0) return;
    const content = current.join('\n\n');
    const tokenCount = estimateTokens(content);
    chunks.push({ index: chunks.length, content, tokenCount });

    // Prepare overlap by keeping tail paragraphs
    if (overlapTokens > 0) {
      const tail: string[] = [];
      let tailTokens = 0;

      for (let i = current.length - 1; i >= 0; i--) {
        const p = current[i];
        const t = estimateTokens(p);
        if (tailTokens + t > overlapTokens && tail.length > 0) break;
        tail.unshift(p);
        tailTokens += t;
      }

      current = tail;
      currentTokens = tailTokens;
    } else {
      current = [];
      currentTokens = 0;
    }
  }

  for (let i = 0; i < units.length; i++) {
    const p = units[i];
    const t = unitTokens[i];

    // If a single unit is too large, hard-split by length
    if (t > maxTokens) {
      // Flush existing
      finalizeChunk();

      const approxCharsPerToken = 4;
      const targetChars = maxTokens * approxCharsPerToken;
      for (let start = 0; start < p.length; start += targetChars) {
        const slice = p.slice(start, start + targetChars);
        const tokenCount = estimateTokens(slice);
        chunks.push({ index: chunks.length, content: slice, tokenCount });
      }

      // Reset overlap state
      current = [];
      currentTokens = 0;
      continue;
    }

    if (currentTokens + t <= maxTokens) {
      current.push(p);
      currentTokens += t;
      continue;
    }

    finalizeChunk();
    current.push(p);
    currentTokens += t;
  }

  finalizeChunk();
  return chunks;
}
