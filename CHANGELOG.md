## Unreleased

### Added
- Deterministic Replay capture, tool stubs, rerun API, and replay diff persistence.
- Compliance DSR queue with export/delete worker, object-store artifacts, deletion tombstones, and scoped consent APIs.
- COPPA/GDPR-K age-gated memory writes, draft consent page, and scoped consent revocation.
- Automated hot/warm/cold memory tier demotion cron, recall promotion, and tier stats API.
- `graph_entities.external_id` column migration file with unique-per-graph index for SDK slug support.
- `POST /api/v1/graph/{graphId}/entities` to create or idempotently update entities with `external_id`.
- `GET /api/v1/graph/{graphId}/entities/by-external-id/{externalId}` for slug lookup.
- Test organization and SDK E2E key provisioning workflow support (internal).
- Batch C Korean persona seeding: bundled 1K sample package, graph entity transformer with provenance, seeding API/dashboard, PIPA consent gate, Seoul region preference, docs, and smoke coverage.

## [0.9.0-beta.1] - 2026-04-21

First public beta release.

- `@seizn/sdk-js` OpenAPI-generated TypeScript client
- `@seizn/mcp` Model Context Protocol server
- `@seizn/cli` command-line interface
- Published with GitHub Actions OIDC provenance.
