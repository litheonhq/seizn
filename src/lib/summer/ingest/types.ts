export type IngestSourceType = 'api' | 'upload' | 'url' | 'connector';

export interface IngestDocument {
  external_id?: string;
  title?: string;
  source?: string;
  mime_type?: string;
  content: string;

  metadata?: Record<string, unknown>;
}

export interface ParsedDocument {
  text: string;
  metadata: Record<string, unknown>;
}

export interface SemanticChunk {
  index: number;
  text: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
}
