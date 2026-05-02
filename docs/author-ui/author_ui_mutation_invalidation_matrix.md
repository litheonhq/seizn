---
doc_type: ui-mutation-invalidation-matrix
version: v1
generated_at: 2026-05-02
applies_to: Seizn Author UI cache 정책·optimistic update·invalidation 매트릭스
depends_on:
  - author_ui_data_contracts.json
  - author_ui_query_bindings.json
  - author_ui_screen_specs.md
---

# Mutation × Query Invalidation Matrix

> 각 mutation 성공 시 *어느 query cache를 무효화·patch·rollback*하는지 일목요연. WebSocket event도 동일 모델.

## 0. 정책 룰

- **Optimistic 우선**: 작가 워크플로우는 빠른 응답이 핵심. 가능한 모든 review·edit mutation은 optimistic, 실패 시 rollback.
- **WebSocket 우선·polling fallback**: 실시간성이 필요한 화면(inbox·review·conflicts·simulate)은 WebSocket 구독, 끊기면 자동 polling.
- **Invalidation 보수적으로**: 한 mutation이 5+ query를 무효화하면 over-invalidation. *조건부 invalidation* 활용.
- **Audit log 동시 발신**: 모든 mutation은 telemetry event 동시 발행 (Replay·Trace 정합).

## 1. Mutation × Query Invalidation 매트릭스

| Mutation | 항상 invalidate | 조건부 invalidate | Optimistic | Rollback |
|---|---|---|---|---|
| `useCreateProject` | `['projects']` | — | ✗ | — |
| `useUploadImport` | `['imports', projectId]` | — | ✓ (push temp) | ✓ |
| `useRetryImport` | `['imports', projectId]` | — | ✓ (status reset) | ✓ |
| `useDeleteImport` | `['imports', projectId]`, `['candidates', projectId]` | — | ✓ (filter out) | ✓ |
| `useDecideCandidate` | `['candidates', projectId]`, `['candidate', projectId, candidateId]` | status=canon & type=character → `['characters', projectId]`, `['character', projectId, entityId]`<br/>type=relationship → `['graph', projectId]`<br/>type=event → `['timeline', projectId]`<br/>action=escalate → `['conflicts', projectId]` | ✓ (remove from queue) | ✓ |
| `useBatchDecide` | `['candidates', projectId]`, `['characters', projectId]`, `['graph', projectId]`, `['timeline', projectId]` | — | ✓ (filter ids) | ✓ |
| `useUpdateCharacter` | `['character', projectId, characterId]`, `['characters', projectId]` | relationships changed → `['graph', projectId]`<br/>events or arc changed → `['timeline', projectId]`<br/>knowledge_state changed → `['conflicts', projectId]`<br/>settings.author_changes_require_review → `['candidates', projectId]` | ✓ (merge patch) | ✓ |
| `useResolveConflict` | `['conflicts', projectId]`, `['candidates', projectId]` | resolution=keep_new\|merge & existing.type=character → `['character', entityId]`, `['characters', projectId]`<br/>type=relationship → `['graph', projectId]`<br/>type=event → `['timeline', projectId]` | ✓ (filter out) | ✓ |
| `useRunSimulation` | `['simulation', tempId]` (set) | — | △ (set query data, no rollback) | — |
| `useReplaySimulation` | `['simulation', simulationId]` | — | ✗ | — |
| `usePromoteSimulationCandidate` | `['candidates', projectId]`, `['character', perspectiveCharId]` | — | ✗ | — |
| `useUpdateProjectSettings` | `['settings', projectId]` | — | ✓ | ✓ |
| `useSaveByok` | `['account', 'byok']`, `['account', 'usage']` | — | ✗ (검증 필요) | — |

## 2. WebSocket Event × Cache Patch 룰

WebSocket은 *내 mutation 결과가 아닌 다른 source* (다른 작가·백그라운드 추출·자동 모순 검출)의 변경을 반영. 핵심 원칙: **patch 가능하면 patch, 모호하면 invalidate**.

| Event | Action | Target Query | Logic | Side Effect |
|---|---|---|---|---|
| `import.parsed` | patch | `['imports', projectId]` | 해당 import의 parse_status='parsed', storage_key, parsed_text_preview, parser_version, candidate_count 갱신 | invalidate `['candidates', projectId]`, info toast |
| `import.failed` | patch | `['imports', projectId]` | parse_status='failed', error_message 세팅 | error toast |
| `candidate.added` | patch | `['imports', projectId]`, `['candidates', projectId]` | imports의 source 카운트 증가, candidates list prepend (filter 통과 시) | sidebar nav 뱃지 ++ |
| `candidate.status_changed` | conditional | 변경된 candidate type에 따라 target 분기 | (자세히 §3) | mutation ack token 일치 시 skip (이미 optimistic 처리됨) |
| `conflict.detected` | invalidate | `['conflicts', projectId]` | — | sidebar 뱃지 ++, severity=critical 시 alert toast + topnav red dot |
| `simulation.progress` | patch | `['simulation', simulationId]` | progress·current_step·tokens_used 갱신 | progress bar 업데이트 |
| `simulation.complete` | invalidate | `['simulation', simulationId]` | — | success toast |
| `sync.status` | patch | `['sync', 'status', projectId]` | direction·last_sync·error 갱신 | error 시 error toast |

## 3. `candidate.status_changed` 상세 분기

내가 발신하지 않은 외부 변경 (다른 작가·자동 분류기). target은 candidate.type에 따라 다름.

```text
candidate.status_changed payload = { candidate_id, old_status, new_status, type, target_entity_id?, ack_token? }

if ack_token === 내가_방금_발신한_mutation의_ack: skip (중복)
elif type === 'character':
   invalidate ['character', target_entity_id], ['characters', projectId]
elif type === 'relationship':
   throttle 2s → invalidate ['graph', projectId]
elif type === 'event':
   throttle 2s → invalidate ['timeline', projectId]
elif type === 'fact' or 'world_rule':
   patch ['candidates', projectId] (상태만 갱신)
   if review queue currently viewing this candidate: visual flash + 'updated' badge
always:
   invalidate ['candidates', projectId, ...] (큐 위에 있을 수도)
```

## 4. Optimistic Update 패턴

### 4.1 패턴 A: List remove (검수 큐에서 카드 제거)

`useDecideCandidate`, `useBatchDecide`, `useResolveConflict`, `useDeleteImport`

```ts
onMutate: async (variables) => {
  await queryClient.cancelQueries({ queryKey: ['candidates', projectId] })
  const previous = queryClient.getQueryData(['candidates', projectId])
  queryClient.setQueryData(['candidates', projectId], (old) => ({
    ...old,
    candidates: old.candidates.filter(c => c.id !== variables.candidate_id)
  }))
  return { previous }
}
onError: (err, vars, ctx) => {
  queryClient.setQueryData(['candidates', projectId], ctx.previous)
  toast.error('검수 실패·되돌립니다')
}
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ['candidates', projectId] })
}
```

### 4.2 패턴 B: List push (업로드 등 신규 추가)

`useUploadImport`

```ts
onMutate: async (file) => {
  const tempId = `temp-${nanoid()}`
  const previous = queryClient.getQueryData(['imports', projectId])
  queryClient.setQueryData(['imports', projectId], (old) => ({
    ...old,
    imports: [...old.imports, { id: tempId, file_name: file.name, parse_status: 'queued', ...placeholder }]
  }))
  return { previous, tempId }
}
onSuccess: (response, vars, ctx) => {
  // temp id를 server id로 교체
  queryClient.setQueryData(['imports', projectId], (old) => ({
    ...old,
    imports: old.imports.map(i => i.id === ctx.tempId ? { ...i, id: response.import_id } : i)
  }))
}
onError: (err, vars, ctx) => {
  queryClient.setQueryData(['imports', projectId], ctx.previous)
  toast.error(`${vars.name} 업로드 실패`)
}
```

### 4.3 패턴 C: Single resource merge patch

`useUpdateCharacter`, `useUpdateProjectSettings`

```ts
onMutate: async (patch) => {
  await queryClient.cancelQueries({ queryKey: ['character', characterId] })
  const previous = queryClient.getQueryData(['character', characterId])
  queryClient.setQueryData(['character', characterId], (old) => ({ ...old, ...patch }))
  return { previous }
}
onError: (err, vars, ctx) => {
  queryClient.setQueryData(['character', characterId], ctx.previous)
}
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ['character', characterId] })
}
```

### 4.4 Optimistic 안 쓰는 mutation

- `useCreateProject` — 서버가 id 생성·즉시 navigation 필요
- `useRunSimulation` — 서버 큐잉 후 simulation_id 받음·temp set만
- `useReplaySimulation` — 결과가 직선적으로 변경됨, 빠른 응답 불필요
- `usePromoteSimulationCandidate` — leak warning modal 거쳐야 함
- `useSaveByok` — 서버 검증 필요·검증 안 된 키를 cache에 넣으면 위험

## 5. Polling vs WebSocket 결정 매트릭스

| Resource | 1순위 | 2순위 (fallback) | 비고 |
|---|---|---|---|
| imports (parsing/extracting) | WebSocket `import.*` | polling 10s (active만) | 진행률 빈번 갱신 |
| candidates (review queue) | WebSocket `candidate.*` | polling 60s | 작가 수동 흐름·자동 부담 X |
| conflicts | WebSocket `conflict.detected` | polling 60s | critical 알림은 즉시성 중요 |
| simulation (running) | WebSocket `simulation.progress` | polling 3s (running만) | 작가가 실행 후 대기 중 |
| sync.status | WebSocket `sync.status` | polling 30s | global indicator |
| characters | manual refetch | — | mutation 시만 invalidate |
| graph | manual refetch | throttled `candidate.status_changed` invalidate (2s) | 무거운 query·자주 invalidate X |
| timeline | manual refetch | throttled `candidate.status_changed` invalidate (2s) | 마찬가지 |
| settings | manual refetch | — | 거의 안 변경 |
| account/usage | manual refetch | — | settings 화면 진입 시 갱신 |

## 6. URL State Sync (필터·정렬·페이지)

| Screen | URL params | Query key segment |
|---|---|---|
| Review Queue | `?status=candidate&scope=short1&tier=1&sort=priority&page=1` | `['candidates', projectId, filters, sort, page]` |
| Inbox | `?status=ready_for_review` (단일 필터만) | `['imports', projectId]` |
| Characters list | `?scope=short1&search=...` | `['characters', projectId, scope]` |
| Graph | `?time_state=D14&filter_type=person,event` | `['graph', projectId, { time_state, filters }]` |
| Timeline | `?phase=2&character_filter=소리,나리` | `['timeline', projectId, filters]` |
| Conflicts | `?severity=critical,high` | `['conflicts', projectId, filters]` |

URL ↔ form ↔ query key 3 way binding. 새로고침·뒤로가기 시 상태 보존.

## 7. Prefetch 정책

| Trigger | Prefetch 대상 | 효과 |
|---|---|---|
| Dashboard ProjectCard hover | `['imports', projectId]`, `['candidates', projectId, {status:'candidate'}]` | 진입 즉시 표시 |
| SidebarNav 항목 hover | 해당 화면 main query | 화면 전환 무딜레이 |
| Review Queue 다음 페이지 임박 (70% 스크롤) | `['candidates', projectId, filters, sort, page+1]` | infinite scroll 매끈 |
| Review Queue 카드 hover | `['candidate', projectId, candidateId]` 상세 | Space expand 즉시 |
| Timeline 가로 스크롤 viewport | 보이는 Day ± 7일 사건 detail | 사건 클릭 즉시 영향 분석 |
| Simulation 결과 candidate hover | EvidencePanel용 evidence query | 클릭 시 즉시 근거 표시 |

## 8. Rate Limit / Race Condition / Stale Cache

### 8.1 Rate Limit (HTTP 429)

- `Retry-After` 헤더 존중·exponential backoff (1·2·4·8s)
- toast variant=warning '잠시 기다려주세요·{seconds}초 후 자동 재시도'
- 검수 빠른 키 입력 (A·R 연타) 시 client-side throttle 200ms·실패 시 queue로 직렬화

### 8.2 Race Condition

| Issue | Guard |
|---|---|
| 카드 결정 연타 — 같은 카드에 다중 mutation | `currentCardId`와 mutation `candidateId` 일치 검증·이미 결정된 카드 차단 |
| 내 mutation의 ws echo 와 optimistic patch 충돌 | server response·ws payload에 `ack_token` 포함, 중복 patch skip |
| 빠른 필터 변경 — 이전 응답 늦게 도착 | TanStack Query auto cancellation·AbortController |
| WebSocket reconnect 후 missed events | reconnect 시 모든 active query invalidate (재동기화) |

### 8.3 Stale Cache

| Trigger | 정책 |
|---|---|
| 30분 이상 idle | window focus 시 모든 query refetch (`refetchOnWindowFocus: true`인 query만) |
| 다른 탭에서 변경 | BroadcastChannel API + invalidate |
| 오프라인 → 온라인 복귀 | 모든 active query refetch + queued mutation flush |

## 9. Audit Log Telemetry

모든 mutation은 frontend telemetry event 동시 발신.

| Mutation | Telemetry Event | Payload |
|---|---|---|
| `useDecideCandidate` | `candidate.decide` | `{candidate_id, decision, trigger: 'key' \| 'button', shortcut?, latency_ms, override_warning?}` |
| `useBatchDecide` | `candidate.batch_decide` | `{count, decision}` |
| `useUpdateCharacter` | `character.update` | `{character_id, fields_changed: string[]}` |
| `useResolveConflict` | `conflict.resolve` | `{conflict_id, resolution, severity}` |
| `useRunSimulation` | `simulation.run` | `{characters_count, day, candidate_count_requested}` |
| `usePromoteSimulationCandidate` | `simulation.promote` | `{simulation_id, candidate_index, leak_warning, leak_overridden}` |
| `useUploadImport` | `import.upload` | `{file_type, file_size, source_role, a_or_d_mode}` |

**Privacy**: 원문 텍스트 X·요약·메타만. server side에서 추가 trace 결합.

## 10. Error Boundary 전략

| 층 | 처리 |
|---|---|
| Screen 컴포넌트 | `<ErrorBoundary>` 감싸고 fallback `<ErrorState variant='screen-crash' />` |
| Query | TanStack Query error → `<ErrorState>` 자동·exponential backoff retry max 3 |
| Mutation | error → toast + rollback (optimistic 시) — retry는 작가 수동 |
| WebSocket | 끊김 → 5s backoff 재연결·재연결 성공 시 active query invalidate |

## 11. 화면별 상태 매트릭스 요약

각 화면이 표시하는 state branch 일목요연. ([author_ui_empty_error_states.md](author_ui_empty_error_states.md) 참고)

| Screen | Loading | Empty (first) | Empty (filter zero) | Partial | Error |
|---|---|---|---|---|---|
| Dashboard | skeleton×6 | first-time CTA | — | — | load-fail + retry |
| Inbox | progress per file | drop zone | all-reviewed | failed mixed | parse-fail / extract-fail / token-limit |
| Review Queue | candidate skeleton×3 | all-done | filter-no-match | — | sync-fail + offline |
| Character Card | skeleton | no characters | — | data-insufficient | load-fail |
| Graph | canvas skeleton | no entities | filter-no-match | sparse (<5 nodes) | render-fail (Cosmos.gl) |
| Timeline | row skeleton×5 | no events | day-range-no-events | — | load-fail |
| Conflicts | card skeleton×3 | no conflicts | — | — | load-fail; critical alert top-priority |
| Simulate | progress percent | first-use samples | character-data-insufficient | leak-detected | token-limit / api-error |
| BYOK | form skeleton | not-set CTA | — | — | invalid-key |
| Sync | progress | not-configured | — | — | sync-fail / merge-conflict |

## 12. 구현 우선순위 (Codex 작업 순서)

**Phase 1 (MVP — Inbox·Review·Character·Conflict)**:
1. `useImports` + `useUploadImport` + `useDeleteImport` + websocket `import.*`
2. `useCandidates` + `useDecideCandidate` (10 단축키 모두) + websocket `candidate.*`
3. `useCharacter` + `useUpdateCharacter` (read-only 우선)
4. `useConflicts` + `useResolveConflict` + websocket `conflict.detected`
5. SidebarNav 뱃지 cross-screen subscription
6. Offline 모드 (review queue 한정)

**Phase 2 (Graph·Timeline·Simulate)**:
7. `useGraph` (Cosmos.gl) + throttled invalidate
8. `useTimeline` + throttled invalidate
9. `useSimulation` + `useRunSimulation` + websocket `simulation.*`
10. Leak warning modal + `usePromoteSimulationCandidate`

**Phase 3 (Settings·Sync·BYOK)**:
11. `useProjectSettings` + `useUpdateProjectSettings`
12. `useByokKey` + `useSaveByok`
13. `useSyncStatus` + websocket `sync.status`
14. Audit log telemetry pipeline (전 phase 횡단·Phase 3에서 통합)

## 13. 검증 체크리스트

Codex 구현 후 자체 점검:

- [ ] 모든 query key가 본 문서·`author_ui_query_bindings.json`과 1:1 일치
- [ ] 모든 mutation이 본 매트릭스 §1의 invalidation을 정확히 수행
- [ ] optimistic mutation 모두 onError rollback 구현
- [ ] WebSocket 재연결 시 active query invalidate 자동 실행
- [ ] URL state ↔ filter form ↔ query key 3 way binding 동작
- [ ] HTTP 429 retry-after 존중
- [ ] mutation ack_token 으로 ws echo 중복 patch skip
- [ ] offline 모드 review queue 큐잉 + 복귀 자동 sync
- [ ] critical conflict 알림: toast + topnav red dot + sidebar 뱃지 3중 표시
- [ ] leak warning modal: simulation candidate canon_risk='leak' 시 강제 표시
- [ ] 모든 mutation telemetry event 발신
- [ ] error boundary screen-level + query-level + mutation-level 3중 wrap
