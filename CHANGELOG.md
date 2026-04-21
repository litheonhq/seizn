## Unreleased

### Added
- `graph_entities.external_id` column migration file with unique-per-graph index for SDK slug support.
- `POST /api/v1/graph/{graphId}/entities` to create or idempotently update entities with `external_id`.
- `GET /api/v1/graph/{graphId}/entities/by-external-id/{externalId}` for slug lookup.
- Test organization and SDK E2E key provisioning workflow support (internal).

## [0.9.0-beta.1] - 2026-04-21

First public beta release.

- `@seizn/sdk-js` OpenAPI-generated TypeScript client
- `@seizn/mcp` Model Context Protocol server
- `@seizn/cli` command-line interface
- Published with GitHub Actions OIDC provenance.
