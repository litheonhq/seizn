# Seizn Author Memory v3 Kickoff Plan

> Status: kickoff plan
> Date: 2026-05-02
> Scope: Seizn Author memory architecture, KNOT dogfood, replay/eval harness
> Audience: implementation agents, product operators, and technical reviewers

## 1. Objective

Build Seizn Author Memory v3 as a creator-facing memory system for long-running fictional IP. The system must let writers import existing material, review extracted canon, lock approved facts, track temporal contradictions, simulate character-state responses, and reproduce AI outputs from recorded traces.

The first dogfood target is KNOT. The plan should also preserve the Seizn Live path for game NPC runtime memory.

## 2. Product Thesis

Seizn should not be framed as a generic vector database, chatbot shell, or "better memory API." The stronger product thesis is:

- memory layer for IP builders
- AI memory layer for serial fiction and visual novels
- persistent memory for AI NPCs
- replayable, governable, debuggable memory for AI systems

The Author direction is not a full permanent pivot yet. Treat it as a PMF test driven by KNOT over the next work cycle. If authoring signal is strong, build a dedicated Seizn Author surface. If signal is weak, keep Author as an internal KNOT tool and continue Seizn Live as the external game/NPC memory product.

## 3. Consumer Workflow Decision

The default UX must not require users to prepare perfect Seizn-formatted documents before upload.

Use a hybrid onboarding flow:

1. Upload/import existing materials.
   - Plain text
   - Markdown
   - DOCX/PDF
   - Notion or Obsidian exports
   - Google Docs exports
   - scripts, outlines, lore sheets, scene notes
   - character sheets and visual references
2. Seizn parses and extracts candidate memory.
   - people and aliases
   - world rules
   - events and timeline anchors
   - locations
   - relationship edges
   - character voice and persona hints
   - forbidden or retired facts
   - private knowledge vs public/canon knowledge
3. User reviews inside the site.
   - approve as canon
   - reject as noise
   - mark as retired
   - mark as past-only
   - assign "known by character" visibility
   - merge duplicates
   - split ambiguous facts
4. User continues refinement inside Seizn.
   - character cards
   - relationship graph
   - event timeline
   - canon conflict inbox
   - memory recall explanation
   - scene simulation

Add an interview-style fallback for users who do not have clean source documents:

- Who are the main characters?
- What rules of this world must never be broken?
- What does each character know, misunderstand, or hide?
- Which facts are known only to the author?
- Which past settings were discarded?
- Which relationships must remain stable?

The best UX is therefore "bring anything, Seizn organizes it, the writer locks it."

## 4. Locked Architecture Invariants

These are the items to lock now. They are product and architecture invariants, not vendor locks.

1. `graph_entities(type="person")` is the canonical person/NPC/character model.
2. Canon facts are temporal. Use valid/invalid intervals, provenance, supersession, and contradiction state rather than destructive overwrite.
3. Every important AI output must be reproducible from trace, seed, memory snapshot hash, side-effect records, and provider metadata.
4. Vendor/model choices must be replaceable through adapter slots.
5. KNOT is the first dogfood and evaluation corpus.
6. Generated thoughts, dialogue, and scene predictions are candidates. They become canon only after writer approval.
7. Seizn-native implementation must be clean-room Litheon IP. External projects and papers can inform patterns, but Seizn core should not become a copy of a third-party system.

## 5. Candidate Technology Slots

These are not all final vendor decisions. Lock the interface and eval gate first; promote a provider only after passing the gate.

| Layer | Phase 1 choice | Phase 2 candidate | Lock status |
| --- | --- | --- | --- |
| Memory backbone | Graphiti-style bi-temporal KG pattern | Hindsight-style long-context observations | Lock pattern, not implementation |
| Retrieval | LightRAG-style dual-level retrieval | HippoRAG2 / graph-walk retrieval | Eval-gated |
| Embedding | KURE-v1 for Korean text | Gemini Embedding 2 for multimodal/multilingual | Adapter slot |
| Graph DB online | Neo4j or FalkorDB | Re-evaluate after Graphiti compatibility tests | Open |
| Graph DB offline | Kuzu/Ladybug analytical cache | Wider benchmark if needed | Open |
| Reranker | Voyage rerank slot | Alternative rerankers if eval wins | Adapter slot |
| Parser | LlamaParse slot | OCR/multimodal second pass | Adapter slot |
| Sync | Yjs CRDT | Liveblocks, PartyKit, or Cloudflare Durable Objects | Open |
| Visualization | Cosmos.gl | Alternative only if perf fails | Likely |

## 6. Luvoire-Derived Seizn Patterns

Bring patterns, not product identity or domain-specific assets.

| Pattern | Seizn adaptation | Why it matters |
| --- | --- | --- |
| Replay cache for provider side effects | Capture LLM, parser, embedding, reranker, and tool/API outputs | Reproduces behavior despite provider drift |
| Replay-only mode | Cache miss fails closed and never falls back to live provider | Prevents hidden nondeterminism in evals |
| Run fingerprint | Input hash, memory snapshot hash, output hash, environment metadata | Makes QA receipts verifiable |
| Aggregate trace | Store per-run summaries plus sampled frames for large NPC/memory runs | Avoids storing every agent frame |
| Persona consistency score | Score whether a character response stays aligned with persona | Author QA |
| Relationship coherence score | Score whether character-to-character behavior matches relationship state | Continuity QA |

Do not import Luvoire public-safety, demography, KOSIS, routing, or Nemotron-derived data into Seizn core. If persona seed data is ever used, it must be opt-in, licensed, attributed, and separated from KNOT/Seizn canon data.

## 7. Character-State Simulation

Seizn Author can support fictional character-state forecasting after world rules, character persona, relationships, memories, and scene context are registered.

Use the term "simulation" or "candidate forecast," not deterministic prediction. This is for fictional authoring, not real-person prediction.

Required state for useful simulation:

- facts the character knows
- facts the character misunderstands
- facts only the author knows
- current emotional state
- long-term desire
- short-term goal
- relationship state toward other characters
- high-salience recent memories
- voice, taboo topics, speech pattern, and reasoning style
- current scene pressure

Output contract:

- current known facts
- unknown or forbidden facts
- internal thought candidates
- dialogue candidates
- action candidates
- canon risk
- supporting memories and graph edges
- contradiction warnings
- writer decision controls

Canonical flow:

```text
simulate -> generate candidates -> show evidence -> writer approves/rejects -> store canon or discard
```

## 8. Target Data Model

Use existing Seizn concepts where possible and extend only where the Author workflow needs it.

Core entities:

- `graph_entities`
- `graph_edges`
- `memories`
- `memory_provenance`
- `memory_snapshots`
- `replay_runs`
- `replay_side_effects`
- `eval_cases`
- `eval_results`
- `author_projects`
- `author_imports`
- `author_review_items`
- `character_states`
- `scene_simulations`

Minimum temporal fields for canon-bearing records:

- `valid_at`
- `invalid_at`
- `source_id`
- `source_span`
- `confidence`
- `status`
- `supersedes_id`
- `invalidates_id`
- `reviewed_by`
- `reviewed_at`

Status vocabulary:

- `candidate`
- `canon`
- `rejected`
- `retired`
- `contradicted`
- `invalidated`
- `past_only`

## 9. Phase Plan

### Phase 0: Documentation Lock

Goal: make the work executable for another agent without reinterpreting the pivot.

Deliverables:

- this kickoff plan
- architecture design document for Seizn Author Memory v3
- replay/eval harness design document
- README summary alignment

Acceptance:

- clear distinction between architecture invariants and vendor candidates
- no final lock on Neo4j/FalkorDB, Liveblocks/PartyKit/CF DO, Hindsight, HippoRAG2, or specific model versions
- explicit clean-room Seizn-native implementation boundary

### Phase 1: KNOT Intake and Review Workflow

Goal: support messy creator import plus in-site review.

Deliverables:

- import object model
- document/chunk/source-span model
- extraction candidate schema
- review queue schema
- writer approval/rejection flow
- KNOT sample import fixture

Acceptance:

- user can upload or paste material without preparing a strict template
- extracted candidates remain non-canon until approved
- duplicate/ambiguous candidates can be merged, split, rejected, or marked past-only
- every candidate retains source provenance

### Phase 2: Bi-Temporal Canon Graph

Goal: make canon queryable by time, source, and current validity.

Deliverables:

- person profile extension on `graph_entities(type="person")`
- temporal fact and edge model
- contradiction invalidation behavior
- "current canon" query
- "canon as of time" query
- "why invalidated" explanation query

Acceptance:

- contradictory updates do not delete older records
- current queries exclude invalidated facts by default
- historical queries can still retrieve older facts
- output can explain source, supersession, and invalidation path

### Phase 3: Replay and Determinism Harness

Goal: make model/provider behavior reproducible for QA and eval.

Deliverables:

- side-effect capture for LLM/parser/embedding/reranker/tool calls
- replay-only mode
- memory snapshot hash
- run fingerprint
- output hash
- trace receipt format
- cache-miss failure mode

Acceptance:

- live run can be replayed without live provider calls
- replay cache miss fails closed
- provider drift cannot silently change a replay result
- eval results reference memory snapshot hash and side-effect record IDs

### Phase 4: Retrieval v1

Goal: retrieve current canon, relevant history, and character state with explanations.

Deliverables:

- local chunk retrieval
- graph/global retrieval
- temporal filter
- invalidated-fact exclusion
- retrieval explanation
- embedding adapter interface
- reranker adapter interface

Acceptance:

- answers cite memory/chunk/graph provenance
- invalidated facts are not surfaced as current canon unless explicitly requested
- KNOT recall cases show which source supported each result
- adapter swaps do not change public retrieval contracts

### Phase 5: Evaluation Set

Goal: create objective gates before adding heavier retrieval systems.

Deliverables:

- KNOT ParseBench-style 100-case set
- embedding recall set
- hallucination tracking set
- persona consistency cases
- relationship coherence cases
- contradiction invalidation cases
- replay equivalence cases

Acceptance:

- each eval case has input, expected behavior, and scoring rubric
- eval runner stores result, snapshot hash, provider metadata, and failure reason
- no Phase 2 retrieval technique can be promoted without beating v1 on these cases

### Phase 6: Author Surface

Goal: make the memory system usable by writers.

Deliverables:

- project dashboard
- import inbox
- review queue
- character card
- relationship graph
- timeline
- canon conflict inbox
- memory recall explanation panel
- scene simulation panel

Acceptance:

- writer can approve/reject candidate canon without editing raw JSON
- writer can inspect why a character remembers or says something
- writer can mark facts as author-only, character-known, or unknown
- generated dialogue is clearly labeled as candidate output

### Phase 7: Phase 2 Research Promotion

Goal: add advanced methods only when they improve measured outcomes.

Candidates:

- Hindsight-style observation memory
- HippoRAG2-style graph retrieval
- Generative Agents reflection
- five-category decay model
- long-context verifier
- multimodal character reference ingestion

Acceptance:

- candidate improves KNOT evals or author UX measurably
- cost/latency budget is recorded
- replay mode still works
- failure modes are documented

## 10. First Implementation Batch

Batch A should avoid large UI work and avoid final vendor decisions.

Recommended order:

1. Create `docs/architecture/seizn-author-memory-v3.md`.
2. Create `docs/architecture/memory-replay-eval-harness.md`.
3. Define `KNOT_AUTHOR_EVAL_V1` case format.
4. Add replay side-effect interface.
5. Add memory snapshot hash helper.
6. Add eval result schema.
7. Add one minimal KNOT fixture.
8. Add tests for replay-only cache miss behavior.
9. Add tests for invalidated canon exclusion.
10. Update README summary if the architecture docs are accepted.

## 11. Verification Gates

Documentation-only gates:

```powershell
git diff --check -- docs/architecture/seizn-author-memory-v3-kickoff-plan.md
```

Implementation gates for later phases:

```powershell
npm run typecheck
npm run lint
npm run test:run
git diff --check
```

Add targeted tests for each phase:

- replay cache miss fails closed
- same run replays from side effects
- memory snapshot hash changes when canon changes
- current canon excludes invalidated facts
- historical canon can retrieve invalidated past facts
- character simulation does not reveal author-only facts
- eval runner records snapshot hash and provider metadata

## 12. Open Decisions

Do not decide these before the relevant eval exists:

- Neo4j vs FalkorDB for online graph operations
- Kuzu vs Ladybug fork for offline analytical cache
- Liveblocks vs PartyKit vs Cloudflare Durable Objects
- exact parser provider
- exact reranker provider
- Hindsight/HippoRAG2 promotion
- whether Author becomes a public product or remains internal KNOT tooling

## 13. Non-Goals

- Do not build a fully procedural story generator.
- Do not let generated outputs become canon automatically.
- Do not require users to prepare strict upload templates for MVP.
- Do not import Luvoire domain data into Seizn.
- Do not hard-lock a model/provider as the product moat.
- Do not create a `characters` table unless newly verified and intentionally migrated; use `graph_entities(type="person")`.
- Do not run live provider calls during replay-only evals.

## 14. Definition of Done for Kickoff

This kickoff is complete when:

- plan document exists in repo
- architecture invariants are separated from vendor candidates
- consumer onboarding flow is documented
- character simulation boundaries are documented
- Luvoire-derived reproducibility patterns are included
- first implementation batch is explicit enough for another agent to start
- document diff passes whitespace validation
