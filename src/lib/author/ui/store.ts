import type { createServerClient } from '@/lib/supabase';
import type { JsonValue } from '@/lib/author/memory-v3/canonical';
import { InMemoryAuthorUiStore } from './in-memory-store';
import type {
  AuthorUiCandidate,
  AuthorUiCharacterDetail,
  AuthorUiCharacterSummary,
  AuthorUiImport,
} from './service';
import type {
  AuthorCandidateFilter,
  AuthorCandidateRow,
  AuthorCharacterRow,
  AuthorConflictFilter,
  AuthorConflictRow,
  AuthorImportRow,
  AuthorSimulationRow,
} from './store-types';

export type SupabaseClientLike = Pick<ReturnType<typeof createServerClient>, 'from' | 'rpc'>;

export interface AuthorUiStore {
  listImports(userId: string, projectId: string): Promise<AuthorUiImport[]>;
  getImport(userId: string, projectId: string, importId: string): Promise<AuthorUiImport | undefined>;
  insertImport(row: AuthorImportRow): Promise<void>;
  updateImport(userId: string, projectId: string, importId: string, patch: Partial<AuthorImportRow>): Promise<void>;
  deleteImport(userId: string, projectId: string, importId: string): Promise<void>;

  listCandidates(userId: string, projectId: string, filter: AuthorCandidateFilter): Promise<AuthorUiCandidate[]>;
  getCandidate(userId: string, projectId: string, candidateId: string): Promise<AuthorUiCandidate | undefined>;
  insertCandidates(rows: AuthorCandidateRow[]): Promise<void>;
  updateCandidate(userId: string, projectId: string, candidateId: string, patch: Partial<AuthorCandidateRow>): Promise<void>;

  listCharacterSummaries(userId: string, projectId: string): Promise<AuthorUiCharacterSummary[]>;
  getCharacter(userId: string, projectId: string, characterKey: string): Promise<AuthorUiCharacterDetail | undefined>;
  upsertCharacter(row: AuthorCharacterRow): Promise<void>;

  listConflicts(userId: string, projectId: string, filter: AuthorConflictFilter): Promise<AuthorConflictRow[]>;
  upsertConflict(row: AuthorConflictRow): Promise<void>;
  resolveConflict(userId: string, projectId: string, conflictKey: string, resolution: JsonValue): Promise<void>;

  listSimulations(userId: string, projectId: string): Promise<AuthorSimulationRow[]>;
  getSimulation(userId: string, projectId: string, simulationKey: string): Promise<AuthorSimulationRow | undefined>;
  upsertSimulation(row: AuthorSimulationRow): Promise<void>;

  countAll(userId: string, projectId: string): Promise<{
    imports: number;
    candidates: number;
    characters: number;
    conflicts: number;
    simulations: number;
  }>;

  resetForTests?(userId: string): void;
}

export class AuthorUiStoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorUiStoreConfigError';
  }
}

export function createAuthorUiStoreForUser(_options: {
  userId: string;
  client?: SupabaseClientLike;
}): AuthorUiStore {
  return new InMemoryAuthorUiStore();
}
