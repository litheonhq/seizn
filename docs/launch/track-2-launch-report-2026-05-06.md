# Track 2 launch report — Seizn API + MCP

**Status:** Live in production. `TRACK_2_API_ENABLED=true` since 2026-05-06.
**Audience:** Seizn team + downstream cycles + customers asking "what shipped".
**Source of truth:** PR #252 (Phase 0~7) + #253 (npm bump) + #254 (registry workflow) + #255 (i18n hand-off) + #256 (17 locale seed) + #257 (locale guide refinement) + #258 (Stripe v8 cleanup) + #259~261 (design brief) + #262 (bundle micro-bump) + #263 (idempotency TTL).

---

## 1. What shipped

A public REST API (`https://seizn.com/api/v1/*`, 10 endpoints) and an MCP server (`@seizn/author-mcp-server@0.1.1`, 6 tools) that let any AI agent — Claude Desktop, Claude Code, Cursor, Cline, Continue, ChatGPT (when its MCP support lands), or anything that speaks JSON-RPC over stdio — read and write Seizn canon for fiction writers.

What "canon" means in Seizn: typed entities (character, location, object, event, rule, promise) with provenance, mentions, and pending conflicts — not anonymous embeddings. The API is canon-shaped, the MCP server hands the same canon to a host LLM as tool calls.

### Phase pipeline (PR #252, single PR with 7 commits)

| Phase | Surface | Output |
|---|---|---|
| 0 | DB | `api_keys` ALTER + `api_key_usage` + `api_key_audit_log`, RLS enabled, multi-tenancy ready, SHA-256 hash, `org_id` + `rotated_from_id` columns |
| 1 | service layer | `src/lib/api-keys/*` — generate (`sk_seizn_…` prefix) / hash / **timing-safe validate** / Upstash rate-limit / monthly+daily quota / audit / rotation |
| 2 | REST | 10 endpoints under `/api/v1/*` — Bearer auth, scope check, per-minute rate limit, monthly quota, idempotency cache, cursor pagination, CORS, RFC 7807 problem+json |
| 3 | billing | Stripe v8 product spec + 90-day v7 grandfather + `applyV8Track2TierToApiKeys` webhook helper |
| 4 | dashboard | `/dashboard/account/api-keys` (issue / rotate / revoke, secret-shown-once modal, 5-key cap) + `/audit` (filterable + CSV export) |
| 5 | docs | `/[locale]/api` public docs page + `public/openapi.yaml` + `pnpm docs:test` |
| 6 | MCP | `@seizn/author-mcp-server` — 6 tools, e2e test, npm publish prep, MCP Registry manifest |
| 7 | rollout | `TRACK_2_API_ENABLED` feature flag (default off) + per-request `[track-2-metric]` log |

### Post-merge ops (Phase 8, automated this session)

- Vercel prod env: 14 keys (Stripe price IDs × 9, lock version, feature flag, Upstash REST URL/TOKEN, billing meter)
- Stripe live: 5 v8 products (`prod_USlhSMAlUmwUTZ`, `…gCG7pTLJoR`, `…rj96E3mOpj`, `…NulslV0gp9`, `…my54g0sLK41`) + 9 prices (Indie/Pro/Studio/Studio Managed × monthly+yearly + Opus metered overage `price_1TTrCL8XSoMws9UfKlX8PELp`) + 1 billing meter (`mtr_61UdF9Yp…`, event `studio_managed_opus_call`)
- Webhook endpoint `https://seizn.com/api/webhooks/stripe` enabled with 8 events (covers all 6 we need + `customer.{created,updated}` for v7 path)
- npm publish: `@seizn/author-mcp-server@0.1.1` (22 files, 13.9 KB, `mcpName: io.github.litheonhq/author-mcp-server`)
- MCP Registry: `io.github.litheonhq/author-mcp-server@0.1.1` registered via GitHub Actions OIDC workflow (PR #254 — works around the device-flow polling bug in `mcp-publisher` v1.7.8)
- Upstash Redis: free-tier database `seizn-track2` (us-east-1, TLS) auto-provisioned, REST URL/TOKEN wired to Vercel — idempotency cache survives multi-instance lambda routing
- 22 locale i18n: 5 base (en/ko/ja/zh-hans/zh-hant) + 17 secondary (ar/de/es/fr/he/hi/id/it/nl/pl/pt-BR/pt-PT/ru/sv/th/uk/vi). 12 of those got per-language guide refinement that caught real UI bugs (ar/hi/he had `cancel` and `revoke` collapsing to the same word; vi had `Xoay` calque of "rotate")

### What we deliberately didn't build this cycle

- Webhook auto-attach of the Studio Managed metered subscription item — additive, fires on first real subscription
- Native-speaker review of the 16 secondary locales — guide-driven first pass shipped, native polish is a separate cycle
- Track 1 / Track 3 surfaces — those cycles own their own dashboards and pricing

---

## 2. How to use it — host LLM subscriber path (recall / remember / search / graph)

If you already pay for Claude Pro / Max or ChatGPT Plus, **you don't need a separate LLM API key** for these four tools. Your host AI handles the chat; Seizn just supplies the canon.

### Step 1 — Issue a Seizn API key (Free tier)

1. Sign in at <https://seizn.com>
2. Go to <https://seizn.com/dashboard/account/api-keys>
3. Click **New API key**, name it (e.g. `claude-desktop-mac`), copy the secret once — it's shown a single time.
   Free tier: 100 calls/day, 30 req/min, scopes `recall`, `remember`, `graph`, `search`.

### Step 2 — Wire it into your AI tool

#### Claude Desktop (macOS / Windows)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "@seizn/author-mcp-server"],
      "env": {
        "SEIZN_API_KEY": "sk_seizn_..."
      }
    }
  }
}
```

Restart Claude Desktop. The four tools (`seizn_author_recall`, `_remember`, `_search`, `_graph`) appear in the sidebar. Ask: *"Recall everything we know about the protagonist before this chapter."*

#### Claude Code (CLI)

```bash
SEIZN_API_KEY=sk_seizn_... claude mcp add seizn \
  --command "npx" \
  --arg "-y" --arg "@seizn/author-mcp-server" \
  --env SEIZN_API_KEY=$SEIZN_API_KEY
```

#### Cursor / Cline / Continue

Same JSON shape as Claude Desktop, pasted into each client's MCP settings panel.

#### ChatGPT (when MCP support is generally available)

Same JSON shape. OpenAI announced MCP client support in 2026; check the latest docs.

### Step 3 — That's it

The host LLM (Claude / GPT) decides when to call each tool based on the conversation. You don't have to remember tool names or invoke them manually.

**No double charging.** Your Claude Pro / Max / Plus subscription covers the chat. Seizn covers the canon DB. Two channels, two bills.

---

## 3. How to use it — BYOK / direct REST path (check / timeline)

Two endpoints (`/conflicts/check`, `/timeline`) run actual LLM inference on Seizn's backend, so they need an LLM key. You either bring your own (any tier), or upgrade to **Studio Managed** ($299/mo) where Seizn handles the LLM cost in-house.

### BYOK header pattern

```bash
curl -X POST https://seizn.com/api/v1/projects/saebyeok-main/conflicts/check \
  -H "Authorization: Bearer sk_seizn_..." \
  -H "X-LLM-Provider: anthropic" \
  -H "X-LLM-Key: sk-ant-..." \
  -H "Content-Type: application/json" \
  -d '{"text":"In chapter 12, the protagonist returns home..."}'
```

**Important:** the Anthropic `sk-ant-…` key is a **separate paid product** from your Claude Pro / Max chat subscription. Generate one from <https://console.anthropic.com>; we recommend creating a dedicated key with a monthly cost cap.

### TypeScript example

```ts
async function recall(projectId: string, query: string) {
  const url = new URL(`https://seizn.com/api/v1/projects/${projectId}/recall`);
  url.searchParams.set('q', query);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SEIZN_API_KEY!}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).entities;
}
```

### Python example

```python
import os, requests

res = requests.get(
    f"https://seizn.com/api/v1/projects/saebyeok-main/recall",
    headers={"Authorization": f"Bearer {os.environ['SEIZN_API_KEY']}"},
    params={"q": "protagonist"},
    timeout=30,
)
res.raise_for_status()
print(res.json()["entities"])
```

### Error shape (RFC 7807)

```http
HTTP/1.1 402 Payment Required
Content-Type: application/problem+json

{
  "type": "https://seizn.com/errors/quota-exceeded",
  "title": "Quota exceeded",
  "status": 402,
  "code": "quota_exceeded",
  "detail": "API key sk_seizn_a1b2 reached 1000 calls this month.",
  "instance": "/api/v1/projects/saebyeok-main/recall"
}
```

Every response carries `X-Request-Id` (log correlation) and `Seizn-Api-Version: 1.0`. Idempotent POSTs accept `Idempotency-Key`; replays return the cached response with `Idempotency-Replayed: true`.

### Full reference

- **OpenAPI spec:** <https://seizn.com/openapi.yaml>
- **Public docs page:** <https://seizn.com/api>
- **MCP server README:** <https://www.npmjs.com/package/@seizn/author-mcp-server>

---

## 4. Pricing (Track 2, USD)

Track 2 covers the public REST + MCP channel only and bills in USD. The web app (Track 1, KRW) and the desktop app (Track 3, KRW) have their own plans on a single Stripe customer with separate subscriptions.

| Tier | $/month | $/year | Quota | Rate | Scopes added | Notes |
|---|---|---|---|---|---|---|
| Free | $0 | — | 100 / day | 30 / min | recall, remember, graph, search | BYOK optional, no LLM tools |
| Indie | $9 | $90 | 1,000 / month | 60 / min | + check, timeline | BYOK required for AI tools |
| Pro | $19 | $190 | 10,000 / month | 60 / min | + projects:write | BYOK required |
| Studio | $99 | $990 | 100,000 / month | 600 / min | + audit:read, 5 keys / user | BYOK required |
| Studio Managed | $299 | $2,990 | 100,000 + 500 Opus calls / month | 600 / min | + managed_llm | LLM included; $0.15 / Opus call overage (metered) |
| Enterprise | contact | contact | custom | custom | all + custom | SOC 2 / SSO / VPC; <sales@seizn.com> |

**Host-LLM cost is separate** from the Track 2 bill. Claude Pro / Max, Cursor Pro, ChatGPT Plus all charge for chat themselves. Seizn doesn't double-charge.

v8 launched 2026-05-06. There are no v7 Track 2 subscribers (Track 2 launched directly on v8) so the 90-day grandfather notice in `docs/billing/v7-deprecation-notice.md` is currently unused — it's there for symmetry with Track 1 in case Track 2 ever ships a price change.

---

## 5. Operational notes

- **Feature flag:** `TRACK_2_API_ENABLED=true` in Vercel prod. Flip it to `false` and the entire surface returns 503 `feature_disabled` with no auth/DB work attempted; dashboard falls back to "Coming soon".
- **Idempotency cache:** Upstash Redis (`smart-platypus-116038.upstash.io`, free tier, AWS us-east-1, TLS, eviction off). 24 h TTL on every entry; cache key = `track2:idempotency:${apiKeyId}:${method}:${pathname}:${idempotencyKey}` (per-key scope, no cross-user collision). In-memory fallback (dev / test) now matches the same 24 h TTL — PR #263.
- **Observability:** every request emits `[track-2-metric]` JSON to stdout (requestId / tool / method / pathname / status / latencyMs / costUnits). Sentry is wired in `src/instrumentation.ts` and captures all unhandled errors with stack. No BYOK or Bearer token ever lands in either log.
- **Stripe webhook:** `https://seizn.com/api/webhooks/stripe`, 8 events, HMAC SHA256 + 5-min tolerance. v8 price-ID lookup runs first; v7 fallback preserves the legacy Track 1 path with no behaviour change.
- **Bundle budget:** raw 8050 KB / gzip 2400 KB total; per-file 550 KB raw / 170 KB gzip. Track 2 added ~0.42 MB raw; the gzip total still has 46 KB headroom. Re-trim is on a Track 1 design follow-up cycle.
- **Tests:** 236 vitest cases pass on every PR (api-keys + api-v1 + billing + feature-flags + dashboard actions + i18n integrity 166 + docs OpenAPI + MCP e2e). lint:track2 clean. `pnpm typecheck` clean. mcp-server `npm pack --dry-run` ships 22 files (no source, no tests).
- **Audit history:** 40 audit prongs run during the launch cycle (security, RLS, console emits, BYOK leak path, timing-safe compare, SQL injection, webhook signature, JSON validity, Stripe state, Upstash health, deploy state). One real fix landed (PR #263, in-memory cache TTL); rest of the surface clean.

---

## 6. Quick links

- Issue an API key: <https://seizn.com/dashboard/account/api-keys>
- Public API docs: <https://seizn.com/api>
- OpenAPI spec: <https://seizn.com/openapi.yaml>
- npm package: <https://www.npmjs.com/package/@seizn/author-mcp-server>
- MCP Registry entry: <https://registry.modelcontextprotocol.io/v0/servers?search=author-mcp-server>
- Source: <https://github.com/litheonhq/seizn>
- Support: <support@seizn.com>
- Sales / Enterprise: <sales@seizn.com>
