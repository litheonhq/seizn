# Seizn

> Seize your memories. Seizn is the memory layer for AI characters, agents, and creative IP systems.

This README is written as the repo-level orientation file for human and AI operators. After reading only this file, another agent should understand what Seizn is, where the product is pivoting, how the codebase is organized, and which commands and guardrails matter.

## Current Product Thesis

Seizn is not an LLM, not a vector database, and not a generic chatbot shell. It is a stateful memory operating layer around AI applications.

The core product stores, retrieves, governs, and explains long-lived context:

- memories: facts, preferences, events, instructions, experiences, relationships
- profile/persona state: stable user, character, or agent traits
- graph state: entities, relationships, provenance, external IDs, observations
- retrieval context: hybrid search, RAG, reranking, answer contracts, traceable evidence
- runtime controls: replay, budget controls, policy checks, retention, audit logs, webhooks

The current strategy is a hybrid wedge:

- **Seizn Author**: authoring memory for serial fiction, VN, TRPG, manga, drama rooms, and IP builders. This is the 2026-05 candidate direction. The KNOT integration is the first dogfood and PMF test.
- **Seizn Live**: runtime memory middleware for game NPCs and AI characters. This is the 2026-04 NPC memory pivot and remains valid.

The unifying wedge is:

```text
Build IP and character memory in an authoring surface, then export the same memory graph into a game or agent runtime.
```

The product should not be positioned as "a better memory API" in the abstract. The sharper pitch is:

- memory layer for IP builders
- AI memory layer for serial fiction
- persistent memory for AI NPCs
- replayable, governable, debuggable memory for AI systems

## Why This Pivot Exists

The first pivot narrowed Seizn toward game NPC memory middleware. The reasoning was that Inworld, Convai, NVIDIA ACE, and similar stacks are strong at dialogue, voice, and expression, but long-lived memory and relationship persistence remain thin.

The 2026-05 candidate pivot adds an authoring angle. While working on KNOT, the useful stack became clear:

```text
Seizn memory + persona/profile + world/relationship graph
```

That same stack is valuable before runtime, while writers and IP builders are designing characters, relationships, episodes, and continuity. The market may be broader and faster to test than game studio middleware alone.

Current decision state:

- Do not treat Seizn Author as a completed full pivot yet.
- Use KNOT as the first dogfood loop.
- If the authoring workflow gives strong signal, build a Seizn Author web surface and test with a small beta group.
- If signal is weak, keep Author as an internal KNOT tool and continue Seizn Live for games.
- Core assets survive either path: SDK, MCP, Graph, Profile, memory search, replay, governance.

## Differentiation

Do not sell Seizn as "better semantic search." That is commodity in 2026.

The stronger differentiation is:

| Layer | Why it matters |
| --- | --- |
| Memory graph | Characters, users, factions, places, scenes, and incidents can persist as graph entities and relationships. |
| Persona/profile | Stable traits and preferences can be separated from transient chat context. |
| Deterministic replay | AI behavior can be reproduced from trace, seed, memory hash, and tool stubs. This is especially important for QA and compliance. |
| Compliance and deletion | RTBF, audit logs, DSR-style deletion, retention, data residency, and policy checks make memory shippable in production. |
| Budget controls | Hot/warm/cold memory tiers, caching, routing, and degrade events keep retrieval cost controllable. |
| Creative continuity | Memory and relationship state can help preserve long-running fiction, NPC history, and world-bible consistency. |

The roadmap filter for new features is:

```text
Does this make AI memory more reproducible, governable, debuggable, exportable, or useful for creators building persistent characters?
```

## Canonical Domain Model

The active graph/person model is `graph_entities`, not a separate `characters` table.

For creative and NPC work:

- person or NPC: `graph_entities` row with `type = "person"`
- faction, location, object, incident, scene: `graph_entities` with the appropriate type
- relationship: graph relationship edge between entities
- memory: timestamped textual or multimodal note tied to user, namespace, agent, scope, and optional graph context
- profile/persona: stable derived state used to shape recall and context
- external ID: stable mapping from game/editor/world-bible object IDs into Seizn graph IDs

Primitive mapping for games and fiction:

| Domain object | Seizn representation |
| --- | --- |
| NPC / character / author persona | `graph_entities(type="person")` plus profile |
| player / reader / user | memory owner, profile, graph entity when needed |
| faction / house / organization | graph entity |
| trust, grudge, kinship, alliance | relationship edge |
| event, quest, episode, scene | graph entity plus linked memories |
| world-bible fact | memory, entity property, or document chunk depending on source |
| "what happened last time" | retrieval context over memory + graph + trace |

## Seasonal Architecture

The codebase uses seasonal codenames. They are not marketing fluff; they are the main architecture map.

| Season | Main job | Important paths |
| --- | --- | --- |
| Spring | Memory lifecycle: create/search/update/delete, memory v4, candidates, edges, profiles, temporal search, multimodal memory | `src/lib/spring/`, `src/app/api/spring/`, `src/app/api/v1/memories/` |
| Summer | RAG and document intelligence: ingestion, chunking, embeddings, retrieval, reranking, answer contracts, federated search | `src/lib/summer/`, `src/app/api/summer/`, `src/app/api/rag/`, `docs/ARCHITECTURE_SUMMER.md` |
| Fall | Observability and reliability: flight recorder, deterministic replay, evals, experiments, canaries, time travel, self-healing | `src/lib/fall/`, `src/app/api/fall/`, `src/app/api/retrieval/` |
| Winter | Governance: policy engine, PII, encryption, retention, RTBF, residency, enterprise controls | `src/lib/winter/`, `src/app/api/winter/`, `docs/compliance/` |

These four layers are meant to compose:

```text
Application event
  -> Spring extracts/stores memory
  -> Summer retrieves grounded context
  -> Fall records and replays behavior
  -> Winter enforces policy, deletion, residency, and auditability
```

## Product Surfaces

| Surface | Purpose | Key paths |
| --- | --- | --- |
| Public web app | Marketing, docs, pricing, trust, localized landing pages | `src/app/[locale]/` |
| Dashboard | Memories, usage, traces, orgs, API keys, governance, evals, integrations, webhooks | `src/app/(dashboard)/dashboard/` |
| API v1 | Stable memory and graph API surface | `src/app/api/v1/` |
| Spring API | Memory v4, candidates, temporal search, mindmap, edges, jobs | `src/app/api/spring/` |
| Summer API | RAG, retrieval, explainability, cache, versions, RetOps | `src/app/api/summer/` |
| Fall API | Traces, runs, replay, eval datasets, experiments, HNSW tuning | `src/app/api/fall/` |
| Winter API | RTBF, org policy, graph permissions, transparency, OPA policy | `src/app/api/winter/` |
| MCP server | Claude/Cursor/Windsurf/Codex memory bridge and graph tools | `mcp-server/` |
| CLI | Local/offline memory, save/search/export/config/migrate commands | `cli/seizn/` |
| SDKs and adapters | JS/Python packages, LangChain, Vercel AI, Spring/Summer SDKs | `packages/`, `sdks/`, `sdk/` |

## Key APIs

Common production entry points:

- `POST /api/v1/memories`: create a memory
- `GET /api/v1/memories`: browse/search memories
- `GET /api/v1/memories/{id}`: retrieve memory details
- `DELETE /api/v1/memories`: delete or flush memory scope
- `POST /api/v1/graph`: create/list memory graphs
- `POST /api/v1/graph/{graphId}/entities`: create graph entities
- `GET /api/v1/graph/{graphId}/entities?type=person`: list people/NPCs
- `GET /api/v1/graph/{graphId}/entities/by-external-id/{externalId}`: map game/editor IDs to Seizn IDs
- `GET /api/v1/graph/{graphId}/relationships`: list relationships
- `POST /api/summer/rag`: document/RAG answer pipeline
- `GET /api/retrieval/traces/{id}`: inspect retrieval trace
- `POST /api/webhooks`: manage memory webhooks

Auth uses bearer API keys with the `szn_` prefix. Cookie-authenticated dashboard mutations use CSRF protection.

## Technology Stack

| Category | Current stack |
| --- | --- |
| Runtime | Node.js 20, Next.js 16.1.6, React 18.3, TypeScript 5 |
| UI | App Router, Server Components, Tailwind CSS v4, Lucide, Recharts, React Flow |
| Data | Supabase PostgreSQL with pgvector, RLS, migrations under `supabase/migrations/` |
| Auth | NextAuth v5 beta, Supabase password verification, OAuth, device flow, API keys |
| Cache/rate limit | Upstash Redis with in-memory fallback |
| AI providers | Anthropic, OpenAI, Google Generative AI, Vercel AI SDK |
| Embeddings | Voyage AI by default, with cache and fallback paths |
| Observability | OpenTelemetry, Sentry, PostHog, Web Vitals, custom flight recorder |
| Security/governance | CSRF, scoped API keys, OPA-style policy, PII scanner, BYOK/KMS, audit logs, retention and RTBF |
| Billing | Billing code contains active Stripe routes and older Paddle references; verify the current provider before changing billing |
| i18n | Custom dictionary system with 22 locales and RTL support |
| Deployment | Vercel production, Docker Compose, Helm, Nginx, Prometheus configs |

For a deeper stack inventory, see `.github/TECH_STACK.md`. Treat that file as implementation inventory, and this README as product and architecture orientation.

## Repository Map

```text
src/app/                  Next.js app routes, dashboard, public pages, API route handlers
src/app/api/              All server API domains
src/lib/spring/           Memory v3/v4, candidates, profiles, graph edges, temporal search
src/lib/summer/           RAG, ingestion, chunking, retrieval, versions, federated search
src/lib/fall/             Flight recorder, replay, evals, experiments, canaries, healing
src/lib/winter/           Policy, RTBF, retention, residency, privacy controls
src/lib/memory/           Shared memory search, encryption, lifecycle, router learning
src/lib/graph*/           Graph RAG and external ID helpers
src/lib/ai-gateway/       Multi-provider AI gateway, routing, retry, load balancing
src/lib/connectors/       External connectors and federated sources
src/components/           Dashboard, graph, devtools, memory, budget, governance UI
src/i18n/                 Locale config and dictionaries
supabase/migrations/      Database schema and RLS migrations
docs/                     Architecture, compliance, quickstarts, procurement, deployment docs
mcp-server/               Model Context Protocol server
cli/seizn/                CLI and local offline memory store
packages/                 SDKs and integrations
sdks/                     Additional SDK code
deploy/                   Docker, Helm, Nginx, Prometheus
e2e/                      Playwright tests
scripts/                  Build, verification, migration, docs, market scripts
```

## Development

Prerequisites:

- Node.js 20+
- npm, using the root `package-lock.json`
- Supabase/PostgreSQL-compatible environment variables
- Provider keys only when exercising provider-backed paths

Install and run:

```bash
npm ci
npm run dev
```

Quality gates:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
```

Useful focused checks:

```bash
npm run check:routes
npm run verify:e2e-encryption-db
npm run verify:runtime-primitives
npm run test:security
npm run test:security:strict
```

`npm run build` runs `scripts/check-route-conflicts.js` before `next build`. It requires a valid local env; never commit `.env.local` or secrets.

## Migration Workflow

For DB changes, use the repo migration wrapper:

```bash
node scripts/run-migration-file.mjs <path-to-sql>
npm run verify:e2e-encryption-db
```

The wrapper runs E2E encryption/search-RPC verification by default. If SQL is applied manually in Supabase Dashboard, run the verifier manually once afterward.

Do not regenerate or stage broad migration bundles unless the task explicitly asks for that. Supabase temp files and generated all-migration dumps are common local noise.

## SDK, MCP, and CLI

Seizn is meant to be used by applications and AI tools, not only through the web dashboard.

| Package/tool | Role |
| --- | --- |
| `@seizn/spring` | JS/TS memory SDK |
| `@seizn/summer` | JS/TS RAG and document search SDK |
| `@seizn/core` (`packages/sdk-core`) | Shared SDK primitives |
| `packages/vercel-ai` | Vercel AI SDK integration |
| `packages/langchain` | LangChain adapter/checkpointer integration |
| `packages/seizn-python` | Python SDK package source |
| `mcp-server` | MCP tools/resources for memories, graph, profile, webhooks, config sync |
| `cli/seizn` | CLI with online API commands and offline local memory |

The MCP server exposes memory and graph operations to Claude, Cursor, Windsurf, Cline, and config-sync paths for Copilot/Aider/Codex-style tools.

## Security and Governance Notes

Important implemented boundaries:

- API key auth uses hashed `szn_` keys.
- Cookie-authenticated mutations require CSRF checks.
- E2E confidential memories store ciphertext and are excluded from normal search/embedding.
- RTBF and retention paths live under Winter.
- Webhooks perform SSRF checks and pin validated public IPs before delivery.
- Federated source admin routes must enforce organization membership before service-role writes.
- Logs should never include raw bearer tokens, cookies, API keys, private keys, or provider secrets.

When adding memory features, think about deletion, auditability, and replay at the same time as retrieval quality.

## AI-Agent Operating Guardrails

This repo often has a dirty root worktree. Do not stage broad mixed changes as one blob.

Before committing or pushing:

- verify local repo state with `git status --short --branch`
- verify identity is the Litheon identity for Seizn
- verify `gh` active account is `litheonhq` for GitHub-sensitive work
- stage only files in the current task scope
- avoid `.vercelignore`, Supabase temp files, generated migration bundles, and unrelated brand assets unless explicitly requested
- run the relevant gates and report what was not run

Deployment rule:

- Preview deployments are prohibited.
- If deployment is requested, use production-only flows or stop when production deployment is unsafe.

## Current Strategic Priorities

Near-term Seizn work should bias toward:

1. Authoring memory dogfood with KNOT: character/persona memory, world graph, continuity, relationship recall.
2. Runtime NPC memory: external IDs, person entities, relationship edges, scene/event memory, SDK export.
3. Deterministic replay and memory snapshots: QA-grade reproduction of AI behavior.
4. Compliance and deletion: audit logs, RTBF, DSR, data residency, policy checks.
5. Cost and retrieval control: hot/warm/cold tiers, semantic cache, budget degrade events, planner decisions.
6. Memory explainability: why a memory was recalled, why it was not, trace receipts, answer contracts.

Avoid chasing generic benchmark wins unless they directly improve production value for creators, game teams, or governed AI systems.

## Documentation Pointers

- `docs/quickstart.md`: SDK/API quickstart
- `docs/openapi.yaml`: API reference
- `docs/ARCHITECTURE_SUMMER.md`: Summer RAG architecture
- `docs/AI_PLAYBOOK_SEIZN_INFRA.md`: Fall/Winter implementation playbook
- `docs/architecture/TRACE_REPLAY_DESIGN.md`: replay UI design
- `docs/compliance/SECURITY_WHITEPAPER.md`: security posture
- `SELF_HOSTING.md`: self-hosting guide
- `.github/TECH_STACK.md`: detailed stack inventory
- `CLAUDE.md` and `AGENTS.md`: local operating instructions for agents

## License

Most package metadata in this repo declares MIT; the MCP server declares Apache-2.0. This checkout does not currently include a root `LICENSE` file, so check the relevant package metadata before publishing or redistributing artifacts.
