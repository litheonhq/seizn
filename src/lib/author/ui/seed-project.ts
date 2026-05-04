import type { AuthorUiStore } from './store';
import type {
  AuthorCandidateRow,
  AuthorCharacterRow,
  AuthorConflictRow,
  AuthorImportRow,
  AuthorSimulationRow,
} from './store-types';

export const DEFAULT_AUTHOR_UI_PROJECT_ID = 'knot';

export interface AuthorUiSeedRows {
  imports?: AuthorImportRow[];
  candidates?: AuthorCandidateRow[];
  characters?: AuthorCharacterRow[];
  conflicts?: AuthorConflictRow[];
  simulations?: AuthorSimulationRow[];
}

export async function seedAuthorUiProject(
  store: AuthorUiStore,
  userId: string,
  projectId: string,
  seedRows: AuthorUiSeedRows = {}
): Promise<void> {
  const counts = await store.countAll(userId, projectId);
  const isEmpty = counts.imports === 0
    && counts.candidates === 0
    && counts.characters === 0
    && counts.conflicts === 0
    && counts.simulations === 0;
  if (!isEmpty || projectId !== DEFAULT_AUTHOR_UI_PROJECT_ID) {
    return;
  }

  for (const row of seedRows.imports ?? []) {
    await store.insertImport(row);
  }
  if (seedRows.candidates?.length) {
    await store.insertCandidates(seedRows.candidates);
  }
  for (const row of seedRows.characters ?? []) {
    await store.upsertCharacter(row);
  }
  for (const row of seedRows.conflicts ?? []) {
    await store.upsertConflict(row);
  }
  for (const row of seedRows.simulations ?? []) {
    await store.upsertSimulation(row);
  }
}
