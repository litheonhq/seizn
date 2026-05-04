export {
  extractAuthorCandidates,
  generateBacklogForCharacter,
} from './extractor';
export {
  scoreKnotEvalSeedV3Coverage,
  validateExtractedCandidates,
} from './validator';
export type {
  AuthorBacklogCandidate,
  AuthorBacklogCategory,
  AuthorBacklogCharacterInput,
  AuthorBacklogInput,
  AuthorBacklogResult,
  AuthorExtractionCandidateType,
  AuthorExtractionInput,
  AuthorExtractionRejectedCandidate,
  AuthorExtractionResult,
  ExtractedAuthorCandidate,
} from './types';
