import { parseDocxDocument } from './docx';
import { parseMarkdownDocument } from './md';
import { parseTxtDocument } from './txt';
import {
  AuthorDocumentParseError,
  type AuthorImportFileType,
  type ParsedAuthorDocument,
} from './types';

export type { AuthorHeading, AuthorImportFileType, AuthorSourceSpan, ParsedAuthorDocument } from './types';
export { AuthorDocumentParseError } from './types';

const SUPPORTED_EXTENSIONS = new Set(['md', 'markdown', 'docx', 'pdf', 'txt']);
const UNSUPPORTED_AUTHOR_EXTENSIONS = new Set(['hwp', 'jtd', 'scrivx']);

export async function parseAuthorDocument(input: {
  buffer: Buffer;
  fileName: string;
  contentType?: string;
}): Promise<ParsedAuthorDocument> {
  const fileType = resolveAuthorImportFileType(input.fileName, input.contentType);

  switch (fileType) {
    case 'md':
      return parseMarkdownDocument(input.buffer);
    case 'docx':
      return parseDocxDocument(input.buffer);
    case 'pdf': {
      // Lazy import: pdf-parse depends on pdfjs-dist which references browser-only
      // globals (DOMMatrix, etc.) at module load. Defer evaluation until a PDF
      // file is actually parsed, so unrelated server endpoints don't crash.
      const { parsePdfDocument } = await import('./pdf');
      return parsePdfDocument(input.buffer);
    }
    case 'txt':
      return parseTxtDocument(input.buffer);
  }
}

export function resolveAuthorImportFileType(
  fileName: string,
  contentType?: string
): AuthorImportFileType {
  const extension = extensionFromName(fileName);
  if (UNSUPPORTED_AUTHOR_EXTENSIONS.has(extension)) {
    throw new AuthorDocumentParseError('unsupported_format', `unsupported_format:${extension}`);
  }

  if (extension === 'markdown') return 'md';
  if (SUPPORTED_EXTENSIONS.has(extension)) return extension as AuthorImportFileType;

  const mime = (contentType ?? '').toLowerCase();
  if (mime.includes('markdown')) return 'md';
  if (mime === 'text/plain') return 'txt';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx';
  }

  throw new AuthorDocumentParseError(
    'unsupported_format',
    `unsupported_format:${extension || mime || 'unknown'}`
  );
}

export function extensionFromName(fileName: string): string {
  const clean = fileName.toLowerCase().split(/[?#]/)[0];
  const extension = clean.includes('.') ? clean.slice(clean.lastIndexOf('.') + 1) : '';
  return extension.trim();
}
