# Author Memory Replay and Eval Harness

> Status: design draft
> Date: 2026-05-02
> Scope: replay, snapshot, and eval harness for Seizn Author Memory v3

## Goal

The harness must make Author Memory v3 outputs reproducible, debuggable, and measurable. A writer or QA agent should be able to answer:

- Which memory snapshot produced this answer?
- Which provider/tool side effects were used?
- Did replay use recorded outputs only?
- Did the result leak invalidated canon?
- Did the result preserve relationship and character-state constraints?

## Harness Inputs

Each eval run needs:

- Author eval case
- Author memory records
- optional project ID
- side-effect request
- replay mode
- side-effect store
- live callback for record/off mode
- optional output-to-text mapper

## Harness Outputs

Each run should produce:

- memory snapshot
- side-effect record
- Author eval result
- Fall-compatible eval case input
- Fall-compatible metrics
- Fall-compatible debug payload

## Replay Modes

| Mode | Behavior |
| --- | --- |
| `record` | Read existing side effect if present, otherwise call live provider and store output |
| `replay` | Read existing side effect only; cache miss throws |
| `off` | Call live provider and return the record without storing |

Replay mode is a safety mode. It must fail closed.

## Eval Case Shape

Author eval cases use the `seizn.knot_author_eval.v1` schema:

```json
{
  "schemaVersion": "seizn.knot_author_eval.v1",
  "id": "knot-current-canon-001",
  "kind": "invalidated_fact_exclusion",
  "prompt": "What should the assistant say about Sori's current role?",
  "expected": {
    "mustInclude": ["Sori is a student"],
    "mustExclude": ["Sori is an agent"]
  },
  "tags": ["knot", "canon"]
}
```

Supported kinds:

- `canon_recall`
- `invalidated_fact_exclusion`
- `relationship_continuity`
- `persona_consistency`
- `scene_simulation`

## Scoring v1

The v1 scorer is intentionally simple:

- fail if any `mustInclude` text is missing
- fail if any `mustExclude` text appears
- pass score is `1`
- fail score is `0`

Later scoring can add semantic matching, judge-model verification, source citation coverage, and relationship/persona metrics.

## Fall Eval Mapping

Author cases map into Fall eval without new DB columns:

- `query` = Author prompt
- `metadata.author_memory_v3.caseId` = Author case ID
- `metadata.author_memory_v3.caseKind` = Author case kind
- `metadata.author_memory_v3.expected` = include/exclude contract

Author results map into:

- `metrics.author_memory_v3_score`
- `metrics.author_memory_v3_<caseKind>`
- `debug.authorMemoryV3.memorySnapshotHash`
- `debug.authorMemoryV3.sideEffectKeys`
- `debug.authorMemoryV3.failures`

## Determinism Rules

1. Hash normalized JSON, not raw object insertion order.
2. Sort records before snapshot hashing.
3. Sort entity ID lists.
4. Store side effects by canonical request key.
5. Never call live provider in replay mode.
6. Store snapshot hash with every eval result.
7. Store side-effect keys with every eval result.

## Current Implementation

Implemented now:

- canonical JSON and SHA-256 helper
- Author memory snapshot creation
- current-canon filtering
- replay side-effect key/store
- replay miss error
- simple Author eval scorer
- Fall eval adapter
- KNOT eval fixtures v1/v2/v3, including the v3 100-case regression seed
- temporal canon explanation helpers
- single-case Author eval runner
- project-scoped in-memory store contract
- sequential Author eval job runner
- runtime payload parser and deterministic payload runner
- API response envelope handler for route/worker reuse
- KNOT input adapter for character, world rule, relationship, timeline, and eval seed registries
- Next.js `POST /api/author/memory-v3/eval` route with API-key auth, rate-limit headers, request logging, and invalid-JSON handling
- Supabase-backed store adapter for records, snapshots, side effects, and eval results
- project-scoped persisted side-effect store with async replay lookup
- Fall dataset import helper for Author eval seed cases
- KNOT adapter support for deep-filled main/supporting character registries and expanded v2/v3 eval categories
- KNOT v3 fixture runner that executes the 100-case seed in record mode and replays the same canonical side effects without live output
- optional Author eval verifier contract that can fail a lexically passing case after judge-model review
- Anthropic judge adapter with fail-closed missing-key behavior and compact JSON response parsing
- Author UI query binding artifacts with 12 screens, 14 queries, 13 mutations, and 26 required screen endpoints locked against the data contract
- fixture-backed Author UI API service and routes for project, import, candidate review, character cards, graph, timeline, conflicts, scene simulation/replay/promote, settings, BYOK, usage, sync, search, and telemetry event ingestion. The API guard now keeps fixture-backed routes behind explicit production enablement and allowlists, and the service tests cover project-not-found behavior plus unsafe field-path rejection.
- SWR hooks and the first `/dashboard/author` operator surface consuming the Author UI contract

Next implementation:

- durable Supabase-backed Author UI storage for imports, settings, BYOK metadata, and simulation jobs
- production realtime transport for project event delivery; polling fallback is implemented at the hook layer

## Persistence Strategy

The store contract separates records, snapshots, side effects, and eval results. Local tests can keep using `InMemoryAuthorMemoryV3Store`, while production can opt into `SupabaseAuthorMemoryV3Store` with `AUTHOR_MEMORY_V3_STORE=supabase` after `20260502001_author_memory_v3_store.sql` and `20260502002_author_memory_v3_side_effect_project_scope.sql` are applied. Supabase replay side effects are keyed by `(user_id, project_id, key)` so identical canonical request keys from different Author projects cannot overwrite each other. Fall eval cases reuse existing Fall dataset tables through JSON metadata instead of adding Fall-specific Author columns.

Production activation remains gated until:

- `20260502001_author_memory_v3_store.sql` and `20260502002_author_memory_v3_side_effect_project_scope.sql` have been applied to the target Supabase project
- `AUTHOR_MEMORY_V3_STORE=supabase` is explicitly configured
- Claude-prepared KNOT input artifacts define source IDs and source spans
- Author UI data contracts, query bindings, and mutation invalidation matrix are available and artifact tests pass
- Author UI service has a production store adapter for user-created imports/settings/simulations
- `AUTHOR_UI_ENABLED=1` and an explicit user ID or email allowlist are configured before exposing the fixture-backed Author UI routes in production

## Acceptance Gates

The harness is acceptable when:

- replay-only cache miss fails closed
- KNOT v3 100-case fixture passes in record and replay modes with identical snapshot hash and side-effect keys
- same input produces same side-effect key
- same memory records in different order produce same snapshot hash
- changed canon content changes snapshot hash
- current canon excludes invalidated/candidate/rejected records
- Author eval result carries snapshot hash and side-effect keys
- optional verifier metadata is preserved in Author and Fall-compatible debug output
- Fall adapter preserves Author metadata without Fall schema changes
- sequential job runs preserve case order and persist per-case evidence
- Author UI screen binding endpoints stay equal to the data contract endpoint set
- Author UI fixture service tests cover KNOT seeding, review decisions, simulation/replay/promote, BYOK masking, contract filters, unknown-project rejection, unsafe field-path rejection, and the production route guard
