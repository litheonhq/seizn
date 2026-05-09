# Handoff — production landing crash (React #185 + GTM 500)

**Status as of 2026-05-09 ~05:30 UTC:** Possibly fixed by PR #351, awaiting prod verification. If the page still flips to the "Something went wrong" fallback after PR #351 deploys, this handoff is for you (Codex) to take over.

**Repo:** `C:\Users\admin\Projects\seizn` (litheonhq/seizn on GitHub)
**Affected URL:** https://www.seizn.com/ and any locale page
**Affected user:** at minimum the project owner; likely all users with a `cookie_consent` entry in localStorage

---

## Symptoms (as reported)

1. Landing page (e.g. `https://seizn.com/en`) renders for ~0.1 seconds, then flips to a global error page with the text:

   > Something went wrong
   > We apologize for the inconvenience. Our team has been notified.

2. `Ctrl+Shift+R` (hard reload) reproduces the same flip every time.
3. Browser console (latest deploy `dpl_8YbpyBrudmVvBceaqUdxdzDjJEA8`):
   - `GET https://www.googletagmanager.com/gtag/js?id=G-463HHC6LYT net::ERR_ABORTED 500`
   - `Error: Minified React error #185` — Maximum update depth exceeded.
   - Stack trace shows alternating `sf @ ... sp @ ...` frames repeating, classic infinite-render signature.
4. Server-side render is healthy: `curl -sI https://www.seizn.com/en` → `200 OK`. The crash is purely client-side.
5. The `Invalid Sentry Dsn` warning is gone after PR #350 + Vercel env cleanup, so Sentry is no longer in the loop.

## What's already been tried

| PR | Status | Why it was wrong / partial |
|---|---|---|
| **#349** SW navigation bypass | **Closed (misdiagnosis)** | I assumed stale Service Worker chunk cache because SSR was 200 OK and only the client crashed. The SW change is a valid cleanup but unrelated to this crash — sub-resource chunks are content-hashed and weren't actually 404'ing. |
| **#350** Sentry DSN regex validation | **Merged 04:57 UTC** | Silenced a noisy `Invalid Sentry Dsn` warning (Vercel env had `NEXT_PUBLIC_SENTRY_DSN` set to a UUID-with-dashes GlitchTip DSN; Sentry SDK's `\w+` parser rejects dashes). Also removed `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` from Vercel production env. Did not fix the React #185 loop because Sentry wasn't the cause — the warning never escalated to an exception, and removing it left the consent loop untouched. |
| **#351** Consent snapshot cache | **Awaiting CI/merge** | Current best hypothesis. See below. |

## Current root-cause hypothesis (PR #351)

`src/components/legal/CookieBanner.tsx` uses `useSyncExternalStore`:

```ts
function getConsentSnapshot(): ConsentState | null {
  return readConsent();   // ← problem
}

const state = useSyncExternalStore(
  subscribeConsent,
  getConsentSnapshot,
  getServerSnapshot
);
```

`readConsent()` in `src/lib/consent.ts` is:

```ts
export function readConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (parsed.version !== LATEST_VERSION) return null;
    if (typeof parsed.decided_at !== 'string') return null;
    return {                                       // ← NEW OBJECT every call
      necessary: true,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
      version: LATEST_VERSION,
      decided_at: parsed.decided_at,
    };
  } catch {
    return null;
  }
}
```

The contract React enforces on `useSyncExternalStore` snapshots:

> The result of `getSnapshot` should be cached. If `getSnapshot` is called multiple times in a row, it must return the same exact value (`Object.is` comparison) unless there was a store update in between. Otherwise, an infinite loop will occur.
> https://react.dev/reference/react/useSyncExternalStore#im-getting-an-error-the-result-of-getsnapshot-should-be-cached

Since `readConsent()` builds a fresh object on every call when localStorage holds a value, every render sees a different reference, schedules another render, and the cycle never terminates. React eventually bails with error #185 and the error boundary surfaces the global-error fallback.

**Why it triggers only for some users:** the loop only happens when `readConsent()` returns a non-null object. Users without a `cookie_consent` entry in localStorage (fresh sessions, dev, E2E) get `null` back, and `null === null` is stable, so they don't loop. Anyone who has previously accepted/customized the cookie banner has localStorage state and crashes on every visit. That matches the report: "only this user reproduces it."

**Why GoogleAnalytics.tsx (also `useSyncExternalStore`) is fine:** its snapshot is `readConsent()?.analytics ?? false` — a `boolean`. Primitives are stable under `Object.is`.

## What PR #351 changes

`src/components/legal/CookieBanner.tsx` only — module-scoped snapshot cache plus event-driven invalidation:

```ts
let cachedConsentSnapshot: ConsentState | null = null;
let consentSnapshotValid = false;

function subscribeConsent(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => {
    consentSnapshotValid = false;
    listener();
  };
  window.addEventListener('seizn-consent-change', handler);
  return () => window.removeEventListener('seizn-consent-change', handler);
}

function getConsentSnapshot(): ConsentState | null {
  if (!consentSnapshotValid) {
    cachedConsentSnapshot = readConsent();
    consentSnapshotValid = true;
  }
  return cachedConsentSnapshot;
}
```

Same reference returned across renders until `seizn-consent-change` fires. Then the cache invalidates and the next call re-reads localStorage.

## How to verify the fix worked (post-deploy)

1. Open `https://seizn.com/` in a clean browser session.
2. Click "Accept all" on the cookie banner. (This writes `cookie_consent` to localStorage and dispatches `seizn-consent-change`.)
3. Hard reload (`Ctrl+Shift+R`). The page should render normally and stay rendered. With the bug, you would see the 0.1-second flip to the fallback.
4. Open DevTools → Console. There should be no React #185, no infinite loop warning. The GTM 500 / `ERR_ABORTED` message may still appear (it's a real network-side issue with how that particular GTM ID resolves; investigated separately) but it should not crash the page.

## If PR #351 doesn't fix it — what Codex should investigate next

The hypothesis hinges on **`readConsent()` returning a fresh object** being the loop trigger. If the page still crashes after PR #351 deploys with localStorage seeded, then either:

1. **Another `useSyncExternalStore` consumer** is mis-implemented. Search for it:
   ```bash
   rg -nP 'useSyncExternalStore' src/
   ```
   Audit each call site for a `getSnapshot` that builds a fresh object, array, or function reference. Currently I see only `CookieBanner.tsx` and `GoogleAnalytics.tsx`; both should be safe after this PR.

2. **A `useEffect` setting state with a dependency that always changes.** Look for components mounted on the landing page that:
   - Call `setState` inside `useEffect`
   - Depend on values that aren't memoized (object literals, function references, derived data)

   Candidate components rendered by `[locale]/layout.tsx`: `<GoogleAnalytics />`, `<CookieBanner />`, plus whatever the landing page itself renders. Start there.

3. **The GTM 500 itself** is the trigger. `https://www.googletagmanager.com/gtag/js?id=G-463HHC6LYT` returning 500 is unusual — googletagmanager.com is rock solid. Possibilities:
   - The GA Measurement ID `G-463HHC6LYT` was deleted or restricted in the GA admin console, and Google's edge returns 500 instead of 404.
   - A Cloudflare worker, ad blocker, or browser extension is intercepting the request and returning 500.
   - The CSP is somehow forbidding the request after redirect (unlikely — `script-src` allows `https://www.googletagmanager.com`).

   To rule this out: temporarily set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to an empty string in Vercel env. `GoogleAnalytics.tsx` short-circuits to `return null` when the ID is missing, so the GTM `<Script>` tag never renders and the 500 stops happening. If the React #185 also stops, then GTM was a contributor; if it persists, GTM was just noise.

4. **React 19 / Next.js 16 behavior change.** This codebase is on Next.js 16 + React 19. If a `useSyncExternalStore` snapshot stability bug was tightened in React 19, it could explain why this only surfaced recently. Worth diffing `package-lock.json` for `react` and `react-dom` version changes around when the crash started showing.

## Useful entry points for further investigation

- Layout: `src/app/[locale]/layout.tsx` (mounts `<GoogleAnalytics />`, `<CookieBanner />`, Plausible `<Script>`, Geist + Instrument_Serif fonts)
- Consent state: `src/lib/consent.ts` (`readConsent`, `writeConsent`, `seizn-consent-change` event)
- GA wrapper: `src/components/analytics/GoogleAnalytics.tsx`
- Banner: `src/components/legal/CookieBanner.tsx`
- CSP: `next.config.ts` (search for `Content-Security-Policy`)
- Service worker: `public/sw.js` (already verified not the cause; ignore unless you see SW-specific symptoms)

## Memory entries written for this incident (project memory at `C:\Users\admin\.claude\projects\c--Users-admin--codex\memory\`)

- `feedback_sentry_dsn_uuid_dashes.md` — UUID-with-dashes DSN rejected by Sentry SDK + cascade through @sentry/nextjs
- `feedback_sw_navigation_bypass.md` — SW catch-all SWR over navigation HTML (not the cause here, but a real cleanup)
- (To add if PR #351 confirms fix): `feedback_usesyncexternalstore_object_snapshot.md` — `useSyncExternalStore` getSnapshot must return a stable reference; building a new object every call → infinite loop, only triggered when localStorage seeded.

## Vercel ops context

- Vercel team: `litheon` (team id `team_1gCVxFuahKkMUlmNC4W2zuZc`)
- Project: `seizn` (id `prj_6aEK4Ci6ACcF1NcgUSjndwh5Couq`)
- Token in vault: `~/.codex/private/consolidated/litheon.env` → `VERCEL_TOKEN=…`
- Project link file: `C:/Users/admin/Projects/seizn/.vercel/project.json`
- Deploy ignore: `vercel.json` runs `npm run vercel:ignore-build` → `scripts/vercel-ignore-build.mjs`. Patterns include `^src/`, `^public/`, `^next.config.*`, `^package(-lock)?.json`, etc. **Note: `^sentry\..*\.config\.ts` at repo root is NOT in the patterns**, so changes to those files alone get a "Canceled by Ignored Build Step." If you need to redeploy after env-only changes, use `vercel redeploy <url> --target production --scope litheon --token=$VERCEL_TOKEN` against the latest production deployment URL — the script returns null (always-build) when previous SHA equals current SHA, which a redeploy of the same commit triggers.
- Production redeploy command:
  ```bash
  export VERCEL_TOKEN=$(grep '^VERCEL_TOKEN=' ~/.codex/private/consolidated/litheon.env | cut -d= -f2)
  vercel ls --token=$VERCEL_TOKEN | head     # find latest Production deployment URL
  vercel redeploy <prod-url> --target production --scope litheon --token=$VERCEL_TOKEN
  ```

## Git context

- Active hotfix branch: `hotfix/consent-snapshot-cache` (commit `d37e55f2`), open as PR #351
- Earlier merged hotfixes:
  - PR #350 `hotfix(sentry): validate DSN format before init` — merged `0719653d` ish range
  - PR #347, #346, #345 — pre-incident hardening, see `git log origin/main --oneline -20`
- Closed PR: #349 (SW navigation bypass — misdiagnosis)
- Git identity for seizn: must be `litheonhq` (CLAUDE.md §9). Switch with `gh auth switch --user litheonhq` before any `gh pr ...` operation. The local `git config user.name` should be `litheonhq` and `user.email` should be `litheonhq@gmail.com`.

## Plan-mode artifacts

- Active plan: `C:/Users/admin/.claude/plans/gentle-sleeping-volcano.md` (Hetzner GlitchTip + Plausible deploy, blocked on Cloudflare DNS for `errors.seizn.com` and `analytics.seizn.com`). Until those are deployed, both `errors.seizn.com` and `analytics.seizn.com` resolve to nothing useful and any client `<Script>` pointing at them will fail. The Plausible script in `[locale]/layout.tsx:179` will also fail to load until DNS is up — worth knowing if you suspect that script as a contributor (it doesn't expose React state, so it's unlikely to cause #185).

## What you (Codex) should do if you take over

1. Pull the latest:
   ```bash
   cd C:/Users/admin/Projects/seizn
   git fetch origin main
   git checkout main && git pull origin main
   ```
2. Confirm whether PR #351 merged and the fix landed in production (`gh pr view 351` + `vercel ls`).
3. If the user reports the crash still happens after PR #351 is live: open https://seizn.com/, accept cookies, hard reload, and capture the full unminified console error. Switch React to development build temporarily if needed (set `NODE_ENV=development` in a preview branch) so error #185 prints the actual component name in the stack.
4. Use the **"investigate next"** checklist in this doc as your search order: other `useSyncExternalStore` consumers → effect-driven setState loops → GTM 500 → React 19 compatibility.
5. Iron Law: confirm root cause with evidence (logs, screenshots, repro steps) before writing a fix. I broke this rule twice already (PR #349, PR #350) and burned an hour. Don't repeat it.

Good hunting.
