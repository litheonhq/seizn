## Unreleased

### Added
- `graph_entities.external_id` column migration file with unique-per-graph index for SDK slug support.
- `POST /api/v1/graph/{graphId}/entities` to create or idempotently update entities with `external_id`.
- `GET /api/v1/graph/{graphId}/entities/by-external-id/{externalId}` for slug lookup.
- Test organization and SDK E2E key provisioning workflow support (internal).
