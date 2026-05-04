import mammoth from 'mammoth';
import { AuthorDocumentParseError, type ParsedAuthorDocument } from './types';

export async function parseDocxDocument(buffer: Buffer): Promise<ParsedAuthorDocument> {
  try {
    const [rawText, html] = await Promise.all([
      mammoth.extractRawText({ buffer }),
      mammoth.convertToHtml({ buffer }),
    ]);
    const text = rawText.value.trim();
    if (!text) {
      throw new AuthorDocumentParseError('empty_file', 'DOCX file contains no extractable text');
    }

    return {
      fileType: 'docx',
      text,
      parserVersion: 'author-parser-docx-v1',
      headingStructure: extractHtmlHeadings(html.value),
      pageSpans: [{
        start_line: 1,
        end_line: Math.max(1, text.split(/\r?\n/).length),
        start_char: 0,
        end_char: text.length,
      }],
      metadata: {
        warnings: [...rawText.messages, ...html.messages].map((message) => ({
          type: message.type,
          message: message.message,
        })),
      },
    };
  } catch (error) {
    if (error instanceof AuthorDocumentParseError) {
      throw error;
    }
    throw new AuthorDocumentParseError(
      'corrupt_document',
      error instanceof Error ? error.message : 'Failed to parse DOCX'
    );
  }
}

function extractHtmlHeadings(html: string) {
  const headings: Array<{ level: number; text: string }> = [];
  const headingPattern = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  for (const match of html.matchAll(headingPattern)) {
    const level = Number(match[1]);
    const text = stripTags(match[2]).trim();
    if (text) {
      headings.push({ level, text });
    }
  }
  return headings.slice(0, 80);
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}
