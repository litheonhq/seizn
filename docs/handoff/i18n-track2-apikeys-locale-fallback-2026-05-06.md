# Hand-off: Track 2 API key dashboard — i18n fallback for 17 secondary locales

**Status:** ready for a fresh session. Track 2 Phase 0 (PR #252 / #253 / #254) only seeded 5 base locales (`en`, `ko`, `ja`, `zh-hans`, `zh-hant`) for the new `/dashboard/account/api-keys` UI. The other 17 locales in `src/i18n/dictionaries/` carry no `dashboard.account.apiKeys.*` keys yet, so a user on those locales sees the i18n key path itself in the UI (e.g. `dashboard.account.apiKeys.title`).

This task pack closes that gap.

## Goal

Add `dashboard.account.apiKeys.*` (~50 leaf keys) to the remaining 17 dictionaries. Quality target: **EN-equivalent fallback first, then native rewrite where it costs nothing extra**. The i18n integrity test should keep all 22 locales (5 base + 17 fallback) green.

## Scope

### Target locales (17 — confirmed by user 2026-05-06)

| Code | Language | Note |
|---|---|---|
| `ar` | Arabic | RTL — text flows; no special markup needed for these keys |
| `de` | German | |
| `es` | Spanish | |
| `fr` | French | |
| `he` | Hebrew | RTL |
| `hi` | Hindi | |
| `id` | Indonesian | |
| `it` | Italian | |
| `nl` | Dutch | |
| `pl` | Polish | |
| `pt-BR` | Portuguese (Brazil) | |
| `pt-PT` | Portuguese (Portugal) | |
| `ru` | Russian | |
| `sv` | Swedish | |
| `th` | Thai | |
| `uk` | Ukrainian | |
| `vi` | Vietnamese | |

### Out of scope

- New keys (any change to the **shape** of `dashboard.account.apiKeys.*` belongs in a separate cycle that also touches the 5 base locales).
- Re-translating the 5 base locales — `en` / `ko` / `ja` / `zh-hans` / `zh-hant` are already shipped (PR #252).
- Other Track 2 surfaces (`/[locale]/api`, the Stripe deprecation notice). Those are intentionally EN-only on v1 — see the Phase 0 task pack §523.

## Source of truth — the 5 base locales

`src/i18n/dictionaries/en.json` is the EN master. The 50 keys below already exist in `en` / `ko` / `ja` / `zh-hans` / `zh-hant`. Use the EN value as the canonical text when translating.

```
dashboard.account.apiKeys.title
dashboard.account.apiKeys.description
dashboard.account.apiKeys.capHint                    # contains {cap}
dashboard.account.apiKeys.newKey
dashboard.account.apiKeys.create
dashboard.account.apiKeys.cancel
dashboard.account.apiKeys.done
dashboard.account.apiKeys.name
dashboard.account.apiKeys.scopes
dashboard.account.apiKeys.scopesDefault
dashboard.account.apiKeys.copyKey
dashboard.account.apiKeys.saveItNow
dashboard.account.apiKeys.created
dashboard.account.apiKeys.rotated
dashboard.account.apiKeys.rotate
dashboard.account.apiKeys.revoke
dashboard.account.apiKeys.revokeTitle
dashboard.account.apiKeys.revokeBody                 # contains {name}
dashboard.account.apiKeys.rotateTitle
dashboard.account.apiKeys.rotateBody                 # contains {name}
dashboard.account.apiKeys.usage
dashboard.account.apiKeys.rateLimit
dashboard.account.apiKeys.lastUsed
dashboard.account.apiKeys.createdAt
dashboard.account.apiKeys.empty
dashboard.account.apiKeys.errors.capReached
dashboard.account.apiKeys.errors.invalidName
dashboard.account.apiKeys.errors.internal
dashboard.account.apiKeys.errors.revokeFailed
dashboard.account.apiKeys.errors.rotateFailed
dashboard.account.apiKeys.errors.copyFailed
dashboard.account.apiKeys.toasts.copied
dashboard.account.apiKeys.toasts.revoked
dashboard.account.apiKeys.audit.link
dashboard.account.apiKeys.audit.title
dashboard.account.apiKeys.audit.description
dashboard.account.apiKeys.audit.filterAction
dashboard.account.apiKeys.audit.from
dashboard.account.apiKeys.audit.to
dashboard.account.apiKeys.audit.reset
dashboard.account.apiKeys.audit.exportCsv
dashboard.account.apiKeys.audit.empty
dashboard.account.apiKeys.audit.action.all
dashboard.account.apiKeys.audit.action.created
dashboard.account.apiKeys.audit.action.revoked
dashboard.account.apiKeys.audit.action.rotated
dashboard.account.apiKeys.audit.action.rate_limited
dashboard.account.apiKeys.audit.action.quota_exceeded
dashboard.account.apiKeys.audit.action.scope_denied
```

**Placeholders** (`{cap}`, `{name}`) must be preserved verbatim in every locale — the client uses `String.replace("{cap}", ...)` so any localised replacement of the braces breaks the substitution.

## Steps

### 1. Read the 5 base values

```bash
jq '.dashboard.account.apiKeys' src/i18n/dictionaries/en.json
```

Use that JSON object as the source. Korean / Japanese / Chinese variants in the other base files are also good references for tone and how short/long the strings can be.

### 2. Translate per locale

Open `~/Projects/Books/ai-writing-patterns-guide-<lang>.md` for each target locale before drafting (per global `CLAUDE.md` §11.2):

- `ar.md`, `de.md`, `es.md`, `fr.md`, `hi.md`, `it.md`, `nl.md`, `pl.md`, `pt.md` (covers BR + PT — apply with PT-specific overrides where the guide notes them), `ru.md`, `sv.md` *(if missing, fall back to the multilingual notes)*, `tl.md` is irrelevant here, `uk.md`, `vi.md`.
- `he`, `id`, `th` — no dedicated guide. Use the multilingual notes (`ai-writing-patterns-guide-multilingual-research-notes.md`) plus native-speaker conventions (RTL for `he`, `ar`).

Self-check the draft against each guide's "패턴/avoid" list before saving.

### 3. Apply the patch

Mirror the existing pattern from PR #252's `/tmp/patch_i18n_apikeys.py` — a small Python script that reads each locale JSON, sets `dashboard.account.apiKeys` on `data["dashboard"]["account"]`, and rewrites the file with `ensure_ascii=False, indent=2`. Keep the existing key order. Don't reformat unrelated keys.

### 4. Update the integrity test

Add the 17 new locales to the parameterised loop in `src/__tests__/i18n/dashboard-keys.test.ts`:

```ts
const SECONDARY_LOCALES = ['ar','de','es','fr','he','hi','id','it','nl','pl','pt-BR','pt-PT','ru','sv','th','uk','vi'] as const;

it.each(SECONDARY_LOCALES)('%s has all redesign keys present', (locale) => { ... });
```

Reuse the existing `REDESIGN_PATHS` array — adding `dashboard.account.apiKeys.*` to it would force the 5 base locales to ship the same keys, which they already do, so this naturally cascades.

### 5. Verify locally

```bash
pnpm test --run src/__tests__/i18n/dashboard-keys.test.ts        # expect (5 base × 88 paths) + (17 × 88 paths) = ~1,936 cases
pnpm typecheck
pnpm exec eslint src/i18n/dictionaries                            # JSON only, just a sanity pass
```

The ar/he RTL locales render fine with the current `LandingNav` and dashboard shell — those components don't carry `dir=` attributes that conflict with the existing layout. If the integrity test passes, ship it.

### 6. Commit + PR

```text
feat(i18n): add dashboard.account.apiKeys.* fallback for 17 locales (Track 2 launch)
```

PR description should call out:
- Source of truth = `en.json` (PR #252 baseline)
- 17 locales × ~50 keys = ~850 string entries
- No copy review for non-base locales (ai-writing guides applied; native review is a follow-up task on the locale-owner cycle)
- Verification: `pnpm test src/__tests__/i18n/dashboard-keys.test.ts`

The PR should not touch any non-i18n file. If translation revealed a UI bug (e.g. ko has a longer string that wraps badly), file a separate issue rather than expanding scope.

## Anti-goals

- Do **not** edit `en` / `ko` / `ja` / `zh-hans` / `zh-hant`. They are the source of truth.
- Do **not** add new i18n keys. New copy belongs in a separate Track 2 cycle that touches all 22 locales at once.
- Do **not** translate `/[locale]/api` (the public docs page). Phase 0 spec §523 explicitly defers all non-EN copy on that page.
- Do **not** touch `src/components/dashboard/redesign/*` or any other Track 1 area. Cross-track edits violate master §3.
- Do **not** revert PR #252 changes — the 5-locale baseline is already in production.

## Cross-track notes

- Track 1 (Web KRW) and Track 3 (Tauri KRW) own their own dashboard surfaces and don't share these keys.
- The i18n integrity test (`dashboard-keys.test.ts`) is the only gate. There is no separate `verify:i18n-integrity` script.
- The Phase 0 task pack at `docs/architecture/seizn-author-track-2-phase-0-task-pack-2026-05-06.md` §523 already locks v1 = EN-only for the public REST docs surface; that decision does **not** apply to the dashboard, where the 5-base baseline is the policy.

## References

- PR #252 — initial Track 2 + 5-locale dashboard.account.apiKeys baseline
- PR #253 — server.json + 0.1.1 bump
- PR #254 — MCP Registry OIDC workflow
- `src/__tests__/i18n/dashboard-keys.test.ts` — integrity test target
- `/tmp/patch_i18n_apikeys.py` — reference patch script from PR #252 (gone from /tmp, but recreate from the same template)
- Global `CLAUDE.md` §11.2 — writing & copy guides per locale
