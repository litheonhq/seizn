export const IMPORT_COLUMNS = [
  'file_name',
  'source_role',
  'parse_status',
  'extract_status',
  'candidate_count',
  'parsed_text_preview',
  'error_message',
] as const;

export const CANDIDATE_COLUMNS = ['type', 'status', 'confidence', 'content'] as const;

export const CHARACTER_COLUMNS = ['name', 'summary', 'scope', 'aliases'] as const;

export const TIMELINE_COLUMNS = ['day', 'date', 'where', 'what'] as const;

export const GRAPH_COLUMNS = ['from_name', 'relation', 'to_name', 'intensity_band', 'valid_at'] as const;

export const AUDIT_COLUMNS = ['event', 'created', 'decision', 'llm', 'payload', 'replay'] as const;
