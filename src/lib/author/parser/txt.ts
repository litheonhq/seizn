import iconv from 'iconv-lite';
import { AuthorDocumentParseError, type ParsedAuthorDocument } from './types';

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export function parseTxtDocument(buffer: Buffer): ParsedAuthorDocument {
  const text = decodeText(buffer).replace(/\u0000/g, '').trim();
  if (!text) {
    throw new AuthorDocumentParseError('empty_file', 'Text file is empty');
  }

  return {
    fileType: 'txt',
    text,
    parserVersion: 'author-parser-txt-v1',
    headingStructure: inferPlainTextHeadings(text),
    pageSpans: [{
      start_line: 1,
      end_line: Math.max(1, text.split(/\r?\n/).length),
      start_char: 0,
      end_char: text.length,
    }],
    metadata: {
      encoding: detectEncoding(buffer),
    },
  };
}

export function decodeText(buffer: Buffer): string {
  if (buffer.length === 0) {
    return '';
  }

  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }

  try {
    return UTF8_DECODER.decode(buffer);
  } catch {
    return iconv.decode(buffer, 'euc-kr');
  }
}

function detectEncoding(buffer: Buffer): 'utf-8' | 'utf-8-bom' | 'euc-kr' {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf-8-bom';
  }

  try {
    UTF8_DECODER.decode(buffer);
    return 'utf-8';
  } catch {
    return 'euc-kr';
  }
}

function inferPlainTextHeadings(text: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter((line) => line.text.length > 0 && line.text.length <= 120)
    .filter((line) => /^[#\dIVX가-힣A-Z][\w\s.:：\-가-힣()[\]]+$/.test(line.text))
    .slice(0, 40)
    .map((line) => ({
      level: line.text.startsWith('#') ? Math.min(6, line.text.match(/^#+/)?.[0].length ?? 1) : 2,
      text: line.text.replace(/^#+\s*/, ''),
      line: line.line,
    }));
}
