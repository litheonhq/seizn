# Seizn Author Memory v3 Architecture

> Status: architecture draft
> Date: 2026-05-02
> Scope: Seizn Author memory core, excluding KNOT intake preparation and Author UI specifications

## Purpose

Seizn Author Memory v3 is the creator-facing memory core for long-running fictional IP. It stores canon, retired facts, character knowledge, relationship state, and source provenance in a way that supports temporal queries, reproducible AI outputs, and writer-controlled approval.

This document defines the architecture invariants that implementation work should preserve. Vendor choices remain adapter-level decisions until evals justify promotion.

## Product Boundary

Seizn Author is for fictional authoring workflows:

- serial fiction
- visual novels
- TRPG campaigns
- manga/drama rooms
- game NPC memory preparation
- IP world-bible management

It must not be framed as real-person prediction. Character-state output is a candidate simulation over fictional canon and requires writer approval before it becomes canon.

## Core Invariants

1. The canonical person/NPC/character representation is `graph_entities(type="person")`.
2. Canon-bearing records are temporal and provenance-backed.
3. Contradiction handling must preserve older records and mark validity changes instead of deleting history.
4. Current-canon queries exclude rejected, candidate, retired, contradicted, invalidated, and past-only facts by default.
5. As-of-time queries can retrieve facts that were valid at a past time.
6. Generated character thoughts, dialogue, and actions are candidates until the writer approves them.
7. Model/provider decisions must sit behind replaceable adapter contracts.
8. Replay mode must fail closed when a required side effect is missing.
9. Evaluation results must reference memory snapshot hashes and side-effect keys.
10. The implementation is Seizn-native Litheon IP. External systems can inform patterns, but the implementation should be clean-room.

## Domain Objects

| Object | Responsibility |
| --- | --- |
| Author project | Fiction/IP workspace boundary |
| Source document | Uploaded or imported material with role and authority |
| Source span | Exact evidence range for a candidate or canon record |
| Author memory record | Temporal canon/candidate/retired fact |
| Graph entity | Person, place, organization, object, scene, event |
| Graph edge | Relationship or provenance link between entities |
| Character state | What a character knows, misunderstands, hides, wants, and feels at a time |
| Scene simulation | Candidate forecast over character state and scene pressure |
| Replay side effect | Recorded output from LLM/parser/embedding/reranker/tool/API calls |
| Eval case | Verifiable behavior requirement |
| Eval result | Scored output with snapshot hash and replay evidence |

## Status Model

Author Memory v3 uses an explicit Author status vocabulary:

- `candidate`: extracted or generated, not approved
- `canon`: approved as current or temporally valid canon
- `rejected`: reviewed and discarded
- `retired`: no longer part of active canon
- `contradicted`: conflicts with stronger canon
- `invalidated`: superseded or made false by newer authority
- `past_only`: historically true but not current

Current-canon retrieval defaults to `canon` records whose temporal range includes the query time and whose `invalidAt` is not set at the current time.

## Temporal Fields

Canon-bearing records should carry:

- `validAt`
- `invalidAt`
- `source.sourceId`
- `source.start`
- `source.end`
- `source.quote`
- `confidence`
- `supersedesId`
- `invalidatesId`
- `entityIds`
- `metadata`

The database shape can evolve, but public Author contracts should preserve these concepts.

## Memory Snapshot

An Author memory snapshot is a stable hash over normalized records:

- sort records by kind and ID
- sort entity IDs
- remove undefined values
- preserve dates as ISO strings
- hash each record and the full snapshot

Snapshot hashes are used by evals and replay receipts so a result can prove which canon state produced it.

## Replay Side Effects

Author replay captures provider and tool outputs as side effects:

- LLM extraction
- parser extraction
- embedding generation
- reranker output
- tool/API calls
- scene simulation generation

The side-effect key is a hash over:

- kind
- provider
- model
- operation
- input
- params
- seed

Replay-only mode must never fall back to live calls. A missing side effect is a failed replay, not a live retry.

Persistent replay storage must scope side effects by Author project as well as user and canonical key. The same provider request can appear in two fictional projects; those records must replay independently and must not overwrite each other.

## Fall Eval Integration

Author evals should use existing Fall eval storage through JSON-compatible payloads:

- Fall `EvalCaseInput.metadata.author_memory_v3` carries case kind, expected facts, forbidden facts, tags, and source metadata.
- Fall `EvalCaseMetrics` carries custom metric keys such as `author_memory_v3_score`.
- Fall result debug carries `memorySnapshotHash`, `sideEffectKeys`, failures, and verifier metadata.

This avoids schema churn while the Author eval shape is still being proven.

## Spring/Fall Boundary

Spring remains the memory lifecycle area. Fall remains the trace/replay/eval area. Author Memory v3 starts as a separate pure module because existing Spring v3/v4 status semantics are not fully aligned:

- Spring v3 is centered on `active`, `superseded`, and `contradicted`.
- Spring v4 temporal behavior is closer to Author needs but also uses runtime statuses that are not fully represented in older type definitions.

Author helpers should be integrated only after the Author contracts and KNOT evals are stable.

## KNOT Boundary

Claude will prepare the KNOT input/review artifacts and Author UI requirements. Seizn implementation should consume those artifacts through contracts rather than hardcoding KNOT-specific assumptions.

Expected incoming artifacts:

- source manifest
- canon authority rules
- character registry
- world rule registry
- relationship matrix
- timeline event ledger
- review taxonomy
- KNOT eval seed set
- UI data contracts, query bindings, and mutation invalidation matrix

## Immediate Implementation Surface

The current implementation surface is:

- `src/lib/author/memory-v3/canonical.ts`
- `src/lib/author/memory-v3/types.ts`
- `src/lib/author/memory-v3/snapshot.ts`
- `src/lib/author/memory-v3/replay.ts`
- `src/lib/author/memory-v3/eval.ts`
- `src/lib/author/memory-v3/fall-adapter.ts`
- `src/lib/author/memory-v3/temporal.ts`
- `src/lib/author/memory-v3/runner.ts`
- `src/lib/author/memory-v3/store.ts`
- `src/lib/author/memory-v3/job.ts`
- `src/lib/author/memory-v3/contract.ts`
- `src/lib/author/memory-v3/api.ts`
- `src/lib/author/memory-v3/knot-input.ts`
- `src/lib/author/memory-v3/knot-fixture-runner.ts`
- `src/lib/author/memory-v3/verifier.ts`
- `src/lib/author/memory-v3/supabase-store.ts`
- `src/app/api/author/memory-v3/eval/route.ts`
- `supabase/migrations/20260502001_author_memory_v3_store.sql`
- `supabase/migrations/20260502002_author_memory_v3_side_effect_project_scope.sql`

The storage contract is deliberately adapter-shaped:

- `AuthorMemoryV3Store` owns project-scoped records, snapshots, side effects, and eval results.
- `InMemoryAuthorMemoryV3Store` is the local/test implementation and also implements the replay side-effect store.
- `SupabaseAuthorMemoryV3Store` persists project-scoped records, snapshots, replay side effects, and eval results behind the same store contract. Supabase mode fails closed if service-role configuration is missing instead of silently falling back to memory-only storage.
- `runAuthorEvalJob` executes eval cases sequentially, persists records, snapshots, side effects, and per-case eval results, then returns a run summary.
- `parseAuthorEvalJobPayload` validates external JSON before it reaches the runner.
- `runAuthorEvalJobPayload` supports deterministic fixture execution through per-case `liveOutput`.
- `handleAuthorEvalJobRequest` maps contract, replay, and execution failures to stable API response envelopes.
- `knotInputBundleToAuthorRecords` maps Claude-prepared KNOT registries into Author memory records without committing to the raw artifact files.
- `knotInputBundleToAuthorEvalJobPayload` builds a replay-ready Author eval payload from the KNOT seed set, including the v3 100-case regression fixture.
- `runKnotAuthorEvalFixture` executes the KNOT v3 seed in deterministic record/replay modes and proves replay can run without `liveOutput`.
- `AuthorEvalVerifier` lets a judge adapter reject a case after deterministic lexical checks; `createAnthropicAuthorEvalVerifier` provides the first live Anthropic-backed implementation and fails closed when the API key is not configured.
- `POST /api/author/memory-v3/eval` exposes the eval job contract behind existing API-key auth and stable error envelopes.
- `importAuthorEvalCasesToFallDataset` imports Author eval cases into existing Fall eval datasets without adding Fall columns.
- `docs/author-ui/author_ui_query_bindings.json` maps 12 Author UI screens to 14 queries, 13 mutations, query keys, state branches, WebSocket events, and optimistic update expectations.
- `docs/author-ui/author_ui_mutation_invalidation_matrix.md` documents mutation invalidation, WebSocket cache patching, URL state sync, and race-condition guards.
- `src/__tests__/author-memory-v3/author-artifacts.test.ts` now validates 19 Author/KNOT artifacts and locks the 26 required screen endpoints against `author_ui_data_contracts.json`.
- `src/lib/author/ui/` provides the Author UI fixture-backed service seeded from KNOT input artifacts, with project, import, candidate, character, graph, timeline, conflict, simulation, BYOK, usage, sync, and search DTOs. The fixture service rejects unknown project IDs instead of auto-creating state, blocks unsafe deep field paths, and does not seed local machine paths into sync settings.
- `src/app/api/projects/**`, `src/app/api/account/**`, and `src/app/api/telemetry/event` expose the Author UI contract routes behind the existing session/JWT request-user boundary. In production these fixture-backed routes are additionally gated by `AUTHOR_UI_ENABLED=1` plus `AUTHOR_UI_ALLOWED_USER_IDS` or `AUTHOR_UI_ALLOWED_EMAILS`.
- `src/hooks/useAuthorMemoryV3.ts` provides SWR query/mutation hooks matching the binding registry, including polling fallback intervals and invalidation after review, conflict, character, simulation, and BYOK mutations.
- `src/app/(dashboard)/dashboard/author/` adds the first operator Author Memory screen for inbox, review, characters, graph, timeline, conflicts, and scene simulation.

Next implementation work should add:

- durable Supabase-backed Author UI project/import/settings persistence beyond the current fixture-backed service
- production WebSocket transport for project events; the current hooks use polling fallback behavior from the binding contract
- production calibration of judge-model prompts against Claude-prepared KNOT review cases
- durable Author UI storage and authorization checks before enabling broad production access to fixture-seeded KNOT data
