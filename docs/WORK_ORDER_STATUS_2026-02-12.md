# Seizn Work Order Status (2026-02-12)

Source of Work Orders: `Seizn_AI_Agent_Command_Center_Playbook.md` §5 (`PR-000`~`PR-041`)

## Status Matrix

| Work Order | Status | Notes |
|---|---|---|
| `PR-000` | COMPLETE | Bearer canonical auth + compatibility path already present (`src/lib/api-auth.ts`). |
| `PR-001` | PARTIAL | Rate/plan logic exists but semantics still split across modules. |
| `PR-002` | COMPLETE | Link-check workflow exists and blocks failures in core checks. |
| `PR-010` | PARTIAL | MCP package exists; tool coverage/trace completeness still partial. |
| `PR-011` | PARTIAL | Checkpointer + migration exist; sample-repo readiness still partial. |
| `PR-020` | PARTIAL | Context API exists; response contract still not fully aligned to target shape. |
| `PR-021` | PARTIAL | Versioned profile exists; context auto-injection path still mixed. |
| `PR-022` | BACKEND (UPGRADED) | Flush now supports async queue (`consolidate`) + retry-capable spring jobs. |
| `PR-023` | PARTIAL | Contradiction/invalidation logic exists; end-user reason visibility still partial. |
| `PR-030` | COMPLETE | PGroonga hybrid lane is implemented and wired. |
| `PR-031` | PARTIAL | Language pack ingestion exists; query-time full parity still partial. |
| `PR-032` | PARTIAL | Multilingual eval workflow exists; stricter CI gate/tests still needed. |
| `PR-033` | PARTIAL | pgvector tuning exists; measurable p95 SLO evidence still needed. |
| `PR-040` | BACKEND+UI (UPGRADED) | Control Tower now exposes failing traces, security policy events, quality regressions. |
| `PR-041` | BACKEND (UPGRADED) | Evidence creation now supports signing and signed zip export with governance/compliance artifacts. |

## Evidence (Updated Work Orders)

### `PR-022` Buffer + Flush (queue + retry path)
- `src/app/api/memories/flush/route.ts:27` (`async?: boolean` request contract)
- `src/app/api/memories/flush/route.ts:59` (`consolidate` job enqueue)
- `src/app/api/memories/flush/route.ts:95` (sync path via `runMemoryFlush`)
- `src/lib/spring/memory-v4/flush-service.ts:45` (shared flush pipeline)
- `src/app/api/cron/spring/jobs/process/route.ts:45` (cron processor for `consolidate`)

### `PR-040` Control Tower surface
- `src/app/api/control-tower/signals/route.ts:4` (new signals endpoint)
- `src/lib/control-tower/signals.ts:43` (top failing traces query)
- `src/lib/control-tower/signals.ts:78` (security policy events query)
- `src/lib/control-tower/signals.ts:131` (search quality regressions query)
- `src/app/[locale]/dashboard/control-tower/page.tsx:309` (Top failing traces panel)
- `src/app/[locale]/dashboard/control-tower/page.tsx:320` (Security policy events panel)
- `src/app/[locale]/dashboard/control-tower/page.tsx:331` (Search quality regressions panel)

### `PR-041` Evidence Pack export + verifier CLI compatibility
- `src/app/api/v1/evidence/route.ts:162` (`buildSignedWithKMS` signing path)
- `src/app/api/v1/evidence/[id]/export/route.ts:181` (`format=zip` export path)
- `src/lib/provenance/evidence-pack.ts:837` (`exportToSignedZip`)
- `src/lib/provenance/evidence-pack.ts:940` (policy decisions artifact)
- `src/lib/provenance/evidence-pack.ts:941` (PII redaction report artifact)
- `src/lib/provenance/evidence-pack.ts:942` (trace digest artifact)

