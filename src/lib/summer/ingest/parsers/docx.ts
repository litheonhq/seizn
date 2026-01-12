import mammoth from 'mammoth';
import type { ParsedDocument } from '../types';

export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  const res = await mammoth.extractRawText({ buffer });

  return {
    text: (res.value ?? '').trim(),
    metadata: {
      warnings: res.messages ?? [],
    },
  };
}
