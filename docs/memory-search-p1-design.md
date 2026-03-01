# Memory Search P1 Design (Seizn)

Last updated: 2026-03-02

## Goal
Improve real-user search quality under load by reducing timeout failure impact and by making retrieval behavior measurable and tunable.

## Scope
- API layer: input validation hardening and bounded execution budget
- Retrieval execution layer: mode-agnostic timeout handling with deterministic fallback behavior
- Dashboard UX: expose retrieval diagnostics for trust and debuggability

## Non-goals (this phase)
- Full semantic cache rollout
- Query expansion/HyDE production rollout
- Learned ranker replacement

## Success metrics
- Search timeout rate decreases for interactive dashboard usage
- Zero-result rate does not regress after threshold normalization
- Cached-hit and fallback behavior visible in UI and auditable from logs
- Build/lint/tests remain green

## Design

### 1) Input guardrails
- Validate `mode` against `auto|slot|keyword|hybrid|vector`
- Validate `threshold` in `[0,1]`
- Reject invalid values with `400 invalid_field`

### 2) Bounded search budget
- Introduce `MEMORY_SEARCH_TIMEOUT_MS` (default `2500`)
- Apply timeout to both embedding generation and RPC calls
- Reuse existing fallback chain:
  - vector/hybrid -> keyword fallback on error
  - keyword terminal error -> explicit timeout/database response
- Return `504 search_timeout` when terminal timeout occurs

### 3) Dashboard resilience + explainability
- Replace fixed `threshold=0.0` with adaptive threshold by query length
- Abort stale in-flight requests with `AbortController`
- Surface diagnostics chips:
  - mode/requested mode
  - cache hit/miss
  - fallback reason
  - router learning applied
  - latency
- Add `aria-live` status updates for assistive tech

## Implementation checklist
- [x] Guardrails in v1 route
- [x] Guardrails in v0 route
- [x] Timeout budget in `search-executor`
- [x] Timeout fallback tests
- [x] Dashboard adaptive threshold + request abort
- [x] Dashboard diagnostics + accessibility status message
- [ ] Semantic cache (P1 follow-up)
- [x] DB-level statement timeout / per-query budget at SQL layer via bounded RPC wrappers (`*_search_memories_bounded`)

## Rollout plan
1. Deploy with timeout default `2500ms`
2. Observe timeout/fallback ratio and p95 latency for 24h
3. If timeout > target, increase to `3000ms` and re-evaluate
4. Start P1 follow-up: semantic cache A/B on dashboard traffic

## Risk and mitigation
- Risk: stricter threshold may reduce recall for very short queries
  - Mitigation: adaptive threshold (`0.45/0.55/0.65`) and monitor zero-result ratio
- Risk: timeout budget too aggressive for high-latency users
  - Mitigation: env-tunable timeout and fallback path preserved
- Risk: UI diagnostics increase noise
  - Mitigation: compact chips + no blocking modal interactions
