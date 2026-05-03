# Author Memory v3 — Persistence Handoff

Status: design locked, awaiting Codex execution
Owner: handoff written 2026-05-03
Consumer: `seizn-author-memory-v3-persistence-task-pack.md`

## 1. Problem & scope

The Author Memory v3 UI service stores all per-user state in a module-level
`Map<string, AuthorUiState>` declared at [src/lib/author/ui/service.ts:258](../../src/lib/author/ui/service.ts).
On Vercel, every serverless instance gets its own Map. An import uploaded on
lambda A is invisible to a follow-up request that lands on lambda B, so rows
appear, then vanish on the next interaction.

Founding-member outreach for the Author surface is blocked until persistence
lands. This document specifies a Supabase-backed store that swaps in behind
`getAuthorUiService` without changing the route layer or the audit log.

### In scope (5 tables)

- `author_imports`
- `author_candidates`
- `author_characters`
- `author_conflicts`
- `author_simulations`

### Out of scope

- `author_projects` table — `Map<string, AuthorUiProject>` keeps the rich
  metadata (entity_count, scope, phase, trial_status). Project creation UX
  ships in the rebrand cycle; that cycle owns the projects table.
- `author_settings` table — same rationale; settings UI lands later.
- BYOK persistence — already covered by [supabase/migrations/068_provider_keys.sql](../../supabase/migrations/068_provider_keys.sql).
- `author_audit_log` — already migrated and shipping ([supabase/migrations/20260502006_author_audit_log.sql](../../supabase/migrations/20260502006_author_audit_log.sql)).
- UX rebrand items (English labels, sidebar, empty states) — separate cycle.

### Non-goals

- No real Supabase test instance. Tests stay on the in-memory store.
- No Postgres functions / triggers beyond `updated_at` maintenance.
- No data migration script for existing in-memory rows (they're ephemeral).

## 2. Pattern reused — `author_audit_log`

This refactor is a structural copy of the audit log persistence work. Read
these files before writing code:

- [src/lib/author/audit/logger.ts](../../src/lib/author/audit/logger.ts) — store
  interface, in-memory + Supabase implementations, env-flag dispatch via
  `createAuthorAuditLogStoreForUser` (line 250). Mirror the class layout, the
  `SupabaseClientLike` typedef, the `AuthorAuditLogStoreConfigError` pattern,
  and the row → entry mapper (`rowToEntry`).
- [supabase/migrations/20260502006_author_audit_log.sql](../../supabase/migrations/20260502006_author_audit_log.sql)
  — schema conventions: `id UUID DEFAULT gen_random_uuid()`,
  `user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`,
  RLS via `auth.uid()::TEXT = user_id`, idempotent policy creation in a
  `DO $$ ... END $$` block.
- [src/lib/supabase.ts](../../src/lib/supabase.ts) — service-role factory
  `createServerClient()` (line 48), gate `hasServerSupabaseServiceRoleConfig()`
  (line 32). All persistence writes use the service-role client; RLS is
  enforced for any anon-key reads that may land later.

### Conventions adopted from audit log

- Store interface in a new `store.ts`, two classes (`InMemoryAuthorUiStore`,
  `SupabaseAuthorUiStore`), env flag `AUTHOR_UI_STORE` mirroring
  `AUTHOR_AUDIT_LOG_STORE`.
- Sanitize JSONB payloads before insert. Reuse `sanitizeAuthorAuditJson` from
  `audit/logger.ts` for any `payload`/`details` writes that include
  user-supplied prose.
- Throw `Error(\`Failed to <op> <entity>: ${error.message}\`)` on Supabase
  errors. No silent fallbacks.
- Hand-rolled row interfaces in `store-types.ts`. No `supabase gen types`.

## 3. Schema design

### 3.1 Common conventions (every table)

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
project_id TEXT NOT NULL              -- no FK; projects table out of scope
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

- `user_id` is `TEXT`, not `UUID`. Matches `author_audit_log` and the
  `getRequestUser()` return shape.
- `project_id` is a free-form TEXT so the dogfood `'knot'` constant and any
  future user-created project IDs both work.
- Every table gets RLS enabled with the same two policies as
  `author_audit_log`:
  - `SELECT USING (auth.uid()::TEXT = user_id)`
  - `INSERT WITH CHECK (auth.uid()::TEXT = user_id)`
- Mutable tables also get:
  - `UPDATE USING (auth.uid()::TEXT = user_id) WITH CHECK (auth.uid()::TEXT = user_id)`
  - `DELETE USING (auth.uid()::TEXT = user_id)`
- Service-role inserts bypass RLS by design (same as audit log writes).
- All policy `CREATE`s wrapped in `IF NOT EXISTS` checks via
  `pg_policies` lookup, identical to the audit log migration.

### 3.2 `author_imports` — migration `20260503001_author_imports.sql`

Mirrors `AuthorUiImport` interface ([service.ts:76-93](../../src/lib/author/ui/service.ts#L76-L93)).

```sql
CREATE TABLE IF NOT EXISTS author_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN (
    'md', 'docx', 'pdf', 'txt', 'json', 'notion_export', 'obsidian_md'
  )),
  source_role TEXT NOT NULL CHECK (source_role IN (
    'canon', 'character', 'scene', 'reference', 'visual'
  )),
  a_or_d_mode TEXT NOT NULL CHECK (a_or_d_mode IN ('extract', 'raw_keep')),
  parse_status TEXT NOT NULL CHECK (parse_status IN (
    'queued', 'parsing', 'parsed', 'failed'
  )),
  parse_progress NUMERIC NOT NULL DEFAULT 0,
  extract_status TEXT NOT NULL CHECK (extract_status IN (
    'queued', 'extracting', 'extracted', 'failed'
  )),
  extract_progress NUMERIC NOT NULL DEFAULT 0,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  storage_key TEXT,                 -- R2 object key
  parsed_text_preview TEXT,
  parser_version TEXT,
  upload_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_author_imports_user_project_created
  ON author_imports(user_id, project_id, created_at DESC);
```

### 3.3 `author_candidates` — migration `20260503002_author_candidates.sql`

Mirrors `AuthorUiCandidate` interface ([service.ts:95-121](../../src/lib/author/ui/service.ts#L95-L121)).

```sql
CREATE TABLE IF NOT EXISTS author_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'character', 'world_rule', 'event', 'relationship', 'voice_sample', 'fact'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'candidate', 'canon', 'rejected', 'retired',
    'past_only', 'contradicted', 'invalidated',
    'author_only', 'character_known', 'character_unknown'
  )),
  suggested_status TEXT NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source JSONB NOT NULL,            -- document_id + file_path + span + excerpt
  related_existing JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_entity_id TEXT,
  decision_id UUID,                 -- soft link to author_audit_log.decision_id
  promoted_entity_id TEXT,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_author_candidates_user_project_status
  ON author_candidates(user_id, project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_author_candidates_decision
  ON author_candidates(user_id, decision_id) WHERE decision_id IS NOT NULL;
```

`decision_id` is a soft pointer (no FK): the audit row may land asynchronously
or the link may be cleared on retry. Use a partial index so unset values don't
inflate the index.

### 3.4 `author_characters` — migration `20260503003_author_characters.sql`

Mirrors `AuthorUiCharacterDetail` interface ([service.ts:131-172](../../src/lib/author/ui/service.ts#L131-L172)).
Heavy nested data lives in JSONB to keep the column count sane.

```sql
CREATE TABLE IF NOT EXISTS author_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  character_key TEXT NOT NULL,      -- per-project stable ID used in URLs
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  scope TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '',
  archetype TEXT NOT NULL DEFAULT '',
  voice JSONB NOT NULL DEFAULT '{}'::jsonb,
  persona JSONB NOT NULL DEFAULT '{}'::jsonb,
  appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
  background JSONB NOT NULL DEFAULT '{}'::jsonb,
  knowledge_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  relationships JSONB NOT NULL DEFAULT '[]'::jsonb,
  recent_important_memories JSONB NOT NULL DEFAULT '[]'::jsonb,
  voice_samples JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_arc_phase TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, character_key)
);
CREATE INDEX IF NOT EXISTS idx_author_characters_user_project
  ON author_characters(user_id, project_id);
```

`UNIQUE (user_id, project_id, character_key)` lets the seed-on-first-write
helper use `ON CONFLICT DO NOTHING` for idempotency.

### 3.5 `author_conflicts` — migration `20260503004_author_conflicts.sql`

Resolves the dogfood §5 finding (1-second visibility on conflict rows).

```sql
CREATE TABLE IF NOT EXISTS author_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  conflict_key TEXT NOT NULL,       -- e.g. 'conflict-1'; per-project stable
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  payload JSONB NOT NULL,           -- offending facts + summary + impact
  resolution JSONB,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, conflict_key)
);
CREATE INDEX IF NOT EXISTS idx_author_conflicts_user_project_status
  ON author_conflicts(user_id, project_id, status);
```

### 3.6 `author_simulations` — migration `20260503005_author_simulations.sql`

Mirrors `AuthorUiSimulation` interface ([service.ts:174-230](../../src/lib/author/ui/service.ts#L174-L230)).
Replay reads the same row, so we keep a single JSONB blob for `output`.

```sql
CREATE TABLE IF NOT EXISTS author_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  simulation_key TEXT NOT NULL,     -- AuthorUiSimulation.simulation_id
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  progress NUMERIC NOT NULL DEFAULT 0,
  input JSONB NOT NULL,
  context_used JSONB NOT NULL DEFAULT '{}'::jsonb,
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  trace_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
  llm_meta JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, simulation_key)
);
CREATE INDEX IF NOT EXISTS idx_author_simulations_user_project_created
  ON author_simulations(user_id, project_id, created_at DESC);
```

### 3.7 `updated_at` trigger

Reuse whatever trigger already exists in the repo (audit log doesn't have one
because rows are append-only). For the four mutable tables (imports,
candidates, characters, conflicts, simulations), define one shared
`set_updated_at` trigger function in the first migration and attach to each
table:

```sql
CREATE OR REPLACE FUNCTION set_author_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_author_imports_set_updated_at
  BEFORE UPDATE ON author_imports
  FOR EACH ROW EXECUTE FUNCTION set_author_updated_at();
-- repeat per table
```

Place the function definition in `20260503001_author_imports.sql` and use
`CREATE OR REPLACE` so it's idempotent.

## 4. Store interface and dispatch

### 4.1 New module: `src/lib/author/ui/store.ts`

```ts
export interface AuthorUiStore {
  // Imports
  listImports(userId: string, projectId: string): Promise<AuthorUiImport[]>;
  getImport(userId: string, projectId: string, importId: string): Promise<AuthorUiImport | undefined>;
  insertImport(row: AuthorImportRow): Promise<void>;
  updateImport(userId: string, projectId: string, importId: string, patch: Partial<AuthorImportRow>): Promise<void>;
  deleteImport(userId: string, projectId: string, importId: string): Promise<void>;

  // Candidates
  listCandidates(userId: string, projectId: string, filter: AuthorCandidateFilter): Promise<AuthorUiCandidate[]>;
  getCandidate(userId: string, projectId: string, candidateId: string): Promise<AuthorUiCandidate | undefined>;
  insertCandidates(rows: AuthorCandidateRow[]): Promise<void>;
  updateCandidate(userId: string, projectId: string, candidateId: string, patch: Partial<AuthorCandidateRow>): Promise<void>;

  // Characters
  listCharacterSummaries(userId: string, projectId: string): Promise<AuthorUiCharacterSummary[]>;
  getCharacter(userId: string, projectId: string, characterKey: string): Promise<AuthorUiCharacterDetail | undefined>;
  upsertCharacter(row: AuthorCharacterRow): Promise<void>;

  // Conflicts
  listConflicts(userId: string, projectId: string, filter: AuthorConflictFilter): Promise<AuthorConflictRow[]>;
  upsertConflict(row: AuthorConflictRow): Promise<void>;
  resolveConflict(userId: string, projectId: string, conflictKey: string, resolution: JsonValue): Promise<void>;

  // Simulations
  listSimulations(userId: string, projectId: string): Promise<AuthorSimulationRow[]>;
  getSimulation(userId: string, projectId: string, simulationKey: string): Promise<AuthorSimulationRow | undefined>;
  upsertSimulation(row: AuthorSimulationRow): Promise<void>;

  // Seed bootstrap
  countAll(userId: string, projectId: string): Promise<{
    imports: number; candidates: number; characters: number; conflicts: number; simulations: number;
  }>;

  // Test-only
  resetForTests?(userId: string): void;
}
```

### 4.2 Two implementations

- `InMemoryAuthorUiStore` — extracts the existing Map mutation logic from
  `service.ts` into store form. Lives in `in-memory-store.ts`. Used by all
  Vitest tests and by local dev when `AUTHOR_UI_STORE` is unset.
- `SupabaseAuthorUiStore` — uses `createServerClient()` (service-role) and
  enforces `user_id` matching in every query. Lives in `supabase-store.ts`.

### 4.3 Factory: `createAuthorUiStoreForUser`

Mirror exactly the audit-log dispatcher
([logger.ts:250-265](../../src/lib/author/audit/logger.ts#L250-L265)):

```ts
export function createAuthorUiStoreForUser(options: {
  userId: string;
  client?: SupabaseClientLike;
}): AuthorUiStore {
  if (process.env.AUTHOR_UI_STORE === 'supabase') {
    if (!options.client && !hasServerSupabaseServiceRoleConfig()) {
      throw new AuthorUiStoreConfigError(
        'AUTHOR_UI_STORE=supabase requires Supabase service-role configuration'
      );
    }
    return new SupabaseAuthorUiStore(options);
  }
  return new InMemoryAuthorUiStore();
}
```

### 4.4 Env flag

| Var | Values | Default | Where set |
|---|---|---|---|
| `AUTHOR_UI_STORE` | `supabase` \| `memory` | `memory` | Vercel preview + production set to `supabase`; `.env.example` shows both options |

Reuses the existing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars; no
new secrets.

## 5. service.ts refactor

### 5.1 What stays

- `statesByUser` Map — remains, but only used by `InMemoryAuthorUiStore`.
- `pruneAuthorUiStates`, TTL eviction logic — still needed for the in-memory
  path (otherwise dev sessions leak).
- `seedBundle` constant ([service.ts:260-265](../../src/lib/author/ui/service.ts#L260-L265))
  — read-only knot-input source. Imports at lines 1-5 are not modified.
- `getAuthorUiService(userId)` signature — unchanged.
- `resetAuthorUiServiceForTests` signature — unchanged. 12 test sites depend
  on it ([src/__tests__/author-ui/author-ui-service.test.ts](../../src/__tests__/author-ui/author-ui-service.test.ts)).
- `createSeedState(userId)` — keeps building the seed bundle for the
  in-memory store; in supabase mode the seed-on-first-write helper takes over.
- `flushAuditWrites` — unchanged.
- `withAuthorUiService` higher-order route handler ([src/lib/author/ui/route.ts](../../src/lib/author/ui/route.ts))
  — unchanged.

### 5.2 What changes

`AuthorUiService` constructor receives a store reference:

```ts
class AuthorUiService {
  constructor(
    private readonly state: AuthorUiState,   // keeps in-memory project metadata, byok, audit refs
    private readonly store: AuthorUiStore,
    private readonly userId: string,
  ) {}
}

export function getAuthorUiService(userId: string): AuthorUiService {
  pruneAuthorUiStates();
  let state = statesByUser.get(userId);
  if (!state) {
    state = createSeedState(userId);
    statesByUser.set(userId, state);
  }
  state.lastAccessedAt = Date.now();

  const store = createAuthorUiStoreForUser({ userId });
  return new AuthorUiService(state, store, userId);
}
```

Each public method that currently mutates `state.importsByProject`,
`state.candidatesByProject`, etc., delegates to `this.store.*` instead. Audit
logging is unchanged (still fires through `this.state.auditLog`).

### 5.3 Method delegation table

Source: explore agent's structural map of [service.ts](../../src/lib/author/ui/service.ts).
Every public method lists the in-memory mutation it performs today, the new
store call, and the audit event already emitted.

| Method | Today (in-memory) | After (store call) | Audit event |
|---|---|---|---|
| **Projects** | | | |
| `listProjects` | reads `state.projects` | unchanged (in-memory metadata) | — |
| `createProject` | mutates `state.projects` + 6 per-project Maps | unchanged + `store.countAll` precheck | `project.created` |
| **Imports** | | | |
| `listImports` | reads `state.importsByProject[projectId]` | `store.listImports(userId, projectId)`; trigger `seedAuthorUiProject` if empty in supabase mode | — |
| `uploadImport` | prepends to `state.importsByProject` + parses + may extract candidates | `store.insertImport(row)` then `store.updateImport(...)` for parse / extract progress; `store.insertCandidates` if extract mode | `import.upload`, `import.parsed`, `import.failed`, `candidate.added` |
| `deleteImport` | filters `state.importsByProject` | `store.deleteImport` | `import.deleted` |
| `retryImport` | resets parse/extract status fields | `store.updateImport(... { parse_status: 'queued', extract_status: 'queued', parse_progress: 0, extract_progress: 0, error_message: null })` | `import.retried` |
| **Candidates** | | | |
| `listCandidates` | filters `state.candidatesByProject` | `store.listCandidates(userId, projectId, filter)`; lazy seed if empty | — |
| `getCandidate` | finds by id in array | `store.getCandidate` | — |
| `createCandidate` | prepends to array | `store.insertCandidates([row])` | `candidate.added` |
| `decideCandidate` | sets `status` field on item | `store.updateCandidate(... { status, decided_at, promoted_entity_id, decision_id })` | `candidate.decided` |
| `batchDecideCandidates` | loops `decideCandidate` | loops `updateCandidate`; consider single SQL UPDATE … IN (…) optimization (out of scope this cycle) | `candidate.batch_decided` |
| **Characters** | | | |
| `listCharacters` | reads `characterDetailsByProject[projectId]` summaries | `store.listCharacterSummaries`; lazy seed if empty | — |
| `getCharacter` | reads detail | `store.getCharacter` | — |
| `updateCharacter` | patches nested field; may create candidate | `store.upsertCharacter(merged)` then optional `store.insertCandidates([review_candidate])` | `character.updated` |
| `generateCharacterBacklog` | LLM call → appends candidates | unchanged LLM call → `store.insertCandidates(generated)` | `backlog.generated` |
| **Graph & Timeline** | | | |
| `getGraph` | reads `seedBundle` → builds nodes/edges | unchanged (seed is read-only at runtime) | — |
| `getTimeline` | reads `seedBundle.timelineEventLedger` | unchanged | — |
| **Conflicts** | | | |
| `listConflicts` | reads `state.conflictsByProject` | `store.listConflicts(userId, projectId, filter)`; lazy seed if empty | — |
| `resolveConflict` | sets `status='resolved'`, stores resolution | `store.resolveConflict(userId, projectId, conflictKey, resolution)` | `conflict.resolved` |
| **Simulations** | | | |
| `runSimulation` | creates Map entry | `store.upsertSimulation(row)` | `simulation.run` |
| `getSimulation` | reads entry | `store.getSimulation` | — |
| `replaySimulation` | reads cached entry | `store.getSimulation` | `simulation.replay` |
| **Settings** | | | |
| `getSettings` | reads `state.settingsByProject` | unchanged (in-memory; out of scope) | — |
| `updateSettings` | patches `state.settingsByProject` | unchanged | `settings.updated` |
| **BYOK** | | | |
| `getByok`, `saveByok`, `clearByok` | reads/writes `state.byok` | unchanged (`provider_keys` table covers persistence in a separate code path; this Map is the read-cache for the UI) | `byok.updated` |
| **Usage & Sync** | | | |
| `getUsage`, `getSyncStatus` | reads in-memory | unchanged | — |
| **Audit & Search** | | | |
| `listAuditLogs`, `replayAuditDecision`, `search` | unchanged — already supabase-backed via `state.auditLog` | unchanged | — |
| **Internal** | | | |
| `flushAuditWrites`, `logAudit` | unchanged | unchanged | — |
| `touchProject` | updates project `last_updated` in-memory | unchanged (project metadata still in-memory) | — |

### 5.4 Optimistic concurrency

Not implemented this cycle. If a user double-clicks, the second store call
overwrites the first. Audit log retains the decision chain so we can detect
this in QA. Add row-level versioning in a follow-up if it becomes a problem.

## 6. Seed-on-first-write strategy

`createSeedState` ([service.ts ~1474-1509](../../src/lib/author/ui/service.ts))
currently builds initial bundle from `docs/knot-input/*.json` on every cold
start. In supabase mode this happens once per `(user_id, project_id)`, then
is read from Supabase forever after.

### 6.1 New helper: `src/lib/author/ui/seed-project.ts`

```ts
export async function seedAuthorUiProject(
  store: AuthorUiStore,
  userId: string,
  projectId: string,
): Promise<void> {
  const counts = await store.countAll(userId, projectId);
  const isEmpty = counts.imports === 0
    && counts.candidates === 0
    && counts.characters === 0
    && counts.conflicts === 0
    && counts.simulations === 0;
  if (!isEmpty) return;

  if (projectId !== DEFAULT_PROJECT_ID) {
    return; // production users get an empty project
  }

  const seed = buildSeedBundleRows(userId, projectId);
  await Promise.all([
    store.insertImport(...),  // for each
    store.insertCandidates(seed.candidates),
    store.upsertCharacter(...),  // for each
    store.upsertConflict(...),  // for each
  ]);
}
```

### 6.2 Trigger sites

Lazy seed runs from inside the read methods (`listImports`, `listCandidates`,
`listCharacters`, `listConflicts`) when they observe an empty result and the
project ID is `DEFAULT_PROJECT_ID`. `countAll` short-circuits when any table
already has rows, so the helper is cheap to call repeatedly.

### 6.3 Idempotency guarantee

`UNIQUE (user_id, project_id, character_key)` on characters,
`UNIQUE (user_id, project_id, conflict_key)` on conflicts, and
`UNIQUE (user_id, project_id, simulation_key)` on simulations make
`ON CONFLICT DO NOTHING` upserts safe. Imports and candidates use UUID PKs;
the empty-state check is the idempotency gate.

### 6.4 Production users

`createProject` from the future UX rebrand cycle will assign a non-`'knot'`
ID, so the seed helper short-circuits at the `projectId !== DEFAULT_PROJECT_ID`
check. New projects start empty in supabase mode, which is the expected
production behavior.

## 7. Test strategy

### 7.1 Memory mode tests stay

The 12 calls to `resetAuthorUiServiceForTests` in
[src/__tests__/author-ui/author-ui-service.test.ts](../../src/__tests__/author-ui/author-ui-service.test.ts)
keep working unchanged. After refactor, `resetAuthorUiServiceForTests`:

1. Constructs a fresh `InMemoryAuthorUiStore` (test ignores env flag).
2. Resets `statesByUser` entry as before.
3. Returns `new AuthorUiService(state, inMemoryStore, userId)`.

### 7.2 New supabase-store tests

New file: `src/__tests__/author-ui/supabase-store.test.ts`. Uses Vitest's
existing Supabase mock from [src/test/setup.ts](../../src/test/setup.ts):

```ts
const fromSpy = vi.fn();
const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
fromSpy.mockReturnValue({ insert: insertSpy, select: vi.fn(...), eq: vi.fn(...) });

const store = new SupabaseAuthorUiStore({
  userId: 'test-user',
  client: { from: fromSpy, rpc: vi.fn() } as any,
});

await store.insertImport(sampleRow);
expect(fromSpy).toHaveBeenCalledWith('author_imports');
expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
  user_id: 'test-user',
  project_id: 'test-project',
  file_name: '...',
}));
```

Cover one happy-path test per entity (5 minimum) plus one error-path test
(`error: { message: '...' }` → throws with `Failed to write author_imports: ...`).

### 7.3 Lazy seed test

One test to verify that calling `listImports` on an empty supabase store with
`projectId='knot'` triggers `seedAuthorUiProject`. Mock the seed bundle to
return a single record and assert the insert was called.

### 7.4 No real Supabase test DB

Matches the convention in [src/test/setup.ts](../../src/test/setup.ts).
All Supabase calls are mocked at the client interface level. Smoke
verification happens in §11.

## 8. Lock zones (DO NOT TOUCH)

Files and concerns that this refactor must not modify:

- `docs/knot-input/**` — read-only seed source. Imports at
  [service.ts:1-5](../../src/lib/author/ui/service.ts#L1-L5) preserved verbatim.
- `scripts/verify-knot-separation.ts` — separation guard.
- `supabase/migrations/20260502006_author_audit_log.sql` — already shipping.
- `supabase/migrations/068_provider_keys.sql` — BYOK persistence already done.
- `src/lib/author/audit/logger.ts` — pattern to mirror, not refactor.
- `src/lib/author/ui/route.ts` (`withAuthorUiService`) — stable contract.
- `src/lib/supabase.ts` — client factories, env helpers.
- `resetAuthorUiServiceForTests` signature — 12 dependent test sites.
- `getAuthorUiService(userId)` signature — called from route.ts.

## 9. Env vars

Add to [.env.example](../../.env.example):

```bash
# Author Memory v3 store backend.
# `memory` (default) keeps state per serverless instance; `supabase` persists across requests.
# Production and Vercel previews must set this to `supabase`.
AUTHOR_UI_STORE=memory
```

Reuses (no new secrets):

- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Vercel project env updates (preview + production): set
`AUTHOR_UI_STORE=supabase`.

## 10. Rollback plan

Toggle `AUTHOR_UI_STORE=memory` in Vercel. The route layer falls back to the
in-memory store with no schema dependency. Migrations are additive — no
existing tables modified, so the new tables can sit unused without harm.

If a migration itself misbehaves, drop the affected table; subsequent
deploys with the old code path don't touch it.

## 11. Verification (smoke checklist)

After Phase 7 deploy completes, the user re-runs the dogfood checklist
against `https://seizn-git-feat-npc-memory-pivot-persistence-litheon.vercel.app`:

- [ ] Upload an import → reload page → import row still visible.
- [ ] Generate backlog → switch tabs → return → candidates still visible.
- [ ] Resolve a conflict → reload → resolution persisted.
- [ ] BYOK still functional (Settings → enter key → applied).
- [ ] Existing `author_audit_log` rows still landing (Audit tab populated).
- [ ] Run a simulation → navigate away → return → simulation result still visible.
- [ ] Fresh user (different login) sees empty state, no leak from dogfood project.

Failure on any of these → roll back via env flag toggle, file findings in a
new dogfood report dated to the smoke run.

## 12. Files touched (summary)

New:
- `supabase/migrations/20260503001_author_imports.sql`
- `supabase/migrations/20260503002_author_candidates.sql`
- `supabase/migrations/20260503003_author_characters.sql`
- `supabase/migrations/20260503004_author_conflicts.sql`
- `supabase/migrations/20260503005_author_simulations.sql`
- `src/lib/author/ui/store.ts`
- `src/lib/author/ui/store-types.ts`
- `src/lib/author/ui/in-memory-store.ts`
- `src/lib/author/ui/supabase-store.ts`
- `src/lib/author/ui/seed-project.ts`
- `src/__tests__/author-ui/supabase-store.test.ts`

Modified:
- `src/lib/author/ui/service.ts` — `getAuthorUiService` injects store; ~33
  methods delegate to store.
- `src/lib/author/ui/index.ts` — export new store factory if needed by
  callers (likely no change; keeps the existing re-export).
- `.env.example` — `AUTHOR_UI_STORE` documented.

Untouched (lock zones in §8).
