/* eslint-disable @typescript-eslint/no-require-imports */
const pdfParse = require('pdf-parse');
import type { ParsedDocument } from '../types';

export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const data = await pdfParse(buffer);

  return {
    text: (data.text ?? '').trim(),
    metadata: {
      numpages: data.numpages,
      info: data.info ?? null,
      metadata: data.metadata ?? null,
      version: data.version ?? null,
    },
  };
}
