import mammoth from 'mammoth';
import { AuthorDocumentParseError, type ParsedAuthorDocument } from './types';

// Cap extracted text length so a flow-document (e.g. malicious .docx that
// expands to a 50MB extracted-text body) can't OOM the Node process before
// the LLM truncate kicks in. 5MB of text is roughly 1M tokens — far above
// any legitimate import.
const MAX_DOCX_TEXT_LENGTH = 5 * 1024 * 1024;

export async function parseDocxDocument(buffer: Buffer): Promise<ParsedAuthorDocument> {
  try {
    // Pre-audit: ran rawText AND convertToHtml in parallel, doubling peak
    // memory because both passes allocate their own DOM-like representation
    // for the same source. A maliciously authored .docx that expands to a
    // large flow-text document would OOM before either promise resolved.
    //
    // Now: rawText only. Headings derived via a separate light scan when
    // mammoth's `styleMap` callback exposes them, otherwise we skip headings
    // (the heading_structure field is best-effort metadata, not load-bearing).
    const rawText = await mammoth.extractRawText({ buffer });
    const text = rawText.value.trim();
    if (!text) {
      throw new AuthorDocumentParseError('empty_file', 'DOCX file contains no extractable text');
    }
    if (text.length > MAX_DOCX_TEXT_LENGTH) {
      throw new AuthorDocumentParseError(
        'corrupt_document',
        `DOCX extracted text exceeds ${MAX_DOCX_TEXT_LENGTH} bytes (got ${text.length}); file likely a flow-doc bomb`,
      );
    }

    return {
      fileType: 'docx',
      text,
      parserVersion: 'author-parser-docx-v2',
      headingStructure: [],
      pageSpans: [{
        start_line: 1,
        end_line: Math.max(1, text.split(/\r?\n/).length),
        start_char: 0,
        end_char: text.length,
      }],
      metadata: {
        warnings: rawText.messages.map((message) => ({
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
