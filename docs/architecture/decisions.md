# Seizn Launch Decisions

## 2026-05-03 — Beta Disclaimer Lock

Status: locked for Phase A launch route implementation; lawyer review remains a separate cycle.

Decision:
- Publish Privacy Policy, Terms of Service, and Beta Disclosure from `legal/{en,ko,ja,zh}/` through localized legal routes.
- Keep beta infrastructure disclosure visible from checkout links, footer links, and the first dashboard entry banner.
- Store dashboard banner dismissal in the `seizn_beta_disclosure_dismissed` cookie so the notice appears once per browser.

Rationale:
- Stripe checkout and external author signup need visible Terms and Privacy links before payment intent creation.
- The beta storage ownership disclosure must be easy to inspect without blocking BYOK-only dogfood users.
- Litheon LLC remains the declared controller; lawyer review and full legal polish are tracked outside this implementation phase.

## 2026-05-03 — Author Memory v3 Persistence (handoff)

Status: design locked; Codex execution scheduled in a separate session.

Decision:
- Replace the in-memory `statesByUser` Map in `src/lib/author/ui/service.ts` with a Supabase-backed store covering 5 tables (`author_imports`, `author_candidates`, `author_characters`, `author_conflicts`, `author_simulations`).
- Mirror the existing `author_audit_log` pattern: store interface + env-flag dispatch (`AUTHOR_UI_STORE=supabase|memory`), service-role writes, RLS via `auth.uid()::TEXT = user_id`.
- Defer `author_projects` and `author_settings` tables to the UX rebrand cycle.

Rationale:
- Vercel serverless instances don't share the in-memory Map; uploaded imports vanish ~1s after creation, blocking founding-member outreach (dogfood report 2026-05-03 §5).
- BYOK persistence is already covered by `provider_keys` (migration 068); audit log is already covered (20260502006). This cycle adds only the missing 5 tables.

References:
- Design spec: [seizn-author-memory-v3-persistence-handoff.md](./seizn-author-memory-v3-persistence-handoff.md)
- Codex playbook: [seizn-author-memory-v3-persistence-task-pack.md](./seizn-author-memory-v3-persistence-task-pack.md)

## 2026-05-04 — Author UI Rebrand (handoff)

Status: design locked; Codex execution runs parallel to persistence cycle (no file overlap).

Decision:
- Convert `/dashboard/author` from English dev-tone surface to Korean writer-friendly UI: author-only sidebar via `buildAuthorNavigationGroups`, 8 tabs / 6 cards / 6 tables Korean i18n, `<EmptyState>` across 10 screens, conflicts UI redesigned as card list with offending rule citation + 4 one-click resolve actions, relationship graph rebuilt as react-flow diagram with qualitative intensity bands (no raw IDs or numeric weights visible).
- ~130 new keys land under `author.*` in `src/i18n/dictionaries/{ko,en}.json`; other 20 locales auto-fall-back to `en.json` until the standard translation pass.
- Branch cuts from `feat/npc-memory-pivot-persistence` to inherit the lint hotfix (`8c1d28c2`); rebase onto `feat/npc-memory-pivot` once after the persistence PR merges.

Rationale:
- Dogfood report 2026-05-03 §8 P1 items 1–8 flagged author onboarding friction: NPC SDK menus visible to authors, English dev labels, snake_case headers, raw entity IDs, missing empty states, conflicts UI without offending rule citation.
- Spec is fully self-contained against KNOT identifiers (sample IP = Saebyeok Academy at `docs/marketing/sample_ip/`); rebrand work touches only client-side files (no `service.ts`, no migrations).

References:
- Design spec: [seizn-author-ui-rebrand-spec.md](../design/seizn-author-ui-rebrand-spec.md)
- Codex playbook: [seizn-author-ui-rebrand-task-pack.md](./seizn-author-ui-rebrand-task-pack.md)
