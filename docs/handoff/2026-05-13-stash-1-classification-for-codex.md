# Handoff — stash@{1} classification (Codex, 2026-05-13)

## Goal

Triage the 187-file WIP currently held in `stash@{1}` (`chore-wip-restored-2026-05-12-for-codex`). Decide per-file whether each diff is:

- **A. Stale duplicate** of work already merged via PR #355 / #374 / #376 / #377 / #378 / #380 → discard
- **B. Salvageable WIP** that is not represented on `main` and is still useful → cherry-pick onto a fresh branch and open a PR
- **C. Stale-but-not-merged** (premise broken by other refactors, conflicts with current `main`, or no longer needed) → discard

Output: one new branch + PR containing only the Category B diffs, plus a short report file listing the per-file verdict.

## Non-goals

- Do NOT drop, overwrite, or rewrite `stash@{1}` until the PR is merged. Apply with `git stash apply` (not `pop`).
- Do NOT do unrelated cleanup, dependency bumps, or refactors. Keep the PR scope to surviving WIP only.
- Do NOT include `package.json` / `package-lock.json` deltas unless a salvaged file genuinely needs a new runtime dep.
- Do NOT touch the Stripe webhook handler (`src/app/api/webhooks/stripe/route.ts`) — that area was fully rewritten by PRs #355 and #377. Treat any stash diff there as Category A automatically.

## Critical safety rules

1. **Stash preservation.** The stash entry must still exist after the work is done. Verify with `git stash list` at the end — `stash@{1}: On chore/dashboard-loading-minimal: chore-wip-restored-2026-05-12-for-codex` must remain.
2. **Branch hygiene.** Branch from `origin/main` at the latest commit, not from any local branch. Repo: `litheonhq/seizn` (the `litheonhq` GH account, not `iruhana`).
3. **gh account.** Run `gh auth switch --user litheonhq` before any `gh` command. Mixing accounts is forbidden by global rule §9.
4. **Production smoke.** Do not run `scripts/production-smoke.mjs` as part of this task. It writes to prod and is now wired up as a dispatch-only CI workflow (see `.github/workflows/production-smoke.yml`).
5. **Secrets.** Do not introduce any new env-var references or hardcoded URLs without first checking the consolidated vault at `~/.codex/private/consolidated/litheon.env`.

## Context — what's in the stash and why

`stash@{1}` was created during 2026-05-12 work on `chore/dashboard-loading-minimal` and rolled forward across the prod-P0 incident response. Since then, an intense one-day burst of merges (PRs #355 → #380) has changed the codebase under the stash's feet. The stash spans:

- 187 files, +3773 / -2046 lines
- Several files that PR #355 and PR #374/#376 have since fully rewritten — those diffs are almost certainly stale
- Some files outside the merged PRs' scope (e2e specs, legacy dashboard surfaces, marketing pages, memory-editor surface) that may still be useful

`git stash show stash@{1} --stat` confirms current state. Full file list reproducible via `git stash show stash@{1} --name-only`.

## Reference — merged PRs that overlap with the stash

These are the PRs the stash must be diffed against. When a stash file touches the same area as one of these PRs, it is Category A unless its diff adds something the PR did not.

| PR    | Date       | Area                                                                            |
| ----- | ---------- | ------------------------------------------------------------------------------- |
| #355  | 2026-05-11 | Stripe webhook + memory route + production-smoke + boolean schema convergence   |
| #356  | 2026-05-11 | `vercel.json` — webhook path exempted from apex→www 308 redirect                |
| #357  | 2026-05-11 | Hybrid search cascading timeouts (`src/lib/search/**`)                          |
| #358  | 2026-05-11 | `vercel.json` — preview deploys disabled                                        |
| #359  | 2026-05-11 | Memory search empty-keyword fallback                                            |
| #367  | 2026-05-12 | Voyage timeout unification + empty-pool probe                                   |
| #368  | 2026-05-12 | `content_tsv` STORED generated column                                           |
| #372  | 2026-05-12 | MCP `delete_observations` fix                                                   |
| #374  | 2026-05-12 | Dashboard consolidation (workspace-shell, sidebar, top-bar, dashboard-routes)   |
| #375  | 2026-05-12 | Bundle budget cap raise                                                         |
| #376  | 2026-05-12 | Dashboard fixes (review/timeline tab, 3D graph lighting, sidebar prefetch, i18n)|
| #377  | 2026-05-12 | Track 2 profile sync helper extraction + tests                                  |
| #378  | 2026-05-12 | `.github/workflows/stripe-webhook-url-drift.yml`, `production-smoke.yml`        |
| #379  | 2026-05-12 | `scripts/load-local-env.mjs` — tolerate missing dotenv                          |
| #380  | 2026-05-12 | `production-smoke.yml` — pass `NEXT_PUBLIC_SUPABASE_*` env                      |

## Pre-classification — files I'm confident about

Already evaluated based on filename + scope overlap with the PR table above. Codex should still spot-check, but these are safe defaults.

### Category A — drop without further diffing (overlap with merged PRs)

- `src/app/api/webhooks/stripe/route.ts` — completely rewritten by #355 + #377
- `src/lib/stripe-checkout.ts`, `src/lib/stripe-metered.ts`, `src/lib/stripe.ts` — #355 area
- `src/lib/__tests__/stripe-metered-v8.test.ts` — #355 area
- `scripts/production-smoke.mjs` — #355 rewrite + #378 (CI workflow) + #380 (env handling)
- `src/components/dashboard/redesign/workspace-shell.tsx` — rewritten by #374, #376
- `src/components/dashboard/redesign/sidebar/sidebar.tsx`, `sidebar-item.tsx`, `nav-config.ts` — #374, #376
- `src/components/dashboard/redesign/top-bar.tsx` — #374
- `src/components/dashboard/redesign/views/use-author-data.ts` — #374, #376 area
- `src/__tests__/dashboard/redesign/sidebar.test.ts`, `workspace-shell.test.tsx` — same area as above
- `src/i18n/dictionaries/{en,ja,ko}.json` — #376 touched the `dashboard.fallback.body` key. **Diff against current main** before discarding to confirm the stash isn't introducing new unrelated translation keys.
- `src/lib/dashboard-routes.ts` — #374 rewrote this

### Category B — likely salvageable, diff-confirm before keeping

- `e2e/dashboard-auth-smoke.spec.ts`, `e2e/dashboard-smoke.spec.ts` — e2e improvements not in any merged PR
- `src/__tests__/billing/{billing-portal-route,byok-route,checkout-route,checkout-button-legal,stripe-config,subscription-route}.test.ts` — billing-area test coverage; cross-check that the tests don't reference removed code paths
- `src/__tests__/smoke/batch-c-smoke.test.tsx` — independent smoke suite
- `src/__tests__/legal/legal-docs.test.ts` — paired with `legal/en/{privacy-policy,terms-of-service}.md` (+6 each)
- `src/__tests__/seo/sitemap-robots-contract.test.ts` — independent SEO contract test
- `src/app/(dashboard)/dashboard/memory-editor/page.tsx` + `src/components/memory-editor/grid.tsx` — memory-editor surface, not touched by merged PRs
- `src/app/(dashboard)/dashboard/legacy/webhooks/webhooks-client.tsx` — legacy webhooks UI (verify legacy surface is still active)
- `ISSUES.md` (+137 lines) — incident notes; merge if they document real prod incidents not already captured

### Category C — likely discard but needs Codex judgment

- All other `src/app/(dashboard)/dashboard/legacy/*` files — depends on whether the legacy surface is still maintained on `main`
- `src/app/[locale]/**` landing/marketing pages — many were refactored by recent landing PRs (#353 4-track IA); diff carefully
- `src/components/dashboard/{CommandPalette,DebugBundleExport,RiskConfirmationModal,ShareTraceModal,TraceReplay}.tsx` — older dashboard components; verify they still exist on main and the stash diff isn't broken by upstream refactors
- `src/components/{adaptive-planner,answer-contract,autopilot,budget-planner,compression,devtools,domain-adapter,extreme-homepage,features,graph,hybrid-orchestrator,knowledge-gap,landing,policy-simulator,relay,settings,testing,viz}/**` — feature-specific components, individual judgment required
- `next.config.ts`, `.vercelignore`, `playwright.config.ts`, `package.json` — config drift; almost always Category C unless the change is paired with a salvaged feature

## Procedure

1. `git fetch origin main && git checkout main && git pull --ff-only`. Confirm you are at the tip of `origin/main`.
2. `git stash list` — confirm `stash@{1}` still exists. Note its index.
3. `git checkout -b chore/stash-1-salvage-2026-05-13`.
4. `git stash apply stash@{1}` (NOT pop). Expect conflicts in the Category A files; that is fine — they will be reverted.
5. Resolve / revert per category:
   - **Category A files**: `git checkout HEAD -- <path>` to discard the stashed change and keep current `main`.
   - **Category B files**: leave the stashed change in the working tree if the diff still makes sense against current `main`. If the diff is broken by an upstream refactor, demote to Category C.
   - **Category C files**: `git checkout HEAD -- <path>`.
6. For each Category B file, run focused validation:
   - Tests added → `npx vitest run <path>` (or `npm test -- <path>`)
   - e2e → ensure spec still type-checks (do not run live — would need prod)
   - Components → `npm run typecheck` against the working tree
7. Write a short report at `docs/handoff/2026-05-13-stash-1-classification-codex-report.md` listing, per file, the verdict (A/B/C) and a one-line rationale. This is the artifact future audits will read.
8. Stage only Category B files. Verify `git status` shows nothing from Category A/C.
9. Commit on `chore/stash-1-salvage-2026-05-13` with one logical commit per coherent feature group (e.g., one commit for e2e improvements, one for billing tests, one for memory-editor, etc.) — not 50 one-file commits, not one mega-commit.
10. Push the branch and open a PR titled `chore(stash-salvage): recover Category B WIP from stash@{1}`. PR body must include a link to the report file.
11. **Verify stash preservation.** Run `git stash list` after pushing — `stash@{1}` must still appear with the same description. If it doesn't, restore it from `git fsck --lost-found` before doing anything else.
12. CI must pass before merging. Typecheck and unit tests are required; bundle budget, semgrep, trivy should also be green. The Claude Interactive gate's "CANCELLED" status is a known harmless race — do not retry the PR for it.

## Acceptance criteria

- A PR exists on `litheonhq/seizn` containing only Category B files
- `docs/handoff/2026-05-13-stash-1-classification-codex-report.md` exists with per-file verdicts
- `git stash list` still includes `stash@{1}`
- CI on the PR is green (allowing the Claude Interactive CANCELLED exception)
- No files from Category A appear in the diff
- No new dependencies, lockfile changes, or config drift

## After the PR is merged

Only after merge:

```bash
git stash drop stash@{1}
```

Do NOT drop earlier. If the PR is closed without merging (e.g., reviewer decides nothing in the stash is worth keeping), still do not drop — leave it for a future review.

## Repo context cheatsheet

- Working dir: `C:\Users\admin\Projects\seizn`
- Active GH account: `litheonhq` (NOT `iruhana`)
- Main branch: `main`
- Test runner: `vitest`
- Build: `npm run build` (Next.js)
- Typecheck: `npm run typecheck`
- Active Node: 20

## Known traps

- `package.json` in the stash adds 2 lines. Don't accept unless tied to a salvaged feature — and even then verify the new dep is necessary on current main.
- `next.config.ts` stash diff is +17 lines — most likely conflicts with PRs #356 / #358 vercel/redirect changes. Default to Category C.
- Several `src/app/[locale]/**` pages have been heavily refactored on main between when the stash was created and now. Even files that look unrelated may have moved imports or props.
- The `legacy/` dashboard tree may have been deleted on main entirely (verify with `ls src/app/(dashboard)/dashboard/legacy/`). If gone, all `legacy/*` stash files are auto-Category-C.
