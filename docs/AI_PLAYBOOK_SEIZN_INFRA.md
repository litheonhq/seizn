# Seizn Search Infra AI Playbook
This repository scaffold adds **Fall (Observability/Eval/Autopilot)** and **Winter (Policy/Governance/Memory OS hooks)** on top of **Summer (RAG stack)**.

The intent is that other AIs can implement the remaining “deep work” by following the checklists below.

---

## 0) Quick start

### Required env vars (server-side)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VOYAGE_API_KEY` (if using Voyage embeddings)
- `ANTHROPIC_API_KEY` (optional, for judge / answer contract)
- `SEIZN_ENCRYPTION_KEY` (required for federated connector secrets)

### Apply migrations
Run Supabase migrations in order:
- `021_summer_schema.sql`
- `022_fall_observability.sql`
- `023_fall_eval_experiments.sql`
- `024_winter_governance.sql`
- `025_summer_versioning.sql`
- `026_summer_federated.sql`

---

## 1) Fall: Retrieval Flight Recorder (Tracing)

### What’s implemented
- DB schema: `fall_retrieval_traces`, `fall_retrieval_feedback` (022)
- Recorder libs:
  - `src/lib/fall/flight-recorder/*`
- Summer retrieval pipeline is instrumented:
  - `src/lib/summer/pipeline/retrieve.ts`
- Trace list API:
  - `GET /api/fall/traces?limit=20`

### Trace schema (high-level)
Stored in `fall_retrieval_traces.trace` (JSONB):
- `trace_id` (uuid)
- `started_at`
- `events[]` where each event is:
  - `type: embed|candidates|rerank|context|...`
  - `ts`
  - `payload` (structured)

### Open tasks for other AIs
1) **Schema normalization (optional)**
   - Replace `trace JSONB` with an events table if you need analytics at scale.
2) **Sampling strategy**
   - Make sampling dynamic by error rate, tenant, or p95 latency.
3) **PII-safe logging**
   - Currently Winter policy masks PII for stored query text.
   - Extend masking to chunk text (or never store chunk text in traces).

Acceptance criteria:
- Every retrieval request can be debugged from one trace row.
- “Why this chunk?” can be answered from trace logs.

---

## 2) Fall: Evaluation pipeline

### What’s implemented
- DB schema: datasets / cases / runs / results (023)
- Deterministic metrics:
  - `context_precision`, `context_recall`, `mrr` (`src/lib/fall/eval/metrics.ts`)
- Runner:
  - `src/lib/fall/eval/run.ts`
  - API: `POST /api/fall/eval/run`

### How to create a dataset (manual SQL)
Insert dataset:
```sql
insert into fall_eval_datasets (user_id, name, description)
values ('<USER_ID>', 'my-dataset', 'basic smoke tests')
returning id;
```

Insert cases:
```sql
insert into fall_eval_cases (user_id, dataset_id, query_text, expected_chunk_ids)
values
  ('<USER_ID>', '<DATASET_ID>', 'What is X?', array['<CHUNK_ID_1>'::uuid, '<CHUNK_ID_2>'::uuid]);
```

### Open tasks for other AIs
1) **Faithfulness scoring**
   - Wire `judgeFaithfulness()` into the eval runner when answers exist.
2) **Regression alarms**
   - Persist regression events to a table + Slack webhook.
3) **Eval datasets from real traffic**
   - Create a job that samples traces and turns them into eval cases.

Acceptance criteria:
- Can run eval and get a stable score summary.
- Can detect regressions between runs.

---

## 3) Fall: Autopilot Query Planner

### What’s implemented
- Heuristic config decision:
  - `src/lib/summer/autopilot/decide.ts`
- Planner wrapper + experiment override:
  - `src/lib/summer/autopilot/planner.ts`
- Integration into retrieval pipeline:
  - `src/lib/summer/pipeline/retrieve.ts`

### Open tasks for other AIs
1) **Latency & budget routing**
   - Inputs: tenant plan, latency SLO, cost cap
   - Outputs: dynamic `topK`, rerank on/off, model selection
2) **Collection routing**
   - If Seizn hosts multiple “collections” (NIH/NSF/Papers), implement:
     - keyword-based routing
     - metadata-based routing
     - tenant-configurable routing rules
3) **Feedback-driven tuning**
   - Use `fall_retrieval_feedback` / `fall_outcomes` to learn better defaults.

Acceptance criteria:
- Planner explains its decision (`reason` stored in trace).
- Planner is safe: never crashes retrieval if it fails.

---

## 4) Fall: Online A/B + Bandit Optimization

### What’s implemented
- Experiments schema + arms + exposures + outcomes (023)
- A/B assignment (stable hash by user/api_key):
  - `src/lib/fall/experiments/assign.ts`
- Simple bandit (epsilon-greedy):
  - `src/lib/fall/experiments/bandit.ts`
- Create/list experiments API:
  - `GET/POST /api/fall/experiments`
- Feedback API that also logs outcomes when possible:
  - `POST /api/summer/feedback`

### How to run an experiment
1) Create an experiment with 2+ arms
2) Set `status=running`
3) Retrieval automatically applies the latest running experiment (or pass `experiment_id`)

Example arm override payload (retrieval knobs):
```json
{
  "mode": "hybrid",
  "topK": 30,
  "rerank": true,
  "rerankTopN": 30
}
```

### Open tasks for other AIs
1) **Winner rollouts**
   - Automatically switch weights or stop experiment when confident.
2) **Metric definition**
   - Decide which events are “success” and how to weight them.
3) **Guardrails**
   - Prevent bandit from picking an arm that violates latency/cost budget.

Acceptance criteria:
- Exposure logging works (request_id recorded).
- Outcomes map to experiment arms.

---

## 5) Automatic parameter tuning (pgvector/HNSW)

### What’s implemented
- Heuristic recommenders:
  - `src/lib/summer/tuning/hnsw.ts`
- API:
  - `GET /api/fall/tuning/hnsw`

### Open tasks for other AIs
1) **Workload-based recommendations**
   - Aggregate `fall_retrieval_traces.timings_ms` by collection and query type.
2) **Auto-apply**
   - For `ef_search`, you can apply per-query immediately.
   - For `m` and `ef_construction`, create a safe migration plan (rebuild index window).

Acceptance criteria:
- Recommendations are explainable and reproducible.

---

## 6) Winter: Memory OS (policy-based memory)

### What’s implemented
- Generic policy storage:
  - `winter_policies` (024)
- PII detection/masking:
  - `src/lib/winter/pii.ts`
- Policy read/apply:
  - `src/lib/winter/policy.ts`
- Right-to-be-forgotten job skeleton:
  - `winter_deletion_jobs`, `src/lib/winter/forget.ts`
  - API: `POST /api/winter/forget`

### Open tasks for other AIs
1) **Scope model**
   - Implement scopes: user / project / session / agent (tables + indexes)
2) **TTL enforcement**
   - Cron job to delete expired memories/traces/documents
3) **Memory ↔ RAG synthesis rules**
   - If memory conflicts with docs, docs win
   - If no doc grounding, lower memory confidence

Acceptance criteria:
- Memory storage is policy-governed.
- User can request deletion and get an audit trail.

---

## 7) Summer: Ingestion / Chunking / Structure standardization

### What’s implemented
- Parsers:
  - `src/lib/summer/ingest/parsers/pdf.ts`
  - `src/lib/summer/ingest/parsers/docx.ts`
- Semantic-ish chunker:
  - `src/lib/summer/ingest/chunking/semantic.ts`
- Lightweight metadata labels:
  - `src/lib/summer/ingest/metadata/label.ts`
- Versioned indexing scaffold:
  - `src/lib/summer/ingest/versioned-index.ts`
- DB tables:
  - `summer_ingestion_jobs`, version history tables (025)

### Open tasks for other AIs
1) **Layout-preserving PDF parsing**
   - Extract page blocks, tables, captions
2) **Table/math/reference structure extraction**
   - Store structured blocks in chunk metadata
3) **True partial updates**
   - Diff existing chunks and update only changed ones

Acceptance criteria:
- Document changes do not require full re-index.
- Important structure is preserved in metadata.

---

## 8) Federated Retrieval (Bring-your-own-store)

### What’s implemented
- DB schema:
  - `summer_federated_sources`, `summer_federated_bindings` (026)
- Encrypted connector config:
  - `src/lib/winter/crypto.ts`
- Federated retrieval scaffold:
  - `src/lib/summer/federated/*`
  - MVP supports provider=`custom` via HTTP agent (`connectors/http-agent.ts`)

### Open tasks for other AIs
1) **Admin APIs**
   - CRUD routes for sources and bindings
2) **First-class connectors**
   - Pinecone/Weaviate/Vespa/Azure AI Search adapters
3) **Unified auth + audit**
   - Permission checks and deletion propagation across sources

Acceptance criteria:
- A collection can query multiple sources and merge results safely.

---

## 9) Answer Contract layer

### What’s implemented
- Prompt helper:
  - `src/lib/summer/answer-contract/prompt.ts`
- Lightweight verifier:
  - `src/lib/summer/answer-contract/verify.ts`

### Open tasks for other AIs
1) **Runtime groundedness checks**
   - LLM judge or NLI to verify claims ↔ sources
2) **Auto-retry policy**
   - If contract fails: re-retrieve → re-generate
3) **Claim-level mapping**
   - Require per-sentence citations and coverage thresholds

Acceptance criteria:
- Answers always cite chunk ids.
- Contract violations trigger deterministic recovery.

---

## 10) Domain-adaptive reranker training (hard)

### What’s collected today
- `fall_retrieval_feedback`
- `fall_outcomes` (when experiments are active)

### Open tasks for other AIs
1) **Training dataset builder**
   - Convert (query, candidate list, chosen chunk) → pairwise/triplet labels
2) **Train reranker**
   - Cross-encoder (e.g., miniLM) or adapter fine-tune
3) **Safe deployment**
   - Versioned models per domain + rollback

Acceptance criteria:
- Model quality improves on offline eval + online outcomes.

