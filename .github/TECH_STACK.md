# Seizn -- Tech Stack Documentation
> Auto-generated on 2026-03-02

Seizn is an AI Memory Infrastructure platform that extracts, stores, and retrieves context for AI applications. The platform provides persistent memory via APIs, SDKs, and a management dashboard.

---

## Core Framework

| Category | Technology | Version | Notes |
|----------|-----------|---------|-------|
| Framework | Next.js | ^16.1.6 | App Router, Turbopack (dev), standalone output for Docker |
| Language | TypeScript | ^5 | Strict mode, bundler module resolution |
| Runtime | Node.js | 20 | Alpine-based Docker image |
| Package Manager | npm | (lockfile) | `npm ci` in CI/CD pipelines |
| Build | Turbopack (dev) / Webpack (prod) | -- | Sentry webpack plugin, bundle analyzer |

---

## Frontend

| Category | Technology | Version | Notes |
|----------|-----------|---------|-------|
| UI Library | React | ^18.3.1 | Server Components + Client Components |
| Styling | Tailwind CSS | ^4 | v4 with `@import "tailwindcss"`, OKLCH custom properties, class-based dark mode |
| Fonts | Geist Sans/Mono + Pretendard Variable | -- | `next/font/google`, Korean-optimized Pretendard via CDN |
| Icons | Lucide React | ^0.563.0 | Used across 7+ component files |
| Class Merging | tailwind-merge + clsx | ^3.4.0 | `cn()` utility in `src/lib/utils.ts` |
| Data Grids | @tanstack/react-table | ^8.21.3 | Designer Memory UI spreadsheet grid with sorting/filtering |
| Charts | Recharts | ^3.6.0 | Analytics, evals, traces, RetOps dashboards (7 files) |
| Graph Visualization | @xyflow/react | ^12.10.0 | Memory mind map, knowledge graph canvas (8 files) |
| Force Graphs | react-force-graph-2d | ^1.29.1 | NPC relationship graph canvas with 100+ interactive entity nodes |
| Markdown | react-markdown | ^10.1.0 | Homepage snippet tabs |
| Code Highlighting | react-syntax-highlighter | ^16.1.0 | Homepage code snippets |
| Error Boundaries | react-error-boundary | ^6.1.0 | AsyncBoundary component for streaming |
| Data Fetching | SWR | ^2.4.0 | Client-side data fetching (3 files: settings, memory usage, candidates) |
| State Management | React Context | -- | ThemeContext, DashboardLocaleContext, SessionProvider |
| Theme | Custom ThemeProvider | -- | Class-based dark mode (`system`/`light`/`dark`) |

---

## Backend & Data

| Category | Technology | Version | Notes |
|----------|-----------|---------|-------|
| Database | PostgreSQL + pgvector | -- | Via Supabase; 178 migration files in `supabase/migrations/` |
| ORM/Client | @supabase/supabase-js | ^2.90.0 | Browser client (anon key) + Server client (service role key) |
| Auth | NextAuth v5 | ^5.0.0-beta.30 | JWT strategy, GitHub + Google OAuth + Credentials (Supabase password) |
| SSO | SAML 2.0 + OIDC | -- | Org-scoped SSO connections + domain verification; SAML ACS + OIDC callback routes; plan gate now permits Pro and Enterprise. |
| Encryption | E2E confidential memory encryption | -- | Opt-in client-side WebCrypto (PBKDF2-SHA256 600k + AES-256-GCM). Contract: `content="[encrypted]"`, `encrypted_content=<base64 ciphertext>`, `is_encrypted=true`. Setup material stored in `profiles.e2e_*` via `/api/profile/e2e`. Encrypted memories excluded from search/embedding/optimizer. |
| Compliance DSR | COPPA/GDPR-K subject rights | -- | `subject_id` on memories, `consent_records`, `dsr_jobs`, `/api/v1/dsr/export`, `/api/v1/dsr/delete`, `/api/v1/dsr/jobs/[id]`, `/api/v1/audit`, and `/api/v1/audit/export` provide subject export, certified deletion, and audit evidence. |
| DB Contract Verification | Migration guardrails (`run-migration-file.mjs` + `verify:e2e-encryption-db`) | -- | Every migration run triggers E2E/search-RPC compatibility checks by default; fails fast on overload/RPC regressions unless explicitly bypassed with `SKIP_E2E_VERIFY=1`. |
| Tenant Policy | Budget caps + degrade ladder | -- | Stored in `organizations.settings.budget_quota_policy`; internal enforcement via `/api/tenant-policy/enforce` (includes daily ingest chunk cap and configurable fail-open/fail-closed fallback mode in gateway policy routing) |
| Memory Budgeting | Hot/warm/cold tier budgets | -- | Legacy v1 memories now support `entity_id`, `tier`, `pinned`, recall counters, byte sizing, `/api/v1/memory-budget` telemetry, and `/dashboard/memories/budget` monitoring. |
| Designer Memory UI | @tanstack/react-table + CSV/JSON round-trip | -- | `/dashboard/memory-editor` and `/dashboard/memory-editor/[npc_id]` provide spreadsheet editing; `/api/memory-editor/import` previews/applies diffs, runs Canon Lock validation, and relies on memory history/version triggers. |
| NPC Timeline / Graph UI | SVG timeline + react-force-graph-2d | -- | `/dashboard/npcs/[id]/timeline`, `/dashboard/npcs/[id]/graph`, `/api/npcs/[id]/timeline`, and `/api/npcs/[id]/graph` visualize memory, canon, gossip, and belief relationships with SVG export support. |
| Theory-of-Mind Memory | Belief shards | -- | Perspective-aware recall via `belief_shards`, `/api/v1/beliefs`, `/api/v1/memories.recall`, and `/dashboard/memories/beliefs` so NPCs only retrieve facts they know. |
| Memory Decay | Forgetting curves | -- | `decay_policies`, per-memory strength metadata, recall reinforcement, decay-aware reranking, `/api/v1/decay-policies`, and `/dashboard/memories/decay`. |
| Bot Protection | Cloudflare Turnstile | -- | CAPTCHA on login/signup forms |
| API Pattern | Next.js Route Handlers | -- | `src/app/api/` with 80+ route directories |
| API Auth | Bearer token (`szn_` prefix) | -- | API key hash verification via Supabase, x-api-key deprecated (sunset 2026-05-01) |
| Rate Limiting | Upstash Redis + in-memory fallback | -- | Sliding window algorithm, per-plan RPM limits |
| Cache | Upstash Redis | ^1.36.1 | Embedding cache (7-day TTL), rate limit counters |
| Deterministic Replay | AsyncLocalStorage + PostgreSQL snapshots | -- | `/api/v1/replay` captures and replays memory reads/writes, tool calls, and LLM metadata for reproducible NPC-memory debugging. |
| Replay Bug Reports | Supabase Storage + bug tracker APIs | -- | Signed replay bundles upload to private `replays` storage and can append a Seizn Replay block to Linear, GitHub, or Jira tickets via `/api/webhooks/bug-tracker/[provider]`. |
| Canon Lock | PostgreSQL RLS + Claude Haiku validator | -- | `canon_locks` define hard/soft NPC/world facts; memory writes call `src/lib/canon/enforce.ts` before storage and log `canon_violations`. Pro/Enterprise locks can require team review via `canon_lock_reviews`. |
| Seizn CLI | @seizn/cli + commander | 0.1.0 | Workspace package in `cli/seizn` provides `init`, `login`, `replay`, `export`, `audit`, `bench`, and `canon list/pull/push`; credentials are stored at `~/.config/seizn/credentials.json` with `0600` permissions. |
| MCP Server | @modelcontextprotocol/sdk | ^1.25.2 | `packages/seizn-mcp` publishes `@seizn/mcp` stdio tooling for Claude Desktop, Claude Code, Cursor, and Codex; tools cover memory search/create, canon list/check, replay fetch, chaos run, and Story Health current snapshots. |
| OpenAPI + TypeScript SDK | OpenAPI 3.1 + openapi-typescript-codegen | 0.1.0 | `/api/openapi.json` serves `openapi/seizn-openapi.json`; `packages/seizn-sdk-js` publishes `@seizn/sdk` with generated fetch clients plus ergonomic memory, canon, and replay helpers, and `.github/workflows/sdk-release.yml` regenerates/builds/publishes on main API schema changes. |
| Save-File Portability | SZN1 + Ed25519 + AES-256-GCM | -- | `/api/save-file/export/[npcId]` and `/api/save-file/import` move signed `.szs` bundles containing memories, belief shards, and canon locks; per-studio private signing keys are encrypted in `studio_signing_keys` with `SEIZN_SIGNING_MASTER_KEY`, and CLI round-trip is available via `seizn save export/import`. |
| NPC Chaos Monkey | Claude Sonnet + worker queue | -- | `chaos_runs` and `chaos_findings` store adversarial NPC simulations; `/api/chaos/runs` queues runs, `/api/internal/chaos/worker` processes queued prompts, records ops usage, and surfaces grouped failures in `/dashboard/chaos`. Pro/Enterprise runs receive `queue_priority` ahead of lower-tier Studio runs. |
| Story Health | Recharts + Claude Haiku evaluator | -- | `story_health_snapshots` stores daily per-act narrative metrics from replay, canon, chaos, and bug-report signals; `/api/internal/story-health/evaluate` runs at 06:00 UTC and `/dashboard/story-health` drills metrics into filtered Replay sessions. |
| Post-Mortem Reports | @react-pdf/renderer + private Supabase Storage | -- | `post_mortem_reports` stores token-gated shipped-title reports; `/api/post-mortem/generate` builds LLM summaries, replay/canon/chaos/Story Health/billing sections, uploads PDFs to the private `post-mortems` bucket, tracks Pro quarterly credits in `post_mortem_credits`, and exposes `/dashboard/post-mortem/[id]?token=...` for shareable read access. |
| Live Playground | Next.js public page + Redis/Supabase-backed chat route | -- | `/[locale]/playground` exposes Archivist Vale, `/api/playground/chat` enforces `PLAYGROUND_ENABLED=1`, 10-turn/15-minute session limits, a 10K/day public cap, optional Anthropic generation, demo memory persistence, and Stage 01 metered usage events for the demo studio. |
| Public Benchmark Leaderboard | Python runner + Supabase REST publication | -- | `/[locale]/bench` compares Seizn, Mem0, Zep, and LangChain Memory across six NPC-memory tasks; `scripts/bench/run.py` emits JSON/CSV artifacts, publishes completed runs to `bench_runs`/`bench_results`, and `.github/workflows/weekly-bench.yml` refreshes the leaderboard weekly. |
| Competitor Import Tool | Next.js dashboard wizard + Supabase job ledger | -- | `/dashboard/import` previews and commits Inworld, Convai, and Rivet exports; `/api/import/preview` normalizes uploads into `import_jobs`, `/api/import/commit` writes memories/canon locks/belief shards, and rollback soft-reverses inserted rows. |
| Unity SDK | Unity 2022.3 LTS + UnityWebRequest | 0.1.0 | `packages/seizn-unity` ships the `com.seizn.unity` UPM package with memory, canon, and replay APIs, editor settings stored at `ProjectSettings/Seizn.asset`, coroutine alternatives, and a Basic NPC sample. |
| Email | Resend | ^6.7.0 | Transactional emails (`src/lib/email/`) |
| Payments | Stripe Billing | -- | 5-tier subscriptions, Stage 01 metered overage, and Stage 02 Design Partner coupons. `usage_events` and `usage_aggregates_monthly` feed `/api/internal/usage/flush`; `design_partner_applications` and `design_partner_relationships` gate `SEIZN_DP_2026` checkout discounts for approved Studio customers. |
| Vector Search | Supabase pgvector (default) | -- | BYO vector store support: Pinecone, Weaviate, Qdrant |
| Scene Context | Supabase + v1 scene API | -- | `scenes` stores bounded NPC/faction/location context; `/api/v1/memories` can apply scene-aware recall boosts via `scene_id` or `entity_ids`. |
| Gossip Propagation | Supabase + deterministic distortion | -- | `gossip_events` records fact drift between entities; `/api/v1/gossip/propagate` supports word, entity, combined, and custom distortion metadata. |
| Memory Versioning | Supabase branch tables | -- | `memory_branches` and `memory_branch_entries` provide checkout and merge-diff primitives without automatic conflict application. |
| Embeddings | Voyage AI (voyage-3) | -- | 1024-dim embeddings with Redis caching |
| AI Providers | Anthropic Claude | ^0.71.2 (SDK) | Memory extraction, summarization, vision/multimodal |
| AI Providers | OpenAI | ^6.16.0 | AI Gateway, embeddings |
| AI Providers | Google Generative AI | ^0.24.1 | AI Gateway multi-provider support |
| AI SDK | Vercel AI SDK | ^6.0.69 | Integration package in `packages/vercel-ai/` |
| Document Parsing | mammoth | ^1.11.0 | DOCX ingestion (`src/lib/summer/ingest/parsers/docx.ts`) |
| PII Detection | Custom + Presidio (optional) | -- | `src/lib/pii/` with scanner, pipeline, config |
| Memory Moderation | OpenAI Moderation + local fallback | -- | `SEIZN_FEATURE_MODERATION=true` enables write-time and recall-time policy checks via `src/lib/moderation/guard.ts`; policies live in `moderation_policies` and dashboard controls are under `/dashboard/moderation`. |
| Provenance | KMS Signing | -- | AWS KMS, Azure Key Vault, Google Cloud KMS for content signing |
| Observability | OpenTelemetry | ^2.5.0 | OTLP HTTP/Proto export, custom GenAI semantic conventions |
| Error Tracking | Sentry | ^10.32.1 | Instrumentation client + server, PII pipeline integration |
| Analytics | PostHog | ^1.316.0 | TTFS tracking, conversion funnels, feature usage |
| RUM | web-vitals | ^4.2.4 | WebVitalsReporter component in root layout |

---

## Infrastructure

| Category | Technology | Details |
|----------|-----------|---------|
| Hosting | Vercel (primary) | `vercel --prod` deploy script, IP geolocation headers |
| Self-Hosting | Docker + Docker Compose | Multi-stage Alpine build; services: app, PostgreSQL+pgvector, Redis, Supabase Studio, Jaeger |
| Reverse Proxy | Nginx | Config in `deploy/nginx.conf` |
| Helm | Kubernetes charts | `deploy/helm/` directory |
| Monitoring | Prometheus | Config in `deploy/prometheus.yml` |

### CI/CD Workflows (`.github/workflows/`)

| Workflow | File | Trigger |
|----------|------|---------|
| Seizn CI (Trace-Test-Fix) | `seizn-ci.yml` | PR/push to main/develop |
| E2E Tests (Linux) | `e2e-linux.yml` | PR/push, Playwright (Chromium + Firefox) |
| Lighthouse CI | `lighthouse-ci.yml` | PR to main/develop |
| Security Tests (OWASP LLM Top 10) | `security-tests.yml` | PR/push to main, releases |
| API Security Live Smoke | `api-security-live.yml` | Daily schedule + push to main (API changes) + manual |
| Red Team Security Scan | `red-team-security.yml` | Weekly Fridays 2AM UTC, PR on AI code |
| Regression Tests | `regression-tests.yml` | -- |
| Multilingual Regression | `multilingual-regression.yml` | -- |
| Link Check | `link-check.yml` | -- |
| Claude Code Review | `claude-review.yml` | -- |
| Claude Audit | `claude-audit.yml` | -- |
| Claude Improve | `claude-improve.yml` | -- |
| Claude Auto-fix | `auto-fix.yml` | -- |
| Issue to Code | `issue-to-code.yml` | -- |
| Seizn Autopilot | `seizn-autopilot.yml` | -- |
| SDK Release | `sdk-release.yml` | Pushes to `main` that change OpenAPI or `packages/seizn-sdk-js`; regenerates the JS SDK, builds it, commits generated drift, and publishes when `NPM_TOKEN` is configured |
| SDK Codegen | `sdk-codegen.yml` | -- |
| SDK Test | `sdk-test.yml` | -- |
| Publish JS SDK | `publish-js-sdk.yml` | -- |
| Publish Python SDK | `publish-python-sdk.yml` | -- |
| Publish SDK | `publish-sdk.yml` | -- |
| Seizn CLI Release | `seizn-cli-release.yml` | Push tags matching `cli-v*`; builds and publishes `@seizn/cli` to npm |
| Release SLSA | `release-slsa.yml` | -- |

### Testing

| Tool | Version | Scope |
|------|---------|-------|
| Vitest | ^4.0.17 | Unit + integration tests (`src/__tests__/`) |
| Playwright | ^1.57.0 | E2E tests (`e2e/`): core pages, API keys, Spring memory CRUD, dashboard smoke |
| @testing-library/react | ^16.3.1 | Component testing |
| Lighthouse CI | ^0.14.0 | Performance auditing |
| Custom Red Team | -- | `scripts/red-team-ci.ts` for prompt injection/jailbreak testing |

---

## i18n & Localization

| Category | Details |
|----------|---------|
| Library | Custom dictionary-based system (`src/i18n/`) |
| Routing | `[locale]` dynamic segment in App Router with middleware redirect |
| Locale Detection | Cookie > Accept-Language (q-value) > Vercel IP geolocation > default (en) |
| RTL Support | Hebrew (`he`), Arabic (`ar`) with `dir="rtl"` on `<html>` |

### Supported Locales (22)

| Code | Language | Code | Language |
|------|----------|------|----------|
| `en` | English | `fr` | Francais |
| `ko` | Korean | `de` | Deutsch |
| `ja` | Japanese | `it` | Italiano |
| `zh-hans` | Simplified Chinese | `sv` | Svenska |
| `zh-hant` | Traditional Chinese | `nl` | Nederlands |
| `es` | Espanol | `pl` | Polski |
| `ru` | Russian | `hi` | Hindi |
| `uk` | Ukrainian | `th` | Thai |
| `he` | Hebrew (RTL) | `id` | Bahasa Indonesia |
| `ar` | Arabic (RTL) | `vi` | Vietnamese |
| `pt-BR` | Portuguese (Brazil) | `pt-PT` | Portuguese (Portugal) |

Translation method: JSON dictionary files in `src/i18n/dictionaries/{locale}.json`, loaded server-side via `getDictionary()`.

---

## Key Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| `next` | ^16.1.6 | Full-stack React framework (App Router) |
| `@supabase/supabase-js` | ^2.90.0 | PostgreSQL database client with RLS |
| `next-auth` | ^5.0.0-beta.30 | Authentication (JWT, OAuth, Credentials) |
| `@node-saml/node-saml` | ^5.1.0 | SAML 2.0 processing for Enterprise SSO (ACS, metadata, assertions) |
| `@anthropic-ai/sdk` | ^0.71.2 | Claude AI for memory extraction, summarization, vision |
| `openai` | ^6.16.0 | OpenAI API for AI Gateway multi-provider routing |
| `@google/generative-ai` | ^0.24.1 | Google AI for gateway multi-provider support |
| `ai` (Vercel AI SDK) | ^6.0.69 | Streaming AI integration, memory middleware |
| `@upstash/redis` | ^1.36.1 | Distributed caching and rate limiting |
| `@sentry/nextjs` | ^10.32.1 | Error tracking, performance monitoring, source maps |
| `posthog-js` | ^1.316.0 | Product analytics, TTFS tracking, conversion funnels |
| `@xyflow/react` | ^12.10.0 | Interactive graph/flow visualization (mind maps, knowledge graphs) |
| `@tanstack/react-table` | ^8.21.3 | Spreadsheet-like dashboard data grids |
| `react-force-graph-2d` | ^1.29.1 | Force-directed NPC relationship graphs |
| `recharts` | ^3.6.0 | Data visualization charts (analytics, evals, traces) |
| `@react-pdf/renderer` | ^4.5.1 | Server-side post-mortem PDF generation |
| `@opentelemetry/sdk-node` | ^0.211.0 | Distributed tracing with OTLP export |
| `resend` | ^6.7.0 | Transactional email delivery |
| `lucide-react` | ^0.563.0 | Icon library |
| `commander` | ^12.1.0 | `@seizn/cli` command parser |
| `openapi-typescript-codegen` | ^0.29.0 | `@seizn/sdk` generated fetch client source |
| `yaml` | ^2.8.3 | Canon Lock YAML pull/push format |
| `tailwind-merge` | ^3.4.0 | Tailwind CSS class conflict resolution |
| `swr` | ^2.4.0 | Client-side data fetching with caching |
| `mammoth` | ^1.11.0 | DOCX document parsing for Summer ingestion |
| `react-error-boundary` | ^6.1.0 | Declarative error boundaries for streaming |
| `@octokit/rest` | ^22.0.1 | GitHub API integration (Auto-PR, Autopilot code fixer) |

---

## Architecture Patterns

### Routing Pattern
- **App Router** with route groups: `(auth)`, `(dashboard)`, `[locale]`
- Public marketing pages under `[locale]/` with 22-locale support
- Dashboard at `(dashboard)/dashboard/` with 25+ sub-routes (analytics, autopilot, budget, devtools, evals, governance, integrations, keys, memories, organizations, playground, policy-marketplace, privacy, reports, reranker, security, settings, traces, usage, webhooks)
- API routes at `api/` with 80+ endpoint directories organized by domain
- Legal pages (`/terms`, `/privacy`, `/refund`) at root level without locale prefix

### Data Fetching
- **Server Components** for initial data loading (Supabase queries)
- **SWR** for client-side real-time data (settings, memory candidates)
- **API routes** for mutations and external integrations
- **Streaming** via Vercel AI SDK and AsyncBoundary component

### Code Organization (Seasonal Codenames)
- `src/lib/spring/` -- Memory system (v3, v4): extraction, profiles, multimodal, semantic updates
- `src/lib/summer/` -- RAG system: ingestion, chunking, embedding, answer contracts, federated search, autopilot
- `src/lib/fall/` -- Reliability: canary deployments, experiments, flight recorder, self-healing, time travel
- `src/lib/winter/` -- Governance: conflict resolution, encryption, federated identity, RTBF, PII, OPA policies, retention, TTL

### Monorepo Structure
- `sdks/javascript/` -- JavaScript SDK
- `packages/` -- Shared packages (create-seizn-app, langchain, sdk-core, seizn-mcp, seizn-python, seizn-sdk-js, seizn-unity, spring-sdk, summer-sdk, vercel-ai)
- `mcp-server/` -- Model Context Protocol server
- `relay-agent/` -- Agent relay service (separate Dockerfile)
- `cli/` -- CLI tooling
- `services/` -- Auxiliary services (reranker training)
- `e2e/` -- Playwright E2E tests
- `deploy/` -- Docker, Helm, Nginx, Prometheus configs

### Error Handling
- `global-error.tsx` at root for unrecoverable errors
- `not-found.tsx` for 404 pages
- `react-error-boundary` AsyncBoundary for streaming error recovery
- Structured API errors with error codes, trace IDs, hints, and docs URLs (`src/lib/api-error.ts`, `src/lib/api-error-v2.ts`)
- Sentry integration for server + client instrumentation

### Security Patterns
- CSRF protection (`src/lib/csrf.ts`)
- Rate limiting with sliding window (Redis + in-memory fallback)
- API key hashing and expiration
- Scoped API keys (`src/lib/scoped-api-keys/`)
- E2E encryption for confidential memories (PIN-derived key; ciphertext stored in `memories.encrypted_content`; excluded from search/embedding)
- OPA policy engine (`src/lib/opa/`)
- Prompt firewall (`src/lib/prompt-firewall/`)
- PII detection and anonymization (`src/lib/pii/`)
- BYOK encryption (`src/lib/byok/`)
- Data residency controls (`src/lib/residency/`)
- Audit logging (`src/lib/audit/`)
- GitHub webhook idempotency lock/claim flow for Autopilot deliveries (`src/app/api/webhooks/github/route.ts`)
- Review token system for secure dashboard sharing
- Security headers: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- Dashboard-specific stricter headers (DENY framing, no-referrer)

---

## Technology Synergy Analysis

### Strong Synergies

**Next.js 16 + Supabase + NextAuth**
Server Components fetch data directly from Supabase with the service role client, eliminating unnecessary API round-trips. NextAuth JWT strategy avoids database session lookups. The middleware handles locale detection and review token verification in a single edge pass.

**Upstash Redis + Rate Limiting + Embedding Cache**
A single Redis instance serves dual purposes: sliding-window rate limiting for API abuse prevention and 7-day TTL embedding cache to reduce Voyage AI costs. The in-memory fallback ensures the app functions when Redis is unavailable.

**OpenTelemetry + Sentry + PostHog**
Three observability layers complement each other: OTEL for distributed traces (backend performance), Sentry for error tracking and alerting, PostHog for product analytics (TTFS, conversion funnels). The flight recorder in `fall/` ties production traces to test failures.

**Anthropic SDK + Vercel AI SDK + Multi-provider Gateway**
The AI Gateway (`src/lib/ai-gateway/`) routes requests to Anthropic, OpenAI, or Google based on cost/capability. The Vercel AI SDK provides streaming integration. The Anthropic SDK is used directly for memory extraction where fine-grained control is needed.

**Tailwind CSS v4 + Geist + Pretendard**
Tailwind v4 custom properties integrate with class-based dark mode. Geist provides clean Latin typography while Pretendard handles Korean/CJK scripts, both loaded via `next/font` for zero-CLS font loading.

**Seasonal Architecture (Spring/Summer/Fall/Winter)**
Clear domain separation: Spring handles memory CRUD, Summer handles RAG/ingestion, Fall handles reliability/experiments, Winter handles governance/compliance. Each season has independent evolution paths with shared Supabase backend.

### Potential Friction Points

**NextAuth v5 Beta + Supabase Auth**
Two auth systems coexist: NextAuth manages session/JWT while Supabase Auth handles password verification. This creates complexity in user creation (OAuth users need manual profile inserts). The `@auth/supabase-adapter` is in `package.json` but not imported anywhere -- suggesting an incomplete migration.

**next-intl in package.json but barely used**
`next-intl` (^4.7.0) is installed but only imported in 1 file (`docs/components/page.tsx`). The project primarily uses a custom dictionary system. This creates an unnecessary dependency.

**pdf-parse usage is limited to PDF extraction paths**
`pdf-parse` (^2.4.5) is imported in `src/lib/connectors/external/google-drive.ts` and `src/lib/summer/ingestion/layout-parser.ts`. PDF parsing is implemented, but primarily scoped to ingestion/connectors.

**React 18 on Next.js 16**
Next.js 16 supports React 19, but this project pins React 18.3.1. This works but prevents access to React 19 features (use, Actions, Server Actions improvements). The `params: Promise<>` pattern in layouts suggests Next.js 16 compatibility is intentional.

**Paddle + Stripe Both Referenced**
Stripe Billing is active for the 5-tier catalog and metered overage. Paddle files remain for compatibility and should be retired after legacy webhook traffic is confirmed inactive.

---

### Integration Map

```
User Request
    |
    v
[Middleware] -- Locale detection, review token, security headers
    |
    v
[Next.js App Router]
    |
    +-- /[locale]/* --> Marketing pages (Server Components + dictionaries)
    |
    +-- /(dashboard)/* --> Dashboard (Providers: SessionProvider, ThemeProvider, PostHog)
    |
    +-- /api/* --> API Routes
          |
          v
    [API Auth] -- Bearer token extraction, key hash lookup
          |
          v
    [Rate Limiter] -- Redis sliding window (plan-based RPM)
          |
          v
    [Request Handler]
          |
          +-- Memory CRUD (Spring) --> Supabase (pgvector)
          |                              |
          |                              +--> Embedding: Voyage AI (cached in Redis)
          |                              +--> Extraction: Claude (Anthropic API)
          |
          +-- RAG Query (Summer) --> Chunking + Embedding + Vector Search
          |                           |
          |                           +--> Reranking
          |                           +--> Answer Contract verification
          |
          +-- AI Gateway --> Multi-provider routing (Anthropic/OpenAI/Google)
          |
          +-- Governance (Winter) --> PII scan, policy check, audit log
          |
          v
    [Response] + Rate-limit headers + Trace ID + Deprecation notices
          |
          v
    [Telemetry] -- OTEL traces, Sentry errors, PostHog events, audit logs
```

---

## Implementation Completeness

| Feature | Status | Key Files | Notes |
|---------|--------|-----------|-------|
| NextAuth (GitHub + Google + Credentials) | Fully Implemented | `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/` | JWT strategy, Turnstile CAPTCHA |
| Enterprise SSO (SAML + OIDC) | Partially Implemented | `src/lib/sso/`, `src/app/api/sso/`, `src/app/api/auth/oidc/` | Org-scoped SSO connections, SAML ACS + OIDC callback; validate with each IdP before GA |
| Tenant Policy (Budget & Cost Controls) | Fully Implemented | `src/lib/tenant-policy/`, `src/app/api/tenant-policy/` | Policy persisted in `organizations.settings.budget_quota_policy`; internal enforcement endpoint |
| Autopilot PR Bot (GitHub Webhooks) | Fully Implemented | `src/app/api/webhooks/github/`, `src/app/api/autopilot/`, `src/lib/autopilot/` | Idempotent webhook ingestion; persists deliveries in `autopilot_webhooks` |
| Supabase Database | Fully Implemented | `src/lib/supabase.ts`, `supabase/migrations/` (177 files) | Browser + server clients, pgvector; includes compatibility view for trace cost (`cost_usd`) + budget degrade events |
| E2E Confidential Memory Encryption | Fully Implemented | `src/lib/memory/encryption.ts`, `src/lib/memory/secure-memory-client.ts`, `src/app/api/profile/e2e/`, `src/app/api/v1/memories/`, `scripts/verify-ai-os-memory.mjs` | Opt-in: `content` placeholder + ciphertext storage. Encrypted memories excluded from search/embedding/optimizer. Key never persisted; PIN loss is irreversible. Runtime guard verifies `search_memories` uses normalized params (`match_user_id`, etc.) and blocks legacy `p_*` regressions. |
| API Key Authentication | Fully Implemented | `src/lib/api-auth.ts`, `src/lib/api-key.ts` | Hash-based, expiration, deprecation headers |
| Rate Limiting (Redis) | Fully Implemented | `src/lib/rate-limit.ts` | Sliding window, plan-based, in-memory fallback |
| Redis Caching | Fully Implemented | `src/lib/redis.ts` | Embedding cache, rate limit store |
| i18n (22 locales) | Fully Implemented | `src/i18n/config.ts`, `src/i18n/dictionaries/`, `src/proxy.ts` | Cookie, Accept-Language, IP geolocation |
| PostHog Analytics | Fully Implemented | `src/components/posthog-provider.tsx`, `src/lib/analytics.ts` | TTFS, conversion, feature tracking |
| Sentry Error Tracking | Fully Implemented | `src/instrumentation.ts`, `src/instrumentation-client.ts`, `next.config.ts` | Source maps disabled (build stability) |
| OpenTelemetry Tracing | Fully Implemented | `src/lib/otel/instrumentation.ts`, `src/lib/telemetry/` | GenAI semantic conventions |
| MCP Sampling (`sampling.tools`) | Fully Implemented | `mcp-server/src/index.ts` | `sampling_draft` tool invokes `sampling/createMessage` with `tools`/`toolChoice` and graceful fallback for clients without sampling.tools |
| Web Vitals (RUM) | Fully Implemented | `src/components/rum/WebVitalsReporter.tsx` | Root layout integration |
| Recharts Dashboards | Fully Implemented | `src/components/retops/`, analytics, evals, traces | 7 files with chart components |
| React Flow Graphs | Fully Implemented | `src/app/(dashboard)/dashboard/memories/mindmap/`, `src/components/graph/` | 8 files |
| Anthropic Claude Integration | Fully Implemented | `src/lib/ai.ts`, `src/lib/ai-gateway/gateway.ts`, `src/lib/anthropic/prompt-caching.ts`, `src/lib/spring/memory-v4/` (6 files) | Memory extraction, summarization, vision, and prompt caching signals (`anthropic-beta`, `cache_control`) in core paths |
| OpenAI Integration | Fully Implemented | `src/lib/ai-gateway/gateway.ts`, `src/app/api/gateway/embed/` | Gateway multi-provider |
| Google AI Integration | Fully Implemented | `src/lib/ai-gateway/gateway.ts` | Gateway multi-provider |
| Vercel AI SDK | Fully Implemented | `src/lib/integrations/vercel-ai/` (3 files) | Memory provider + middleware |
| Stripe Payments | Partially Implemented | `src/lib/stripe-config.ts`, `src/lib/stripe-metered.ts`, `src/lib/stripe-checkout.ts`, `src/app/api/webhooks/stripe/route.ts`, `src/app/api/internal/usage/flush/route.ts`, `src/app/api/billing/checkout/route.ts`, `scripts/stripe/` | Active subscription mapping, metered overage reporting for Studio/Pro, and approved Design Partner coupon application for Studio monthly checkout. |
| Resend Email | Fully Implemented | `src/lib/email/index.ts` | Single email service module |
| Document Ingestion (DOCX) | Fully Implemented | `src/lib/summer/ingest/parsers/docx.ts` | Via mammoth |
| Octokit GitHub Integration | Fully Implemented | `src/lib/auto-pr/github-client.ts`, `src/lib/autopilot/code-fixer.ts` | Auto-PR and autopilot |
| PII Detection | Fully Implemented | `src/lib/pii/` (5 files) | Custom scanner + optional Presidio |
| KMS Provenance Signing | Fully Implemented | `src/lib/provenance/kms-signer.ts` | AWS + Azure + Google Cloud KMS |
| SWR Data Fetching | Fully Implemented | 3 client components | Settings, memory usage, candidates |
| Error Boundaries | Fully Implemented | `src/components/streaming/async-boundary.tsx`, `src/app/global-error.tsx` | Streaming + global |
| Docker Self-Hosting | Fully Implemented | `Dockerfile`, `docker-compose.yml`, `deploy/` | Multi-stage build, Helm charts |
| E2E Tests (Playwright) | Fully Implemented | `e2e/` (3 spec files), `playwright.config.ts` | Chromium + Firefox |
| Offline Local Memory Store (CLI) | Fully Implemented | `cli/seizn/src/commands/local.ts`, `cli/seizn/src/local-store.ts` | JSONL at `~/.seizn/local/memories.jsonl` (offline-only, no API key); supports at-rest encryption via `SEIZN_LOCAL_ENCRYPTION_PASSPHRASE` and refuses likely secrets by default |
| Adaptive Memory Router Learning | Fully Implemented | `src/lib/memory/router-learning.ts`, `src/app/api/v1/memories/route.ts`, `src/app/api/v1/memories/feedback/route.ts`, `supabase/migrations/20260221_memory_router_learning_and_scene_sync.sql` | Online strategy stats by query bucket + automatic override in `mode=auto` + feedback reward loop |
| Lifecycle Scene Profile Sync | Fully Implemented | `src/lib/memory/lifecycle.ts`, `supabase/migrations/20260221_memory_router_learning_and_scene_sync.sql` | Consolidation scene profile updates now sync into slots/profile card and persist trace logs (`memory_scene_profile_sync_events`) |
| Scheduled Memory Quality Auto-Eval | Fully Implemented | `src/lib/memory/eval-automation.ts`, `src/app/api/internal/eval-processor/route.ts` | Internal cron path emits synthetic auto-eval triggers when feedback degradation / zero-result ratio crosses thresholds |
| Memory Search Canary Linkage | Fully Implemented | `src/app/api/v1/memories/route.ts`, `src/lib/fall/canary/` | v1 memory search now records canary quality/latency outcomes and supports canary forced mode override in auto routing |
| Companion Memory Metadata & Analytics (v0) | Fully Implemented | `src/app/api/memories/route.ts`, `src/app/api/memories/[id]/route.ts`, `src/app/api/memories/analytics/route.ts`, `supabase/migrations/20260222_001_companion_meta_and_analytics.sql` | Added `search` alias filtering (`ILIKE`), `sort=-field` syntax, `companion_meta` POST/PATCH/filter support, JWT fallback auth for legacy v0 routes, CSRF validation for state-changing cookie-auth requests, and analytics endpoint backed by companion RPC functions with timing-safe admin token checks |
| Memory API Compatibility & Encoding Integrity Signals | Fully Implemented | `src/app/api/memories/route.ts`, `src/app/api/v1/memories/route.ts`, `src/app/api/v1/memories/[id]/route.ts`, `src/lib/memory/content-integrity.ts` | Added `q` query alias support for v0/v1 search, keyword fallback on search errors and zero-result cases (including post-filter zero), v1 `GET /api/v1/memories/{id}` endpoint parity, and soft POST integrity warnings (`integrity_warnings` / `meta.integrityWarnings`) to detect likely encoding corruption without blocking normal users |
| Memory Search Guardrails, Timeout Budget, and Dashboard Diagnostics | Fully Implemented | `src/lib/memory/search-executor.ts`, `src/lib/memory/search-types.ts`, `src/lib/memory/semantic-cache-experiment.ts`, `src/app/api/v1/memories/route.ts`, `src/app/api/memories/route.ts`, `src/app/(dashboard)/dashboard/memories/memories-client.tsx`, `src/types/dashboard.ts`, `supabase/migrations/20260302001_search_bounded_rpc_wrappers.sql`, `supabase/migrations/20260302002_semantic_cache_experiment_events.sql` | Added mode/threshold input validation, bounded search timeout (`MEMORY_SEARCH_TIMEOUT_MS`, default 2500ms), deterministic keyword fallback with explicit `504 search_timeout` for terminal timeouts, DB-side statement timeout wrappers (`*_search_memories_bounded`), semantic cache A/B controls (`MEMORY_SEMANTIC_CACHE_AB_ENABLED/SCOPE/RATIO`) with deterministic user bucketing, variant-level experiment event persistence (`hit/latency/result_count/error`) for v0/v1 search, shared v0/v1 cache mapping utility, adaptive thresholding in dashboard search, stale request cancellation via `AbortController`, and retrieval diagnostics chips (`mode/requested/cache/fallback/router-learning/latency/semantic-cache-variant`) with `aria-live` status updates. |
| Replay BugReport Integration | Fully Implemented | `src/lib/replay-bundler.ts`, `src/app/api/webhooks/bug-tracker/[provider]/route.ts`, `src/app/api/replay/bundles/[traceId]/route.ts`, `src/app/(dashboard)/dashboard/replay/[traceId]/export-panel.tsx`, `supabase/migrations/20260421012_bug_tracker_integrations.sql` | Builds signed seven-day replay zip bundles from replay snapshots, uploads them to private Supabase Storage, records exports, and appends replay blocks to Linear, GitHub, or Jira tickets. |
| Canon Lock | Fully Implemented | `src/lib/canon/validator.ts`, `src/lib/canon/enforce.ts`, `src/app/api/canon/locks/route.ts`, `src/app/api/canon/locks/[id]/route.ts`, `src/app/(dashboard)/dashboard/canon/page.tsx`, `supabase/migrations/20260421013_canon_locks.sql` | Adds hard/soft canon locks scoped to world or NPC, blocks hard memory-write violations with 422, logs hard/soft violations, and exposes dashboard CRUD. |
| Live Playground | Fully Implemented | `src/lib/playground/demo-npc.ts`, `src/app/[locale]/playground/`, `src/app/api/playground/chat/route.ts`, `src/components/extreme-homepage/index.tsx` | Public Archivist Vale demo with example prompts, live memory stream, friendly 429 countdowns, demo account persistence, root homepage embed, and free-tier signup template handoff. |
| Public Benchmark Leaderboard | Fully Implemented | `scripts/bench/run.py`, `src/lib/bench/leaderboard.ts`, `src/app/[locale]/bench/`, `.github/workflows/weekly-bench.yml`, `supabase/migrations/20260421019_bench.sql` | Weekly public comparison of Seizn, Mem0, Zep, and LangChain Memory across six standard NPC-memory tasks, with CSV download, methodology page, Supabase publication tables, and deterministic fallback data. |
| Competitor Import Tool | Fully Implemented | `src/lib/import/`, `src/app/(dashboard)/dashboard/import/`, `src/app/api/import/preview/route.ts`, `src/app/api/import/commit/route.ts`, `supabase/migrations/20260421020_import_jobs.sql`, `docs/import-mapping.md`, `fixtures/import/inworld-200-knowledge.json` | Inworld knowledge/goals map to memories/canon locks, Convai backstory/tagline maps to memories/always_say canon, Rivet graph nodes map to belief shards via backing memories, and each committed job can be rolled back. |
| Unity SDK | Source Implemented | `packages/seizn-unity/`, `docs/unity-quickstart.md`, `src/app/[locale]/docs/unity-quickstart/page.tsx` | Source package for Unity 2022.3 LTS with `SeiznClient`, memory create/search, canon checks, replay fetches, coroutine alternatives, editor settings, and Basic NPC sample assets. `.unitypackage` export and Asset Store submission remain manual. |
| OpenAPI + TypeScript SDK | Fully Implemented | `openapi/seizn-openapi.json`, `src/app/api/openapi.json/route.ts`, `src/lib/openapi/spec.ts`, `packages/seizn-sdk-js/`, `.github/workflows/sdk-release.yml` | Serves a valid OpenAPI 3.1 document, generates the `@seizn/sdk` fetch client from the schema, exposes typed helper wrappers for memory/canon/replay APIs, and automates regeneration/build/publish on main schema changes. |
| Summer Competitive Retrieval Phases (0-6) | Fully Implemented | `src/lib/summer/rag-pipeline.ts`, `src/lib/summer/competitive/`, `src/app/api/summer/rag/route.ts` | Added phase-aware intent routing, query expansion + RRF fusion, trust guard filtering, graph context augmentation, shadow eval overlap metrics, and canary-aware metadata wiring for Summer RAG |
| Security Tests | Fully Implemented | `src/__tests__/security/`, `.github/workflows/security-tests.yml` | OWASP LLM Top 10 |
| Lighthouse CI | Configured | `.github/workflows/lighthouse-ci.yml`, `lighthouserc.json` | Performance auditing |
| @auth/supabase-adapter | Not Implemented | `package.json` only | Installed but never imported |
| next-intl | Partially Implemented | 1 file (`src/app/[locale]/docs/components/page.tsx`) | Mostly unused, custom system preferred |
| pdf-parse | Fully Implemented | `src/lib/connectors/external/google-drive.ts`, `src/lib/summer/ingestion/layout-parser.ts` | Used for PDF text extraction in connector sync and Summer layout-aware parsing |
| Paddle Payments | Legacy | `src/lib/paddle-config.ts`, `src/app/api/webhooks/paddle/route.ts` | Kept for compatibility while Stripe Billing is the active provider. |
| react-markdown | Partially Implemented | 1 file (`src/components/extreme-homepage/snippet-tabs.tsx`) | Homepage only |
| SWR | Partially Implemented | 3 files | Limited client-side use |

---

## Dependency Health

### Potentially Unused Dependencies
| Package | Evidence |
|---------|----------|
| `@auth/supabase-adapter` (^1.11.1) | Not imported anywhere in `src/`. Auth uses custom Supabase + NextAuth integration. |
| `next-intl` (^4.7.0) | Only 1 import in docs components page. The project uses a custom dictionary system for i18n. |

### Noteworthy Version Choices
| Observation | Details |
|-------------|---------|
| React 18 on Next.js 16 | Pinned to ^18.3.1 while Next.js 16 supports React 19. Likely intentional for stability. |
| NextAuth v5 beta | ^5.0.0-beta.30 is pre-release. Monitor for breaking changes. |
| Tailwind CSS v4 | Using the new `@import "tailwindcss"` syntax with `@theme inline` blocks. |
| Sentry v10+ | Using new webpack plugin format with `sourcemaps.disable: true` for build stability. |

### Dependency Overlap
| Overlap | Details |
|---------|---------|
| Paddle + Stripe | Stripe is active for subscriptions and metered overage; Paddle remains in legacy webhook/config paths. |
| Custom i18n + next-intl | Dual i18n systems. The custom dictionary approach is dominant. Consider removing next-intl if not expanding its use. |
| `pg` + `postgres` (devDeps) | Both PostgreSQL drivers in devDependencies. Likely used in scripts only. |
