export type AuthorImportFileType = 'md' | 'docx' | 'pdf' | 'txt';

export interface AuthorSourceSpan {
  page?: number;
  start_line?: number;
  end_line?: number;
  start_char?: number;
  end_char?: number;
}

export interface AuthorHeading {
  level: number;
  text: string;
  line?: number;
}

export interface ParsedAuthorDocument {
  fileType: AuthorImportFileType;
  text: string;
  parserVersion: string;
  headingStructure: AuthorHeading[];
  pageSpans: AuthorSourceSpan[];
  metadata: Record<string, unknown>;
}

export class AuthorDocumentParseError extends Error {
  constructor(
    public readonly code:
      | 'empty_file'
      | 'unsupported_format'
      | 'corrupt_document'
      | 'parse_failed',
    message: string
  ) {
    super(message);
    this.name = 'AuthorDocumentParseError';
  }
}
