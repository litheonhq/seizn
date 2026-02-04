import type { ParsedDocument } from '../types';

export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  // Dynamically import pdf-parse to avoid DOMMatrix issues during build
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParseModule = await import('pdf-parse') as any;
  const pdfParse = pdfParseModule.default ?? pdfParseModule;
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
