import { PDFParse } from 'pdf-parse';
import { AuthorDocumentParseError, type ParsedAuthorDocument } from './types';

// pdf-parse (and pdfjs-dist underneath) have known DoS vectors via deeply
// nested object streams and font tables. A 200KB malicious PDF can
// consume gigabytes of RAM and minutes of CPU. Enforce hard caps:
//   - max pages: 500 (long novels typically <300; refusing 500+ avoids
//     pathological compressed-page attacks)
//   - max extracted text: 5MB (~1M tokens — well above any legitimate use)
//   - parse timeout: 20s wall-clock (above ~15s and the user's been waiting
//     on a stuck UI; the request was probably abandoned anyway)
const MAX_PDF_PAGES = 500;
const MAX_PDF_TEXT_LENGTH = 5 * 1024 * 1024;
const PDF_PARSE_TIMEOUT_MS = 20_000;

export async function parsePdfDocument(buffer: Buffer): Promise<ParsedAuthorDocument> {
  const parser = new PDFParse({ data: buffer });
  // Race the parse against a wall-clock timeout so a hostile PDF can't
  // pin the worker forever. The parser.destroy() in finally still runs
  // even if the timeout wins.
  const parsePromise = parser.getText();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new AuthorDocumentParseError(
        'corrupt_document',
        `PDF parse exceeded ${PDF_PARSE_TIMEOUT_MS}ms timeout`,
      )),
      PDF_PARSE_TIMEOUT_MS,
    );
  });

  try {
    const result = await Promise.race([parsePromise, timeoutPromise]);
    if (typeof result.total === 'number' && result.total > MAX_PDF_PAGES) {
      throw new AuthorDocumentParseError(
        'corrupt_document',
        `PDF has ${result.total} pages; max ${MAX_PDF_PAGES}`,
      );
    }
    const text = result.text.trim();
    if (!text) {
      throw new AuthorDocumentParseError('empty_file', 'PDF file contains no extractable text');
    }
    if (text.length > MAX_PDF_TEXT_LENGTH) {
      throw new AuthorDocumentParseError(
        'corrupt_document',
        `PDF extracted text exceeds ${MAX_PDF_TEXT_LENGTH} bytes (got ${text.length})`,
      );
    }

    return {
      fileType: 'pdf',
      text,
      parserVersion: 'author-parser-pdf-v2',
      headingStructure: [],
      pageSpans: result.pages.map((page) => ({
        page: page.num,
        start_char: 0,
        end_char: page.text.length,
      })),
      metadata: {
        pages: result.total,
      },
    };
  } catch (error) {
    if (error instanceof AuthorDocumentParseError) {
      throw error;
    }
    throw new AuthorDocumentParseError(
      'corrupt_document',
      error instanceof Error ? error.message : 'Failed to parse PDF'
    );
  } finally {
    await parser.destroy();
  }
}
