# Seizn -- Tech Stack Documentation
> Auto-generated on 2026-02-16

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
| Charts | Recharts | ^3.6.0 | Analytics, evals, traces, RetOps dashboards (7 files) |
| Graph Visualization | @xyflow/react | ^12.10.0 | Memory mind map, knowledge graph canvas (8 files) |
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
| Database | PostgreSQL + pgvector | -- | Via Supabase; 140 migration files in `supabase/migrations/` |
| ORM/Client | @supabase/supabase-js | ^2.90.0 | Browser client (anon key) + Server client (service role key) |
| Auth | NextAuth v5 | ^5.0.0-beta.30 | JWT strategy, GitHub + Google OAuth + Credentials (Supabase password) |
| SSO | SAML 2.0 + OIDC | -- | Org-scoped SSO connections + domain verification; SAML ACS + OIDC callback routes |
| Encryption | E2E confidential memory encryption | -- | Opt-in client-side WebCrypto (PBKDF2-SHA256 600k + AES-256-GCM). Contract: `content="[encrypted]"`, `encrypted_content=<base64 ciphertext>`, `is_encrypted=true`. Setup material stored in `profiles.e2e_*` via `/api/profile/e2e`. Encrypted memories excluded from search/embedding/optimizer. |
| DB Contract Verification | Migration guardrails (`run-migration-file.mjs` + `verify:e2e-encryption-db`) | -- | Every migration run triggers E2E/search-RPC compatibility checks by default; fails fast on overload/RPC regressions unless explicitly bypassed with `SKIP_E2E_VERIFY=1`. |
| Tenant Policy | Budget caps + degrade ladder | -- | Stored in `organizations.settings.budget_quota_policy`; internal enforcement via `/api/tenant-policy/enforce` (includes daily ingest chunk cap and configurable fail-open/fail-closed fallback mode in gateway policy routing) |
| Bot Protection | Cloudflare Turnstile | -- | CAPTCHA on login/signup forms |
| API Pattern | Next.js Route Handlers | -- | `src/app/api/` with 80+ route directories |
| API Auth | Bearer token (`szn_` prefix) | -- | API key hash verification via Supabase, x-api-key deprecated (sunset 2026-05-01) |
| Rate Limiting | Upstash Redis + in-memory fallback | -- | Sliding window algorithm, per-plan RPM limits |
| Cache | Upstash Redis | ^1.36.1 | Embedding cache (7-day TTL), rate limit counters |
| Email | Resend | ^6.7.0 | Transactional emails (`src/lib/email/`) |
| Payments | Paddle | -- | Client token + server API key, plan-based billing (free/starter/plus/pro/enterprise) |
| Vector Search | Supabase pgvector (default) | -- | BYO vector store support: Pinecone, Weaviate, Qdrant |
| Embeddings | Voyage AI (voyage-3) | -- | 1024-dim embeddings with Redis caching |
| AI Providers | Anthropic Claude | ^0.71.2 (SDK) | Memory extraction, summarization, vision/multimodal |
| AI Providers | OpenAI | ^6.16.0 | AI Gateway, embeddings |
| AI Providers | Google Generative AI | ^0.24.1 | AI Gateway multi-provider support |
| AI SDK | Vercel AI SDK | ^6.0.69 | Integration package in `packages/vercel-ai/` |
| Document Parsing | mammoth | ^1.11.0 | DOCX ingestion (`src/lib/summer/ingest/parsers/docx.ts`) |
| PII Detection | Custom + Presidio (optional) | -- | `src/lib/pii/` with scanner, pipeline, config |
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
| SDK Codegen | `sdk-codegen.yml` | -- |
| SDK Test | `sdk-test.yml` | -- |
| Publish JS SDK | `publish-js-sdk.yml` | -- |
| Publish Python SDK | `publish-python-sdk.yml` | -- |
| Publish SDK | `publish-sdk.yml` | -- |
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
| `recharts` | ^3.6.0 | Data visualization charts (analytics, evals, traces) |
| `@opentelemetry/sdk-node` | ^0.211.0 | Distributed tracing with OTLP export |
| `resend` | ^6.7.0 | Transactional email delivery |
| `lucide-react` | ^0.563.0 | Icon library |
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
- `packages/` -- Shared packages (create-seizn-app, langchain, sdk-core, seizn-python, spring-sdk, summer-sdk, vercel-ai)
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

**pdf-parse installed but not imported**
`pdf-parse` (^2.4.5) is in dependencies but no source file imports it. Document parsing for Summer may use a different mechanism or this is an unused dependency.

**React 18 on Next.js 16**
Next.js 16 supports React 19, but this project pins React 18.3.1. This works but prevents access to React 19 features (use, Actions, Server Actions improvements). The `params: Promise<>` pattern in layouts suggests Next.js 16 compatibility is intentional.

**Paddle + Stripe Both Referenced**
`.env.example` has both `PADDLE_*` and `STRIPE_WEBHOOK_SECRET` variables. The codebase has `paddle-config.ts` but also `stripe-config.ts`, suggesting a payment provider transition. Active billing appears to be Paddle.

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
| Supabase Database | Fully Implemented | `src/lib/supabase.ts`, `supabase/migrations/` (140 files) | Browser + server clients, pgvector; includes compatibility view for trace cost (`cost_usd`) + budget degrade events |
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
| Paddle Payments | Partially Implemented | `src/lib/paddle-config.ts`, `src/components/checkout-button.tsx` | Price IDs are placeholders |
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
| Security Tests | Fully Implemented | `src/__tests__/security/`, `.github/workflows/security-tests.yml` | OWASP LLM Top 10 |
| Lighthouse CI | Configured | `.github/workflows/lighthouse-ci.yml`, `lighthouserc.json` | Performance auditing |
| @auth/supabase-adapter | Not Implemented | `package.json` only | Installed but never imported |
| next-intl | Partially Implemented | 1 file (`src/app/[locale]/docs/components/page.tsx`) | Mostly unused, custom system preferred |
| pdf-parse | Not Implemented | `package.json` only | Installed but never imported in `src/` |
| Stripe Payments | Configured but Unused | `src/lib/stripe-config.ts`, `.env.example` | Paddle is the active provider |
| react-markdown | Partially Implemented | 1 file (`src/components/extreme-homepage/snippet-tabs.tsx`) | Homepage only |
| SWR | Partially Implemented | 3 files | Limited client-side use |

---

## Dependency Health

### Potentially Unused Dependencies
| Package | Evidence |
|---------|----------|
| `@auth/supabase-adapter` (^1.11.1) | Not imported anywhere in `src/`. Auth uses custom Supabase + NextAuth integration. |
| `pdf-parse` (^2.4.5) | No imports found in `src/`. DOCX parsing uses mammoth instead. |
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
| Paddle + Stripe | Both payment providers configured. Stripe appears dormant; Paddle is active. Consider removing Stripe if not planned. |
| Custom i18n + next-intl | Dual i18n systems. The custom dictionary approach is dominant. Consider removing next-intl if not expanding its use. |
| `pg` + `postgres` (devDeps) | Both PostgreSQL drivers in devDependencies. Likely used in scripts only. |
