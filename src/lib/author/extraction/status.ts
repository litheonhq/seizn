export type FactStatus =
  | 'candidate'
  | 'canon'
  | 'rejected'
  | 'retired'
  | 'past_only'
  | 'contradicted'
  | 'invalidated'
  | 'author_only'
  | 'character_known'
  | 'character_unknown';

export const AUTHOR_EXTRACTION_FACT_STATUSES = new Set<FactStatus>([
  'candidate',
  'canon',
  'rejected',
  'retired',
  'past_only',
  'contradicted',
  'invalidated',
  'author_only',
  'character_known',
  'character_unknown',
]);
