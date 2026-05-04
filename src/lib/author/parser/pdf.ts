import { PDFParse } from 'pdf-parse';
import { AuthorDocumentParseError, type ParsedAuthorDocument } from './types';

export async function parsePdfDocument(buffer: Buffer): Promise<ParsedAuthorDocument> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    if (!text) {
      throw new AuthorDocumentParseError('empty_file', 'PDF file contains no extractable text');
    }

    return {
      fileType: 'pdf',
      text,
      parserVersion: 'author-parser-pdf-v1',
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
