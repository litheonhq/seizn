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
