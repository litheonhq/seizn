# Author Memory v3 — Persistence Task Pack

Status: ready for Codex execution
Owner: handoff written 2026-05-03
Companion design doc: [`seizn-author-memory-v3-persistence-handoff.md`](./seizn-author-memory-v3-persistence-handoff.md)

## How to use this document

자동 순차 진행 모드. 단일 Codex run 으로 Phase 0~6 (코드 작업 전체) 를
연달아 실행. Phase 7~8 은 수동 (Vercel env + PR 머지).

각 phase:

1. Phase 섹션 read.
2. 참조된 handoff 섹션 read.
3. Steps 실행 + 정해진 commit 단위로 commit.
4. Verify gate 평가.
5. **Gate pass → 즉시 다음 phase 진입.** 보고 없이 진행.
6. **Gate fail → 즉시 stop, 실패 phase·gate·로그 보고, Phase 6 완료까지 자동 진행 중단.**
7. Phase 6 완료 → 자동 stop (Phase 7 은 codex 권한 밖).

병렬 금지 — 항상 sequential. cross-task 오염 방지
(`feedback_codex_sequential_execution` 정합).

verify gate 가 안전망. 실패하지 않은 phase 는 묻지 않고 진행.

### Dispatch header (단 1회)

```
작업 디렉토리: C:/Users/admin/Projects/seizn
실행 대상: C:/Users/admin/Projects/seizn/docs/architecture/seizn-author-memory-v3-persistence-task-pack.md §Phase 0 → §Phase 6 순차 자동
지침: Phase 0부터 시작. 각 phase verify gate 통과 시 다음 phase 즉시 진입.
      verify gate 실패 시 즉시 stop, 실패 phase·gate·로그 보고.
      Phase 6 완료 후 자동 stop (Phase 7 Vercel env 는 인간 작업).
      병렬 실행 금지·순차만 (feedback_codex_sequential_execution 정합).
      각 phase 의 commit 양식 준수. 한 phase = 정해진 commit 단위.
```

The agent must not invent extra phases or skip the verify gate to keep moving.

### Commit message convention

- One commit per phase boundary, except Phase 1 (one commit per migration).
- Format: `<type>(<scope>): <imperative summary>`
- Scopes used: `supabase`, `author`
- Types used: `feat`, `refactor`, `chore`, `test`
- Example: `feat(supabase): add author_imports table with RLS`

No emoji, no Co-Authored-By footer unless requested.

## Pre-flight checklist (before Phase 0)

- [ ] Working directory is `C:/Users/admin/Projects/seizn`.
- [ ] On branch `feat/npc-memory-pivot` (or its descendant).
- [ ] `git status` clean.
- [ ] `npm install` already run (no missing deps).
- [ ] Supabase project access available (for verifying migrations later).

---

## Phase 0 — Branch + baseline

**Goal:** Cut the working branch and confirm the baseline is green.

### Steps

1. `git checkout -b feat/npc-memory-pivot-persistence` (off `feat/npc-memory-pivot`).
2. `npm run typecheck`
3. `npm run test:run`
4. Review the handoff doc sections §1–§4 to load context.

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] `npm run test:run` passes (existing tests; ~12 author-ui tests must pass)
- [ ] `git status` clean
- [ ] No commit yet — branch is the only artifact

**Verify gate pass → Phase 1 자동 진행. Fail → stop and report.**

---

## Phase 1 — Migrations (5 SQL files)

**Goal:** Land the 5 new tables, indexes, RLS policies, and shared
`set_author_updated_at` trigger.

**Reference:** Handoff §3 (Schema design). Schema for each table is verbatim
in §3.2 through §3.6. Trigger function in §3.7.

### Steps

For each migration file:

1. Create `supabase/migrations/20260503001_author_imports.sql` with the SQL
   from handoff §3.2 plus:
   - `set_author_updated_at()` function definition (handoff §3.7).
   - `trg_author_imports_set_updated_at` trigger.
   - `ALTER TABLE author_imports ENABLE ROW LEVEL SECURITY;`
   - Two `DO $$ ... END $$` policy blocks (SELECT + INSERT) following the
     idempotent pattern from
     [supabase/migrations/20260502006_author_audit_log.sql](../../supabase/migrations/20260502006_author_audit_log.sql)
     lines 44–67. Add UPDATE and DELETE policies as well.
2. Repeat for `20260503002_author_candidates.sql` (handoff §3.3).
3. Repeat for `20260503003_author_characters.sql` (handoff §3.4).
4. Repeat for `20260503004_author_conflicts.sql` (handoff §3.5).
5. Repeat for `20260503005_author_simulations.sql` (handoff §3.6).
6. Apply locally with `supabase db push` or whatever the runner used for
   prior `2026050200X_*` migrations. (If the runner is unavailable in the
   sandbox, document the manual `psql -f` invocation in the commit message.)
7. Commit each migration on its own:
   - `feat(supabase): add author_imports table with RLS`
   - `feat(supabase): add author_candidates table with RLS`
   - `feat(supabase): add author_characters table with RLS`
   - `feat(supabase): add author_conflicts table with RLS`
   - `feat(supabase): add author_simulations table with RLS`

### Verify gate

- [ ] `npm run verify:supabase-lints` passes
- [ ] All 5 tables exist in the dev Supabase project (Table Editor confirms)
- [ ] `pg_policies` shows ≥4 policies per table (SELECT/INSERT/UPDATE/DELETE)
- [ ] `pg_indexes` shows the indexes named in handoff §3
- [ ] `pg_trigger` shows `trg_author_<entity>_set_updated_at` per mutable table
- [ ] 5 commits on the branch

**Verify gate pass → Phase 2 자동 진행. Fail → stop and report.**

---

## Phase 2 — Hand-rolled row types

**Goal:** Add TypeScript row interfaces that mirror the SQL schemas.

**Reference:** Handoff §3 (column lists). Convention reference:
[src/lib/author/audit/types.ts](../../src/lib/author/audit/types.ts).

### Steps

1. Create `src/lib/author/ui/store-types.ts` exporting:
   - `AuthorImportRow`
   - `AuthorCandidateRow`
   - `AuthorCharacterRow`
   - `AuthorConflictRow`
   - `AuthorSimulationRow`
   - `AuthorCandidateFilter`, `AuthorConflictFilter` (used by store interface
     in Phase 3)
2. Each row type matches the SQL columns one-to-one. Use snake_case for the
   row shape; the existing camelCase domain types (`AuthorUiImport` etc.) are
   the public-facing form.
3. Add a `JsonValue` import from `@/lib/author/memory-v3/canonical` for JSONB
   columns.

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] No new ESLint warnings: `npm run lint -- src/lib/author/ui/store-types.ts`
- [ ] One commit: `feat(author): add persistence row types`

**Verify gate pass → Phase 3 자동 진행. Fail → stop and report.**

---

## Phase 3 — Store interface + in-memory adapter

**Goal:** Define the `AuthorUiStore` interface and extract the current Map
mutation logic into an in-memory implementation. service.ts is **not yet
modified** — both forms of state co-exist after this phase.

**Reference:** Handoff §4 (Store interface and dispatch).

### Steps

1. Create `src/lib/author/ui/store.ts` with:
   - `AuthorUiStore` interface (handoff §4.1)
   - `AuthorUiStoreConfigError` class (mirrors
     [logger.ts:161-166](../../src/lib/author/audit/logger.ts#L161-L166))
   - `SupabaseClientLike` typedef (mirrors
     [logger.ts:20](../../src/lib/author/audit/logger.ts#L20))
   - `createAuthorUiStoreForUser` factory (handoff §4.3) — initially returns
     only `InMemoryAuthorUiStore` until Phase 4 wires the supabase form.
2. Create `src/lib/author/ui/in-memory-store.ts` with `InMemoryAuthorUiStore`:
   - Holds its own Maps (mirrors what's currently scattered across
     `AuthorUiState`).
   - Implements every method of `AuthorUiStore`.
   - `resetForTests(userId)` clears all Maps for that user.
3. Do **not** modify service.ts yet.

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] `npm run test:run -- author-ui` passes (existing tests untouched)
- [ ] No production code path uses `InMemoryAuthorUiStore` yet
- [ ] One commit: `refactor(author): extract in-memory store adapter`

**Verify gate pass → Phase 4 자동 진행. Fail → stop and report.**

---

## Phase 4 — Supabase store adapter + seed helper

**Goal:** Implement `SupabaseAuthorUiStore` against `createServerClient()`,
plus the lazy seed helper. New supabase-mode tests land here.

**Reference:** Handoff §4.2, §6 (seed-on-first-write).

### Steps

1. Create `src/lib/author/ui/supabase-store.ts`:
   - `SupabaseAuthorUiStore` class implementing `AuthorUiStore`.
   - Constructor mirrors
     [logger.ts:60-68](../../src/lib/author/audit/logger.ts#L60-L68): takes
     `{ userId, client? }`, defaults client to `createServerClient()`.
   - Each method: builds the SQL via `.from(table).select(...).eq('user_id', this.userId)...`,
     throws `Error(\`Failed to <op> <table>: ${error.message}\`)` on error.
   - JSONB writes go through `sanitizeAuthorAuditJson` for any field that
     could carry user prose (e.g., `payload`, `details`, `source`).
2. Create `src/lib/author/ui/seed-project.ts`:
   - `seedAuthorUiProject(store, userId, projectId)` per handoff §6.1.
   - Reads from `seedBundle` constant — to avoid circular import, accept the
     bundle as a parameter or move the bundle to its own module
     `src/lib/author/ui/seed-bundle.ts`.
3. Update the factory in `store.ts` to dispatch on `AUTHOR_UI_STORE` env flag.
4. Create `src/__tests__/author-ui/supabase-store.test.ts`:
   - 5 happy-path tests (one per entity) verifying `from()` table name and
     insert/update SQL shape.
   - 1 error-path test (Supabase returns `{ error: { message: '...' } }`).
   - 1 lazy-seed test (empty `countAll` → `seedAuthorUiProject` triggered).
   - Use the existing Vitest Supabase mock pattern from
     [src/test/setup.ts](../../src/test/setup.ts).

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] `npm run test:run` passes (full suite, including new tests)
- [ ] `npm run lint -- src/lib/author/ui/` passes
- [ ] One commit: `feat(author): add supabase store adapter + seed helper`

**Verify gate pass → Phase 5 자동 진행. Fail → stop and report.**

---

## Phase 5 — Env flag + .env.example

**Goal:** Document the env flag, wire it into `.env.example` and
`hasServerSupabaseServiceRoleConfig` callsite checks.

**Reference:** Handoff §9 (Env vars).

### Steps

1. Add to `.env.example`:
   ```bash
   # Author Memory v3 store backend.
   # `memory` (default) keeps state per serverless instance; `supabase` persists across requests.
   # Production and Vercel previews must set this to `supabase`.
   AUTHOR_UI_STORE=memory
   ```
2. Add a small dispatch unit test inside `supabase-store.test.ts` (or a new
   file `store-factory.test.ts`):
   - Memory mode: factory returns `InMemoryAuthorUiStore` when env is unset
     or `'memory'`.
   - Supabase mode: factory returns `SupabaseAuthorUiStore` when env is
     `'supabase'` and config is present.
   - Supabase mode + missing config: throws `AuthorUiStoreConfigError`.

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] `npm run test:run` passes
- [ ] `.env.example` shows `AUTHOR_UI_STORE`
- [ ] One commit: `feat(author): wire AUTHOR_UI_STORE dispatch`

**Verify gate pass → Phase 6 자동 진행. Fail → stop and report.**

---

## Phase 6 — service.ts delegation

**Goal:** Refactor `AuthorUiService` so every public method delegates to
`AuthorUiStore`. The `statesByUser` Map remains for in-memory mode and for
the project metadata, BYOK cache, and audit references that aren't in scope
for this cycle.

**Reference:** Handoff §5 (service.ts refactor) — read the full method
delegation table in §5.3 before starting.

### Steps

1. Update `getAuthorUiService(userId)` to construct the store via
   `createAuthorUiStoreForUser({ userId })` and pass it into the
   `AuthorUiService` constructor (handoff §5.2).
2. For each method in the §5.3 table, replace the in-memory mutation with
   the corresponding store call. Keep audit logging unchanged. Order of
   operations inside a method:
   - Validate input (existing guards).
   - Call `await this.store.<op>(...)`.
   - Queue audit write (`this.logAudit(...)` — existing pattern).
   - Return result.
3. For read methods that lazily seed (`listImports`, `listCandidates`,
   `listCharacters`, `listConflicts`):
   - Call `await seedAuthorUiProject(this.store, this.userId, projectId)`
     before the read in supabase mode.
   - The seed helper short-circuits when the project already has data.
4. `resetAuthorUiServiceForTests(userId)`:
   - Construct an `InMemoryAuthorUiStore` directly (ignore env flag in tests).
   - Reset `statesByUser[userId]` and the in-memory store's per-user maps.
   - Return `new AuthorUiService(state, store, userId)`.
5. Preserve `flushAuditWrites`, `pruneAuthorUiStates`, `createSeedState`,
   and the `seedBundle` constant unchanged.

### Verify gate

- [ ] `npm run typecheck` passes
- [ ] `npm run test:run` passes (12 service.ts tests + supabase-store tests +
      author-ui-route tests + settings-ui tests — full suite)
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] No regressions on existing audit log writes (audit tests still green)
- [ ] One commit: `refactor(author): delegate service to AuthorUiStore`

**Verify gate pass → 자동 stop (Phase 7 은 수동, codex 권한 밖). Fail → stop and report.**

---

## Phase 7 — Vercel env + preview deploy

**Goal:** Set the env flag in Vercel, push the branch, and wait for the
preview deploy URL.

**Reference:** Handoff §9 (Env vars), §11 (Verification smoke checklist).

### Steps

1. Push branch: `git push -u origin feat/npc-memory-pivot-persistence`.
2. Manual step (human): Set `AUTHOR_UI_STORE=supabase` on the Vercel
   project's preview + production env. Codex agent does **not** have Vercel
   access — flag this in the report.
3. Wait for Vercel build to succeed; capture the preview URL.
4. Do not perform manual smoke testing inside the Codex run — that belongs
   in the next dogfood session.

### Verify gate

- [ ] Branch pushed to origin
- [ ] Preview deploy URL captured in the report
- [ ] No build failures in Vercel logs
- [ ] No additional commits in this phase

**Stop and report.** The user runs the manual smoke checklist (handoff §11)
in a separate session and files findings as a new dogfood report.

---

## Phase 8 — Merge prep (only after smoke pass)

**Goal:** Open the PR. Do not merge until the user explicitly approves after
smoke verification.

### Steps

1. `gh pr create` with:
   - Title: `feat(author): persist Author Memory v3 state to Supabase`
   - Body: link to this task pack, the handoff doc, and the dogfood report
     (`~/.codex/private/seizn-dogfood-report-2026-05-03.md` — referenced by
     name only, since it lives outside the repo).
   - Test plan: smoke checklist from handoff §11.
2. Do **not** merge. Leave the PR open for human review.

### Verify gate

- [ ] PR open against the correct base branch
- [ ] Description references task pack + handoff doc
- [ ] Smoke checklist included in the test plan section
- [ ] CI green (or known-flaky failures noted)

**Stop. Hand off to human.**

---

## Failure-mode notes

- **Typecheck fails after extracting in-memory store (Phase 3):** The most
  likely cause is that `service.ts` types (e.g., `AuthorUiState`) leak into
  the new store. Move shared interfaces (`AuthorUiImport`, etc.) into
  `store-types.ts` if needed; do not duplicate them.
- **Supabase write fails with RLS error in Phase 7 deploy:** The
  service-role client should bypass RLS. Check that
  `SUPABASE_SERVICE_ROLE_KEY` is set on the Vercel preview env, not just
  the publishable key.
- **Lazy seed fires repeatedly:** `countAll` may be returning zero from a
  failing query. Add `if (counts.imports === 0 && ...)` guard with explicit
  logging before merging.
- **Existing audit_log tests fail after Phase 6:** The `flushAuditWrites`
  invariant must hold — every mutation method that emits an audit event has
  to add the write to `state.auditLogWrites`. If a test sees a missing audit
  row, recheck the order of `await this.store.<op>()` and
  `this.logAudit(...)`.
- **Verify gate 통과했지만 의미적으로 잘못된 변경이 누적되는 경우:**
  자동 진행 중에는 발견 어려움. Phase 6 완료 후 사용자가 git log 와 diff
  검토 → 잘못된 추상화 발견 시 phase 별 commit 단위로 revert 후 해당
  phase 부터 재실행 (단일 dispatch 헤더의 `§Phase N → §Phase 6` 부분을
  실패 phase 번호로 교체).

## Anti-goals (do NOT do these)

- Do not modify `docs/knot-input/**`.
- Do not modify `scripts/verify-knot-separation.ts`.
- Do not edit `author_audit_log` migration or `logger.ts`.
- Do not introduce a new env var beyond `AUTHOR_UI_STORE`.
- Do not change route signatures in
  [src/lib/author/ui/route.ts](../../src/lib/author/ui/route.ts).
- Do not run `supabase gen types` — types are hand-rolled.
- Do not skip a verify gate to keep the cycle moving.
