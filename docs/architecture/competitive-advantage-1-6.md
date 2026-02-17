# Competitive Advantage Execution (Items 1-6)

This document tracks the technical moat work requested for Seizn.

## 1) Multi-model prompt cache orchestration

Status: Implemented in this sprint.

- Added deterministic gateway response cache in `src/lib/ai-gateway/response-cache.ts`.
- Cache eligibility is constrained to deterministic, non-tool calls (`temperature <= 0.2`, no tools, non-stream).
- Integrated cache read/write into `src/lib/ai-gateway/gateway.ts`.
- Added tests in `src/lib/ai-gateway/response-cache.test.ts`.
- Updated billing path (`src/app/api/gateway/chat/route.ts`) to mark cache hits and avoid billable tokens on cached responses.

## 2) Dense + sparse + rerank retrieval

Status: Implemented in this sprint.

- Added optional second-pass rerank stage to hybrid retrieval pipeline:
  - `src/lib/hybrid-orchestrator/types.ts`
  - `src/lib/hybrid-orchestrator/orchestrator.ts`
  - `src/app/api/hybrid/retrieve/route.ts`
- New request knobs: `rerank`, `rerank_model`, `rerank_top_n`, `rerank_threshold`.
- Added `rerank_latency_ms` to retrieval metrics.

## 3) Memory-type engine + background consolidation

Status: Already implemented (verified).

- Existing asynchronous pipeline and cron processing:
  - `src/app/api/memories/flush/route.ts` (`async` job mode)
  - `src/app/api/cron/spring/jobs/process/route.ts` (worker)
  - `src/lib/spring/memory-v4/*` (ingestion/flush/job services)
- Existing compaction/consolidation surfaces:
  - `src/lib/memory/compaction.ts`
  - `src/app/api/memories/compact/route.ts`

## 4) MCP-native control plane

Status: Expanded in this sprint.

- Added control-plane snapshot endpoint for MCP clients:
  - `src/app/api/mcp/control-plane/route.ts`
- Endpoint exposes:
  - available MCP tool metadata
  - policy delivery metadata (ETag model)
  - retrieval/rerank capability flags
  - memory pipeline endpoints

## 5) Tenant/key isolation hardening

Status: Implemented in this sprint.

- `src/app/api/gateway/proxy/route.ts` now enforces:
  - API key authentication
  - gateway proxy scope (`gateway:proxy` or `gateway:*`)
  - org ownership requirement on key
  - tenant mismatch rejection (`config.orgId` must match key org)
  - raw BYOK config (`config.apiKey`) requires elevated scope (`gateway:proxy:raw-config`)

## 6) Policy-as-code + realtime delivery optimization

Status: Implemented in this sprint.

- Added conditional delivery on tenant policy endpoint:
  - `src/app/api/tenant-policy/route.ts`
- Policy responses now include:
  - `ETag`
  - `Cache-Control: private, no-cache, must-revalidate`
  - `X-Policy-Version-Hash`
- Supports `If-None-Match` with `304 Not Modified` (for policy-only reads), reducing bandwidth and latency.
